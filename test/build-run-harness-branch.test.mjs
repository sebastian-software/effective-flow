// `authorize-execution` for a reused harness checkout takes the `branchSource` `worktree
// reuse-facts` reported, checks it against a fetch-free re-derivation and records it: a reported
// `existing` always stays, `adopted` or `created` only where the re-derivation agrees. An adoption
// behind the base is authorized, fast-forwarded, then transitioned; a `created` checkout starts at
// the fresh base and gets its branch receipt from `record-branch` right before the first commit,
// and an empty result leaves no branch. Invariant: no harness checkout gains lifecycle ownership,
// no reported `existing` is upgraded, and no commit lands outside the authorized delivery branch.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REQUIRED_GATES, nonTerminalBuildRunBranches } from '../src/scripts/build-run-core.mjs';
import { deriveReuseFacts } from '../src/scripts/worktree-reuse-facts-core.mjs';
import {
  durable,
  env,
  error,
  fixture,
  git,
  gitRef,
  issue,
  observedRefusal,
  retainRefusal,
  retainedSeal,
  start,
} from './support/build-run-fixtures.mjs';

const AGENT = 'original-child-handle';

// The `reuseBase` of `authorize-execution`: the recorded base pair and what `reuse-facts` reported.
function reuseBase(branchSource, baseRef = 'develop', localBaseBranch = baseRef) {
  return { baseRef, localBaseBranch, branchSource };
}

// Advances the local `develop` in the main checkout, so a harness checkout started there is behind.
function advanceBase(root) {
  writeFileSync(path.join(root, 'next.txt'), 'next\n');
  git(root, 'add', 'next.txt');
  git(root, 'commit', '-q', '-m', 'advance base');
  return git(root, 'rev-parse', 'develop');
}

// A run whose invocation checkout is the linked harness checkout `git worktree add <args>` made.
async function harnessRun(t, args, prepare = () => {}) {
  const fx = fixture(t);
  const linked = path.join(fx.root, '.effective-flow', 'harness');
  git(fx.root, 'worktree', 'add', '-q', ...args.map((arg) => (arg === '@' ? linked : arg)));
  prepare(fx, linked);
  const branch = git(linked, 'branch', '--show-current');
  fx.input.execution = {
    ...fx.input.execution,
    executionRoot: linked,
    branch: branch === '' ? null : branch,
    head: git(linked, 'rev-parse', 'HEAD'),
    origin: 'harness-managed',
  };
  fx.input.allowedRoots.push(linked);
  fx.input.plan = fx.ref(linked, 'plan.md');
  return { ...(await start(fx)), linked };
}

function authorize(live, extra) {
  return live.call('authorize-execution', {
    ...live.common,
    agentHandle: AGENT,
    mode: 'reuse-worktree',
    executionRoot: live.linked,
    authority: { kind: 'configuration' },
    reuseBase: reuseBase('adopted'),
    ...extra,
  });
}

function transition(live, authorization, execution) {
  return live.call('transition-execution', {
    ...live.common,
    agentHandle: AGENT,
    authorization,
    execution: { ...live.input.execution, ...execution },
    ownership: null,
  });
}

function recordOf(ref) {
  return JSON.parse(readFileSync(path.join(ref.root, ref.path)));
}

// Every gate up to final validation, then the plan archived, staged and sealed in the checkout.
async function sealArchived(live) {
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of REQUIRED_GATES.filter(
    (gate) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(gate),
  ))
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    agentHandle: AGENT,
    preparationId: 'delivery',
    gates: gates.filter((ref) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(ref.path)),
    ),
  });
  live.prepared = prepared;
  const plan = readFileSync(path.join(live.linked, 'plan.md'), 'utf8');
  writeFileSync(
    path.join(live.linked, 'plan.md'),
    plan.replace('Not implemented', 'Implemented') + '\n## Build completion\n\nDone.\n',
  );
  mkdirSync(path.join(live.linked, 'archive'));
  git(live.linked, 'mv', 'plan.md', 'archive/plan.md');
  git(live.linked, 'add', 'archive/plan.md');
  return live.call('seal-delivery', {
    ...live.common,
    agentHandle: AGENT,
    sealId: 'delivery',
    basis: prepared,
    finalPlan: live.ref(live.linked, 'archive/plan.md'),
    expectedTree: git(live.linked, 'write-tree'),
    judgments: [],
  });
}

