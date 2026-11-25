import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { planningClaimKey } from '../src/scripts/effective-flow-state-planning-claim-core.mjs';
import { executeOperation as buddyOperation } from '../src/scripts/issue-buddy-core.mjs';
import { executeOperation as publicationOperation } from '../src/scripts/plan-publication-core.mjs';
import {
  createWorld,
  checked,
  acquire,
  collect,
  collectInput,
  publicationInput,
  recoveryInput,
  writePlan,
  publish,
  record,
  report,
  release,
  prIdentity,
  issue,
  planText,
  advanceRemoteBase,
  assessInput,
  PLAN,
  BRANCH,
} from './fixtures/issue-buddy/world.mjs';

const scenarios = JSON.parse(
  fs.readFileSync(new URL('./fixtures/issue-buddy/pass-scenarios.json', import.meta.url), 'utf8'),
);
const exists = (world, relative) => fs.existsSync(path.join(world.root, relative));
const cache = (world) =>
  JSON.parse(fs.readFileSync(path.join(world.runtime, 'verdicts.json'), 'utf8'));
const passRecord = (world, passId) =>
  JSON.parse(fs.readFileSync(path.join(world.runtime, 'passes', `${passId}.json`), 'utf8'));
// The holder of an issue's planning claim, read from its record (the key derivation is the
// shared one); undefined when the issue is unclaimed.
const claimHolder = (world, issueNumber) => {
  const key = planningClaimKey({
    target: { kind: 'forge', host: 'github.com', owner: 'acme', repository: 'fixture' },
    issue: issueNumber,
  });
  const file = path.join(world.root, key.path);
  if (!fs.existsSync(file)) return undefined;
  const { claimId: _token, ...holder } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return holder;
};
const mutations = (world) =>
  world
    .calls()
    .filter(
      (call) =>
        call.executable === 'gh' && (call.args.includes('POST') || call.args.includes('-X')),
    );
const branches = (world) =>
  world.git(world.bare, 'for-each-ref', '--format=%(refname)', 'refs/heads');
const leftovers = [{ issue: 1, path: PLAN, action: 'remove' }];

