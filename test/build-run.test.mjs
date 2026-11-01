import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  renameSync,
  statSync,
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

test('strict artifact reads still refuse a regular-file ancestor', async (t) => {
  const live = await start(fixture(t));
  writeFileSync(path.join(live.root, 'blocked'), 'regular ancestor\n');
  await assert.rejects(
    live.call('retain-evidence', {
      ...live.common,
      evidenceId: 'blocked-artifact',
      source: {
        root: live.root,
        path: 'blocked/evidence.txt',
        digest: contentDigest('evidence\n'),
      },
    }),
    error('UNSAFE_PATH'),
  );
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

test('resume revalidates retained trusted-user fields even when reply bytes are resealed', async (t) => {
  for (const { field, value, message } of [
    { field: 'channel', value: 'tool-result', message: 'invalid user channel association' },
    {
      field: 'questionDigest',
      value: contentDigest('another question'),
      message: 'invalid user channel association',
    },
    {
      field: 'answer',
      value: 'Publish and merge everything',
      message: 'reply broadens the question options',
    },
  ]) {
    await t.test(field, async (t) => {
      const live = await start(fixture(t));
      const { question } = await pause(live);
      const reply = await live.call('reply', {
        ...live.common,
        question,
        trustedUser: trusted(question),
      });
      const originalReply = { ...reply };
      const replyPath = path.join(reply.root, reply.path);
      const originalBytes = readFileSync(replyPath);
      const tampered = JSON.parse(originalBytes);
      tampered.trustedUser[field] = value;
      const tamperedBytes = encodeControl(tampered);
      writeFileSync(replyPath, tamperedBytes);
      const resealedReply = { ...reply, digest: contentDigest(tamperedBytes) };
      await assert.rejects(
        live.call('resume', {
          ...live.common,
          question,
          reply: resealedReply,
          agentHandle: 'original-child-handle',
        }),
        { code: 'UNTRUSTED_REPLY', message },
      );

      writeFileSync(replyPath, originalBytes);
      const resumed = await live.call('resume', {
        ...live.common,
        question,
        reply: originalReply,
        agentHandle: 'original-child-handle',
      });
      assert.equal(resumed.answer, 'Retain locally');
      assert.equal(resumed.agentHandle, 'original-child-handle');
    });
  }
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

async function preparedForTransform(t, fx = fixture(t)) {
  const live = await setupDelivery(await start(fx));
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

async function preparedForRetainedPlan(t) {
  const live = await setupDelivery(await start(fixture(t)));
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of REQUIRED_GATES.filter(
    (name) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(name),
  ))
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'observed-refusal',
    agentHandle: 'original-child-handle',
    gates: gates.filter((item) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(item.path)),
    ),
  });
  return { ...live, evidence, gates, prepared };
}
function observedRefusal(live, failedOperation) {
  let observed;
  const original = path.join(live.root, 'plan.md');
  const archive = path.join(live.root, 'archive');
  if (failedOperation === 'mkdir') writeFileSync(archive, 'temporary filesystem obstacle\n');
  try {
    if (failedOperation === 'mkdir') mkdirSync(archive);
    else renameSync(original, path.join(archive, 'plan.md'));
    assert.fail('the fixture must observe an actual failed archival operation');
  } catch (failure) {
    assert.equal(failure.code, failedOperation === 'mkdir' ? 'EEXIST' : 'ENOENT');
    observed = { code: failure.code, exitCode: null, message: failure.message };
  }
  // Remove the condition before sealing: this is retained caller observation, not a live probe.
  if (failedOperation === 'mkdir') rmSync(archive);
  else mkdirSync(archive);
  return {
    protocol: 1,
    runId: live.input.runId,
    requestDigest: live.common.requestDigest,
    provenance: 'caller-observed',
    agentHandle: 'original-child-handle',
    completionBasis: live.prepared,
    execution: live.execution,
    sourcePlan: live.input.plan,
    currentPlan: live.ref(live.root, 'plan.md'),
    paths: { root: live.root, original: 'plan.md', archive: 'archive/plan.md' },
    failedOperation,
    observedError: observed,
    visibleReport: `Archival stopped: ${failedOperation} returned ${observed.code}; plan.md retained unarchived.`,
  };
}
async function retainRefusal(live, value, evidenceId) {
  return live.call('retain-evidence', {
    ...live.common,
    evidenceId,
    content: JSON.stringify(value),
  });
}
function retainedSeal(live, evidence, extra = {}) {
  return live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'observed-refusal',
    basis: live.prepared,
    finalPlan: live.ref(live.root, 'plan.md'),
    expectedTree: git(live.root, 'write-tree'),
    judgments: [],
    archivalRefusal: { reason: 'write-failure', evidence },
    ...extra,
  });
}

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

async function preparedForSourceOnlyPlan(t, refusal, additionalRoots = [], options = {}) {
  const fx = fixture(t, true);
  git(fx.root, 'rm', '--cached', 'plan.md');
  writeFileSync(
    path.join(fx.root, '.gitignore'),
    options.ignoreArchive === false ? '.effective-flow/\n' : '.effective-flow/\narchive/plan.md\n',
  );
  if (refusal === 'write-failure' && !options.untrackedArchiveParent) {
    writeFileSync(path.join(fx.root, 'archive'), 'existing non-directory archive parent\n');
    git(fx.root, 'add', 'archive');
  }
  git(fx.root, 'add', '.gitignore');
  git(fx.root, 'commit', '-m', 'keep unpublished plan outside delivery history');
  const sourceRoot = path.join(fx.root, '.effective-flow/source-checkout');
  git(fx.root, 'worktree', 'add', '-b', 'unpublished-plan-source', sourceRoot);
  renameSync(path.join(fx.root, 'plan.md'), path.join(sourceRoot, 'plan.md'));
  fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
  if (!options.ownedDelivery) {
    git(fx.root, 'worktree', 'add', '-b', 'feature', fx.targetExecutionRoot);
    fx.input.execution = {
      ...fx.input.execution,
      executionRoot: fx.targetExecutionRoot,
      branch: 'feature',
      origin: 'harness-managed',
    };
  }
  fx.input.plan = fx.ref(sourceRoot, 'plan.md');
  fx.input.allowedRoots.push(
    sourceRoot,
    ...(!options.ownedDelivery ? [fx.targetExecutionRoot] : []),
    ...additionalRoots,
  );
  const started = await start(fx);
  const authorization = options.ownedDelivery
    ? null
    : await started.call('authorize-execution', {
        ...started.common,
        agentHandle: 'original-child-handle',
        mode: 'reuse-worktree',
        executionRoot: fx.targetExecutionRoot,
        branch: 'feature',
        baseHead: fx.input.execution.head,
        authority: {
          kind: 'source',
          source: 'instruction',
          index: null,
          quote: fx.input.source.instruction,
        },
      });
  const transition = options.ownedDelivery
    ? null
    : await started.call('transition-execution', {
        ...started.common,
        agentHandle: 'original-child-handle',
        authorization,
        execution: fx.input.execution,
        ownership: null,
      });
  const live = options.ownedDelivery
    ? await setupDelivery(started)
    : {
        ...started,
        executionRoot: fx.targetExecutionRoot,
        execution: fx.input.execution,
        transition,
        mode: 'reuse-worktree',
      };
  assert.equal(existsSync(path.join(live.executionRoot, 'plan.md')), false);
  assert.equal(git(sourceRoot, 'rev-parse', '--git-common-dir'), live.repositoryIdentity);
  assert.equal(git(live.executionRoot, 'rev-parse', '--git-common-dir'), live.repositoryIdentity);
  assert.equal(git(sourceRoot, 'ls-files', '--', ':(literal)plan.md'), '');
  const createObstacle = () => {
    if (options.collisionFactory) options.collisionFactory(live);
    else if (options.untrackedArchiveParent)
      writeFileSync(path.join(live.executionRoot, 'archive'), 'untracked regular archive parent\n');
    else if (refusal === 'collision') {
      mkdirSync(path.join(live.executionRoot, 'archive'));
      writeFileSync(
        path.join(live.executionRoot, 'archive/plan.md'),
        '# Unrelated private archive\n',
      );
    }
  };
  if (options.collisionTiming !== 'after-preparation') createObstacle();
  if (options.trackCollisionMember) {
    git(live.executionRoot, 'add', 'archive/plan.md/root.txt');
    git(live.executionRoot, 'commit', '-m', 'fixture tracked obstruction descendant');
  }
  writeFileSync(path.join(live.executionRoot, 'source.txt'), 'delivered implementation\n');
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of REQUIRED_GATES.filter(
    (name) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(name),
  ))
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'source-only-plan',
    agentHandle: 'original-child-handle',
    gates: gates.filter((item) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(item.path)),
    ),
  });
  if (options.collisionTiming === 'after-preparation') createObstacle();
  return { ...live, sourceRoot, evidence, gates, prepared, refusal };
}
function sourceOnlySeal(live, extra = {}) {
  git(live.executionRoot, 'add', 'source.txt');
  return live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'source-only-plan',
    basis: live.prepared,
    finalPlan: live.ref(live.sourceRoot, 'plan.md'),
    expectedTree: git(live.executionRoot, 'write-tree'),
    judgments: [],
    archivalRefusal: { reason: live.refusal },
    ...extra,
  });
}