// `record-branch` after `sealArchived`, with the completion basis that proves the plan's archival.
function recordBranch(live, execution, proof = true) {
  return live.call('record-branch', {
    ...live.common,
    agentHandle: AGENT,
    execution,
    ...(proof
      ? { completionBasis: live.prepared, currentPlan: live.ref(live.linked, 'archive/plan.md') }
      : {}),
  });
}

test('a clean host branch at the base is adopted under its own name', async (t) => {
  const live = await harnessRun(t, ['-b', 't3code/thread', '@', 'develop']);
  const head = live.input.execution.head;
  await assert.rejects(
    authorize(live, { branch: 'other', baseHead: head }),
    error('AUTHORITY_MISMATCH'),
  );
  await assert.rejects(
    authorize(live, { branch: 't3code/thread', baseHead: head, reuseBase: undefined }),
    error('INVALID_PAYLOAD'),
  );
  await assert.rejects(
    authorize(live, { branch: 'feature', baseHead: head, reuseBase: reuseBase('created') }),
    error('AUTHORITY_MISMATCH'),
    'a reported source the re-derivation does not reach is refused',
  );
  const authorization = await authorize(live, { branch: 't3code/thread', baseHead: head });
  const value = recordOf(authorization);
  assert.equal(value.branchSource, 'adopted');
  assert.equal(value.creationOid, null);
  assert.equal(value.fastForwardFrom, null);
  const moved = recordOf(await transition(live, authorization, {}));
  assert.equal(moved.branchSource, 'adopted');
  assert.equal(moved.ownership, null);
});

test('a host branch behind the base is authorized, fast-forwarded, then transitioned', async (t) => {
  const live = await harnessRun(t, ['-b', 't3code/thread', '@', 'develop'], (fx) =>
    advanceBase(fx.root),
  );
  const before = live.input.execution.head;
  const target = git(live.root, 'rev-parse', 'develop');
  assert.notEqual(before, target);
  await assert.rejects(
    authorize(live, { branch: 't3code/thread', baseHead: before }),
    error('AUTHORITY_MISMATCH'),
    'an adoption starts at the fresh base',
  );
  const authorization = await authorize(live, { branch: 't3code/thread', baseHead: target });
  assert.equal(recordOf(authorization).fastForwardFrom, before);
  // Transition before the fast-forward is refused: the checkout is not at `baseHead` yet.
  await assert.rejects(transition(live, authorization, { head: target }), error('CONTENT_DRIFT'));
  git(live.linked, 'merge', '--ff-only', '-q', target);
  const moved = recordOf(await transition(live, authorization, { head: target }));
  assert.equal(moved.branchSource, 'adopted');
  assert.equal(moved.execution.head, target);
});

test('a failed fast-forward transitions at the unchanged HEAD as existing', async (t) => {
  const live = await harnessRun(t, ['-b', 't3code/thread', '@', 'develop'], (fx) =>
    advanceBase(fx.root),
  );
  const before = live.input.execution.head;
  const target = git(live.root, 'rev-parse', 'develop');
  const authorization = await authorize(live, { branch: 't3code/thread', baseHead: target });
  const moved = recordOf(await transition(live, authorization, { head: before }));
  assert.equal(moved.branchSource, 'existing');
});