// These recipes establish helper composition. Prompt ordering/bindings are checked separately;
// no test here claims to execute a model or the Markdown workflow.
test('real WP3/WP4 draft publish records confirmed identity; the unchanged next collect performs no forge write', async (t) => {
  const world = createWorld(t);
  const head = world.git(world.root, 'rev-parse', 'HEAD');
  const index = world.git(world.root, 'write-tree');
  const passId = await acquire(world);
  const collected = await collect(world, passId);
  assert.equal(collected.eligible.length, 1);
  await writePlan(world);
  const published = await publish(world, collected);
  assert.equal(published.state, 'pull-request-opened');
  assert.equal(world.state().pulls[0].draft, true);
  assert.equal(world.state().pulls.length, 1);
  assert.equal(world.state().creates.length, 1);
  const created = world.state().creates[0];
  assert.equal(created.title, 'docs: plan issue #1');
  assert.match(created.body, /^Plan for issue #1; review result: approved; open points: 0\./);
  assert.match(created.body, /Refs #1/);
  assert.equal(world.git(world.bare, 'rev-parse', `refs/heads/${BRANCH}`), published.commitOid);
  assert.equal(
    world.git(world.bare, 'show', `${published.commitOid}:${PLAN}`),
    fs.readFileSync(path.join(world.root, PLAN), 'utf8').trim(),
  );
  const verdict = await record(world, passId, collected, { pullRequest: published.pullRequest });
  const stored = await report(world, passId, collected, {
    verdicts: [verdict],
    pullRequestsOpened: [prIdentity(published)],
    leftoverPlanFiles: leftovers,
  });
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.counts.published, 1);
  assert.equal(cache(world).records['1'].pullRequest, published.pullRequest.number);
  assert.equal(world.git(world.root, 'rev-parse', 'HEAD'), head);
  assert.equal(world.git(world.root, 'write-tree'), index);
  assert.equal(
    exists(world, PLAN),
    true,
    'no protected removal proof is available, so the new plan survives',
  );
  await release(world, passId);
  const secondId = await acquire(world);
  const before = mutations(world).length;
  const second = await collect(world, secondId, { leftoverPlanFiles: leftovers });
  assert.deepEqual(second.eligible, []);
  assert.deepEqual(second.authorizedRecovery, []);
  assert.deepEqual(second.skipped, [{ issue: 1, reason: 'open-pull-request' }]);
  assert.equal(mutations(world).length, before);
  assert.equal(world.state().creates.length, 1);
  assert.equal(world.state().pulls.length, 1);
  await report(world, secondId, second);
  await release(world, secondId);
});

test('dry ready outcomes consume shared plan capacity without creating files, refs, or forge objects', async (t) => {
  const world = createWorld(t, { issues: [issue(1), issue(2)] });
  const passId = await acquire(world);
  const collected = await collect(world, passId, {
    mode: 'dry-run',
    limits: { judgments: 2, plans: 1 },
  });
  const first = await record(world, passId, collected, { verdict: 'would-publish' });
  const refused = await world.buddy('verdict-record', {
    passId,
    mode: 'dry-run',
    issue: 2,
    fingerprint: collected.eligible[1].fingerprint,
    verdict: 'would-publish',
    reason: 'Over capacity',
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  const stored = await report(world, passId, collected, {
    verdicts: [first],
    cutOff: 'publish-limit',
  });
  assert.deepEqual(stored.counts, { 'would-publish': 1 });
  assert.equal(exists(world, PLAN), false);
  assert.equal(branches(world), 'refs/heads/main');
  assert.equal(mutations(world).length, 0);
  await release(world, passId);
  const nextId = await acquire(world);
  const next = await collect(world, nextId, { mode: 'dry-run' });
  assert.deepEqual(next.skipped, [{ issue: 1, reason: 'unchanged-would-publish' }]);
  assert.deepEqual(
    next.eligible.map((entry) => entry.issue),
    [2],
  );
  await release(world, nextId);
});

test('visibility GET supports a precollection private/unknown publication stop with a version-2 report', async (t) => {
  for (const visibility of ['private', 'unknown'])
    await t.test(visibility, async (t) => {
      const world = createWorld(t, { visibility });
      const passId = await acquire(world);
      const result = checked(await world.tracker('repository-visibility-read'));
      assert.equal(result.result.visibility, visibility);
      const stored = await report(world, passId, undefined, {
        repositoryVisibility: visibility,
        outcome: 'failed',
        failures: [{ issue: null, stage: 'preflight', code: 'PUBLISH_VISIBILITY' }],
      });
      assert.equal(stored.outcome, 'failed');
      assert.equal(stored.repositoryVisibility, visibility);
      assert.equal(passRecord(world, passId).collection, undefined);
      assert.equal(
        world
          .calls()
          .some(
            (call) =>
              call.executable === 'gh' &&
              call.args.some((arg) => arg.includes('/issues') || arg.includes('/pulls')),
          ),
        false,
      );
      assert.equal(fs.existsSync(path.join(world.runtime, 'trusted')), false);
      assert.equal(mutations(world).length, 0);
      await release(world, passId);
    });
});

test('a postcollection environment stop preserves earlier publication and numerical failure in reconciled v2 results', async (t) => {
  const world = createWorld(t, { issues: [issue(1), issue(2), issue(3)] });
  const passId = await acquire(world);
  const collected = await collect(world, passId, { limits: { judgments: 3, plans: 2 } });
  await writePlan(world);
  const published = await publish(world, collected);
  const succeeded = await record(world, passId, collected, { pullRequest: published.pullRequest });
  const failed = await record(world, passId, collected, {
    candidate: collected.eligible[1],
    verdict: 'failed',
    reason: 'READINESS_INVALID',
  });
  const stored = await report(world, passId, collected, {
    outcome: 'failed',
    verdicts: [succeeded, failed],
    pullRequestsOpened: [prIdentity(published)],
    failures: [
      { issue: 2, stage: 'readiness', code: 'READINESS_INVALID' },
      { issue: null, stage: 'planning', code: 'NESTED_SPAWN_FAILED' },
    ],
    leftoverPlanFiles: leftovers,
  });
  assert.equal(stored.cutOff, 'none');
  assert.deepEqual(stored.counts, { published: 1, failed: 1 });
  assert.deepEqual(stored.verdicts, [succeeded, failed]);
  assert.equal(cache(world).records['2'].verdict, 'failed');
  assert.equal(cache(world).records['2'].retryCount, 0);
  assert.equal(cache(world).records['3'], undefined, 'environment stop spends no issue retry');
  assert.equal(world.state().creates.length, 1);
  await release(world, passId);
});

async function leaveRemote(t, { create = false } = {}) {
  const world = createWorld(t, { issues: [issue(1), issue(2)] });
  const firstId = await acquire(world);
  const first = await collect(world, firstId);
  await writePlan(world);
  if (create) await publish(world, first);
  else {
    const state = world.state();
    state.failCreate = true;
    world.state(state);
    const failed = await world.publication('publish', publicationInput(first.baseOid));
    assert.equal(failed.ok, false);
    assert.equal(failed.error.details.state, 'branch-pushed');
    assert.ok(branches(world).includes(`refs/heads/${BRANCH}`));
    assert.equal(world.state().pulls.length, 0);
    state.failCreate = false;
    state.creates = world.state().creates;
    world.state(state);
  }
  await release(world, firstId);
  // Only the operator removes a preserved local survivor before a later recovery pass.
  fs.unlinkSync(path.join(world.root, PLAN));
  return world;
}

test('an actual pushed orphan is inspected/completed once, and its recovery consumes plan capacity', async (t) => {
  const world = await leaveRemote(t);
  const passId = await acquire(world);
  const collected = await collect(world, passId, { limits: { judgments: 1, plans: 1 } });
  assert.deepEqual(collected.recovery.orphanBranches, [{ issue: 1, headRef: BRANCH }]);
  assert.equal(collected.authorizedRecovery[0].kind, 'orphan-branch');
  assert.deepEqual(
    collected.eligible.map((entry) => entry.issue),
    [2],
  );
  const input = recoveryInput(collected.baseOid);
  const { title, body, ...inspectInput } = input;
  const inspected = checked(await world.publication('inspect-branch', inspectInput));
  assert.deepEqual(
    Object.keys(inspected).sort(),
    ['baseOid', 'branchTip', 'planFile', 'blobOid', 'reviewResult', 'openPointCount'].sort(),
  );
  assert.equal(inspected.reviewResult, 'approved');
  assert.equal(inspected.openPointCount, 0);
  const completed = checked(
    await world.publication('complete-branch', { ...input, expectedTipOid: inspected.branchTip }),
  );
  const verdict = await record(world, passId, collected, {
    candidate: collected.authorizedRecovery[0],
    pullRequest: completed.pullRequest,
  });
  const over = await world.buddy('verdict-record', {
    passId,
    issue: 2,
    fingerprint: collected.eligible[0].fingerprint,
    verdict: 'published',
    mode: 'publish',
    reason: 'Over capacity',
    pullRequest: { number: 999, url: 'https://github.com/acme/fixture/pull/999' },
  });
  assert.equal(over.error.code, 'INVALID_PAYLOAD');
  const stored = await report(world, passId, collected, {
    verdicts: [verdict],
    pullRequestsRecovered: [prIdentity(completed)],
    cutOff: 'publish-limit',
  });
  assert.equal(stored.counts.published, 1);
  assert.equal(world.state().pulls.length, 1);
  assert.equal(
    world.state().creates.filter((entry) => entry.draft).length,
    2,
    'one failed create and one successful recovery create',
  );
  await release(world, passId);
});

test('a real unrecorded draft PR is reconciled without a second create or publication call', async (t) => {
  const world = await leaveRemote(t, { create: true });
  const passId = await acquire(world);
  const collected = await collect(world, passId);
  assert.equal(collected.authorizedRecovery.length, 1);
  const candidate = collected.authorizedRecovery[0];
  assert.equal(candidate.kind, 'unrecorded-pull-request');
  const before = mutations(world).length;
  const verdict = await record(world, passId, collected, { candidate, pullRequest: candidate });
  const stored = await report(world, passId, collected, {
    verdicts: [verdict],
    pullRequestsRecovered: [
      { issue: 1, number: candidate.number, headRef: candidate.headRef, url: candidate.url },
    ],
    cutOff: 'publish-limit',
  });
  assert.equal(stored.pullRequestsRecovered.length, 1);
  assert.equal(mutations(world).length, before);
  assert.equal(world.state().creates.length, 1);
  await release(world, passId);
});

test('dry collection diagnoses actual orphan/PR recovery without authorizing or mutating it', async (t) => {
  for (const create of [false, true])
    await t.test(create ? 'unrecorded PR' : 'orphan', async (t) => {
      const world = await leaveRemote(t, { create });
      const passId = await acquire(world);
      const before = mutations(world).length;
      const collected = await collect(world, passId, { mode: 'dry-run' });
      assert.deepEqual(collected.authorizedRecovery, []);
      assert.equal(
        collected.recovery[create ? 'unrecordedPullRequests' : 'orphanBranches'].length,
        1,
      );
      await report(world, passId, collected);
      assert.equal(mutations(world).length, before);
      assert.equal(fs.existsSync(path.join(world.runtime, 'verdicts.json')), false);
      await release(world, passId);
    });
});

test('prior and changed survivors remain excluded and unchanged until operator removal permits a later collect', async (t) => {
  const world = createWorld(t);
  await writePlan(world);
  const target = path.join(world.root, PLAN);
  const before = fs.readFileSync(target, 'utf8');
  const passId = await acquire(world);
  const collected = await collect(world, passId, { leftoverPlanFiles: leftovers });
  assert.deepEqual(collected.eligible, []);
  assert.deepEqual(collected.authorizedRecovery, []);
  await report(world, passId, collected);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  await release(world, passId);
  fs.appendFileSync(target, '\nOperator edit\n');
  const changed = fs.readFileSync(target, 'utf8');
  const secondId = await acquire(world);
  const second = await collect(world, secondId, { leftoverPlanFiles: leftovers });
  assert.deepEqual(second.eligible, []);
  await report(world, secondId, second);
  assert.equal(fs.readFileSync(target, 'utf8'), changed);
  await release(world, secondId);
  fs.unlinkSync(target);
  const thirdId = await acquire(world);
  const third = await collect(world, thirdId);
  assert.deepEqual(
    third.eligible.map((entry) => entry.issue),
    [1],
  );
  assert.equal(fs.existsSync(path.join(world.runtime, 'verdicts.json')), false);
  assert.equal(mutations(world).length, 0);
  await release(world, thirdId);
});

test('an earlier survivor excludes its real orphan from recovery until the operator removes the file', async (t) => {
  const world = await leaveRemote(t);
  await writePlan(world);
  const target = path.join(world.root, PLAN);
  const bytes = fs.readFileSync(target);
  const passId = await acquire(world);
  const before = mutations(world).length;
  const collected = await collect(world, passId, { leftoverPlanFiles: leftovers });
  assert.deepEqual(collected.recovery.orphanBranches, [{ issue: 1, headRef: BRANCH }]);
  assert.deepEqual(collected.authorizedRecovery, []);
  assert.deepEqual(
    collected.eligible.map((entry) => entry.issue),
    [2],
  );
  await report(world, passId, collected);
  assert.deepEqual(fs.readFileSync(target), bytes);
  assert.equal(mutations(world).length, before);
  await release(world, passId);
  fs.unlinkSync(target);
  const nextId = await acquire(world);
  const next = await collect(world, nextId);
  assert.equal(next.authorizedRecovery[0].kind, 'orphan-branch');
  assert.equal(next.authorizedRecovery[0].issue, 1);
  assert.equal(fs.existsSync(path.join(world.runtime, 'verdicts.json')), false);
  await release(world, nextId);
});

test('unsafe leftover paths and symlink plan artifacts are refused without deleting their targets', async (t) => {
  const world = createWorld(t);
  const passId = await acquire(world);
  const unsafe = await world.buddy(
    'pass-collect',
    collectInput(passId, {
      leftoverPlanFiles: [{ issue: 1, path: '../escape.md', action: 'remove' }],
    }),
  );
  assert.equal(unsafe.error.code, 'INVALID_PAYLOAD');
  assert.equal(passRecord(world, passId).collection, undefined);
  const collected = await collect(world, passId);
  const outside = path.join(world.container, 'outside.md');
  fs.writeFileSync(outside, 'Keep this target\n');
  fs.mkdirSync(path.dirname(path.join(world.root, PLAN)), { recursive: true });
  fs.symlinkSync(outside, path.join(world.root, PLAN));
  const refused = await world.publication('publish', publicationInput(collected.baseOid));
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'UNSAFE_PATH');
  assert.equal(refused.error.details.reason, 'symlink');
  assert.equal(fs.lstatSync(path.join(world.root, PLAN)).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'Keep this target\n');
  assert.equal(mutations(world).length, 0);
  assert.equal(branches(world), 'refs/heads/main');
  await release(world, passId);
});

function crashActor(t, world, boundary) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./fixtures/issue-buddy/crash-pass.mjs', import.meta.url))],
    { cwd: world.root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );
  let passId;
  let errors = '';
  child.stderr.on('data', (bytes) => {
    errors += bytes;
  });
  let entered, rejectEntered;
  const reached = new Promise((resolve, reject) => {
    entered = resolve;
    rejectEntered = reject;
  });
  child.on('message', (message) => {
    if (message.kind === 'acquired') passId = message.passId;
    if (message.kind === 'boundary') entered(message);
    if (message.kind === 'failure') rejectEntered(new Error(message.message));
  });
  const timeout = setTimeout(() => {
    rejectEntered(new Error(`Timed out at ${boundary}: ${errors}`));
    child.kill('SIGKILL');
  }, 20000);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      rejectEntered(new Error(`Child exited before ${boundary}: ${code}/${signal} ${errors}`));
      resolve({ code, signal });
    });
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await done;
  });
  child.send({ container: world.container, boundary });
  return {
    child,
    reached,
    done,
    get passId() {
      return passId;
    },
  };
}

