import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  contentDigest,
  encodeControl,
  limitationText,
  MAX_CONTROL_BYTES,
  MAX_DISPATCH_BYTES,
  MAX_RETAINED_EVIDENCE_BYTES,
  REQUIRED_GATES,
  canonicalPlanStatusLines,
  planCompletionMismatch,
} from '../src/scripts/build-run-core.mjs';
import {
  authorizePlan,
  completed,
  durable,
  env,
  error,
  fixture,
  git,
  issue,
  lifecycleFixture,
  pause,
  publishedPlanFixture,
  recordLane,
  setupDelivery,
  setupTable,
  start,
  terminalInput,
  trusted,
} from './support/build-run-fixtures.mjs';

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

function committedBlob(live, bytes) {
  const hashed = spawnSync('git', ['-C', live.root, 'hash-object', '-w', '--stdin'], {
    env,
    input: bytes,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(hashed.status, 0, String(hashed.stderr));
  const blob = String(hashed.stdout).trim();
  const tree = spawnSync('git', ['-C', live.root, 'mktree'], {
    env,
    encoding: 'utf8',
    input: `100644 blob ${blob}\tbig.bin\n`,
  });
  assert.equal(tree.status, 0, tree.stderr);
  const commit = git(live.root, 'commit-tree', tree.stdout.trim(), '-m', 'detached evidence blob');
  return {
    repositoryIdentity: live.repositoryIdentity,
    commit,
    blob,
    path: 'big.bin',
    digest: contentDigest(bytes),
  };
}

function recordGitCalls(t, live, override = () => undefined) {
  const original = live.deps.runner;
  const calls = [];
  live.deps.runner = (call) => {
    calls.push(call.args.slice(2));
    const answered = override(call);
    if (answered) return answered;
    if (call.args.includes('cat-file') && call.stdoutBuffer) {
      const result = spawnSync(call.executable, call.args, {
        cwd: call.cwd,
        env,
        maxBuffer: 4 * 1024 * 1024,
      });
      return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      };
    }
    return original(call);
  };
  t.after(() => {
    live.deps.runner = original;
  });
  return calls;
}

const catFileCalls = (calls, mode, blob) =>
  calls.filter((args) => args[0] === 'cat-file' && args[1] === mode && args[2] === blob);

test('a committed evidence blob above the retained-evidence limit is rejected on its size before any content read', async (t) => {
  const live = await setupDelivery(await start(fixture(t)));
  const bytes = Buffer.alloc(MAX_RETAINED_EVIDENCE_BYTES + 1, 0xab);
  const ref = committedBlob(live, bytes);
  const calls = recordGitCalls(t, live);
  calls.length = 0;
  await assert.rejects(issue(live, 'implementation', [ref]), error('TOO_LARGE'));
  assert.equal(catFileCalls(calls, '-s', ref.blob).length, 1);
  assert.equal(catFileCalls(calls, 'blob', ref.blob).length, 0);
});

test('a binary committed evidence blob at exactly the limit is read once and judged by digest only', async (t) => {
  const live = await setupDelivery(await start(fixture(t)));
  const bytes = Buffer.alloc(MAX_RETAINED_EVIDENCE_BYTES, 0x61);
  bytes.set([0x00, 0xff, 0xc3, 0x28, 0xa0, 0xa1, 0x00, 0xfe], 0);
  bytes.set([0x00, 0xff, 0xc3, 0x28], MAX_RETAINED_EVIDENCE_BYTES - 4);
  const ref = committedBlob(live, bytes);
  const calls = recordGitCalls(t, live);
  calls.length = 0;
  await issue(live, 'implementation', [ref]);
  assert.equal(catFileCalls(calls, 'blob', ref.blob).length, 1);
  await assert.rejects(
    issue(live, 'implementation', [{ ...ref, digest: contentDigest('other bytes') }]),
    error('DIGEST_MISMATCH'),
  );
});

test('a committed evidence read that returns more than the limit is rejected even when the reported size was in budget', async (t) => {
  const live = await setupDelivery(await start(fixture(t)));
  const ref = committedBlob(live, Buffer.from('small evidence\n'));
  recordGitCalls(t, live, (call) => {
    if (call.args.includes('cat-file') && call.args.includes('-s'))
      return { status: 0, stdout: String(MAX_RETAINED_EVIDENCE_BYTES), stderr: '' };
    if (
      call.args.includes('cat-file') &&
      call.args.includes('blob') &&
      call.args.includes(ref.blob)
    )
      return { status: 0, stdout: Buffer.alloc(MAX_RETAINED_EVIDENCE_BYTES + 1), stderr: '' };
    return undefined;
  });
  await assert.rejects(issue(live, 'implementation', [ref]), error('TOO_LARGE'));
});

function configured(fx, rows) {
  mkdirSync(path.join(fx.root, 'docs/adr'), { recursive: true });
  writeFileSync(path.join(fx.root, 'docs/adr/effective-flow-project-setup.md'), setupTable(rows));
  git(fx.root, 'add', 'docs/adr/effective-flow-project-setup.md');
  git(fx.root, 'commit', '-m', 'configure');
  fx.input.execution.head = git(fx.root, 'rev-parse', 'HEAD');
  return fx;
}

const LIMITED = { outcome: 'limited', prerequisite: 'git-checkout' };

// Phases 2-6 plus a final validation whose suite stopped at the environment preflight.
async function limitedThroughFinalValidation(live) {
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of REQUIRED_GATES.slice(0, REQUIRED_GATES.indexOf('final-validation') + 1))
    gates.push(
      await issue(
        { ...live, evidence },
        gate,
        evidence,
        ['validation', 'final-validation'].includes(gate) ? LIMITED : {},
      ),
    );
  return { ...live, evidence, gates, acceptance: gates.slice(-2) };
}