test('a harness checkout with an untracked file keeps the earlier harness flow as existing', async (t) => {
  const live = await harnessRun(t, ['--detach', '@'], (_fx, linked) =>
    writeFileSync(path.join(linked, 'notes.txt'), 'local notes\n'),
  );
  const head = live.input.execution.head;
  await assert.rejects(
    authorize(live, { branch: 'harness-feature', baseHead: head, reuseBase: reuseBase('created') }),
    error('AUTHORITY_MISMATCH'),
    'an untracked file disqualifies the created source the caller claims',
  );
  const authorization = await authorize(live, {
    branch: 'harness-feature',
    baseHead: head,
    reuseBase: reuseBase('existing'),
  });
  assert.equal(recordOf(authorization).branchSource, 'existing');
  git(live.linked, 'switch', '-q', '-c', 'harness-feature');
  const moved = recordOf(await transition(live, authorization, { branch: 'harness-feature' }));
  assert.equal(moved.branchSource, 'existing');
  await assert.rejects(
    live.call('record-branch', {
      ...live.common,
      agentHandle: AGENT,
      execution: { ...live.input.execution, branch: 'harness-feature' },
    }),
    error('AUTHORITY_MISMATCH'),
  );
});

for (const [name, args] of [
  ['detached', ['--detach', '@']],
  ['base-branch', ['-b', 'trunk', '@', 'develop']],
])
  test(`a ${name} harness checkout gets its delivery branch at the first commit`, async (t) => {
    const live = await harnessRun(t, args);
    const original = live.input.execution;
    const head = original.head;
    const base = { reuseBase: reuseBase('created', name === 'base-branch' ? 'trunk' : 'develop') };
    await assert.rejects(
      authorize(live, { branch: 'develop', baseHead: head, ...base }),
      error('AUTHORITY_MISMATCH'),
      'an existing branch is never the created one',
    );
    const authorization = await authorize(live, { branch: 'feature', baseHead: head, ...base });
    const value = recordOf(authorization);
    assert.equal(value.branchSource, 'created');
    assert.equal(value.creationOid, head);
    // Setup keeps the original identity: the branch does not exist yet.
    await assert.rejects(
      transition(live, authorization, { branch: 'feature' }),
      error('AUTHORITY_MISMATCH'),
    );
    await transition(live, authorization, {});
    assert.equal(git(live.root, 'branch', '--list', 'feature'), '', 'no branch before a commit');

    const seal = await sealArchived(live);
    const branchReceipt = {
      ...original,
      branch: 'feature',
    };
    // Recording before the switch is refused: the checkout is not on the branch.
    await assert.rejects(recordBranch(live, branchReceipt), error('REPOSITORY_MISMATCH'));
    git(live.linked, 'switch', '-q', '-c', 'feature');
    // As for every other non-transition operation, the moved plan needs its completion basis.
    await assert.rejects(recordBranch(live, branchReceipt, false), error('MISSING_EVIDENCE'));
    const recorded = recordOf(await recordBranch(live, branchReceipt));
    assert.equal(recorded.creationOid, head);
    assert.deepEqual(recorded.execution, branchReceipt);
    await assert.rejects(
      recordBranch(live, branchReceipt),
      error('INVALID_STATE'),
      'the branch receipt is issued once',
    );
    assert.deepEqual((await nonTerminalBuildRunBranches(live.root)).branches, ['feature']);
    git(live.linked, 'commit', '-q', '-m', 'deliver');
    const finalPlan = gitRef({ ...live, executionRoot: live.linked }, 'archive/plan.md');
    const handoff = recordOf(
      await live.call('handoff', {
        ...live.common,
        agentHandle: AGENT,
        seal,
        head: finalPlan.commit,
        finalPlan,
      }),
    );
    assert.deepEqual(handoff.execution, branchReceipt);
    assert.equal(git(live.root, 'rev-parse', 'feature'), finalPlan.commit);
    // Post-handoff runtime control verifies the handoff against the branch receipt.
    await issue(live, 'plan-archival', [durable(live, 'archival.txt')]);
  });