test(
  'real SIGKILL before/after file, push, create, verdict and report retains exact cross-helper state and requires explicit pass release',
  { timeout: 120000 },
  async (t) => {
    const stages = [
      'before-file',
      'after-file',
      'before-push',
      'after-push',
      'before-create',
      'after-create',
      'before-verdict',
      'after-verdict',
      'before-report',
      'after-report',
    ];
    for (const [index, boundary] of stages.entries())
      await t.test(boundary, async (t) => {
        const world = createWorld(t);
        const actor = crashActor(t, world, boundary);
        await actor.reached;
        assert.ok(actor.passId);
        actor.child.kill('SIGKILL');
        assert.equal((await actor.done).signal, 'SIGKILL');
        // The killed pass keeps its record and, until its verdict settled it, its claim.
        const retained = passRecord(world, actor.passId);
        assert.equal(claimHolder(world, 1)?.passId, index >= 7 ? undefined : actor.passId);
        assert.equal(retained.collection.status, 'collected');
        assert.equal(exists(world, PLAN), index >= 1);
        assert.equal(branches(world).includes(`refs/heads/${BRANCH}`), index >= 3);
        assert.equal(world.state().pulls.length, index >= 5 ? 1 : 0);
        assert.equal(world.state().creates.length, index >= 5 ? 1 : 0);
        assert.equal(Object.keys(retained.collection.outcomes).length, index >= 7 ? 1 : 0);
        assert.equal(fs.existsSync(path.join(world.runtime, 'verdicts.json')), index >= 7);
        assert.equal(
          fs.existsSync(path.join(world.runtime, 'reports', `${actor.passId}.json`)),
          index >= 9,
        );
        assert.equal(fs.existsSync(path.join(world.runtime, 'last-pass.json')), index >= 9);
        if (index >= 7) assert.equal(cache(world).records['1'].verdict, 'published');
        if (index >= 9) {
          const stored = JSON.parse(
            fs.readFileSync(path.join(world.runtime, 'last-pass.json'), 'utf8'),
          );
          assert.equal(stored.outcome, 'completed');
          assert.equal(stored.pullRequestsOpened.length, 1);
        }
        assert.equal(
          (await world.buddy('pass-close', { passId: 'wrong' })).error.code,
          'PASS_NOT_FOUND',
        );
        assert.deepEqual(passRecord(world, actor.passId), retained);
        // A parallel pass opens beside the killed one; the killed pass's issue stays claimed.
        const nextId = await acquire(world);
        assert.notEqual(nextId, actor.passId);
        if (index < 7) {
          const blocked = await collect(world, nextId, { issue: 1 }).catch((error) => error);
          assert.match(String(blocked.message), /ISSUE_CLAIMED/);
        }
        await release(world, actor.passId);
        assert.equal(claimHolder(world, 1), undefined);
        await release(world, nextId);
      });
  },
);