for (const refusal of ['collision', 'write-failure'])
  test(`source-only unpublished plan survives ${refusal} while separate delivery commits only the other deliverables`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, refusal);
    const sourcePlan = path.join(live.sourceRoot, 'plan.md');
    const original = readFileSync(sourcePlan);
    const archivePath = path.join(
      live.executionRoot,
      refusal === 'collision' ? 'archive/plan.md' : 'archive',
    );
    const foreignArchive = readFileSync(archivePath);
    const seal = await sourceOnlySeal(live);
    git(
      live.executionRoot,
      'commit',
      '-m',
      'deliver implementation without publishing the unpublished plan',
    );
    const head = git(live.executionRoot, 'rev-parse', 'HEAD');
    assert.equal(
      git(
        live.executionRoot,
        'ls-tree',
        '-r',
        '--name-only',
        head,
        '--',
        'plan.md',
        'archive/plan.md',
      ),
      '',
    );
    const handoffRef = await live.call('handoff', {
      ...live.common,
      agentHandle: 'original-child-handle',
      seal,
      head,
      finalPlan: live.ref(live.sourceRoot, 'plan.md'),
    });
    const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
    assert.equal(handoff.finalPlan.root, live.root);
    assert.match(handoff.finalPlan.path, /^\.effective-flow\/build-runs\/fixture-run\//);
    assert.deepEqual(
      readFileSync(path.join(handoff.finalPlan.root, handoff.finalPlan.path)),
      original,
    );
    assert.deepEqual(
      readFileSync(sourcePlan),
      original,
      'the handoff itself preserves the original source plan',
    );
    // A later user edit/removal does not erase the immutable handoff evidence.
    const laterUserText = '# User revised the unpublished plan after handoff\n';
    if (refusal === 'collision') writeFileSync(sourcePlan, laterUserText);
    else rmSync(sourcePlan);
    for (const gate of ['plan-archival', 'delivery', 'cleanup', 'pilot-finalization', 'completion'])
      live.gates.push(
        await issue(
          live,
          gate,
          live.evidence,
          gate === 'plan-archival'
            ? { reason: `Archival refused: ${refusal}; unpublished source-only plan retained.` }
            : {},
        ),
      );
    const terminal = await live.call(
      'terminal',
      terminalInput(
        {
          ...live,
          finalPlan: handoff.finalPlan,
          finalCheckout: {
            repositoryIdentity: live.repositoryIdentity,
            executionRoot: live.executionRoot,
            branch: live.execution.branch,
            head,
            snapshot: handoff.snapshot,
            worktreeRemoved: false,
          },
        },
        {
          retainedWorktree: {
            root: live.executionRoot,
            dirty: false,
            reason: 'Delivery retained for review.',
          },
        },
      ),
    );
    assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
    if (refusal === 'collision') assert.equal(readFileSync(sourcePlan, 'utf8'), laterUserText);
    else assert.equal(existsSync(sourcePlan), false);
    assert.deepEqual(readFileSync(archivePath), foreignArchive);
    assert.equal(existsSync(path.join(live.executionRoot, 'plan.md')), false);
    assert.equal(
      readFileSync(path.join(live.executionRoot, 'source.txt'), 'utf8'),
      'delivered implementation\n',
    );
  });

function retainedPlanItem(
  live,
  { role, root = live.executionRoot, path: name, visibleReport, type },
) {
  const target = path.join(root, name);
  const mode = lstatSync(target).mode & 0o7777;
  let entries;
  if (type === 'directory') {
    entries = [];
    const walk = (relative = '') => {
      for (const child of readdirSync(path.join(target, relative)).sort()) {
        const name = relative ? `${relative}/${child}` : child;
        const absolute = path.join(target, name);
        const info = lstatSync(absolute);
        const type = info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : 'file';
        entries.push({
          path: name,
          type,
          mode: info.mode & 0o7777,
          digest:
            type === 'directory'
              ? null
              : contentDigest(type === 'symlink' ? readlinkSync(absolute) : readFileSync(absolute)),
        });
        if (type === 'directory') walk(name);
      }
    };
    walk();
    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
  return {
    role,
    fileRef: {
      root,
      path: name,
      digest:
        type === 'directory'
          ? contentDigest(JSON.stringify(entries))
          : contentDigest(type === 'symlink' ? readlinkSync(target) : readFileSync(target)),
    },
    mode,
    visibleReport,
    ...(type ? { type } : {}),
    ...(entries ? { entries } : {}),
  };
}

async function retainPlanFiles(live, currentPlan, files) {
  const value = {
    protocol: 1,
    runId: live.input.runId,
    requestDigest: live.common.requestDigest,
    provenance: 'caller-observed',
    agentHandle: 'original-child-handle',
    completionBasis: live.prepared,
    execution: live.execution,
    sourcePlan: live.input.plan,
    currentPlan,
    retained: files.map((item) => retainedPlanItem(live, item)),
  };
  return live.call('retain-evidence', {
    ...live.common,
    evidenceId: 'retained-plan-files',
    content: JSON.stringify(value),
  });
}

async function finishRetainedFiles(
  live,
  seal,
  finalPlan,
  conclusion,
  beforeCleanup,
  beforeTerminal,
) {
  git(
    live.executionRoot,
    'commit',
    '-m',
    'deliver approved output while retaining refused plan files',
  );
  const head = git(live.executionRoot, 'rev-parse', 'HEAD');
  const plan = finalPlan.root ? finalPlan : gitRef(live, finalPlan.path, head);
  const handoffRef = await live.call('handoff', {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head,
    finalPlan: plan,
  });
  const handoff = JSON.parse(readFileSync(path.join(handoffRef.root, handoffRef.path)));
  if (beforeCleanup) await beforeCleanup();
  for (const gate of ['plan-archival', 'delivery', 'cleanup', 'pilot-finalization', 'completion'])
    live.gates.push(
      await issue(
        live,
        gate,
        live.evidence,
        gate === 'plan-archival' ? { reason: conclusion } : {},
      ),
    );
  const terminalPayload = terminalInput(
    {
      ...live,
      finalPlan: handoff.finalPlan,
      finalCheckout: {
        repositoryIdentity: live.repositoryIdentity,
        executionRoot: live.executionRoot,
        branch: live.execution.branch,
        head,
        snapshot: handoff.snapshot,
        worktreeRemoved: false,
      },
    },
    {
      retainedWorktree: { root: live.executionRoot, dirty: true, reason: conclusion },
      conclusion,
    },
  );
  if (beforeTerminal) await beforeTerminal(terminalPayload);
  const terminal = await live.call('terminal', terminalPayload);
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
  return { head, handoff, terminal, terminalPayload };
}

test('an untracked regular-file archive parent is retained through seal and handoff without publication', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'write-failure', [], {
    ignoreArchive: false,
    untrackedArchiveParent: true,
  });
  const obstacle = path.join(live.executionRoot, 'archive');
  const original = readFileSync(obstacle);
  const conclusion = 'Archival refused: untracked regular-file archive parent retained unchanged.';
  assert.equal(git(live.executionRoot, 'ls-files', '--', ':(literal)archive'), '');
  assert.throws(() => mkdirSync(obstacle, { recursive: true }), { code: 'EEXIST' });
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    { role: 'archive-collision', path: 'archive', visibleReport: conclusion },
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  const result = await finishRetainedFiles(
    live,
    seal,
    live.ref(live.sourceRoot, 'plan.md'),
    conclusion,
  );
  assert.deepEqual(readFileSync(obstacle), original);
  assert.equal(
    git(live.executionRoot, 'ls-tree', '-r', '--name-only', result.head, '--', 'archive'),
    '',
  );
  assert.match(
    git(live.executionRoot, 'status', '--porcelain', '--untracked-files=all'),
    /\?\? archive/,
  );
});