test('a base-branch checkout that commits without its branch receipt cannot hand off', async (t) => {
  const live = await harnessRun(t, ['-b', 'trunk', '@', 'develop']);
  const head = live.input.execution.head;
  const authorization = await authorize(live, {
    branch: 'feature',
    baseHead: head,
    reuseBase: reuseBase('created', 'trunk'),
  });
  await transition(live, authorization, {});
  const seal = await sealArchived(live);
  git(live.linked, 'commit', '-q', '-m', 'on the base branch');
  const finalPlan = gitRef({ ...live, executionRoot: live.linked }, 'archive/plan.md');
  await assert.rejects(
    live.call('handoff', {
      ...live.common,
      agentHandle: AGENT,
      seal,
      head: finalPlan.commit,
      finalPlan,
    }),
    error('INVALID_STATE'),
  );
  assert.equal(git(live.root, 'branch', '--list', 'feature'), '', 'no branch was created');
});

// Invariant: `reuse-facts` fetched and reported `existing` because a fetch failed; the
// fetch-free re-derivation reads the same refs and would qualify the checkout as `adopted`, so the
// reported `existing` is kept, never upgraded.
test('an existing source reported after a failed fetch stays existing', async (t) => {
  const live = await harnessRun(t, ['-b', 't3code/thread', '@', 'develop'], (fx) => {
    git(fx.root, 'remote', 'add', 'origin', path.join(fx.root, 'missing-remote'));
    git(fx.root, 'update-ref', 'refs/remotes/origin/develop', git(fx.root, 'rev-parse', 'develop'));
  });
  const runGit = (args, options = {}) => {
    const result = spawnSync('git', ['-C', live.linked, ...args], {
      env: { ...env, ...options.env },
      encoding: 'utf8',
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const pair = { baseRef: 'origin/develop', localBaseBranch: 'develop', visibility: 'standard' };
  const reported = await deriveReuseFacts(
    { ...pair, fetch: true },
    { git: runGit, environment: env },
  );
  assert.equal(reported.branchSource, 'existing');
  assert.deepEqual(reported.reasons, ['fetch-failed']);
  assert.equal(
    (await deriveReuseFacts({ ...pair, fetch: false }, { git: runGit })).branchSource,
    'adopted',
    'the re-derivation alone would upgrade the checkout',
  );
  const head = live.input.execution.head;
  const authorization = await authorize(live, {
    branch: 't3code/thread',
    baseHead: head,
    reuseBase: reuseBase(reported.branchSource, 'origin/develop', 'develop'),
  });
  const value = recordOf(authorization);
  assert.equal(value.branchSource, 'existing');
  assert.equal(value.fastForwardFrom, null);
  assert.equal(recordOf(await transition(live, authorization, {})).branchSource, 'existing');
});

// Invariant: a detached or base-branch checkout strictly behind the fresh base gets its
// delivery branch at the fresh base (`creationOid`), detached there at setup; the local base branch
// keeps its tip.
for (const [name, args, prepare, base] of [
  ['detached', ['--detach', '@'], (fx) => advanceBase(fx.root), reuseBase('created')],
  [
    'base-branch',
    ['-b', 'trunk', '@', 'develop'],
    (fx) => {
      git(fx.root, 'remote', 'add', 'origin', fx.root);
      git(fx.root, 'update-ref', 'refs/remotes/origin/trunk', advanceBase(fx.root));
    },
    reuseBase('created', 'origin/trunk', 'trunk'),
  ],
])
  test(`a ${name} harness checkout behind the fresh base gets its delivery branch there`, async (t) => {
    const live = await harnessRun(t, args, prepare);
    const original = live.input.execution;
    const before = original.head;
    const target = git(live.root, 'rev-parse', 'develop');
    assert.notEqual(before, target);
    await assert.rejects(
      authorize(live, { branch: 'feature', baseHead: before, reuseBase: base }),
      error('AUTHORITY_MISMATCH'),
      'a created delivery branch starts at the fresh base',
    );
    const authorization = await authorize(live, {
      branch: 'feature',
      baseHead: target,
      reuseBase: base,
    });
    const value = recordOf(authorization);
    assert.equal(value.branchSource, 'created');
    assert.equal(value.creationOid, target);
    const atBase = { branch: null, head: target };
    await assert.rejects(transition(live, authorization, {}), error('AUTHORITY_MISMATCH'));
    await assert.rejects(
      transition(live, authorization, atBase),
      error('REPOSITORY_MISMATCH'),
      'the checkout has not moved to the creation OID yet',
    );
    git(live.linked, 'switch', '-q', '--detach', target);
    await assert.rejects(
      transition(live, authorization, { branch: 'trunk', head: target }),
      error('AUTHORITY_MISMATCH'),
      'a moved checkout is detached at the creation OID',
    );
    const moved = recordOf(await transition(live, authorization, atBase));
    assert.equal(moved.branchSource, 'created');
    assert.deepEqual(moved.execution, { ...original, ...atBase });

    const seal = await sealArchived(live);
    git(live.linked, 'switch', '-q', '-c', 'feature');
    const branchReceipt = { ...original, branch: 'feature', head: target };
    const recorded = recordOf(await recordBranch(live, branchReceipt));
    assert.equal(recorded.creationOid, target);
    git(live.linked, 'commit', '-q', '-m', 'deliver');
    const finalPlan = gitRef({ ...live, executionRoot: live.linked }, 'archive/plan.md');
    const handoff = recordOf(
      await live.call('handoff', {
        ...live.common,
        agentHandle: AGENT,
        seal,
        head: finalPlan.commit,
        finalPlan,
      }),
    );
    assert.deepEqual(handoff.execution, branchReceipt);
    assert.equal(git(live.root, 'rev-parse', 'feature^'), target);
    if (name === 'base-branch') assert.equal(git(live.root, 'rev-parse', 'trunk'), before);
  });

// Invariant: a `created` checkout whose result is empty (the plan stays unarchived, nothing is
// committed) hands off at the creation OID without `record-branch`, and no branch exists.
test('an empty created result hands off at the creation OID without a branch receipt', async (t) => {
  const live = await harnessRun(t, ['--detach', '@']);
  const head = live.input.execution.head;
  const authorization = await authorize(live, {
    branch: 'feature',
    baseHead: head,
    reuseBase: reuseBase('created'),
  });
  await transition(live, authorization, {});
  const evidence = [durable(live)];
  const gates = [];
  for (const gate of REQUIRED_GATES.filter(
    (gate) =>
      !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(gate),
  ))
    gates.push(await issue(live, gate, evidence));
  const prepared = await live.call('prepare-completion', {
    ...live.common,
    agentHandle: AGENT,
    preparationId: 'observed-refusal',
    gates: gates.filter((ref) =>
      /gate-(independent-review|final-validation)-/.test(path.basename(ref.path)),
    ),
  });
  const checkout = { ...live, root: live.linked, execution: live.input.execution, prepared };
  const refusal = await retainRefusal(live, observedRefusal(checkout, 'mkdir'), 'observed-refusal');
  const seal = await retainedSeal(checkout, refusal);
  const finalPlan = gitRef({ ...live, executionRoot: live.linked }, 'plan.md');
  assert.equal(finalPlan.commit, head, 'nothing was committed');
  const handoff = recordOf(
    await live.call('handoff', {
      ...live.common,
      agentHandle: AGENT,
      seal,
      head: finalPlan.commit,
      finalPlan,
    }),
  );
  assert.equal(handoff.head, head);
  assert.equal(handoff.execution.branch, null);
  assert.equal(git(live.root, 'branch', '--list', 'feature'), '', 'no branch was created');
  assert.deepEqual((await nonTerminalBuildRunBranches(live.root)).branches, []);
});