function prepareLimited(live) {
  return live.call('prepare-completion', {
    ...live.common,
    agentHandle: 'original-child-handle',
    preparationId: 'delivery',
    gates: live.acceptance,
  });
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

// Invariant: `limited` is an environment result of a validation gate only: it names its failed
// prerequisite and never stands in for a protected remote gate's required proof.
test('a limited receipt names its prerequisite and stays off non-validation and protected remote gates', async (t) => {
  const live = await setupDelivery(await start(fixture(t)));
  const evidence = [durable(live)];
  await assert.rejects(issue(live, 'implementation', evidence, LIMITED), error('INCOMPLETE_GATES'));
  await assert.rejects(
    issue(live, 'validation', evidence, { outcome: 'limited' }),
    error('INVALID_PAYLOAD'),
  );
  await assert.rejects(
    issue(live, 'validation', evidence, { outcome: 'limited', prerequisite: '/abs/path' }),
    error('INVALID_PAYLOAD'),
  );
  await assert.rejects(
    issue(live, 'validation', evidence, { prerequisite: 'git-checkout' }),
    error('INVALID_PAYLOAD'),
  );
  const receipt = await issue(live, 'validation', evidence, LIMITED);
  const value = JSON.parse(readFileSync(path.join(receipt.root, receipt.path)));
  assert.equal(value.outcome, 'limited');
  assert.equal(value.prerequisite, 'git-checkout');

  const fx = fixture(t);
  fx.input.remoteValidation = {
    protocol: 'effective-flow.protected-validation/1',
    requiredGates: ['final-validation'],
    policyDigest: contentDigest('original protected policy'),
  };
  const remote = await setupDelivery(await start(fx));
  await assert.rejects(
    issue(remote, 'final-validation', [durable(remote)], LIMITED),
    (failure) => failure.code === 'REMOTE_VALIDATION_REQUIRED' && /limited/.test(failure.message),
  );
});

// Invariant: a PR-lane run completes with limited final validation, and DONE discloses the
// limitation verbatim instead of reading as a fully validated delivery.
test('a limited final validation completes on a configured pr lane and DONE must disclose it', async (t) => {
  const live = await completed(configured(fixture(t), [['delivery.completion', 'pr']]), {
    limited: ['validation', 'final-validation'],
    lane: { lane: 'pr', authority: { kind: 'configuration' } },
  });
  await assert.rejects(live.call('terminal', terminalInput(live)), error('MISSING_EVIDENCE'));
  const terminal = await live.call(
    'terminal',
    terminalInput(live, {
      conclusion: `Feature delivered; ${limitationText('git-checkout')}; PR CI runs the full suite.`,
    }),
  );
  const accepted = await live.call('verify-terminal', { ...live.common, terminal });
  assert.equal(accepted.status, 'DONE');
});

// Invariant: continuing an existing plan pull request is the pr lane, proven by the verified plan
// continuation the execution authorization already bound.
test('a verified plan continuation proves the pr lane for a limited final validation', async (t) => {
  const live = await publishedPlanFixture(t);
  const authorization = await authorizePlan(live);
  git(live.root, 'worktree', 'add', live.target, 'published-plan');
  const ownership = lifecycleFixture(live, live.target, 'published-plan', live.fetchedHead);
  await live.call('transition-execution', {
    ...live.common,
    agentHandle: 'original-child-handle',
    authorization,
    execution: {
      executionRoot: live.target,
      branch: 'published-plan',
      head: live.head,
      origin: 'effective-flow-created',
      owner: 'build',
    },
    ownership,
  });
  const limited = await limitedThroughFinalValidation(live);
  await assert.rejects(prepareLimited(limited), error('INCOMPLETE_GATES'));
  await recordLane(limited, 'pr', { kind: 'plan-continuation' });
  const prepared = await prepareLimited(limited);
  const value = JSON.parse(readFileSync(path.join(prepared.root, prepared.path)));
  assert.deepEqual(value.gates, limited.acceptance);
});

// Invariant: every no-PR lane, and a missing lane record, stops a limited final validation before
// completion preparation, so it can never reach the handback commit.
for (const variant of ['missing', 'merge', 'branch', 'in-place-no-delivery'])
  test(`a limited final validation is refused at prepare-completion with lane ${variant}`, async (t) => {
    let fx = fixture(t);
    if (variant === 'branch') fx = configured(fx, [['delivery.completion', 'branch']]);
    if (variant === 'in-place-no-delivery') fx = configured(fx, [['worktree.enabled', 'false']]);
    const live = await limitedThroughFinalValidation(
      await setupDelivery(
        await start(fx),
        variant === 'in-place-no-delivery' ? 'in-place-no-delivery' : undefined,
      ),
    );
    if (variant !== 'missing') await recordLane(live, variant, { kind: 'configuration' });
    await assert.rejects(prepareLimited(live), error('INCOMPLETE_GATES'));
  });

// Invariant: the lane is bound only through closed provenance; a caller's bare claim of `pr`
// never unlocks a limited validation.
test('a caller-asserted completion lane without closed provenance is refused', async (t) => {
  const live = await limitedThroughFinalValidation(await setupDelivery(await start(fixture(t))));
  for (const authority of [
    { kind: 'configuration' },
    { kind: 'plan-continuation' },
    { kind: 'caller', lane: 'pr' },
    { kind: 'source', source: 'instruction', index: null, quote: 'open a pull request' },
    null,
  ])
    await assert.rejects(recordLane(live, 'pr', authority), error('AUTHORITY_MISMATCH'));
  await assert.rejects(
    live.call('record-lane', { ...live.common, agentHandle: 'original-child-handle', lane: 'pr' }),
    error('INVALID_PAYLOAD'),
  );
  await assert.rejects(
    recordLane(live, 'in-place-no-delivery', { kind: 'configuration' }),
    error('AUTHORITY_MISMATCH'),
  );
  await assert.rejects(prepareLimited(live), error('INCOMPLETE_GATES'));
  // A real quote proves only the lane it names: "retain a delivery branch" never proves `pr`.
  const branchQuote = {
    kind: 'source',
    source: 'instruction',
    index: null,
    quote: 'retain a delivery branch',
  };
  await assert.rejects(recordLane(live, 'pr', branchQuote), error('AUTHORITY_MISMATCH'));
  await assert.rejects(recordLane(live, 'merge', branchQuote), error('AUTHORITY_MISMATCH'));
  await assert.rejects(
    recordLane(live, 'branch', { ...branchQuote, quote: 'Implement the approved Feature plan' }),
    error('AUTHORITY_MISMATCH'),
  );
  await assert.rejects(prepareLimited(live), error('INCOMPLETE_GATES'));
  await recordLane(live, 'merge', { kind: 'configuration' });
  await assert.rejects(recordLane(live, 'merge', { kind: 'configuration' }), error('COLLISION'));
});

// Invariant: a source quote binds only the one stopping lane it names through the closed lane
// keywords; a substring cannot prove affirmative intent, so no quote ever proves `pr`.
test('a source quote naming its stopping lane is accepted and never unlocks a limited validation', async (t) => {
  const fx = fixture(t);
  fx.input.source.instruction =
    'Implement the plan, open a pull request, and retain a delivery branch.';
  const live = await limitedThroughFinalValidation(await setupDelivery(await start(fx)));
  const quote = (text) => ({ kind: 'source', source: 'instruction', index: null, quote: text });
  await assert.rejects(
    recordLane(live, 'pr', quote('open a pull request')),
    error('AUTHORITY_MISMATCH'),
  );
  await assert.rejects(
    recordLane(live, 'branch', quote('open a pull request, and retain a delivery branch')),
    error('AUTHORITY_MISMATCH'),
  );
  const lane = await recordLane(live, 'branch', quote('retain a delivery branch'));
  const value = JSON.parse(readFileSync(path.join(lane.root, lane.path)));
  assert.equal(value.lane, 'branch');
  await assert.rejects(prepareLimited(live), error('INCOMPLETE_GATES'));
});

// Phase 7's lane question, asked from a checkpoint that already holds the given gate receipts.
async function laneQuestion(live, id, answer, evidence = live.gates) {
  const completedGates = REQUIRED_GATES.slice(0, evidence.length);
  const checkpoint = await live.call('checkpoint', {
    ...live.common,
    checkpointId: `lane-${id}`,
    agentHandle: 'original-child-handle',
    completed: completedGates,
    pending: REQUIRED_GATES.slice(completedGates.length),
    evidence,
  });
  const question = await live.call('question', {
    ...live.common,
    questionId: `lane-${id}`,
    revision: 1,
    origin: 'delivery-choice',
    agentHandle: 'original-child-handle',
    checkpoint,
    question: 'How should the delivery branch be completed?',
    options: ['Pull request', 'Merge', 'Branch only'],
    responseType: 'option',
  });
  const reply = await live.call('reply', {
    ...live.common,
    question,
    trustedUser: { ...trusted(question, answer), messageId: `message-${id}` },
  });
  const { resume } = await live.call('resume', {
    ...live.common,
    question,
    reply,
    agentHandle: 'original-child-handle',
  });
  return { kind: 'reply', reply, resume };
}

// Invariant: a lane reply proves only the lane its fixed completion option names, and only when it
// answers the Phase 7 question asked after the limited final-validation receipt.
test('a lane reply must answer the post-receipt question with this lane option', async (t) => {
  const live = await limitedThroughFinalValidation(await setupDelivery(await start(fixture(t))));
  const merge = await laneQuestion(live, 'merge', 'Merge');
  await assert.rejects(recordLane(live, 'pr', merge), error('AUTHORITY_MISMATCH'));
  const pr = await laneQuestion(live, 'pr', 'Pull request');
  await recordLane(live, 'pr', pr);
  const prepared = await prepareLimited(live);
  const value = JSON.parse(readFileSync(path.join(prepared.root, prepared.path)));
  assert.deepEqual(value.gates, live.acceptance);
});

test('a lane reply that predates the limited final-validation receipt is refused', async (t) => {
  const started = await setupDelivery(await start(fixture(t)));
  const early = await laneQuestion(started, 'early', 'Pull request', []);
  const live = await limitedThroughFinalValidation(started);
  await assert.rejects(recordLane(live, 'pr', early), error('AUTHORITY_MISMATCH'));
  // A checkpoint holding only the provisional Phase 5 validation is still too early.
  const phase5 = await laneQuestion(
    live,
    'phase5',
    'Pull request',
    live.gates.slice(0, REQUIRED_GATES.indexOf('validation') + 1),
  );
  await assert.rejects(recordLane(live, 'pr', phase5), error('AUTHORITY_MISMATCH'));
  await assert.rejects(prepareLimited(live), error('INCOMPLETE_GATES'));
});

// Invariant: a fully passing final validation supersedes a provisional Phase 5 limited
// validation, so a run whose environment recovered completes without a limitation claim.
test('a passing final validation supersedes a provisional limited validation at the terminal', async (t) => {
  const live = await completed(fixture(t), { limited: ['validation'] });
  const terminal = await live.call('terminal', terminalInput(live));
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'DONE');
});