function createTypedArchiveObstacle(live, type) {
  const archive = path.join(live.executionRoot, 'archive');
  if (type === 'parent-file') {
    writeFileSync(archive, 'untracked regular archive parent\n');
    return;
  }
  mkdirSync(archive);
  const target = path.join(archive, 'plan.md');
  if (type === 'symlink') symlinkSync('../../unreadable-private-target', target);
  else {
    mkdirSync(path.join(target, 'nested'), { recursive: true });
    mkdirSync(path.join(target, 'empty'));
    writeFileSync(path.join(target, 'root.txt'), 'private root archive bytes\n');
    writeFileSync(path.join(target, 'nested/child.txt'), 'private nested archive bytes\n');
    chmodSync(path.join(target, 'nested/child.txt'), 0o755);
    symlinkSync('../../../unreadable-private-target', path.join(target, 'nested/link'));
  }
}

for (const type of ['parent-file', 'symlink', 'directory'])
  for (const collisionTiming of ['before-preparation', 'after-preparation']) {
    if (type === 'parent-file' && collisionTiming === 'before-preparation') continue;
    test(`typed archive obstruction ${type} ${collisionTiming} survives seal commit handoff and DONE`, async (t) => {
      const live = await preparedForSourceOnlyPlan(
        t,
        type === 'parent-file' ? 'write-failure' : 'collision',
        [],
        {
          ignoreArchive: false,
          untrackedArchiveParent: type === 'parent-file',
          collisionTiming,
          collisionFactory: (live) => createTypedArchiveObstacle(live, type),
        },
      );
      const descriptor = {
        role: 'archive-collision',
        path: type === 'parent-file' ? 'archive' : 'archive/plan.md',
        ...(type === 'parent-file' ? {} : { type }),
        visibleReport: `Archival refused: exact ${type} obstruction retained unchanged.`,
      };
      const before = retainedPlanItem(live, descriptor);
      const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
        descriptor,
      ]);
      const seal = await sourceOnlySeal(live, { retainedFiles });
      const result = await finishRetainedFiles(
        live,
        seal,
        live.ref(live.sourceRoot, 'plan.md'),
        descriptor.visibleReport,
      );
      assert.deepEqual(retainedPlanItem(live, descriptor), before);
      assert.equal(
        git(live.executionRoot, 'ls-tree', '-r', '--name-only', result.head, '--', 'archive'),
        '',
      );
      assert.equal(git(live.executionRoot, 'ls-files', '--', 'archive'), '');
      assert.match(
        git(live.executionRoot, 'status', '--porcelain', '--untracked-files=all'),
        /\?\? archive/,
      );
      if (type === 'symlink')
        assert.equal(
          readlinkSync(path.join(live.executionRoot, descriptor.path)),
          '../../unreadable-private-target',
        );
    });
  }

test('typed archive directory proof detects exhaustive membership type mode link bytes and staging drift', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    collisionFactory: (live) => createTypedArchiveObstacle(live, 'directory'),
  });
  const directory = path.join(live.executionRoot, 'archive/plan.md');
  const descriptor = {
    role: 'archive-collision',
    path: 'archive/plan.md',
    type: 'directory',
    visibleReport: 'Exact directory obstruction retained.',
  };
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    descriptor,
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  git(live.executionRoot, 'commit', '-m', 'deliver implementation excluding directory obstruction');
  const head = git(live.executionRoot, 'rev-parse', 'HEAD');
  const handoff = () =>
    live.call('handoff', {
      ...live.common,
      agentHandle: 'original-child-handle',
      seal,
      head,
      finalPlan: live.ref(live.sourceRoot, 'plan.md'),
    });
  const file = path.join(directory, 'root.txt');
  const bytes = readFileSync(file);
  const link = path.join(directory, 'nested/link');
  const linkText = readlinkSync(link);
  const mode = lstatSync(directory).mode & 0o7777;
  const nested = path.join(directory, 'nested/child.txt');
  for (const [name, change, restore] of [
    [
      'added member',
      () => writeFileSync(path.join(directory, 'extra'), 'extra\n'),
      () => rmSync(path.join(directory, 'extra')),
    ],
    ['missing member', () => rmSync(file), () => writeFileSync(file, bytes)],
    [
      'member type',
      () => {
        rmSync(file);
        symlinkSync('nested/child.txt', file);
      },
      () => {
        rmSync(file);
        writeFileSync(file, bytes);
      },
    ],
    ['root mode', () => chmodSync(directory, mode ^ 0o010), () => chmodSync(directory, mode)],
    ['member mode', () => chmodSync(nested, 0o644), () => chmodSync(nested, 0o755)],
    [
      'link text',
      () => {
        rmSync(link);
        symlinkSync('changed-link-target', link);
      },
      () => {
        rmSync(link);
        symlinkSync(linkText, link);
      },
    ],
    [
      'file bytes',
      () => writeFileSync(file, 'changed private bytes\n'),
      () => writeFileSync(file, bytes),
    ],
    [
      'staged member',
      () => git(live.executionRoot, 'add', 'archive/plan.md/root.txt'),
      () => git(live.executionRoot, 'reset', 'HEAD', '--', 'archive/plan.md/root.txt'),
    ],
  ]) {
    change();
    try {
      await assert.rejects(handoff(), error('CONTENT_DRIFT'), name);
    } finally {
      restore();
    }
  }
  const accepted = await handoff();
  assert.ok(accepted.digest);
});

test('typed archive symlink proof binds opaque link text through handoff', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    collisionFactory: (live) => createTypedArchiveObstacle(live, 'symlink'),
  });
  const link = path.join(live.executionRoot, 'archive/plan.md');
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      type: 'symlink',
      visibleReport: 'Opaque archive link retained.',
    },
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  git(live.executionRoot, 'commit', '-m', 'deliver implementation excluding symlink obstruction');
  const input = {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head: git(live.executionRoot, 'rev-parse', 'HEAD'),
    finalPlan: live.ref(live.sourceRoot, 'plan.md'),
  };
  rmSync(link);
  symlinkSync('../../changed-private-target', link);
  await assert.rejects(live.call('handoff', input), error('CONTENT_DRIFT'));
  rmSync(link);
  symlinkSync('../../unreadable-private-target', link);
  assert.ok((await live.call('handoff', input)).digest);
});

for (const location of ['foreign-root', 'sibling', 'prefix'])
  test(`typed archive retention rejects ${location} authority outside the exact obstruction`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, 'collision', [], { ignoreArchive: false });
    const root = location === 'foreign-root' ? live.sourceRoot : live.executionRoot;
    const name =
      location === 'sibling'
        ? 'archive/another-plan.md'
        : location === 'prefix'
          ? 'archive/plan.md.extra'
          : 'archive/plan.md';
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), 'unrelated bytes cannot gain archive authority\n');
    const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
      {
        role: 'archive-collision',
        root,
        path: name,
        type: 'file',
        visibleReport: 'Invented archive authority.',
      },
    ]);
    await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('AUTHORITY_MISMATCH'));
  });

for (const tracking of ['staged', 'tracked'])
  test(`typed archive directory retention rejects a ${tracking} descendant`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
      ignoreArchive: false,
      collisionFactory: (live) => createTypedArchiveObstacle(live, 'directory'),
      trackCollisionMember: tracking === 'tracked',
    });
    const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
      {
        role: 'archive-collision',
        path: 'archive/plan.md',
        type: 'directory',
        visibleReport: 'Directory must stay unpublished.',
      },
    ]);
    if (tracking === 'staged') git(live.executionRoot, 'add', 'archive/plan.md/root.txt');
    await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('RECHECK_REQUIRED'));
  });

test('typed archive retention rejects a symlink ancestor without following its target', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    collisionTiming: 'after-preparation',
    collisionFactory: (live) => {
      const outside = path.join(live.root, '.effective-flow/outside-archive');
      mkdirSync(outside);
      writeFileSync(path.join(outside, 'plan.md'), 'outside obstruction\n');
      symlinkSync(outside, path.join(live.executionRoot, 'archive'));
    },
  });
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      type: 'file',
      visibleReport: 'Unsafe ancestor is never authority.',
    },
  ]);
  await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('UNSAFE_PATH'));
});

for (const contents of ['empty', 'ignored-only'])
  test(`typed archive ${contents} directory remains truthfully retained through DONE`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
      ignoreArchive: true,
      collisionFactory: (live) => {
        const target = path.join(live.executionRoot, 'archive/plan.md');
        mkdirSync(target, { recursive: true });
        if (contents === 'ignored-only')
          writeFileSync(path.join(target, 'private.txt'), 'ignored archive bytes\n');
      },
    });
    const descriptor = {
      role: 'archive-collision',
      path: 'archive/plan.md',
      type: 'directory',
      visibleReport: 'Exact ignored or empty directory retained.',
    };
    const before = retainedPlanItem(live, descriptor);
    const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
      descriptor,
    ]);
    const seal = await sourceOnlySeal(live, { retainedFiles });
    const result = await finishRetainedFiles(
      live,
      seal,
      live.ref(live.sourceRoot, 'plan.md'),
      descriptor.visibleReport,
      undefined,
      (payload) => {
        payload.retainedWorktree.dirty = false;
      },
    );
    assert.deepEqual(retainedPlanItem(live, descriptor), before);
    assert.equal(result.handoff.dirty, false);
    assert.equal(
      git(live.executionRoot, 'ls-tree', '-r', '--name-only', result.head, '--', 'archive'),
      '',
    );
  });

