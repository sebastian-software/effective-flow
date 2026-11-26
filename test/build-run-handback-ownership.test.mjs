import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { contentDigest, REQUIRED_GATES } from '../src/scripts/build-run-core.mjs';
import { executeOperation as executeStateOperation } from '../src/scripts/effective-flow-state-core.mjs';
import { RECORD_KEYS, recordPaths } from '../src/scripts/effective-flow-state-worktree-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import {
  authorizePlan,
  completed,
  durable,
  env,
  error,
  finishRetainedFiles,
  fixture,
  git,
  gitRef,
  issue,
  lifecycleFixture,
  observedRefusal,
  pause,
  preparedForRetainedPlan,
  preparedForSourceOnlyPlan,
  preparedForTransform,
  publishedPlanFixture,
  retainedSeal,
  retainPlanFiles,
  retainRefusal,
  sealing,
  setupDelivery,
  setupTable,
  sourceOnlySeal,
  start,
  terminalInput,
  trusted,
} from './support/build-run-fixtures.mjs';

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

// Invariant (compatibility): a record the runtime-state helper writes passes build-run's lifecycle
// proof (`exact()` over the version 1 key set, every identity field) at the transition, and the
// helper's per-record lock path is the one build-run's lock check reads: a held lock blocks build
// continuation, and the helper reports the same lock as held.
test('a helper-written lifecycle record passes the build-run record and lock checks', async (t) => {
  const fx = fixture(t, true);
  fx.targetExecutionRoot = path.join(
    fx.root,
    '.effective-flow',
    '.worktrees',
    path.basename(fx.root),
    fx.input.runId,
  );
  const live = await setupDelivery(await start(fx), 'owned-worktree', { helperRecord: true });
  assert.ok(live.transition, 'transition-execution accepted the helper-written record');
  const record = JSON.parse(
    readFileSync(path.join(live.root, '.effective-flow/worktree-runs/owned-delivery.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(record), [...RECORD_KEYS]);
  const { lock } = recordPaths(live.root, 'owned-delivery');
  mkdirSync(lock);
  await assert.rejects(
    live.call('checkpoint', {
      ...live.common,
      checkpointId: 'locked-by-helper-path',
      agentHandle: 'original-child-handle',
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    }),
    error('LOCKED'),
  );
  const held = await executeStateOperation(
    'worktree transition',
    {
      cwd: live.root,
      executionRoot: live.root,
      recordId: 'owned-delivery',
      from: 'active',
      to: 'cleanup-ready',
      reason: null,
      sessionId: live.input.runId,
    },
    { runner: createProcessRunner(), env },
  );
  assert.equal(held.outcome?.code, 'LOCK_HELD', JSON.stringify(held));
  rmSync(lock, { recursive: true });
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

// Invariant (ledger location): the adoption proof scans `worktree-runs/` for exactly one lifecycle
// record naming the worktree, reading only `*.json` entries; the `ledgers/` directory of the
// delivery-progress ledgers and ledger files that name the very same worktree never count as a
// second record, and a scan that read them would fail the adoption.
test('the owner adoption scan of worktree-runs ignores the ledgers directory and ledger files', async (t) => {
  const live = await publishedPlanFixture(t, true);
  const authorization = await authorizePlan(live);
  const runs = path.join(live.root, '.effective-flow', 'worktree-runs');
  const ownerFile = path.join(live.root, live.planContinuation.ownership.path);
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
  // Ledgers of other records, one of them a byte copy of the matching lifecycle record, plus a
  // non-JSON name that is not a directory.
  const ledgers = path.join(runs, 'ledgers');
  mkdirSync(ledgers, { recursive: true });
  writeFileSync(path.join(ledgers, 'plan-delivery.ledger'), readFileSync(ownerFile));
  writeFileSync(path.join(ledgers, 'other-record.ledger'), readFileSync(ownerFile));
  writeFileSync(path.join(runs, 'stray.ledger'), readFileSync(ownerFile));
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
    checkpointId: 'adopted-with-ledgers',
    completed: [],
    pending: REQUIRED_GATES,
    evidence: [],
  });
  assert.equal(JSON.parse(readFileSync(path.join(cp.root, cp.path))).snapshot.head, live.head);
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