test('SIGKILL after real publication and cache commit lets a stopped v2 report reconcile its pending published outcome exactly once', async (t) => {
  const world = createWorld(t);
  const actor = crashActor(t, world, 'after-cache');
  await actor.reached;
  actor.child.kill('SIGKILL');
  assert.equal((await actor.done).signal, 'SIGKILL');
  const retained = passRecord(world, actor.passId);
  assert.deepEqual(retained.collection.outcomes, {});
  assert.equal(retained.collection.pendingVerdict.outcome.verdict, 'published');
  assert.equal(cache(world).records['1'].verdict, 'published');
  const pull = world.state().pulls[0];
  assert.equal(pull.draft, true);
  const verdict = { issue: 1, verdict: 'published', reason: 'Fixture outcome' };
  const identity = { issue: 1, number: pull.number, headRef: BRANCH, url: pull.html_url };
  const stored = await report(world, actor.passId, retained.collection.result, {
    outcome: 'failed',
    verdicts: [verdict],
    pullRequestsOpened: [identity],
    failures: [{ issue: null, stage: 'verdict', code: 'PROCESS_KILLED' }],
    leftoverPlanFiles: leftovers,
  });
  assert.equal(stored.outcome, 'failed');
  assert.deepEqual(stored.counts, { published: 1 });
  assert.deepEqual(stored.pullRequestsOpened, [identity]);
  assert.equal(passRecord(world, actor.passId).collection.pendingVerdict, undefined);
  assert.equal(Object.keys(passRecord(world, actor.passId).collection.outcomes).length, 1);
  assert.equal(world.state().creates.length, 1);
  // Reconciling the pending verdict settled the issue: its claim is released.
  assert.equal(claimHolder(world, 1), undefined);
  await release(world, actor.passId);
});