test('an owned worktree with a sealed archive collision records retained cleanup and DONE without removal', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    ownedDelivery: true,
  });
  assert.equal(live.execution.origin, 'effective-flow-created');
  const obstacle = path.join(live.executionRoot, 'archive/plan.md');
  const original = readFileSync(obstacle);
  const conclusion =
    'Archival refused: owned delivery worktree retains the proven untracked archive collision.';
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    { role: 'archive-collision', path: 'archive/plan.md', visibleReport: conclusion },
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  const lifecycle = path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json');
  const lock = lifecycle.replace(/\.json$/, '.lock');
  const created = JSON.parse(readFileSync(lifecycle));
  const result = await finishRetainedFiles(
    live,
    seal,
    live.ref(live.sourceRoot, 'plan.md'),
    conclusion,
    async () => {
      await assert.rejects(
        issue(live, 'cleanup', live.evidence),
        error('AUTHORITY_MISMATCH'),
        'active owner cannot prove terminal retention',
      );
      const writeLifecycle = (value) => {
        const temporary = `${lifecycle}.tmp`;
        writeFileSync(temporary, JSON.stringify(value));
        renameSync(temporary, lifecycle);
      };
      const ready = {
        ...created,
        status: 'cleanup-ready',
        updatedAt: '2026-10-20T10:01:00Z',
        reason: null,
      };
      for (const [name, value] of [
        ['foreign session', { ...ready, sessionId: 'foreign-run' }],
        [
          'creation identity',
          { ...ready, creationOid: git(live.root, 'hash-object', 'source.txt') },
        ],
        ['creation timestamp', { ...ready, createdAt: '2026-10-19T10:00:00Z' }],
        ['foreign receipt', { ...ready, receipt: { ...ready.receipt, origin: 'harness-managed' } }],
        ['aborted owner', { ...ready, status: 'aborted', reason: 'Stopped before delivery.' }],
        ['failed owner', { ...ready, status: 'failed', reason: 'Delivery failed.' }],
      ]) {
        writeLifecycle(value);
        await assert.rejects(
          issue(live, 'cleanup', live.evidence),
          error('AUTHORITY_MISMATCH'),
          name,
        );
      }
      renameSync(lifecycle, `${lifecycle}.missing`);
      try {
        await assert.rejects(issue(live, 'cleanup', live.evidence), error('ENOENT'));
      } finally {
        renameSync(`${lifecycle}.missing`, lifecycle);
      }
      writeLifecycle(created);
      mkdirSync(lock);
      writeFileSync(
        path.join(lock, 'owner'),
        JSON.stringify({
          actor: live.input.runId,
          workflow: 'build',
          acquiredAt: '2026-10-20T10:01:00Z',
        }),
      );
      try {
        const current = JSON.parse(readFileSync(lifecycle));
        assert.deepEqual(current, created);
        const temporary = `${lifecycle}.tmp`;
        writeFileSync(
          temporary,
          JSON.stringify({
            ...current,
            status: 'cleanup-ready',
            updatedAt: '2026-10-20T10:01:00Z',
            reason: null,
          }),
        );
        renameSync(temporary, lifecycle);
      } finally {
        rmSync(lock, { recursive: true });
      }
    },
    async (payload) => {
      await assert.rejects(
        live.call('terminal', {
          ...payload,
          finalCheckout: { ...payload.finalCheckout, worktreeRemoved: true },
        }),
        error('INCOMPLETE_GATES'),
        'retained output cannot be reported physically removed',
      );
    },
  );
  const accepted = await live.call('verify-terminal', {
    ...live.common,
    terminal: result.terminal,
  });
  assert.equal(accepted.status, 'DONE');
  assert.equal(accepted.finalCheckout.worktreeRemoved, false);
  assert.equal(accepted.retainedWorktree.root, live.executionRoot);
  assert.equal(accepted.retainedWorktree.dirty, true);
  assert.equal(JSON.parse(readFileSync(lifecycle)).status, 'cleanup-ready');
  assert.equal(existsSync(lock), false);
  const cleanupRef = live.gates.find(
    (ref) => path.basename(ref.path) === 'gate-cleanup-handoff.json',
  );
  const cleanup = JSON.parse(readFileSync(path.join(cleanupRef.root, cleanupRef.path)));
  assert.ok(
    cleanup.retainedOwnership,
    'cleanup helper must bind the actual canonical lifecycle record',
  );
  const ownership = JSON.parse(
    readFileSync(path.join(cleanup.retainedOwnership.root, cleanup.retainedOwnership.path)),
  );
  assert.deepEqual(ownership.record, JSON.parse(readFileSync(lifecycle)));
  assert.equal(ownership.ownership.path, '.effective-flow/worktree-runs/owned-delivery.json');
  assert.equal(ownership.ownership.digest, contentDigest(readFileSync(lifecycle)));
  const verify = () => live.call('verify-terminal', { ...live.common, terminal: result.terminal });
  const originalLifecycle = readFileSync(lifecycle);
  const rejectStale = (failure) =>
    ['CONTENT_DRIFT', 'AUTHORITY_MISMATCH', 'DIGEST_MISMATCH'].includes(failure.code);
  writeFileSync(
    lifecycle,
    JSON.stringify({ ...ownership.record, updatedAt: '2026-10-20T10:02:00Z' }),
  );
  await assert.rejects(
    verify(),
    rejectStale,
    'terminal must revalidate the cleanup receipt lifecycle basis',
  );
  writeFileSync(lifecycle, originalLifecycle);
  mkdirSync(lock);
  try {
    await assert.rejects(verify(), error('LOCKED'));
  } finally {
    rmSync(lock, { recursive: true });
  }
  writeFileSync(path.join(live.executionRoot, 'additional-dirt.txt'), 'unproven output\n');
  try {
    await assert.rejects(verify(), error('CONTENT_DRIFT'));
  } finally {
    rmSync(path.join(live.executionRoot, 'additional-dirt.txt'));
  }
  writeFileSync(obstacle, 'changed retained archive bytes\n');
  try {
    await assert.rejects(verify(), error('CONTENT_DRIFT'));
  } finally {
    writeFileSync(obstacle, original);
  }
  assert.equal((await verify()).status, 'DONE');
  assert.deepEqual(readFileSync(obstacle), original);
  assert.equal(
    git(live.executionRoot, 'ls-tree', '-r', '--name-only', result.head, '--', 'archive/plan.md'),
    '',
  );
});

test('retained owned DONE rejects a checkout physically removed after its cleanup receipt', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    ownedDelivery: true,
  });
  const conclusion = 'Owned checkout retains its exact untracked archive obstruction.';
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      visibleReport: conclusion,
    },
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  const lifecycle = path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json');
  const result = await finishRetainedFiles(
    live,
    seal,
    live.ref(live.sourceRoot, 'plan.md'),
    conclusion,
    () => {
      const lock = lifecycle.replace(/\.json$/, '.lock');
      mkdirSync(lock);
      try {
        const record = JSON.parse(readFileSync(lifecycle));
        writeFileSync(
          `${lifecycle}.tmp`,
          JSON.stringify({ ...record, status: 'cleanup-ready', updatedAt: '2026-10-20T10:01:00Z' }),
        );
        renameSync(`${lifecycle}.tmp`, lifecycle);
      } finally {
        rmSync(lock, { recursive: true });
      }
    },
  );
  const terminal = JSON.parse(readFileSync(path.join(result.terminal.root, result.terminal.path)));
  assert.equal(terminal.finalCheckout.worktreeRemoved, false);
  rmSync(path.join(live.executionRoot, 'archive'), { recursive: true });
  git(live.root, 'worktree', 'remove', live.executionRoot);
  assert.equal(existsSync(live.executionRoot), false);
  assert.equal(existsSync(lifecycle), true);
  await assert.rejects(
    live.call('verify-terminal', { ...live.common, terminal: result.terminal }),
    error('CONTENT_DRIFT'),
    'a retained cleanup proof cannot report a missing checkout as still retained',
  );
});