// Invariant: the no-PR stop is a terminal ABORT that names the failed prerequisite; it never
// becomes DONE and verify-terminal refuses an ABORT that hides the limitation.
test('a no-PR lane stops a limited final validation as an ABORT naming its prerequisite', async (t) => {
  const live = await limitedThroughFinalValidation(await setupDelivery(await start(fixture(t))));
  await recordLane(live, 'merge', { kind: 'configuration' });
  await assert.rejects(prepareLimited(live), error('INCOMPLETE_GATES'));
  const checkpoint = await live.call('checkpoint', {
    ...live.common,
    checkpointId: 'environment-stop',
    agentHandle: 'original-child-handle',
    completed: REQUIRED_GATES.slice(0, REQUIRED_GATES.indexOf('final-validation') + 1),
    pending: REQUIRED_GATES.slice(REQUIRED_GATES.indexOf('final-validation') + 1),
    evidence: live.gates,
  });
  const { snapshot } = JSON.parse(readFileSync(path.join(checkpoint.root, checkpoint.path)));
  const finalPlan = await live.call('retain-evidence', {
    ...live.common,
    evidenceId: 'environment-stop-plan',
    source: live.ref(live.executionRoot, 'plan.md'),
  });
  const stop = (extra) => ({
    ...live.common,
    status: 'ABORT',
    finalPlan,
    finalCheckout: {
      repositoryIdentity: live.repositoryIdentity,
      executionRoot: live.executionRoot,
      branch: live.execution.branch,
      head: snapshot.head,
      snapshot,
      worktreeRemoved: false,
    },
    gates: live.gates,
    retainedWorktree: null,
    pilotStatus: 'not-applicable',
    conclusion: 'Stopped before completion.',
    nextWorkflow: 'Rerun once Git is readable.',
    ...extra,
  });
  await assert.rejects(live.call('terminal', stop({ status: 'DONE' })), error('MISSING_EVIDENCE'));
  await assert.rejects(live.call('terminal', stop()), error('MISSING_EVIDENCE'));
  const terminal = await live.call(
    'terminal',
    stop({ conclusion: `Stopped: ${limitationText('git-checkout')}.` }),
  );
  assert.equal((await live.call('verify-terminal', { ...live.common, terminal })).status, 'ABORT');
});