test('metadata blob drift preserves the new plan and refuses publication before push or forge mutation', async (t) => {
  const world = createWorld(t);
  const passId = await acquire(world);
  const collected = await collect(world, passId);
  await writePlan(world);
  const metadata = checked(await world.lint('publication-metadata'));
  const target = path.join(world.root, PLAN);
  fs.appendFileSync(target, '\nOperator edit after metadata extraction.\n');
  const changed = fs.readFileSync(target, 'utf8');
  const refused = await world.publication(
    'publish',
    publicationInput(collected.baseOid, { expectedBlobOid: metadata.blobOid }),
  );
  assert.equal(refused.error.code, 'BLOB_CHANGED');
  assert.equal(fs.readFileSync(target, 'utf8'), changed);
  assert.equal(branches(world), 'refs/heads/main');
  assert.equal(mutations(world).length, 0);
  assert.deepEqual(passRecord(world, passId).collection.outcomes, {});
  const stored = await report(world, passId, collected, {
    outcome: 'failed',
    failures: [{ issue: null, stage: 'publish', code: 'BLOB_CHANGED' }],
    leftoverPlanFiles: leftovers,
  });
  assert.deepEqual(stored.counts, {});
  assert.equal(fs.existsSync(path.join(world.runtime, 'verdicts.json')), false);
  await release(world, passId);
});

