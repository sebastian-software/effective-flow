import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  contentDigest,
  MAX_CONTROL_BYTES,
  REQUIRED_GATES,
} from '../src/scripts/build-run-core.mjs';
import {
  completed,
  env,
  error,
  finishRetainedFiles,
  git,
  issue,
  preparedForSourceOnlyPlan,
  retainedPlanItem,
  retainPlanFiles,
  sourceOnlySeal,
  terminalInput,
  trusted,
} from './support/build-run-fixtures.mjs';

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