// Invariant: the plan-completion convention has one owner. A later plan text completes an earlier
// one only with exactly one canonical status line on each side and, status values masked, an
// identical or `## Build completion`-continued body; `fatalUtf8` alone makes undecodable bytes a
// distinct refusal and changes no other verdict.
test('planCompletionMismatch accepts equal or completed plans and names every refusal', () => {
  const open = '# Plan\n\n**Plan status:** Not implemented\n\n## Requirement\n\nGo.\n';
  const done = open.replace('Not implemented', 'Implemented');
  const completed = `${done}\n## Build completion\n\nDone.\n`;
  assert.deepEqual(canonicalPlanStatusLines(open), ['**Plan status:** Not implemented']);
  assert.deepEqual(canonicalPlanStatusLines('no status\n'), []);
  assert.equal(planCompletionMismatch(open, open), null);
  assert.equal(planCompletionMismatch(open, done), null);
  assert.equal(planCompletionMismatch(open, completed), null);
  assert.equal(
    planCompletionMismatch(open, completed.replace('Build completion', 'Workflow-Abschluss')),
    null,
  );
  assert.equal(planCompletionMismatch(Buffer.from(open), Buffer.from(completed)), null);
  assert.equal(planCompletionMismatch(open, `${done}\n## Notes\n\nMore.\n`), 'not-preserved');
  assert.equal(planCompletionMismatch(open, done.replace('Go.', 'Revised.')), 'not-preserved');
  assert.equal(planCompletionMismatch(`${open}\nx\n`, open), 'not-preserved');
  assert.equal(
    planCompletionMismatch(open, `${done}\n**Plan status:** Implemented\n`),
    'status-count',
  );
  assert.equal(planCompletionMismatch('no status\n', 'no status\n'), 'status-count');
  assert.equal(planCompletionMismatch(open, 'no status\n'), 'status-count');

  const bad = Buffer.concat([
    Buffer.from(open.replace('Go.', 'Go ')),
    Buffer.from([0xff]),
    Buffer.from('\n'),
  ]);
  const badDone = Buffer.concat([
    Buffer.from(done.replace('Go.', 'Go ')),
    Buffer.from([0xfe]),
    Buffer.from('\n'),
  ]);
  assert.equal(planCompletionMismatch(bad, bad, { fatalUtf8: true }), 'invalid-utf8');
  assert.equal(planCompletionMismatch(Buffer.from(open), bad, { fatalUtf8: true }), 'invalid-utf8');
  assert.equal(planCompletionMismatch(bad, badDone, { fatalUtf8: true }), 'invalid-utf8');
  // Without `fatalUtf8` the bytes decode leniently, so two different invalid sequences compare equal.
  assert.equal(planCompletionMismatch(bad, badDone), null);
  assert.equal(
    planCompletionMismatch(Buffer.from(open), Buffer.from(completed), { fatalUtf8: true }),
    null,
  );
  assert.equal(
    planCompletionMismatch(open, `${done}\n## Notes\n`, { fatalUtf8: true }),
    'not-preserved',
  );
});