// Invariant (issue #734): a base that moves after collection, without touching anything the plan
// cites, is assessed `fits`; the fragment's `publication-metadata` re-run yields the identical
// projection, `blobOid` included, the one re-publish builds the plan commit on the new tip, and the
// stored v2 report with its `fits` entry is accepted.
test('an unrelated base move after collection fits: the pass publishes on the new tip and reports the move', async (t) => {
  const world = createWorld(t);
  const passId = await acquire(world);
  const collected = await collect(world, passId);
  await writePlan(world);
  checked(await world.lint('lint'));
  const metadata = checked(await world.lint('publication-metadata'));
  const newTip = advanceRemoteBase(world, { 'unrelated/notes.txt': 'notes\n' });
  assert.notEqual(newTip, collected.baseOid);

  const refused = await world.publication(
    'publish',
    publicationInput(collected.baseOid, { expectedBlobOid: metadata.blobOid }),
  );
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'BASE_CHANGED');
  assert.equal(refused.error.details?.state, undefined, 'refused before any mutation');
  assert.equal(branches(world), 'refs/heads/main');
  assert.equal(mutations(world).length, 0);

  const assessed = checked(
    await world.publication('assess-base-move', assessInput(collected.baseOid, metadata.blobOid)),
  );
  assert.equal(assessed.verdict, 'fits');
  assert.equal(assessed.fromBaseOid, collected.baseOid);
  assert.equal(assessed.toBaseOid, newTip);
  assert.equal(assessed.commitCount, 1);
  assert.deepEqual(assessed.overlappingPaths, []);
  assert.equal(branches(world), 'refs/heads/main', 'assessment pushes nothing');
  assert.equal(mutations(world).length, 0, 'assessment writes no forge object');
  // The integrity re-run before the single re-publish: the projection is unchanged.
  const rerun = checked(await world.lint('publication-metadata'));
  assert.deepEqual(rerun, metadata);
  assert.equal(rerun.blobOid, metadata.blobOid);

  const published = checked(
    await world.publication(
      'publish',
      publicationInput(newTip, { expectedBlobOid: metadata.blobOid }),
    ),
  );
  assert.equal(published.state, 'pull-request-opened');
  assert.equal(world.git(world.bare, 'rev-parse', `${published.commitOid}^`), newTip);
  assert.equal(world.git(world.bare, 'rev-parse', `refs/heads/${BRANCH}`), published.commitOid);
  assert.equal(world.state().creates.length, 1);

  const verdict = await record(world, passId, collected, { pullRequest: published.pullRequest });
  const move = {
    issue: 1,
    fromBaseOid: assessed.fromBaseOid,
    toBaseOid: assessed.toBaseOid,
    verdict: assessed.verdict,
    reason: assessed.reason,
    commitCount: assessed.commitCount,
    changedPathCount: assessed.changedPathCount,
    citedPathCount: assessed.citedPathCount,
    citedPaths: assessed.citedPaths,
    overlappingPaths: assessed.overlappingPaths,
  };
  const stored = await report(world, passId, collected, {
    verdicts: [verdict],
    pullRequestsOpened: [prIdentity(published)],
    leftoverPlanFiles: leftovers,
    baseMoves: [move],
  });
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.outcome, 'completed');
  assert.deepEqual(stored.baseMoves, [move]);
  assert.equal(stored.baseMoves[0].verdict, 'fits');
  await release(world, passId);
});

