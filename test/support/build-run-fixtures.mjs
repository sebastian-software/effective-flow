// Fixtures shared by the build-run tests: a hermetic Git fixture with a prepared build-run input,
// the run start, pause and trusted-reply helpers, and the delivery, gate-receipt and retained-plan
// builders that more than one build-run test file uses.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
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
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  contentDigest,
  executeOperation,
  REQUIRED_GATES,
} from '../../src/scripts/build-run-core.mjs';
import { executeOperation as executeTrackerOperation } from '../../src/scripts/remote-tracker-core.mjs';
import { executeOperation as executeStateOperation } from '../../src/scripts/effective-flow-state-core.mjs';
import { createProcessRunner } from '../../src/scripts/process-runner.mjs';

export const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Flow Test',
  GIT_AUTHOR_EMAIL: 'flow@example.invalid',
  GIT_COMMITTER_NAME: 'Flow Test',
  GIT_COMMITTER_EMAIL: 'flow@example.invalid',
};

export function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

export function fixture(t, separate = false) {
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

export async function start(fx) {
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

export async function pause(fx, extra = {}) {
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

export function error(code) {
  return (failure) => failure.code === code;
}

export function trusted(question, answer = 'Retain locally') {
  return {
    channel: 'current-user',
    messageId: 'message-1',
    questionDigest: question.digest,
    answer,
  };
}

export function gitRef(fx, relative, head = git(fx.executionRoot, 'rev-parse', 'HEAD')) {
  const bytes = spawnSync('git', ['-C', fx.root, 'show', `${head}:${relative}`], { env }).stdout;
  return {
    repositoryIdentity: fx.repositoryIdentity,
    commit: head,
    blob: git(fx.root, 'rev-parse', `${head}:${relative}`),
    path: relative,
    digest: contentDigest(bytes),
  };
}

// `helperRecord` writes the lifecycle record through the runtime-state helper's `worktree
// record-init` instead of by hand, so its output meets the build-run checks below.
export async function setupDelivery(
  live,
  mode = live.targetExecutionRoot === live.root ? 'in-place-delivery' : 'owned-worktree',
  { helperRecord = false } = {},
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
    if (helperRecord) {
      const envelope = await executeStateOperation(
        'worktree record-init',
        { cwd: live.root, executionRoot: live.root, record: value },
        { runner: createProcessRunner(), env },
      );
      assert.equal(envelope.ok, true, JSON.stringify(envelope));
    } else {
      mkdirSync(path.join(live.root, '.effective-flow', 'worktree-runs'), { recursive: true });
      writeFileSync(
        path.join(live.root, '.effective-flow', 'worktree-runs', 'owned-delivery.json'),
        JSON.stringify(value),
      );
    }
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

export function durable(
  live,
  name = 'acceptance.txt',
  contents = 'Existing gates were judged by the workflow.\n',
) {
  const relative = `.effective-flow/build-runs/${live.input.runId}/${name}`;
  writeFileSync(path.join(live.root, relative), contents);
  return live.ref(live.root, relative);
}

export async function issue(live, gate, evidence = live.evidence, extra = {}) {
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

export async function completed(fx, { limited = [], lane = null } = {}) {
  let live = await setupDelivery(await start(fx));
  const evidence = [durable(live)];
  const gates = [];
  live = { ...live, evidence, gates };
  // Preserve actual order: implementation through final validation precede completion metadata.
  for (const gate of REQUIRED_GATES.filter(
    (gate) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(gate),
  ))
    gates.push(
      await issue(
        live,
        gate,
        evidence,
        limited.includes(gate) ? { outcome: 'limited', prerequisite: 'git-checkout' } : {},
      ),
    );
  if (lane) await recordLane(live, lane.lane, lane.authority);
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

export function recordLane(live, lane, authority) {
  return live.call('record-lane', {
    ...live.common,
    agentHandle: 'original-child-handle',
    lane,
    authority,
  });
}

export function terminalInput(live, extra = {}) {
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

export async function preparedForTransform(t, fx = fixture(t)) {
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

export function sealing(live, judgments = []) {
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

export async function preparedForRetainedPlan(t) {
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

export function observedRefusal(live, failedOperation) {
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

export async function retainRefusal(live, value, evidenceId) {
  return live.call('retain-evidence', {
    ...live.common,
    evidenceId,
    content: JSON.stringify(value),
  });
}

export function retainedSeal(live, evidence, extra = {}) {
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

export async function preparedForSourceOnlyPlan(t, refusal, additionalRoots = [], options = {}) {
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

export function sourceOnlySeal(live, extra = {}) {
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

export function retainedPlanItem(
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

export async function retainPlanFiles(live, currentPlan, files) {
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

export async function finishRetainedFiles(
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

export async function publishedPlanFixture(t, adoption = false) {
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

export function lifecycleFixture(
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

export async function authorizePlan(live, proof = live.planContinuation) {
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

export function setupTable(rows) {
  return (
    '# Setup\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n' +
    rows.map(([key, value]) => `| ${key} | ${value} |\n`).join('')
  );
}