for (const size of [1024 * 1024, 1024 * 1024 + 1])
  test(`typed archive directory observation enforces the one-megabyte byte boundary at ${size}`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
      ignoreArchive: false,
      collisionFactory: (live) => {
        const target = path.join(live.executionRoot, 'archive/plan.md');
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, 'data'), Buffer.alloc(size, 0x61));
      },
    });
    const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
      {
        role: 'archive-collision',
        path: 'archive/plan.md',
        type: 'directory',
        visibleReport: 'Bounded directory obstruction retained.',
      },
    ]);
    if (size === 1024 * 1024) assert.ok((await sourceOnlySeal(live, { retainedFiles })).digest);
    else await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('TOO_LARGE'));
  });

test('typed archive live inventory stops at its 1024-entry boundary', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    collisionFactory: (live) =>
      mkdirSync(path.join(live.executionRoot, 'archive/plan.md'), { recursive: true }),
  });
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      type: 'directory',
      visibleReport: 'Empty directory proof cannot authorize unbounded later members.',
    },
  ]);
  for (let i = 0; i < 1024; i++)
    writeFileSync(
      path.join(live.executionRoot, 'archive/plan.md', `entry-${String(i).padStart(4, '0')}`),
      '',
    );
  await assert.rejects(
    sourceOnlySeal(live, { retainedFiles }),
    (failure) =>
      failure.code === 'CONTENT_DRIFT' &&
      failure.message === 'retained obstruction inventory changed',
    'exactly 1024 observed entries reach identity validation rather than exceeding the entry cap',
  );
  writeFileSync(path.join(live.executionRoot, 'archive/plan.md/entry-1024'), '');
  await assert.rejects(
    sourceOnlySeal(live, { retainedFiles }),
    (failure) =>
      failure.code === 'TOO_LARGE' &&
      failure.message === 'retained obstruction exceeds entry bound',
  );
});

test('typed archive directory evidence keeps the existing control-record byte cap', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: false,
    collisionFactory: (live) => {
      const target = path.join(live.executionRoot, 'archive/plan.md');
      mkdirSync(target, { recursive: true });
      for (let i = 0; i < 140; i++)
        writeFileSync(path.join(target, `entry-${String(i).padStart(4, '0')}`), '');
    },
  });
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      type: 'directory',
      visibleReport: 'Inventory must fit existing control evidence.',
    },
  ]);
  assert.ok(
    readFileSync(path.join(retainedFiles.root, retainedFiles.path)).length > MAX_CONTROL_BYTES,
  );
  await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('TOO_LARGE'));
});

test('owned retained cleanup-failed lifecycle preserves its observed command failure through DONE', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
    ignoreArchive: true,
    ownedDelivery: true,
  });
  const conclusion = 'Ignored archive obstruction remains in the owned worktree.';
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      visibleReport: conclusion,
    },
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  const lifecycle = path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json');
  const removalFailure = 'git worktree remove failed: fixture filesystem refused removal.';
  const result = await finishRetainedFiles(
    live,
    seal,
    live.ref(live.sourceRoot, 'plan.md'),
    conclusion,
    () => {
      assert.equal(
        git(
          live.executionRoot,
          'status',
          '--porcelain',
          '--untracked-files=all',
          '--ignore-submodules=none',
        ),
        '',
      );
      const lock = lifecycle.replace(/\.json$/, '.lock');
      mkdirSync(lock);
      writeFileSync(
        path.join(lock, 'owner'),
        JSON.stringify({
          actor: 'fixture-cleanup',
          workflow: 'cleanup',
          acquiredAt: '2026-10-20T10:01:01Z',
        }),
      );
      const originalRunner = live.deps.runner;
      const args = ['-C', live.root, 'worktree', 'remove', live.executionRoot];
      // The lifecycle fixture injects one external removal failure; checkout and ownership stay real.
      live.deps.runner = (call) =>
        call.executable === 'git' && JSON.stringify(call.args) === JSON.stringify(args)
          ? { status: 1, stdout: '', stderr: removalFailure }
          : originalRunner(call);
      const persist = (record) => {
        writeFileSync(`${lifecycle}.tmp`, JSON.stringify(record));
        renameSync(`${lifecycle}.tmp`, lifecycle);
      };
      try {
        const created = JSON.parse(readFileSync(lifecycle));
        persist({
          ...created,
          status: 'cleanup-ready',
          updatedAt: '2026-10-20T10:01:00Z',
          reason: null,
        });
        persist({
          ...created,
          status: 'cleanup-in-progress',
          updatedAt: '2026-10-20T10:01:01Z',
          reason: 'Removal claimed.',
          cleanupRunId: 'fixture-cleanup',
          claimedAt: '2026-10-20T10:01:01Z',
        });
        const failed = live.deps.runner({ executable: 'git', args, cwd: live.root });
        assert.equal(failed.status, 1);
        persist({
          ...created,
          status: 'cleanup-failed',
          updatedAt: '2026-10-20T10:01:02Z',
          reason: failed.stderr,
        });
      } finally {
        live.deps.runner = originalRunner;
        rmSync(lock, { recursive: true });
      }
    },
    (payload) => {
      payload.retainedWorktree.dirty = false;
      payload.retainedWorktree.reason = `${conclusion} ${removalFailure}`;
      payload.conclusion = payload.retainedWorktree.reason;
    },
  );
  const accepted = await live.call('verify-terminal', {
    ...live.common,
    terminal: result.terminal,
  });
  assert.equal(accepted.status, 'DONE');
  assert.equal(accepted.finalCheckout.worktreeRemoved, false);
  assert.equal(accepted.retainedWorktree.dirty, false);
  assert.equal(JSON.parse(readFileSync(lifecycle)).status, 'cleanup-failed');
  assert.match(accepted.retainedWorktree.reason, /fixture filesystem refused removal/);
});

for (const collisionTiming of ['before-preparation', 'after-preparation'])
  test(`nonignored untracked archive collision ${collisionTiming} is retained without entering the delivery tree`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, 'collision', [], {
      ignoreArchive: false,
      collisionTiming,
    });
    const archive = path.join(live.executionRoot, 'archive/plan.md');
    const originalArchive = readFileSync(archive);
    const source = readFileSync(path.join(live.sourceRoot, 'plan.md'));
    assert.equal(git(live.executionRoot, 'ls-files', '--', ':(literal)archive/plan.md'), '');
    const ignore = spawnSync(
      'git',
      ['-C', live.executionRoot, 'check-ignore', '--quiet', '--no-index', 'archive/plan.md'],
      { env },
    );
    assert.equal(ignore.status, 1, 'the collision must be an ordinary nonignored untracked file');
    const conclusion = 'Archival refused: nonignored untracked archive target retained unchanged.';
    const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
      { role: 'archive-collision', path: 'archive/plan.md', visibleReport: conclusion },
    ]);
    if (collisionTiming === 'after-preparation') {
      const completion = {
        completionBasis: live.prepared,
        currentPlan: live.ref(live.sourceRoot, 'plan.md'),
        retainedFiles,
      };
      const prepared = JSON.parse(readFileSync(path.join(live.prepared.root, live.prepared.path)));
      const completed = ['independent-review', 'final-validation'];
      const checkpoint = await live.call('checkpoint', {
        ...live.common,
        ...completion,
        checkpointId: 'late-collision',
        agentHandle: 'original-child-handle',
        completed,
        pending: REQUIRED_GATES.filter((gate) => !completed.includes(gate)),
        evidence: prepared.gates,
      });
      const value = JSON.parse(readFileSync(path.join(checkpoint.root, checkpoint.path)));
      assert.deepEqual(value.retainedFiles, retainedFiles);
      assert.notEqual(
        value.snapshot.untracked,
        prepared.snapshot.untracked,
        'the raw snapshot still observes the retained archive',
      );
      const question = await live.call('question', {
        ...live.common,
        ...completion,
        checkpoint,
        questionId: 'late-collision',
        revision: 1,
        origin: 'completion-recovery',
        agentHandle: 'original-child-handle',
        question: 'Continue delivery while retaining the colliding archive?',
        options: ['Continue', 'Stop'],
        responseType: 'option',
      });
      const reply = await live.call('reply', {
        ...live.common,
        ...completion,
        question,
        trustedUser: trusted(question, 'Continue'),
      });
      const resumed = await live.call('resume', {
        ...live.common,
        ...completion,
        question,
        reply,
        agentHandle: 'original-child-handle',
      });
      assert.equal(resumed.authority, 'product');
    }
    const seal = await sourceOnlySeal(live, { retainedFiles });
    const result = await finishRetainedFiles(
      live,
      seal,
      live.ref(live.sourceRoot, 'plan.md'),
      conclusion,
    );
    assert.deepEqual(readFileSync(archive), originalArchive);
    assert.deepEqual(readFileSync(path.join(live.sourceRoot, 'plan.md')), source);
    assert.equal(
      git(
        live.executionRoot,
        'ls-tree',
        '-r',
        '--name-only',
        result.head,
        '--',
        'plan.md',
        'archive/plan.md',
      ),
      '',
    );
    assert.match(
      git(live.executionRoot, 'status', '--porcelain', '--untracked-files=all'),
      /\?\? archive\/plan\.md/,
    );
  });