// Invariant (issue #734): a base move that changes a path the plan cites stops the pass before
// any mutation; the v2 report carries the null BASE_CHANGED failure and the `overlap` entry, and
// the plan and its planning worktree, HEAD still at the collected base, stay for the operator.
test('an overlapping base move stops the pass with an overlap entry and keeps the plan', async (t) => {
  const world = createWorld(t);
  const passId = await acquire(world);
  const collected = await collect(world, passId);
  const tree = path.join(world.container, 'planning-1');
  world.git(
    world.root,
    'worktree',
    'add',
    '-q',
    '-b',
    'issue-planning/s1',
    tree,
    collected.baseOid,
  );
  fs.mkdirSync(path.join(tree, 'docs/plan'), { recursive: true });
  fs.writeFileSync(path.join(tree, PLAN), planText(), { flag: 'wx' });
  const planBytes = fs.readFileSync(path.join(tree, PLAN));
  checked(await world.lint('lint', { cwd: tree }));
  const metadata = checked(await world.lint('publication-metadata', { cwd: tree }));
  const newTip = advanceRemoteBase(world, { 'README.md': '# Fixture, edited elsewhere\n' });

  const refused = await world.publication(
    'publish',
    publicationInput(collected.baseOid, { cwd: tree, expectedBlobOid: metadata.blobOid }),
  );
  assert.equal(refused.error.code, 'BASE_CHANGED');
  const assessed = checked(
    await world.publication(
      'assess-base-move',
      assessInput(collected.baseOid, metadata.blobOid, { cwd: tree }),
    ),
  );
  assert.equal(assessed.verdict, 'overlap');
  assert.equal(assessed.reason, 'cited-path');
  assert.deepEqual(assessed.overlappingPaths, ['README.md']);
  assert.equal(assessed.toBaseOid, newTip);
  assert.equal(branches(world), 'refs/heads/main');
  assert.equal(mutations(world).length, 0);
  assert.equal(world.state().creates.length, 0);

  const move = {
    issue: 1,
    fromBaseOid: assessed.fromBaseOid,
    toBaseOid: assessed.toBaseOid,
    verdict: assessed.verdict,
    reason: assessed.reason,
    commitCount: assessed.commitCount,
    changedPathCount: assessed.changedPathCount,
    citedPathCount: assessed.citedPathCount,
    citedPaths: assessed.citedPaths,
    overlappingPaths: assessed.overlappingPaths,
  };
  const stored = await report(world, passId, collected, {
    outcome: 'failed',
    failures: [{ issue: null, stage: 'publish', code: 'BASE_CHANGED' }],
    leftoverPlanFiles: [],
    baseMoves: [move],
  });
  assert.equal(stored.outcome, 'failed');
  assert.deepEqual(stored.failures, [{ issue: null, stage: 'publish', code: 'BASE_CHANGED' }]);
  assert.deepEqual(stored.baseMoves, [move]);
  assert.deepEqual(stored.pullRequestsOpened, []);
  assert.deepEqual(fs.readFileSync(path.join(tree, PLAN)), planBytes, 'the plan is preserved');
  assert.equal(world.git(tree, 'rev-parse', 'HEAD'), collected.baseOid, 'the worktree is kept');
  assert.equal(fs.existsSync(path.join(world.runtime, 'verdicts.json')), false);
  assert.equal(branches(world), 'refs/heads/main');
  await release(world, passId);
});