async function preparedForLocalUntrackedPlan(t, writeFailure = false) {
  const fx = fixture(t);
  git(fx.root, 'rm', '--cached', 'plan.md');
  if (writeFailure) {
    writeFileSync(path.join(fx.root, 'archive'), 'existing archive parent is a file\n');
    git(fx.root, 'add', 'archive');
  }
  git(fx.root, 'commit', '-m', 'leave unpublished local plan untracked');
  fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
  const live = await setupDelivery(await start(fx));
  writeFileSync(path.join(live.root, 'source.txt'), 'delivered implementation\n');
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of REQUIRED_GATES.filter(
    (name) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(name),
  ))
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'local-untracked-plan',
    agentHandle: 'original-child-handle',
    gates: gates.filter((item) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(item.path)),
    ),
  });
  return { ...live, evidence, gates, prepared };
}

test('nonignored local untracked plan remains unpublished after an archive write refusal', async (t) => {
  const live = await preparedForLocalUntrackedPlan(t, true);
  const original = readFileSync(path.join(live.root, 'plan.md'));
  const conclusion =
    'Archival refused: original nonignored local plan retained untracked and unpublished.';
  const retainedFiles = await retainPlanFiles(live, live.ref(live.root, 'plan.md'), [
    { role: 'unarchived-original', path: 'plan.md', visibleReport: conclusion },
  ]);
  git(live.root, 'add', 'source.txt');
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'local-untracked-plan',
    basis: live.prepared,
    finalPlan: live.ref(live.root, 'plan.md'),
    expectedTree: git(live.root, 'write-tree'),
    judgments: [],
    archivalRefusal: { reason: 'write-failure' },
    retainedFiles,
  });
  const result = await finishRetainedFiles(live, seal, live.ref(live.root, 'plan.md'), conclusion);
  assert.deepEqual(readFileSync(path.join(live.root, 'plan.md')), original);
  assert.equal(git(live.root, 'ls-tree', '-r', '--name-only', result.head, '--', 'plan.md'), '');
  assert.equal(git(live.root, 'ls-files', '--', ':(literal)plan.md'), '');
});

test('a retained originally untracked local plan cannot be staged for publication after preparation', async (t) => {
  const live = await preparedForLocalUntrackedPlan(t, true);
  const retainedFiles = await retainPlanFiles(live, live.ref(live.root, 'plan.md'), [
    {
      role: 'unarchived-original',
      path: 'plan.md',
      visibleReport: 'Original plan must remain untracked.',
    },
  ]);
  git(live.root, 'add', 'source.txt', 'plan.md');
  for (const extra of [{}, { retainedFiles }])
    await assert.rejects(
      live.call('seal-delivery', {
        ...live.common,
        agentHandle: 'original-child-handle',
        sealId: 'untracked-plan-tracking-drift',
        basis: live.prepared,
        finalPlan: live.ref(live.root, 'plan.md'),
        expectedTree: git(live.root, 'write-tree'),
        judgments: [],
        archivalRefusal: { reason: 'write-failure' },
        ...extra,
      }),
      error('AUTHORITY_MISMATCH'),
    );
});

test('refused cleanup retains an edited untracked original beside the committed canonical archive', async (t) => {
  const live = await preparedForLocalUntrackedPlan(t);
  const original = readFileSync(path.join(live.root, 'plan.md'), 'utf8');
  mkdirSync(path.join(live.root, 'archive'));
  writeFileSync(
    path.join(live.root, 'archive/plan.md'),
    original.replace('Not implemented', 'Implemented') +
      '\n## Build completion\n\nCompleted and reviewed.\n',
  );
  const userEdit =
    '# User changed the unpublished original during cleanup\n\n**Plan status:** Not implemented\n';
  writeFileSync(path.join(live.root, 'plan.md'), userEdit);
  const conclusion =
    'Plan archived; cleanup refused because the untracked original changed after its captured digest.';
  const retainedFiles = await retainPlanFiles(live, live.ref(live.root, 'archive/plan.md'), [
    { role: 'cleanup-refused', path: 'plan.md', visibleReport: conclusion },
  ]);
  git(live.root, 'add', 'source.txt', 'archive/plan.md');
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'refused-cleanup',
    basis: live.prepared,
    finalPlan: live.ref(live.root, 'archive/plan.md'),
    expectedTree: git(live.root, 'write-tree'),
    judgments: [],
    retainedFiles,
  });
  const result = await finishRetainedFiles(live, seal, { path: 'archive/plan.md' }, conclusion);
  assert.equal(readFileSync(path.join(live.root, 'plan.md'), 'utf8'), userEdit);
  assert.equal(git(live.root, 'ls-tree', '-r', '--name-only', result.head, '--', 'plan.md'), '');
  assert.equal(
    git(live.root, 'ls-tree', '-r', '--name-only', result.head, '--', 'archive/plan.md'),
    'archive/plan.md',
  );
  assert.equal(git(live.root, 'ls-files', '--', ':(literal)plan.md'), '');
});

for (const [name, staged] of [
  ['unrelated.txt', false],
  ['new-code.mjs', false],
  ['archive/another-plan.md', false],
  ['staged-foreign.mjs', true],
])
  test(`retaining a known plan collision never excludes unrelated ${staged ? 'staged' : 'untracked'} ${name}`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, 'collision', [], { ignoreArchive: false });
    const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
      {
        role: 'archive-collision',
        path: 'archive/plan.md',
        visibleReport: 'Untracked archive collision retained unchanged.',
      },
    ]);
    writeFileSync(path.join(live.executionRoot, name), 'unreviewed unrelated content\n');
    if (staged) git(live.executionRoot, 'add', name);
    await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('RECHECK_REQUIRED'));
    assert.equal(git(live.executionRoot, 'ls-files', '--', ':(literal)archive/plan.md'), '');
  });

test('an archive collision cannot be staged as a foreign deliverable to bypass its retained-file authority', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], { ignoreArchive: false });
  const before = readFileSync(path.join(live.executionRoot, 'archive/plan.md'));
  git(live.executionRoot, 'add', 'archive/plan.md');
  await assert.rejects(sourceOnlySeal(live), error('MISSING_EVIDENCE'));
  assert.deepEqual(readFileSync(path.join(live.executionRoot, 'archive/plan.md')), before);
});

test('retained archive exclusions bind exact content, executable mode and tracking through handoff and later verification', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], { ignoreArchive: false });
  const archive = path.join(live.executionRoot, 'archive/plan.md');
  const original = readFileSync(archive);
  const originalMode = statSync(archive).mode & 0o777;
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      visibleReport: 'Untracked archive collision retained unchanged.',
    },
  ]);
  const seal = await sourceOnlySeal(live, { retainedFiles });
  git(
    live.executionRoot,
    'commit',
    '-m',
    'deliver implementation with separately retained collision',
  );
  const handoffInput = {
    ...live.common,
    agentHandle: 'original-child-handle',
    seal,
    head: git(live.executionRoot, 'rev-parse', 'HEAD'),
    finalPlan: live.ref(live.sourceRoot, 'plan.md'),
  };
  writeFileSync(archive, '# Changed foreign archive after seal\n');
  await assert.rejects(live.call('handoff', handoffInput), error('CONTENT_DRIFT'));
  writeFileSync(archive, original);
  chmodSync(archive, originalMode | 0o111);
  await assert.rejects(live.call('handoff', handoffInput), error('CONTENT_DRIFT'));
  chmodSync(archive, originalMode);
  git(live.executionRoot, 'add', 'archive/plan.md');
  await assert.rejects(live.call('handoff', handoffInput), error('CONTENT_DRIFT'));
  git(live.executionRoot, 'reset', 'HEAD', '--', 'archive/plan.md');
  const handoff = await live.call('handoff', handoffInput);
  assert.ok(handoff.digest);
  writeFileSync(archive, '# Changed foreign archive after handoff\n');
  await assert.rejects(issue(live, 'plan-archival', live.evidence), error('CONTENT_DRIFT'));
  writeFileSync(archive, original);
  const record = path.join(retainedFiles.root, retainedFiles.path);
  writeFileSync(record, readFileSync(record, 'utf8') + '\n');
  await assert.rejects(issue(live, 'plan-archival', live.evidence), error('DIGEST_MISMATCH'));
  assert.equal(
    git(
      live.executionRoot,
      'ls-tree',
      '-r',
      '--name-only',
      handoffInput.head,
      '--',
      'archive/plan.md',
    ),
    '',
  );
});

test('retained-file evidence cannot give an unrelated source file plan-path authority', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision', [], { ignoreArchive: false });
  writeFileSync(path.join(live.executionRoot, 'unrelated.mjs'), 'unreviewed product code\n');
  const retainedFiles = await retainPlanFiles(live, live.ref(live.sourceRoot, 'plan.md'), [
    {
      role: 'archive-collision',
      path: 'archive/plan.md',
      visibleReport: 'Untracked archive retained.',
    },
    {
      role: 'archive-collision',
      path: 'unrelated.mjs',
      visibleReport: 'This must never authorize unrelated code.',
    },
  ]);
  await assert.rejects(sourceOnlySeal(live, { retainedFiles }), error('AUTHORITY_MISMATCH'));
});

test('retained local original plan bytes cannot drift between seal and committed handoff', async (t) => {
  const live = await preparedForLocalUntrackedPlan(t, true);
  const finalPlan = live.ref(live.root, 'plan.md');
  const retainedFiles = await retainPlanFiles(live, finalPlan, [
    {
      role: 'unarchived-original',
      path: 'plan.md',
      visibleReport: 'Original unpublished plan retained.',
    },
  ]);
  git(live.root, 'add', 'source.txt');
  const seal = await live.call('seal-delivery', {
    ...live.common,
    agentHandle: 'original-child-handle',
    sealId: 'retained-local-original',
    basis: live.prepared,
    finalPlan,
    expectedTree: git(live.root, 'write-tree'),
    judgments: [],
    archivalRefusal: { reason: 'write-failure' },
    retainedFiles,
  });
  git(live.root, 'commit', '-m', 'deliver other product files without publishing the local plan');
  writeFileSync(path.join(live.root, 'plan.md'), '# Tampered retained original after seal\n');
  await assert.rejects(
    live.call('handoff', {
      ...live.common,
      agentHandle: 'original-child-handle',
      seal,
      head: git(live.root, 'rev-parse', 'HEAD'),
      finalPlan,
    }),
    error('CONTENT_DRIFT'),
  );
});

async function preparedExecutionPlanCopy(t, variant = 'valid') {
  const live = await setupDelivery(await start(fixture(t, true)));
  const approved = readFileSync(path.join(live.root, 'plan.md'), 'utf8');
  const file = path.join(live.executionRoot, 'plan.md');
  const originalBlob = git(live.executionRoot, 'rev-parse', ':plan.md');
  assert.notEqual(live.input.plan.root, live.executionRoot);
  assert.equal(git(live.executionRoot, 'rev-parse', '--git-common-dir'), live.repositoryIdentity);
  assert.equal(readFileSync(file, 'utf8'), approved);
  if (variant === 'different-working-bytes') {
    writeFileSync(file, approved.replace('Approved Feature', 'Different execution requirements'));
  } else if (variant === 'different-index-blob') {
    const staged = path.join(live.root, '.effective-flow', 'different-index-plan.txt');
    writeFileSync(staged, approved.replace('Approved Feature', 'Different staged requirements'));
    const blob = git(live.root, 'hash-object', '-w', staged);
    git(live.executionRoot, 'update-index', '--cacheinfo', `100644,${blob},plan.md`);
    assert.notEqual(git(live.executionRoot, 'rev-parse', ':plan.md'), originalBlob);
    assert.equal(readFileSync(file, 'utf8'), approved);
  } else if (variant === 'different-index-mode') {
    assert.equal(statSync(file).mode & 0o111, 0);
    git(live.executionRoot, 'update-index', '--chmod=+x', 'plan.md');
    assert.match(git(live.executionRoot, 'ls-files', '--stage', '--', 'plan.md'), /^100755 /);
    assert.equal(readFileSync(file, 'utf8'), approved);
  } else if (variant === 'conflict-index-stages') {
    git(live.executionRoot, 'update-index', '--force-remove', 'plan.md');
    const conflict = spawnSync('git', ['-C', live.executionRoot, 'update-index', '--index-info'], {
      env,
      encoding: 'utf8',
      input: [1, 2, 3].map((stage) => `100644 ${originalBlob} ${stage}\tplan.md\n`).join(''),
    });
    assert.equal(conflict.status, 0, conflict.stderr);
    assert.equal(
      git(live.executionRoot, 'ls-files', '--unmerged', '--', 'plan.md').split('\n').length,
      3,
    );
    assert.equal(readFileSync(file, 'utf8'), approved);
  }
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of ['independent-review', 'final-validation'])
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    preparationId: 'execution-copy',
    agentHandle: 'original-child-handle',
    gates,
  });
  return { ...live, evidence, gates, prepared, approved, variant };
}
function writeCanonicalExecutionArchive(live, approved) {
  mkdirSync(path.join(live.executionRoot, 'archive'), { recursive: true });
  writeFileSync(
    path.join(live.executionRoot, 'archive/plan.md'),
    approved.replace('Not implemented', 'Implemented') +
      '\n## Build completion\n\nCompleted and reviewed.\n',
  );
  return live.ref(live.executionRoot, 'archive/plan.md');
}
function movePreparedExecutionCopy(live) {
  if (live.variant === 'conflict-index-stages') {
    git(live.executionRoot, 'rm', '--cached', '-f', '--', 'plan.md');
    rmSync(path.join(live.executionRoot, 'plan.md'));
    writeCanonicalExecutionArchive(live, live.approved);
  } else {
    writeFileSync(
      path.join(live.executionRoot, 'plan.md'),
      live.approved.replace('Not implemented', 'Implemented') +
        '\n## Build completion\n\nCompleted and reviewed.\n',
    );
    mkdirSync(path.join(live.executionRoot, 'archive'));
    git(live.executionRoot, 'mv', '--', 'plan.md', 'archive/plan.md');
  }
  git(live.executionRoot, 'add', '--', 'archive/plan.md');
  assert.equal(existsSync(path.join(live.executionRoot, 'plan.md')), false);
  assert.equal(git(live.executionRoot, 'ls-files', '--stage', '--', 'plan.md'), '');
  return live.ref(live.executionRoot, 'archive/plan.md');
}
function executionCopyCheckpoint(live, currentPlan, checkpointId) {
  const completed = ['independent-review', 'final-validation'];
  return live.call('checkpoint', {
    ...live.common,
    checkpointId,
    agentHandle: 'original-child-handle',
    completionBasis: live.prepared,
    currentPlan,
    completed,
    pending: REQUIRED_GATES.filter((gate) => !completed.includes(gate)),
    evidence: live.gates,
  });
}

test('a proved tracked execution copy can be removed into its canonical archive while carrying both prepared acceptance gates', async (t) => {
  const live = await preparedExecutionPlanCopy(t);
  const currentPlan = movePreparedExecutionCopy(live);
  const checkpoint = await executionCopyCheckpoint(live, currentPlan, 'proved-copy-removal');
  const value = JSON.parse(readFileSync(path.join(checkpoint.root, checkpoint.path)));
  assert.deepEqual(value.completed, ['independent-review', 'final-validation']);
  assert.deepEqual(value.evidence, live.gates);
  assert.equal(readFileSync(path.join(live.root, 'plan.md'), 'utf8'), live.approved);
});

for (const variant of [
  'different-working-bytes',
  'different-index-blob',
  'different-index-mode',
  'conflict-index-stages',
])
  test(`an execution copy with ${variant} at preparation never receives archive-removal authority`, async (t) => {
    const live = await preparedExecutionPlanCopy(t, variant);
    const finalPlan = movePreparedExecutionCopy(live);
    await assert.rejects(
      live.call('seal-delivery', {
        ...live.common,
        agentHandle: 'original-child-handle',
        sealId: 'unproved-copy-removal',
        basis: live.prepared,
        finalPlan,
        expectedTree: git(live.executionRoot, 'write-tree'),
        judgments: [],
      }),
      error('RECHECK_REQUIRED'),
    );
    assert.equal(readFileSync(path.join(live.root, 'plan.md'), 'utf8'), live.approved);
  });