// Invariant (acceptance "Different issues"): two single-issue passes for different issues run
// with overlapping lifetimes, overlapping collection read phases and overlapping readiness reads,
// each in its own planning worktree at its collected base, and both publish.
test('two overlapping single-issue passes for different issues both publish from their planning worktrees', async (t) => {
  const world = createWorld(t, { issues: [issue(1), issue(2)] });
  const head = world.git(world.root, 'rev-parse', 'HEAD');
  const meeting = (parties) => {
    let arrived = 0;
    let open;
    const all = new Promise((resolve) => {
      open = resolve;
    });
    return async () => {
      if (++arrived === parties) open();
      await all;
    };
  };
  // Both read phases must reach the issue listing before either may continue.
  const listing = meeting(2);
  const readiness = meeting(2);
  // The fake forge is a read-modify-write JSON file; only its PR creation is serialized.
  let creations = Promise.resolve();
  const runner = async (call) => {
    if (
      call.executable === 'gh' &&
      call.args.some((arg) => /^repos\/acme\/fixture\/issues(?:\?|$)/.test(arg))
    )
      await listing();
    if (call.executable === 'gh' && call.args.includes('POST')) {
      const created = creations.then(() => world.runner(call));
      creations = created.catch(() => {});
      return created;
    }
    return world.runner(call);
  };
  const options = { ...world.options, runner };
  const buddy = (operation, input = {}) =>
    buddyOperation(operation, { cwd: world.root, ...input }, options);
  const plan = async (number) => {
    const passId = checked(await buddy('pass-open')).passId;
    const collected = checked(await buddy('pass-collect', collectInput(passId, { issue: number })));
    assert.deepEqual(
      collected.eligible.map((entry) => entry.issue),
      [number],
    );
    // Readiness reads of both passes overlap while both hold their claims.
    await readiness();
    const candidate = collected.eligible[0];
    assert.equal(
      checked(
        await buddy('fingerprint', {
          trustedTextPath: candidate.trustedTextPath,
          issueAuthor: candidate.issueAuthor,
        }),
      ).fingerprint,
      candidate.fingerprint,
    );
    assert.equal(claimHolder(world, number).passId, passId);
    const tree = path.join(world.container, `planning-${number}`);
    world.git(
      world.root,
      'worktree',
      'add',
      '-q',
      '-b',
      `issue-planning/s${number}`,
      tree,
      collected.baseOid,
    );
    const file = `docs/plan/2026-10-19-issue-${number}-fixture.md`;
    fs.mkdirSync(path.join(tree, 'docs/plan'), { recursive: true });
    fs.writeFileSync(path.join(tree, file), planText(number), { flag: 'wx' });
    checked(await world.lint('lint', { cwd: tree, files: [file] }));
    const metadata = checked(
      await world.lint('publication-metadata', { cwd: tree, files: [file] }),
    );
    const published = checked(
      await publicationOperation(
        'publish',
        publicationInput(collected.baseOid, {
          cwd: tree,
          issue: number,
          planFile: file,
          title: `docs: plan issue #${number}`,
          body: `Plan for issue #${number}; review result: approved; open points: 0.`,
          commitMessage: `docs: plan issue #${number}`,
          expectedBlobOid: metadata.blobOid,
        }),
        { apply: true, runner, environment: {} },
      ),
    );
    const verdict = {
      issue: number,
      verdict: 'published',
      reason: 'Fixture outcome',
    };
    checked(
      await buddy('verdict-record', {
        passId,
        issue: number,
        fingerprint: candidate.fingerprint,
        verdict: 'published',
        mode: 'publish',
        reason: 'Fixture outcome',
        pullRequest: { number: published.pullRequest.number, url: published.pullRequest.url },
      }),
    );
    const stored = checked(
      await buddy('pass-report', {
        passId,
        reportVersion: 2,
        collect: collected,
        outcome: 'completed',
        cutOff: 'none',
        verdicts: [verdict],
        pullRequestsOpened: [prIdentity(published, number)],
        pullRequestsRecovered: [],
        failures: [],
        repositoryVisibility: 'public',
        leftoverPlanFiles: [],
      }),
    );
    checked(await buddy('pass-close', { passId }));
    return { published, stored };
  };
  const [first, second] = await Promise.all([plan(1), plan(2)]);
  for (const [number, result] of [
    [1, first],
    [2, second],
  ]) {
    assert.equal(result.published.state, 'pull-request-opened');
    assert.equal(result.stored.outcome, 'completed');
    assert.equal(result.stored.counts.published, 1);
    assert.equal(cache(world).records[String(number)].verdict, 'published');
    assert.equal(claimHolder(world, number), undefined);
    assert.ok(branches(world).includes(`refs/heads/effective-flow/plan/issue-${number}`));
  }
  assert.equal(world.state().pulls.length, 2);
  assert.equal(world.git(world.root, 'rev-parse', 'HEAD'), head);
  assert.deepEqual(fs.readdirSync(path.join(world.runtime, 'passes')), []);
});

test('fixture scenario definitions keep the required phase inputs explicit', () => {
  assert.deepEqual(Object.keys(scenarios), [
    'dryLocalOnly',
    'publishDraft',
    'privateStop',
    'unknownStop',
    'malformedReadiness',
    'nestedSpawnFailure',
  ]);
});