for (const removedFrom of ['working-tree-only', 'index-only'])
  test(`a proved execution copy removed from ${removedFrom} cannot carry old acceptance gates`, async (t) => {
    const live = await preparedExecutionPlanCopy(t);
    const currentPlan = writeCanonicalExecutionArchive(live, live.approved);
    git(live.executionRoot, 'add', '--', 'archive/plan.md');
    if (removedFrom === 'working-tree-only') {
      rmSync(path.join(live.executionRoot, 'plan.md'));
      assert.match(
        git(live.executionRoot, 'ls-files', '--stage', '--', 'plan.md'),
        / 0\tplan\.md$/,
      );
    } else {
      git(live.executionRoot, 'rm', '--cached', '-f', '--', 'plan.md');
      assert.equal(readFileSync(path.join(live.executionRoot, 'plan.md'), 'utf8'), live.approved);
    }
    await assert.rejects(
      executionCopyCheckpoint(live, currentPlan, 'incomplete-copy-removal'),
      error('CONTENT_DRIFT'),
    );
  });

test('an identical execution plan first staged after preparation cannot acquire copy metadata authority', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, undefined, [], { ignoreArchive: false });
  const approved = readFileSync(path.join(live.sourceRoot, 'plan.md'), 'utf8');
  const currentPlan = writeCanonicalExecutionArchive(live, approved);
  git(live.executionRoot, 'add', '--', 'archive/plan.md');
  const prepared = JSON.parse(readFileSync(path.join(live.prepared.root, live.prepared.path)));
  const checkpointLive = { ...live, gates: prepared.gates };
  assert.ok(
    (await executionCopyCheckpoint(checkpointLive, currentPlan, 'before-late-copy')).digest,
  );
  writeFileSync(path.join(live.executionRoot, 'plan.md'), approved);
  git(live.executionRoot, 'add', '--', 'plan.md');
  await assert.rejects(
    executionCopyCheckpoint(checkpointLive, currentPlan, 'after-late-copy'),
    error('CONTENT_DRIFT'),
  );
});

for (const aliasTracking of ['untracked', 'staged'])
  test(`a retained external source plan never exempts ${aliasTracking} content at the same relative execution path from renewed checkpoint checks`, async (t) => {
    const live = await preparedForSourceOnlyPlan(t, undefined, [], { ignoreArchive: false });
    const approved = readFileSync(path.join(live.sourceRoot, 'plan.md'), 'utf8');
    mkdirSync(path.join(live.executionRoot, 'archive'));
    const archive =
      approved.replace('Not implemented', 'Implemented') +
      '\n## Build completion\n\nCompleted and reviewed.\n';
    writeFileSync(path.join(live.executionRoot, 'archive/plan.md'), archive);
    const userEdit =
      '# User edited the external unpublished original\n\n**Plan status:** Not implemented\n';
    writeFileSync(path.join(live.sourceRoot, 'plan.md'), userEdit);
    const currentPlan = live.ref(live.executionRoot, 'archive/plan.md');
    const retainedFiles = await retainPlanFiles(live, currentPlan, [
      {
        role: 'cleanup-refused',
        root: live.sourceRoot,
        path: 'plan.md',
        visibleReport: 'Cleanup refused: edited external source plan retained unchanged.',
      },
    ]);
    const prepared = JSON.parse(readFileSync(path.join(live.prepared.root, live.prepared.path)));
    const completed = ['independent-review', 'final-validation'];
    const checkpoint = (checkpointId) =>
      live.call('checkpoint', {
        ...live.common,
        checkpointId,
        agentHandle: 'original-child-handle',
        completionBasis: live.prepared,
        currentPlan,
        retainedFiles,
        completed,
        pending: REQUIRED_GATES.filter((gate) => !completed.includes(gate)),
        evidence: prepared.gates,
      });
    const control = await checkpoint(`no-alias-${aliasTracking}`);
    assert.equal(
      JSON.parse(readFileSync(path.join(control.root, control.path))).authority,
      'product',
    );
    writeFileSync(
      path.join(live.executionRoot, 'plan.md'),
      '# Unreviewed execution-checkout content with the same relative path\n',
    );
    if (aliasTracking === 'staged') git(live.executionRoot, 'add', 'plan.md');
    await assert.rejects(checkpoint(`with-alias-${aliasTracking}`), error('CONTENT_DRIFT'));
    assert.equal(readFileSync(path.join(live.sourceRoot, 'plan.md'), 'utf8'), userEdit);
    assert.equal(readFileSync(path.join(live.executionRoot, 'archive/plan.md'), 'utf8'), archive);
  });

test('source-only refusal rejects a foreign allowed root and another plan path', async (t) => {
  const foreign = fixture(t);
  const live = await preparedForSourceOnlyPlan(t, 'collision', [foreign.root]);
  await assert.rejects(
    sourceOnlySeal(live, { finalPlan: live.ref(foreign.root, 'plan.md') }),
    error('AUTHORITY_MISMATCH'),
  );
  writeFileSync(
    path.join(live.sourceRoot, 'another-plan.md'),
    readFileSync(path.join(live.sourceRoot, 'plan.md')),
  );
  await assert.rejects(
    sourceOnlySeal(live, { finalPlan: live.ref(live.sourceRoot, 'another-plan.md') }),
    error('AUTHORITY_MISMATCH'),
  );
});

test('source-only refusal rejects source worktree common-identity substitution', async (t) => {
  const foreign = fixture(t);
  const live = await preparedForSourceOnlyPlan(t, 'collision', [foreign.root]);
  const gitFile = path.join(live.sourceRoot, '.git');
  const original = readFileSync(gitFile);
  writeFileSync(gitFile, `gitdir: ${foreign.repositoryIdentity}\n`);
  try {
    await assert.rejects(sourceOnlySeal(live), error('REPOSITORY_MISMATCH'));
  } finally {
    writeFileSync(gitFile, original);
  }
});

test('source-only refusal rechecks external plan bytes between seal and committed handoff', async (t) => {
  const live = await preparedForSourceOnlyPlan(t, 'collision');
  const originalPlan = live.ref(live.sourceRoot, 'plan.md');
  const seal = await sourceOnlySeal(live);
  git(live.executionRoot, 'commit', '-m', 'deliver implementation while retaining source plan');
  writeFileSync(
    path.join(live.sourceRoot, 'plan.md'),
    '# Changed requirements after seal\n\n**Plan status:** Not implemented\n',
  );
  await assert.rejects(
    live.call('handoff', {
      ...live.common,
      agentHandle: 'original-child-handle',
      seal,
      head: git(live.executionRoot, 'rev-parse', 'HEAD'),
      finalPlan: originalPlan,
    }),
    error('DIGEST_MISMATCH'),
  );
});

test('caller-observed archival refusal rejects foreign, stale, tampered, undisclosed and helper-error evidence', async (t) => {
  const live = await preparedForRetainedPlan(t);
  const observed = observedRefusal(live, 'mkdir');
  const cases = [
    [
      'foreign-run',
      (value) => {
        value.runId = 'foreign-run';
      },
      'FOREIGN_RECORD',
    ],
    [
      'foreign-agent',
      (value) => {
        value.agentHandle = 'replacement-child';
      },
      'AGENT_MISMATCH',
    ],
    [
      'stale-preparation',
      (value) => {
        value.completionBasis.digest = contentDigest('stale receipt');
      },
      'FOREIGN_RECORD',
    ],
    [
      'stale-plan',
      (value) => {
        value.currentPlan.digest = contentDigest('stale plan bytes');
      },
      'FOREIGN_RECORD',
    ],
    [
      'missing-report',
      (value) => {
        delete value.visibleReport;
      },
      'INVALID_PAYLOAD',
    ],
    [
      'helper-error',
      (value) => {
        value.observedError.code = 'CONTENT_DRIFT';
      },
      'INVALID_PAYLOAD',
    ],
    [
      'unmeasured-error',
      (value) => {
        value.observedError.code = null;
        value.observedError.exitCode = null;
      },
      'INVALID_PAYLOAD',
    ],
    [
      'wrong-operation',
      (value) => {
        value.failedOperation = 'tracking-probe';
      },
      'INVALID_PAYLOAD',
    ],
  ];
  for (const [name, mutate, expectedCode] of cases) {
    const value = structuredClone(observed);
    mutate(value);
    const evidence = await retainRefusal(live, value, name);
    await assert.rejects(retainedSeal(live, evidence), error(expectedCode), name);
  }
  const tampered = await retainRefusal(live, observed, 'tampered-refusal');
  writeFileSync(
    path.join(tampered.root, tampered.path),
    JSON.stringify({ ...observed, visibleReport: 'Changed after retention.' }),
  );
  await assert.rejects(retainedSeal(live, tampered), error('DIGEST_MISMATCH'));
  await assert.rejects(
    retainedSeal(live, tampered, { archivalRefusal: true }),
    error('INVALID_PAYLOAD'),
  );
});

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
