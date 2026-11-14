// Invariants protected (plan 2026-11-13-merge-gate-repair-attempts, "Focused unit tests for the
// helper"): repair attempts are counted only for attributed, implemented repairs; waits and gate
// base merges cost nothing; the second verified ineffective repair of one reviewer cause stops the
// run; same/new/uncertain is decided per configured reviewer from forge anchors and git diffs; the
// authorized scope admits beyond the PR's paths only test files the run added; and every failed git
// read has its stated outcome. Every git read runs through a fake runner keyed by its exact argv
// after the `--no-replace-objects` every read must lead with.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_INERT_LISTED,
  TEST_GLOBS,
  UNDETERMINED_CODES,
  createGitReads,
  executeOperation,
  gitReadEnv,
  isTestPath,
  parseHunks,
  parseNameStatus,
} from '../src/scripts/repair-attempt-core.mjs';

const sha = (n) => n.toString(16).padStart(40, '0');
const MB = sha(0xa0);
const H0 = sha(0xb0);
const M1 = sha(0xc1);
const M2 = sha(0xc2);
const S1 = sha(0xd1);
const S2 = sha(0xd2);
const S3 = sha(0xd3);
const P0 = sha(0xe0);
const X9 = sha(0xf9);
const B1 = sha(0xba);
const BOT = 'review-bot[bot]';
const OTHER = 'other-bot[bot]';
const FREE = 'F'.repeat(32);
const CORR = 'K'.repeat(32);
const X1 = '1'.repeat(32);
const X2 = '2'.repeat(32);
const X3 = '3'.repeat(32);
const SCOPE = { mergeBase: MB, head: H0, paths: ['src/a.mjs', 'src/b.mjs', 'test/a.test.mjs'] };

const ok = (stdout) => ({ status: 0, stdout, stderr: '' });
const failed = { status: 128, stdout: '', stderr: 'fatal: bad object' };

const keys = {
  mergeBase: (head) => `merge-base origin/develop ${head}`,
  scopeDiff: (mergeBase, head) => `diff --name-status -z -M ${mergeBase} ${head}`,
  range: (before, after) => `rev-list ${before}..${after} --not origin/develop`,
  parents: (commit) => `rev-list --parents -n 1 ${commit}`,
  paths: (commit) => `diff-tree --no-commit-id --name-status -r -z -M ${commit}`,
  hunks: (commit) =>
    `-c core.quotePath=false diff-tree -p -U0 -M --no-commit-id --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ ${commit}`,
  pathChanged: (from, head, path) =>
    `--literal-pathspecs diff --name-only --no-renames ${from} ${head} -- ${path}`,
  ancestor: (ancestor, head) => `merge-base --is-ancestor ${ancestor} ${head}`,
  inTree: (commit, path) =>
    `--literal-pathspecs ls-tree -r -z --name-only --full-tree ${commit} -- ${path}`,
  addedBy: (from, tip, path) =>
    `--literal-pathspecs log -m --first-parent --diff-filter=A --format=%H%x20%P -n 1 ${from}..${tip} -- ${path}`,
};

const patch = (files) =>
  Object.entries(files)
    .map(
      ([path, hunks]) =>
        `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n` +
        hunks.map(([start, count]) => `@@ -${start},1 +${start},${count} @@\n+changed\n`).join(''),
    )
    .join('');

// A fake git: unknown argv answers like a missing object, and every call is recorded.
function world() {
  const table = new Map();
  const calls = [];
  const runner = async ({ executable, args }) => {
    assert.equal(executable, 'git');
    assert.equal(args[0], '--no-replace-objects', 'every read ignores replace refs');
    const key = args.slice(1).join(' ');
    calls.push(key);
    return table.get(key) ?? failed;
  };
  return {
    runner,
    calls,
    set: (key, result) => table.set(key, result),
    range(before, after, commits) {
      table.set(keys.range(before, after), ok(commits.map((commit) => `${commit}\n`).join('')));
    },
    // One single-parent commit with its name-status and new-side hunks ([start, count] per path).
    commit(commit, { parents = [P0], changes = [['M', 'src/a.mjs']], hunks } = {}) {
      table.set(keys.parents(commit), ok(`${[commit, ...parents].join(' ')}\n`));
      table.set(keys.paths(commit), ok(changes.map((change) => `${change.join('\0')}\0`).join('')));
      table.set(keys.hunks(commit), ok(patch(hunks ?? { 'src/a.mjs': [[10, 3]] })));
    },
    pathChanged(from, head, path, changed) {
      table.set(keys.pathChanged(from, head, path), ok(changed ? `${path}\n` : ''));
    },
    ancestor(ancestor, head, yes = true) {
      table.set(keys.ancestor(ancestor, head), { status: yes ? 0 : 1, stdout: '', stderr: '' });
    },
    // Whether `path` is in the tree of `commit`.
    inTree(commit, path, present) {
      table.set(keys.inTree(commit, path), ok(present ? `${path}\0` : ''));
    },
    // The latest first-parent commit adding `path` in `from..tip`, with its parents; none for null.
    addedBy(from, tip, path, adder, parents = [P0]) {
      table.set(
        keys.addedBy(from, tip, path),
        ok(adder === null ? '' : `${[adder, ...parents].join(' ')}\n`),
      );
    },
    // A test path the run added in `adder` and that is still absent from the scope head.
    runAdded(path, tip, adder) {
      table.set(keys.inTree(H0, path), ok(''));
      table.set(keys.ancestor(H0, tip), { status: 0, stdout: '', stderr: '' });
      this.addedBy(H0, tip, path, adder);
    },
  };
}

async function run(w, operation, input) {
  const envelope = await executeOperation(
    operation,
    { cwd: '/repo', ...input },
    { runner: w.runner },
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(envelope.operation, operation);
  return envelope.data;
}

const item = (identifier, key, outcome = 'implemented', reviewer = BOT) => ({
  identifier,
  key,
  reviewer,
  outcome,
});

const record = (w, state, { round, before, after, items = [], ...rest }) =>
  run(w, 'record', {
    base: 'develop',
    state,
    scope: SCOPE,
    round,
    before,
    after,
    minted: { items, freeText: FREE, correction: CORR },
    ...rest,
  });

const observe = (w, state, head, findings, { reviewer = BOT, events } = {}) =>
  run(w, 'evaluate', {
    state,
    head,
    observations: [{ reviewer, head, findings }],
    ...(events ? { events } : {}),
  });

const thread = (key, path = 'src/a.mjs', line = 11, lineOutdated = false) => ({
  key,
  anchor: { path, line, lineOutdated },
});
const body = (key) => ({ key, anchor: null });
const resultsOf = (data, reviewer = BOT) =>
  data.classifications.find((entry) => entry.reviewer === reviewer).results;
const causeCount = (data, cause) => data.counts.reviewer.find((entry) => entry.cause === cause);

// K1 reported on H0, repaired once in round 1 (S1 changes src/a.mjs lines 10-12).
async function afterFirstRepair(w) {
  const first = await observe(w, null, H0, [thread('K1')]);
  assert.deepEqual(resultsOf(first), [{ key: 'K1', class: 'new' }]);
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const recorded = await record(w, first.state, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.equal(recorded.decision, 'continue');
  assert.equal(causeCount(recorded, 'K1').attempts, 1);
  return recorded.state;
}

// The first repair re-reported through a new overlapping thread K2, then repaired again by S2.
async function afterSecondRepair(w) {
  const state = await afterFirstRepair(w);
  const seen = await observe(w, state, S1, [thread('K2')]);
  assert.deepEqual(resultsOf(seen), [{ key: 'K2', class: 'same', cause: 'K1', via: 'overlap' }]);
  assert.equal(seen.decision, 'continue');
  assert.equal(causeCount(seen, 'K1').ineffective, 1);
  w.range(S1, S2, [S2]);
  w.commit(S2);
  const recorded = await record(w, seen.state, {
    round: 2,
    before: S1,
    after: S2,
    items: [item(X2, 'K2')],
    returned: [{ identifier: X2, shas: [S2] }],
  });
  assert.equal(causeCount(recorded, 'K1').attempts, 2, 'the alias K2 counts against cause K1');
  assert.equal(recorded.decision, 'continue');
  w.pathChanged(S1, S2, 'src/a.mjs', true);
  return recorded.state;
}

test('a base-only update followed by the same finding uses zero attempts, so a legitimate fix proceeds', async () => {
  const w = world();
  const first = await observe(w, null, H0, [thread('K1')]);
  // The gate's own base merge M1 moves the head; the bot re-reports K1 under the same thread key.
  const rereported = await observe(w, first.state, M1, [thread('K1')], {
    events: [{ type: 'base-merge', sha: M1 }],
  });
  assert.deepEqual(resultsOf(rereported), [{ key: 'K1', class: 'same', cause: 'K1', via: 'key' }]);
  assert.equal(rereported.decision, 'continue');
  assert.equal(causeCount(rereported, 'K1').attempts, 0);
  // #641: the same finding re-reported in a fresh thread is a separate cause, still at zero.
  const fresh = await observe(w, rereported.state, M1, [
    thread('K1'),
    thread('K5', 'src/b.mjs', 3),
  ]);
  assert.equal(causeCount(fresh, 'K5').attempts, 0);
  // The legitimate fix S1 is the first attempt; the reviewer's clean run on S1 resolves both.
  w.range(M1, S1, [S1]);
  w.commit(S1);
  const recorded = await record(w, fresh.state, {
    round: 1,
    before: M1,
    after: S1,
    items: [item(X1, 'K1'), item(X2, 'K5', 'deferred')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.equal(causeCount(recorded, 'K1').attempts, 1);
  assert.equal(causeCount(recorded, 'K5').attempts, 0, 'a deferred item is no attempt');
  const clean = await observe(w, recorded.state, S1, []);
  assert.equal(clean.decision, 'continue');
  assert.deepEqual(
    clean.counts.reviewer.map(({ cause, status }) => [cause, status]),
    [
      ['K1', 'resolved'],
      ['K5', 'resolved'],
    ],
  );
  assert.ok(clean.state.timeline.some((entry) => entry.type === 'base-merge' && entry.sha === M1));
});

test('two ineffective repairs of the same reviewer cause stop the run', async () => {
  const w = world();
  const state = await afterSecondRepair(w);
  // Pending: a review of the older head S1 is no evidence about the head S2.
  const stale = await run(w, 'evaluate', {
    state,
    head: S2,
    observations: [{ reviewer: BOT, head: S1, findings: [thread('K3')] }],
  });
  assert.equal(stale.decision, 'continue');
  assert.equal(stale.classifications[0].stale, true);
  const result = await observe(w, state, S2, [thread('K3')]);
  assert.deepEqual(resultsOf(result), [{ key: 'K3', class: 'same', cause: 'K1', via: 'overlap' }]);
  assert.equal(result.decision, 'stop');
  assert.deepEqual(result.stop, {
    reason: 'ineffective-repairs',
    cause: 'K1',
    reviewer: BOT,
    attempts: 2,
    head: S2,
  });
  assert.equal(result.report.maintainerDecision, 'choose-repair-approach');
  assert.deepEqual(
    result.report.attempts.map(({ round, before, after, ineffective }) => [
      round,
      before,
      after,
      ineffective,
    ]),
    [
      [1, H0, S1, true],
      [2, S1, S2, true],
    ],
  );
});

test('one ineffective repair followed by an effective one resolves the cause without a stop', async () => {
  const w = world();
  const state = await afterSecondRepair(w);
  const result = await observe(w, state, S2, []);
  assert.equal(result.decision, 'continue');
  assert.deepEqual(result.causes, [{ cause: 'K1', reviewer: BOT, verdict: 'resolved' }]);
  assert.equal(causeCount(result, 'K1').attempts, 0, 'resolution resets the counter');
  assert.equal(result.state.causes[0].history[0].attempts.length, 2);
  // A resolved cause that reappears under one of its keys restarts at zero.
  const again = await observe(w, result.state, S2, [thread('K2')]);
  assert.equal(again.decision, 'continue');
  assert.equal(causeCount(again, 'K1').status, 'open');
  assert.equal(causeCount(again, 'K1').attempts, 0);
});

test('a genuinely new anchored finding opens its own cause and does not block resolving others', async () => {
  const w = world();
  const state = await afterFirstRepair(w);
  const result = await observe(w, state, S1, [thread('K9', 'src/b.mjs', 40)]);
  assert.deepEqual(resultsOf(result), [{ key: 'K9', class: 'new' }]);
  assert.deepEqual(result.causes, [{ cause: 'K1', reviewer: BOT, verdict: 'resolved' }]);
  assert.deepEqual(causeCount(result, 'K9'), {
    cause: 'K9',
    reviewer: BOT,
    attempts: 0,
    ineffective: 0,
    status: 'open',
  });
});

test('an uncertain match neither increments, resets nor stops', async () => {
  const w = world();
  const state = await afterSecondRepair(w);
  const result = await observe(w, state, S2, [body('R7#1')]);
  assert.deepEqual(resultsOf(result), [{ key: 'R7#1', class: 'uncertain', reason: 'no-anchor' }]);
  assert.equal(result.decision, 'continue');
  assert.deepEqual(result.causes, [
    { cause: 'K1', reviewer: BOT, verdict: 'unresolved-uncertain' },
  ]);
  assert.equal(causeCount(result, 'K1').attempts, 2);
  assert.equal(causeCount(result, 'K1').status, 'open');
  assert.equal(result.state.causes.length, 1, 'an uncertain finding opens no cause');
  // Not reset: the next fresh same finding still stops.
  const next = await observe(w, result.state, S2, [thread('K3')]);
  assert.equal(next.decision, 'stop');
});

test('outdated, left-side, negative-line and Forgejo anchors are uncertain', async () => {
  const w = world();
  const state = await afterFirstRepair(w);
  const cases = [
    // `lineOutdated` from the normalized thread read: a null GitHub line, `diffSide: LEFT`, a
    // negative signed line, and every Forgejo thread.
    ['null GitHub line', { path: 'src/a.mjs', line: 11, lineOutdated: true }, 'line-outdated'],
    ['left side', { path: 'src/a.mjs', line: 11, lineOutdated: true }, 'line-outdated'],
    ['negative line', { path: 'src/a.mjs', line: -11, lineOutdated: true }, 'line-outdated'],
    ['Forgejo', { path: 'src/a.mjs', line: 11, lineOutdated: true }, 'line-outdated'],
    ['flag absent', { path: 'src/a.mjs', line: 11 }, 'line-outdated'],
    [
      'negative line unflagged',
      { path: 'src/a.mjs', line: -11, lineOutdated: false },
      'anchor-invalid',
    ],
  ];
  for (const [label, anchor, reason] of cases) {
    const before = w.calls.length;
    const result = await observe(w, state, S1, [{ key: 'K2', anchor }]);
    assert.deepEqual(resultsOf(result), [{ key: 'K2', class: 'uncertain', reason }], label);
    assert.equal(result.decision, 'continue', label);
    assert.equal(causeCount(result, 'K1').attempts, 1, label);
    assert.equal(w.calls.length, before, `${label}: no overlap read for an uncurrent anchor`);
  }
});

test('an anchored path changed by an intervening commit is uncertain', async () => {
  const w = world();
  const state = await afterFirstRepair(w);
  // The gate's base merge M2 changed src/a.mjs after the attempt's after-head S1.
  w.pathChanged(S1, M2, 'src/a.mjs', true);
  w.ancestor(S1, M2);
  const changed = await observe(w, state, M2, [thread('K2')], {
    events: [{ type: 'base-merge', sha: M2 }],
  });
  assert.deepEqual(resultsOf(changed), [{ key: 'K2', class: 'uncertain', reason: 'path-changed' }]);
  assert.equal(causeCount(changed, 'K1').attempts, 1);
  // A base merge that left the path alone keeps the observation: it counts, and is named.
  w.pathChanged(S1, M1, 'src/a.mjs', false);
  w.ancestor(S1, M1);
  const kept = await observe(w, state, M1, [thread('K2')], {
    events: [{ type: 'base-merge', sha: M1 }],
  });
  assert.deepEqual(resultsOf(kept), [{ key: 'K2', class: 'same', cause: 'K1', via: 'overlap' }]);
  assert.equal(causeCount(kept, 'K1').ineffective, 1);
});

test('a body finding without an anchor is uncertain', async () => {
  const w = world();
  const fresh = await observe(w, null, H0, [body('R1#1')]);
  assert.deepEqual(resultsOf(fresh), [{ key: 'R1#1', class: 'uncertain', reason: 'no-anchor' }]);
  assert.deepEqual(fresh.counts, { reviewer: [], ci: [] });
});

test("another reviewer's overlapping thread is never the same cause", async () => {
  const w = world();
  const state = await afterFirstRepair(w);
  const result = await observe(w, state, S1, [thread('O1')], { reviewer: OTHER });
  assert.deepEqual(resultsOf(result, OTHER), [{ key: 'O1', class: 'new' }]);
  assert.deepEqual(result.causes, [], 'the other reviewer judges none of BOT causes');
  assert.deepEqual(
    result.counts.reviewer.map(({ cause, reviewer, attempts, ineffective }) => [
      cause,
      reviewer,
      attempts,
      ineffective,
    ]),
    [
      ['K1', BOT, 1, 0],
      ['O1', OTHER, 0, 0],
    ],
  );
});

test('a repair that adds focused test files stays in scope', async () => {
  const w = world();
  assert.deepEqual(TEST_GLOBS, [
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/*.test.*',
    '**/*.spec.*',
  ]);
  const added = [
    'test/new-case.test.mjs',
    'pkg/tests/fixture.json',
    'src/__tests__/a.mjs',
    'src/deep/b.spec.ts',
    'lib/c.test.js',
  ];
  const result = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [{ status: 'M', path: 'src/a.mjs' }, ...added.map((path) => ({ status: 'A', path }))],
  });
  assert.deepEqual(result, { status: 'in-scope', outside: [], undetermined: [] });
  for (const path of added) assert.ok(isTestPath(path), path);
  assert.equal(isTestPath('src/testing.mjs'), false);
  assert.equal(isTestPath('test'), false);
  assert.deepEqual(w.calls, [], 'scope-check reads nothing');
});

test('a repair that edits or deletes an existing out-of-PR test is an expansion', async () => {
  const w = world();
  w.inTree(H0, 'test/other.test.mjs', true);
  for (const status of ['M', 'D', 'T']) {
    const result = await run(w, 'scope-check', {
      scope: SCOPE,
      changes: [{ status, path: 'test/other.test.mjs' }],
    });
    assert.deepEqual(
      result,
      { status: 'expansion', outside: ['test/other.test.mjs'], undetermined: [] },
      status,
    );
  }
  // An existing PR test stays editable, and a plain added non-test file is an expansion.
  const mixed = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [
      { status: 'M', path: 'test/a.test.mjs' },
      { status: 'A', path: 'package-lock.json' },
      { status: 'A', path: '../test/escape.test.mjs' },
    ],
  });
  assert.deepEqual(mixed.outside, ['../test/escape.test.mjs', 'package-lock.json']);
});

test('a test file added earlier in the run stays editable and deletable', async () => {
  const w = world();
  const added = 'test/new-case.test.mjs';
  // Iterate's pre-edit check reads against HEAD of its execution root.
  w.runAdded(added, 'HEAD', S1);
  for (const status of ['M', 'D']) {
    const result = await run(w, 'scope-check', {
      scope: SCOPE,
      changes: [{ status, path: added }],
    });
    assert.deepEqual(result, { status: 'in-scope', outside: [], undetermined: [] }, status);
  }
  // Attempt 1 adds the test, attempt 2 modifies it: the post-check of both passes, reading S2 as
  // the tip of the second.
  w.commit(S1, { changes: [['A', added]] });
  w.commit(S2, { changes: [['M', added]] });
  w.runAdded(added, S2, S1);
  const check = await run(w, 'post-check', { scope: SCOPE, shas: [S1, S2] });
  assert.equal(check.status, 'pass');
  assert.deepEqual(check.outside, []);
  // A call without `cwd` reads nothing and stays an expansion.
  const calls = w.calls.length;
  const pure = await executeOperation(
    'scope-check',
    { scope: SCOPE, changes: [{ status: 'M', path: added }] },
    { runner: w.runner },
  );
  assert.deepEqual(pure.data, { status: 'expansion', outside: [added], undetermined: [] });
  assert.equal(w.calls.length, calls, 'scope-check without cwd reads nothing');
  // A non-test path absent from the scope head is still an expansion, and is never read.
  const plain = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [{ status: 'M', path: 'src/new.mjs' }],
  });
  assert.deepEqual(plain.outside, ['src/new.mjs']);
  assert.ok(!w.calls.some((call) => call.endsWith(' src/new.mjs')));
});

test("a test a base merge brought in is the base's, so modifying or deleting it is an expansion", async () => {
  const w = world();
  const merged = 'test/base-only.test.mjs';
  // Absent from the scope head, but added by the gate's base merge M1 (parents: PR line, base).
  w.inTree(H0, merged, false);
  w.ancestor(H0, 'HEAD');
  w.addedBy(H0, 'HEAD', merged, M1, [S1, B1]);
  for (const status of ['M', 'D']) {
    const result = await run(w, 'scope-check', {
      scope: SCOPE,
      changes: [{ status, path: merged }],
    });
    assert.deepEqual(result, { status: 'expansion', outside: [merged], undetermined: [] }, status);
  }
  // The post-check of a returned commit editing it stops as a committed expansion.
  w.commit(S2, { changes: [['M', merged]] });
  w.ancestor(H0, S2);
  w.addedBy(H0, S2, merged, M1, [S1, B1]);
  const check = await run(w, 'post-check', { scope: SCOPE, shas: [S2] });
  assert.equal(check.reason, 'scope-expansion-committed');
  assert.deepEqual(check.outside, [{ sha: S2, path: merged }]);
  // No adding commit in the range, a scope head off the tip's history, or a root commit: expansion.
  const cases = [
    ['test/none.test.mjs', () => w.addedBy(H0, 'HEAD', 'test/none.test.mjs', null)],
    ['test/root.test.mjs', () => w.addedBy(H0, 'HEAD', 'test/root.test.mjs', S3, [])],
  ];
  for (const [path, arrange] of cases) {
    w.inTree(H0, path, false);
    arrange();
    const result = await run(w, 'scope-check', { scope: SCOPE, changes: [{ status: 'M', path }] });
    assert.deepEqual(result.outside, [path], path);
  }
  const off = world();
  off.inTree(H0, merged, false);
  off.ancestor(H0, 'HEAD', false);
  off.addedBy(H0, 'HEAD', merged, S1);
  const diverged = await run(off, 'scope-check', {
    scope: SCOPE,
    changes: [{ status: 'M', path: merged }],
  });
  assert.deepEqual(diverged.outside, [merged]);
  assert.ok(!off.calls.includes(keys.addedBy(H0, 'HEAD', merged)), 'no lookup off the history');
});

test('a failed ancestry or addition lookup is undetermined, and the post-check reports its code', async () => {
  const w = world();
  const path = 'test/new-case.test.mjs';
  w.inTree(H0, path, false);
  // The ancestry read fails: undetermined, never in scope.
  const ancestry = await run(w, 'scope-check', { scope: SCOPE, changes: [{ status: 'M', path }] });
  assert.deepEqual(ancestry, {
    status: 'expansion',
    outside: [],
    undetermined: [{ path, code: 'ancestry-unreadable' }],
  });
  w.ancestor(H0, 'HEAD');
  for (const answer of [failed, ok(`${S1} ${P0}\n${S2} ${P0}\n`), ok('HEAD\n')]) {
    w.set(keys.addedBy(H0, 'HEAD', path), answer);
    const result = await run(w, 'scope-check', { scope: SCOPE, changes: [{ status: 'D', path }] });
    assert.deepEqual(result.undetermined, [{ path, code: 'addition-unreadable' }]);
    assert.equal(result.status, 'expansion');
  }
  // In the post-check an unreadable tree is `post-check-undetermined`, not a committed expansion.
  w.range(H0, S1, [S1]);
  w.commit(S1, { changes: [['M', 'test/unread.test.mjs']] });
  const recorded = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.deepEqual(recorded.stop, { reason: 'post-check-undetermined', round: 1 });
  assert.deepEqual(recorded.round.postCheck.undetermined, [
    { sha: S1, path: 'test/unread.test.mjs', code: 'tree-unreadable' },
  ]);
  assert.deepEqual(recorded.round.postCheck.outside, []);
  assert.equal(recorded.report.maintainerDecision, 'verify-returned-commits');
});

test('a non-canonical spelling of a test path is an expansion and reads nothing', async () => {
  const w = world();
  const spellings = [
    'test/./new.test.mjs',
    'test//new.test.mjs',
    './test/new.test.mjs',
    'test/new.test.mjs/',
    '/test/new.test.mjs',
    'test/../test/new.test.mjs',
    'test/.',
  ];
  for (const status of ['A', 'M']) {
    const result = await run(w, 'scope-check', {
      scope: SCOPE,
      changes: spellings.map((path) => ({ status, path })),
    });
    assert.equal(result.status, 'expansion', status);
    assert.deepEqual(result.outside, [...spellings].sort(), status);
  }
  assert.deepEqual(w.calls, [], 'a non-canonical path is never handed to git');
});

test('a rename from an out-of-scope path into a test path is an expansion', async () => {
  const w = world();
  const renamed = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [{ status: 'R', from: 'src/outside.mjs', path: 'test/outside.test.mjs' }],
  });
  assert.deepEqual(renamed, {
    status: 'expansion',
    outside: ['src/outside.mjs'],
    undetermined: [],
  });
  // The post-check reads renames with both sides from diff-tree and stops on them.
  w.commit(S1, { changes: [['R100', 'src/outside.mjs', 'test/outside.test.mjs']] });
  const check = await run(w, 'post-check', { scope: SCOPE, shas: [S1] });
  assert.equal(check.status, 'stop');
  assert.equal(check.reason, 'scope-expansion-committed');
  assert.deepEqual(check.outside, [{ sha: S1, path: 'src/outside.mjs' }]);
  // A copy checks its source too.
  const copied = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [{ status: 'C', from: 'src/a.mjs', path: 'test/copy.test.mjs' }],
  });
  assert.deepEqual(copied.status, 'in-scope');
});

test('the test globs match at any depth and need a test directory segment or a .test./.spec. name', async () => {
  for (const path of [
    'a/b/__tests__/x.js',
    'src/foo.spec.ts',
    'a/b/c/test/y.json',
    'pkg/tests/deep/z.txt',
    'x.test.mjs',
  ]) {
    assert.ok(isTestPath(path), path);
  }
  for (const path of [
    'src/contest/x.mjs',
    'src/latest.mjs',
    'src/foo.spec',
    'tests',
    'a/b/c.mjs',
  ]) {
    assert.equal(isTestPath(path), false, path);
  }
  const w = world();
  const added = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [
      { status: 'A', path: 'a/b/__tests__/x.js' },
      { status: 'A', path: 'src/foo.spec.ts' },
    ],
  });
  assert.deepEqual(added, { status: 'in-scope', outside: [], undetermined: [] });
  // The same nested paths are an expansion once they exist outside the PR and are only edited.
  w.inTree(H0, 'a/b/__tests__/x.js', true);
  w.inTree(H0, 'src/foo.spec.ts', true);
  const edited = await run(w, 'scope-check', {
    scope: SCOPE,
    changes: [
      { status: 'M', path: 'a/b/__tests__/x.js' },
      { status: 'D', path: 'src/foo.spec.ts' },
    ],
  });
  assert.deepEqual(edited.outside, ['a/b/__tests__/x.js', 'src/foo.spec.ts']);
});

test('a rename or copy is checked on both sides, and only the added side may use the test allowance', async () => {
  const w = world();
  const check = (change) => run(w, 'scope-check', { scope: SCOPE, changes: [change] });
  // A copy from an out-of-scope source is an expansion even when the target is an added test.
  assert.deepEqual(await check({ status: 'C', from: 'lib/x.mjs', path: 'test/c.test.mjs' }), {
    status: 'expansion',
    outside: ['lib/x.mjs'],
    undetermined: [],
  });
  // A PR path may be renamed into a test path: the source is in scope and the target is added.
  assert.deepEqual(await check({ status: 'R', from: 'src/a.mjs', path: 'test/moved.test.mjs' }), {
    status: 'in-scope',
    outside: [],
    undetermined: [],
  });
  // The target of a rename is added, not allowed by the PR paths: a non-test target is outside.
  assert.deepEqual(await check({ status: 'R', from: 'src/a.mjs', path: 'src/new.mjs' }), {
    status: 'expansion',
    outside: ['src/new.mjs'],
    undetermined: [],
  });
  // The post-check reads a copy with both sides as well.
  w.commit(S1, { changes: [['C100', 'lib/x.mjs', 'test/c.test.mjs']] });
  const stopped = await run(w, 'post-check', { scope: SCOPE, shas: [S1] });
  assert.equal(stopped.reason, 'scope-expansion-committed');
  assert.deepEqual(stopped.outside, [{ sha: S1, path: 'lib/x.mjs' }]);
});

test('a pending review, a stale head or another reviewer run establishes nothing for a cause', async () => {
  const w = world();
  const state = await afterSecondRepair(w);
  const calls = [];
  // No observation at all (the reviewer has not run on S2): nothing resolves and nothing stops.
  const pending = await run(w, 'evaluate', { state, head: S2, observations: [] });
  calls.push(pending);
  // A clean run on the older head S1 is stale for the head S2.
  calls.push(
    await run(w, 'evaluate', {
      state,
      head: S2,
      observations: [{ reviewer: BOT, head: S1, findings: [] }],
    }),
  );
  // Another reviewer's clean run on S2 judges none of this reviewer's causes.
  calls.push(await observe(w, state, S2, [], { reviewer: OTHER }));
  for (const result of calls) {
    assert.equal(result.decision, 'continue');
    assert.equal(causeCount(result, 'K1').status, 'open');
    assert.equal(causeCount(result, 'K1').attempts, 2);
    assert.deepEqual(result.causes, []);
  }
  // The counter was neither reset nor stopped: fresh evidence from the cause's own reviewer stops.
  const fresh = await observe(w, pending.state, S2, [thread('K3')]);
  assert.equal(fresh.decision, 'stop');
});

test('a gate base merge between the second attempt and the observation still stops, and the report names it', async () => {
  const w = world();
  const state = await afterSecondRepair(w);
  // The gate's base merge M1 left the anchored path alone, so the observation still counts.
  w.ancestor(S2, M1);
  w.pathChanged(S2, M1, 'src/a.mjs', false);
  w.pathChanged(S1, M1, 'src/a.mjs', false);
  const result = await observe(w, state, M1, [thread('K3')], {
    events: [{ type: 'ci-wait' }, { type: 'base-merge', sha: M1 }],
  });
  assert.deepEqual(resultsOf(result), [{ key: 'K3', class: 'same', cause: 'K1', via: 'overlap' }]);
  assert.equal(result.decision, 'stop');
  assert.equal(result.stop.cause, 'K1');
  assert.equal(result.stop.head, M1);
  const timeline = result.report.timeline;
  assert.ok(
    timeline.some((entry) => entry.type === 'ci-wait'),
    'the wait is named',
  );
  assert.ok(
    timeline.some((entry) => entry.type === 'base-merge' && entry.sha === M1),
    'the base change is named',
  );
});

test('a returned merge commit stops the run', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1, { parents: [P0, B1] });
  const result = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.equal(result.decision, 'stop');
  assert.deepEqual(result.stop, { reason: 'merge-commit', round: 1 });
  assert.deepEqual(result.round.postCheck.mergeCommits, [{ sha: S1, parents: 2 }]);
  assert.equal(result.report.maintainerDecision, 'review-returned-merge-commit');
  assert.ok(!w.calls.includes(keys.paths(S1)), 'a merge commit gets no name-status read');
});

test('a declared path outside the scope stops the run', async () => {
  for (const identifier of [X1, FREE, CORR]) {
    const w = world();
    const result = await record(w, null, {
      round: 1,
      before: H0,
      after: H0,
      items: [item(X1, 'K1', 'unassessed')],
      scopeExpansion: [{ identifier, paths: ['package-lock.json'] }],
    });
    assert.equal(result.decision, 'stop', identifier);
    assert.deepEqual(result.stop, {
      reason: 'scope-expansion-declared',
      round: 1,
      declared: [{ identifier, paths: ['package-lock.json'] }],
    });
    assert.deepEqual(result.report.outOfScope, [
      { round: 1, identifier, path: 'package-lock.json' },
    ]);
    assert.equal(result.report.maintainerDecision, 'authorize-scope-expansion');
  }
  // An unminted identifier's declaration is inert.
  const w = world();
  const inert = await record(w, null, {
    round: 1,
    before: H0,
    after: H0,
    scopeExpansion: [{ identifier: 'validation', paths: ['package-lock.json'] }],
  });
  assert.equal(inert.decision, 'continue');
  assert.deepEqual(inert.round.inert, ['validation']);
});

test('CI or reviewer waits alone count no attempt and never stop', async () => {
  const w = world();
  const waited = await run(w, 'evaluate', {
    state: null,
    head: H0,
    observations: [],
    events: [{ type: 'ci-wait' }, { type: 'bot-wait' }, { type: 'review-resubmission' }],
  });
  assert.equal(waited.decision, 'continue');
  assert.deepEqual(waited.counts, { reviewer: [], ci: [] });
  // A resolved delegation without a head movement records a round and reads no range.
  const unmoved = await record(w, waited.state, {
    round: 1,
    before: H0,
    after: H0,
    items: [item(X1, 'K1', 'implemented')],
    ciChecks: ['lint'],
  });
  assert.equal(unmoved.decision, 'continue');
  assert.deepEqual(unmoved.counts, { reviewer: [], ci: [] });
  assert.deepEqual(w.calls, []);
});

test('repeated CI repairs are counted per check and never stop', async () => {
  const w = world();
  let state = null;
  let before = H0;
  for (const [round, after] of [
    [1, S1],
    [2, S2],
    [3, S3],
  ]) {
    w.range(before, after, [after]);
    w.commit(after);
    const recorded = await record(w, state, {
      round,
      before,
      after,
      ciChecks: ['unit', 'lint', 'lint'],
      returned: [{ identifier: FREE, shas: [after] }],
    });
    assert.equal(recorded.decision, 'continue');
    state = recorded.state;
    before = after;
  }
  const evaluated = await run(w, 'evaluate', { state, head: S3, observations: [] });
  assert.equal(evaluated.decision, 'continue');
  assert.deepEqual(evaluated.counts.ci, [
    { check: 'lint', attempts: 3 },
    { check: 'unit', attempts: 3 },
  ]);
  assert.deepEqual(evaluated.counts.reviewer, []);
});

test('a foreign commit is named and a base commit brought in by a gate merge is attributed', async () => {
  // Base commit B1 arrived through the gate's merge M1; `--not origin/develop` keeps it out of the
  // range, so the range holds only the gate merge and the returned commit.
  const w = world();
  w.range(H0, S1, [S1, M1]);
  w.commit(S1);
  const attributed = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    gateMerges: [M1],
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.ok(w.calls.includes(`rev-list ${H0}..${S1} --not origin/develop`));
  assert.equal(attributed.round.attribution.status, 'attributed');
  assert.equal(attributed.round.attribution.range.includes(B1), false);
  assert.equal(causeCount(attributed, 'K1').attempts, 1);
  assert.ok(!w.calls.includes(keys.parents(M1)), 'a gate merge is never post-checked');

  const v = world();
  v.range(H0, S1, [S1, X9]);
  v.commit(S1);
  v.commit(X9, { changes: [['M', 'src/b.mjs']] });
  const foreign = await record(v, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.equal(foreign.decision, 'continue');
  assert.deepEqual(foreign.round.attribution.foreign, [X9]);
  assert.deepEqual(foreign.round.reasons, ['foreign-commits']);
  assert.deepEqual(foreign.counts.reviewer, [], 'a foreign head movement counts no attempt');
  assert.equal(foreign.round.foreignCheck.status, 'pass', 'an in-scope foreign commit passes');
  assert.ok(v.calls.includes(keys.paths(X9)), 'the foreign commit is post-checked');
  assert.ok(!v.calls.includes(keys.hunks(X9)), 'a foreign commit is no attempt and gets no hunks');
  // The round's matches are uncertain until the next recorded round.
  const after = await observe(v, foreign.state, S1, [thread('K1')]);
  assert.deepEqual(resultsOf(after), [
    { key: 'K1', class: 'uncertain', reason: 'uncertain-round' },
  ]);
});

// Invariant (plan decision 3): the gate checks the commits actually made, not only the returned
// ones, so a run that commits outside the scope and leaves the commit out of `Returned commits:`
// still stops. A foreign commit outside the scope, without exactly one parent, or with an
// undetermined read stops as `foreign-commit-unverified`; the stop names its commits and paths.
test('an unverified foreign commit stops the run and the report names it', async (t) => {
  const recordForeign = (w, rest = {}) =>
    record(w, null, {
      round: 1,
      before: H0,
      after: S1,
      items: [item(X1, 'K1')],
      returned: [{ identifier: X1, shas: [S1] }],
      ...rest,
    });
  await t.test('an unreturned commit outside the scope', async () => {
    const w = world();
    w.range(H0, S1, [S1, X9]);
    w.commit(S1);
    w.commit(X9, { changes: [['M', 'package.json']] });
    const result = await recordForeign(w);
    assert.equal(result.decision, 'stop');
    assert.deepEqual(result.stop, {
      reason: 'foreign-commit-unverified',
      round: 1,
      outside: [{ sha: X9, path: 'package.json' }],
      mergeCommits: [],
      undetermined: [],
    });
    assert.deepEqual(result.round.postCheck.outside, [], 'the returned commit is checked once');
    assert.deepEqual(result.round.reasons, ['foreign-commits']);
    assert.deepEqual(result.counts.reviewer, []);
    assert.deepEqual(result.report.foreign, [{ round: 1, sha: X9 }]);
    assert.deepEqual(result.report.outOfScope, [{ round: 1, sha: X9, path: 'package.json' }]);
    assert.equal(result.report.maintainerDecision, 'verify-returned-commits');
    // The stop is sticky: the next record reads nothing.
    const calls = w.calls.length;
    const again = await record(w, result.state, { round: 2, before: S1, after: S2 });
    assert.equal(again.decision, 'stop');
    assert.equal(w.calls.length, calls);
  });
  await t.test('a commit filed under an unminted name is foreign and checked', async () => {
    const w = world();
    w.range(H0, S1, [S1]);
    w.commit(S1, { changes: [['M', 'package.json']] });
    const result = await recordForeign(w, { returned: [{ identifier: 'ci', shas: [S1] }] });
    assert.deepEqual(result.round.inert, ['ci']);
    assert.equal(result.stop.reason, 'foreign-commit-unverified');
    assert.deepEqual(result.stop.outside, [{ sha: S1, path: 'package.json' }]);
  });
  await t.test('a foreign merge commit', async () => {
    const w = world();
    w.range(H0, S1, [S1, X9]);
    w.commit(S1);
    w.commit(X9, { parents: [P0, B1] });
    const result = await recordForeign(w);
    assert.equal(result.stop.reason, 'foreign-commit-unverified');
    assert.deepEqual(result.stop.mergeCommits, [{ sha: X9, parents: 2 }]);
    assert.ok(!w.calls.includes(keys.paths(X9)), 'a merge commit gets no name-status read');
  });
  await t.test('an undetermined read', async () => {
    const w = world();
    w.range(H0, S1, [S1, X9]);
    w.commit(S1);
    const result = await recordForeign(w);
    assert.equal(result.stop.reason, 'foreign-commit-unverified');
    assert.deepEqual(result.stop.undetermined, [{ sha: X9, code: 'parents-unreadable' }]);
    assert.equal(result.report.maintainerDecision, 'verify-returned-commits');
  });
  await t.test('a re-record runs the same full post-check', async () => {
    const w = world();
    w.commit(S1);
    w.commit(X9, { changes: [['M', 'package.json']] });
    const lagging = await recordForeign(w, { after: H0 });
    assert.deepEqual(lagging.round.reasons, ['returned-outside-range']);
    w.ancestor(H0, S1);
    w.range(H0, S1, [S1, X9]);
    const again = await recordForeign(w, { state: lagging.state });
    assert.equal(again.rerecorded, true);
    assert.equal(again.stop.reason, 'foreign-commit-unverified');
    assert.deepEqual(again.state.rounds.length, 1);
  });
});

test('correction-bucket commits count no attempt', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const result = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1', 'deferred')],
    ciChecks: ['lint'],
    returned: [{ identifier: CORR, shas: [S1] }],
  });
  assert.equal(result.decision, 'continue');
  assert.equal(result.round.attribution.status, 'attributed');
  assert.deepEqual(result.counts, { reviewer: [], ci: [] });
  assert.ok(w.calls.includes(keys.parents(S1)), 'correction commits are still post-checked');
});

test('entries under unminted ci or validation names are inert', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const result = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    ciChecks: ['lint'],
    returned: [
      { identifier: X1, shas: [S1] },
      { identifier: X1, shas: [S1] },
      { identifier: 'ci', shas: [S1] },
      { identifier: 'validation', shas: [S1] },
    ],
  });
  assert.deepEqual(result.round.inert, ['ci', 'validation']);
  assert.equal(result.round.inertCount, 2);
  assert.deepEqual(result.round.reasons, [], 'an identical repeat is idempotent');
  assert.equal(causeCount(result, 'K1').attempts, 1);
  assert.deepEqual(result.counts.ci, []);
});

test('one SHA claimed for two identifiers makes the round uncertain', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const result = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1'), item(X2, 'K2')],
    returned: [
      { identifier: X1, shas: [S1] },
      { identifier: X2, shas: [S1] },
    ],
  });
  assert.equal(result.decision, 'continue');
  assert.deepEqual(result.round.reasons, ['duplicate-sha']);
  assert.deepEqual(result.round.duplicates, [S1]);
  assert.deepEqual(result.counts.reviewer, []);
  assert.equal(result.state.lastRoundUncertain, true);
  // A conflicting repeat of one identifier is uncertain as well, and so is a SHA outside the range.
  const v = world();
  v.range(H0, S1, [S1]);
  v.commit(S1);
  v.commit(S2);
  const conflicting = await record(v, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [
      { identifier: X1, shas: [S1] },
      { identifier: X1, shas: [S2] },
    ],
  });
  assert.deepEqual(conflicting.round.reasons, ['conflicting-repeat', 'returned-outside-range']);
  assert.deepEqual(conflicting.counts.reviewer, []);
});

test('a malformed entry under an unminted name is inert, and the inert list is bounded', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const many = Array.from({ length: MAX_INERT_LISTED + 3 }, (_, i) => ({
    identifier: `thread-${String(i).padStart(2, '0')}`,
    shas: ['not-a-sha'],
  }));
  const result = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [
      { identifier: X1, shas: [S1] },
      { identifier: 'ci', shas: 'HEAD' },
      { identifier: 7 },
      'not an object',
      { identifier: 'x'.repeat(500), shas: [S1] },
      ...many,
    ],
    scopeExpansion: [{ identifier: 'validation', paths: 'everything' }, null],
  });
  assert.equal(result.decision, 'continue');
  assert.deepEqual(result.round.reasons, []);
  assert.equal(result.round.inert.length, MAX_INERT_LISTED);
  assert.equal(result.round.inertCount, many.length + 6);
  assert.ok(!result.round.inert.some((identifier) => identifier.length > 128));
  assert.equal(causeCount(result, 'K1').attempts, 1);
  // The same malformed shape under a minted identifier is refused.
  const refused = await executeOperation(
    'record',
    {
      cwd: '/repo',
      base: 'develop',
      scope: SCOPE,
      round: 1,
      before: H0,
      after: S1,
      minted: { items: [item(X1, 'K1')], freeText: FREE, correction: CORR },
      returned: [{ identifier: X1, shas: 'HEAD' }],
    },
    { runner: w.runner },
  );
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'INVALID_INPUT');
});

test('two items aliasing one cause in one round count one attempt', async () => {
  const w = world();
  const state = await afterFirstRepair(w);
  // K2 overlaps the first repair, so it joins cause K1 as an alias.
  const seen = await observe(w, state, S1, [thread('K2')]);
  assert.deepEqual(resultsOf(seen), [{ key: 'K2', class: 'same', cause: 'K1', via: 'overlap' }]);
  w.range(S1, S3, [S2, S3]);
  w.commit(S2);
  w.commit(S3);
  const result = await record(w, seen.state, {
    round: 2,
    before: S1,
    after: S3,
    items: [item(X2, 'K1'), item(X3, 'K2')],
    returned: [
      { identifier: X2, shas: [S2] },
      { identifier: X3, shas: [S3] },
    ],
  });
  assert.equal(causeCount(result, 'K1').attempts, 2, 'one attempt for this round, not two');
  assert.equal(result.round.attempts.length, 1);
  assert.deepEqual(result.round.attempts[0].shas, [S2, S3]);
  assert.deepEqual(result.round.attempts[0].identifiers, [X2, X3], 'every aliasing identifier');
  const stored = result.state.causes.find((cause) => cause.id === 'K1').attempts.at(-1);
  assert.deepEqual(stored.identifiers, [X2, X3]);
  assert.deepEqual(stored.keys, ['K1', 'K2']);
  // The stop report lists every identifier and key of the merged attempt.
  const judged = await observe(w, result.state, S3, [thread('K2')]);
  assert.equal(judged.decision, 'stop');
  const last = judged.report.attempts.at(-1);
  assert.deepEqual(last.identifiers, [X2, X3]);
  assert.deepEqual(last.keys, ['K1', 'K2']);
});

test('a replayed record of a stored round counts nothing again', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const input = {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    ciChecks: ['lint'],
    returned: [
      { identifier: X1, shas: [S1] },
      { identifier: FREE, shas: [] },
    ],
  };
  const first = await record(w, null, input);
  assert.equal(causeCount(first, 'K1').attempts, 1);
  const calls = w.calls.length;
  const again = await record(w, first.state, input);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.state, first.state, 'the state is unchanged');
  assert.deepEqual(again.round, first.round);
  assert.equal(causeCount(again, 'K1').attempts, 1);
  assert.equal(w.calls.length, calls, 'a replay reads nothing');
  const clash = await executeOperation(
    'record',
    {
      cwd: '/repo',
      base: 'develop',
      state: first.state,
      scope: SCOPE,
      round: 1,
      before: S1,
      after: S2,
      minted: { items: [item(X1, 'K1')], freeText: FREE, correction: CORR },
    },
    { runner: w.runner },
  );
  assert.equal(clash.ok, false);
  assert.equal(clash.error.code, 'INVALID_INPUT');
});

test('a round cut short by a lagging forge head is recorded again with the later head', async () => {
  const w = world();
  w.commit(S1);
  // The forge still reported H0 as the head: S1 lies outside the empty range.
  const input = {
    round: 1,
    before: H0,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  };
  const lagging = await record(w, null, { ...input, after: H0 });
  assert.deepEqual(lagging.round.reasons, ['returned-outside-range']);
  assert.deepEqual(lagging.round.attribution.outsideRange, [S1]);
  assert.deepEqual(lagging.counts.reviewer, []);
  // The re-read shows S1: the round is replaced, not added, and its attempt counts once.
  w.ancestor(H0, S1);
  w.range(H0, S1, [S1]);
  const again = await record(w, lagging.state, { ...input, after: S1 });
  assert.equal(again.rerecorded, true);
  assert.equal(again.round.uncertain, false);
  assert.equal(causeCount(again, 'K1').attempts, 1);
  assert.deepEqual(
    again.state.rounds.map((round) => [round.round, round.after]),
    [[1, S1]],
  );
  assert.equal(again.state.timeline.filter((entry) => entry.type === 'round').length, 1);
  assert.equal(again.state.lastRoundUncertain, false);
  // A recorded round that is no longer rerecordable refuses other heads.
  const refused = await executeOperation(
    'record',
    {
      cwd: '/repo',
      base: 'develop',
      state: again.state,
      scope: SCOPE,
      round: 1,
      before: H0,
      after: S2,
      minted: { items: [item(X1, 'K1')], freeText: FREE, correction: CORR },
    },
    { runner: w.runner },
  );
  assert.equal(refused.error.code, 'INVALID_INPUT');
});

test('a later head that does not descend, or an unreadable ancestry, keeps the round uncertain', async () => {
  for (const arrange of [(w) => w.ancestor(H0, S1, false), () => {}]) {
    const w = world();
    w.commit(S1);
    const input = {
      round: 1,
      before: H0,
      items: [item(X1, 'K1')],
      returned: [{ identifier: X1, shas: [S1] }],
    };
    const lagging = await record(w, null, { ...input, after: H0 });
    arrange(w);
    const again = await record(w, lagging.state, { ...input, after: S1 });
    assert.equal(again.replayed, true);
    assert.deepEqual(again.state, lagging.state, 'the stored record stays');
    assert.equal(again.round.uncertain, true);
  }
  // A round uncertain for another reason, or one followed by an evaluation, is never re-recorded.
  const w = world();
  w.range(H0, S1, [S1, X9]);
  w.commit(S1);
  w.commit(X9, { changes: [['M', 'src/b.mjs']] });
  const foreign = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.deepEqual(foreign.round.reasons, ['foreign-commits']);
  const clash = await executeOperation(
    'record',
    {
      cwd: '/repo',
      base: 'develop',
      state: foreign.state,
      scope: SCOPE,
      round: 1,
      before: H0,
      after: S2,
      minted: { items: [item(X1, 'K1')], freeText: FREE, correction: CORR },
    },
    { runner: w.runner },
  );
  assert.equal(clash.error.code, 'INVALID_INPUT');
  const x = world();
  x.commit(S1);
  const lagging = await record(x, null, {
    round: 1,
    before: H0,
    after: H0,
    returned: [{ identifier: FREE, shas: [S1] }],
  });
  assert.deepEqual(lagging.round.reasons, ['returned-outside-range']);
  const waited = await observe(x, lagging.state, H0, [], { events: [{ type: 'ci-wait' }] });
  const late = await executeOperation(
    'record',
    {
      cwd: '/repo',
      base: 'develop',
      state: waited.state,
      scope: SCOPE,
      round: 1,
      before: H0,
      after: S1,
      minted: { items: [], freeText: FREE, correction: CORR },
    },
    { runner: x.runner },
  );
  assert.equal(late.error.code, 'INVALID_INPUT');
});

test('a return without a parseable Scope expansion line records the round and then stops', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1);
  const result = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
    scopeLineMissing: true,
  });
  assert.equal(result.decision, 'stop');
  assert.deepEqual(result.stop, { reason: 'scope-line-missing', round: 1 });
  assert.equal(result.report.maintainerDecision, 'verify-returned-commits');
  assert.equal(causeCount(result, 'K1').attempts, 1, 'the round itself is still recorded');
  const sticky = await observe(w, result.state, S1, [thread('K1')]);
  assert.equal(sticky.decision, 'stop');
  const refused = await executeOperation(
    'record',
    {
      cwd: '/repo',
      base: 'develop',
      scope: SCOPE,
      round: 1,
      before: H0,
      after: S1,
      minted: { items: [], freeText: FREE, correction: CORR },
      scopeLineMissing: 'yes',
    },
    { runner: w.runner },
  );
  assert.equal(refused.error.code, 'INVALID_INPUT');
});

test("a stored hunk that is not the helper's own shape is refused before any read", async () => {
  const w = world();
  const state = await afterFirstRepair(w);
  const calls = w.calls.length;
  for (const hunks of [
    [{ sha: '--output=/tmp/x', files: [] }],
    [{ sha: S1, files: 'src/a.mjs' }],
    [{ sha: S1, files: [{ path: '', ranges: [] }] }],
    [{ sha: S1, files: [{ path: 'src/a.mjs', ranges: [[3]] }] }],
    [{ sha: S1, files: [{ path: 'src/a.mjs', ranges: [[5, 2]] }] }],
  ]) {
    const broken = structuredClone(state);
    broken.causes[0].attempts[0].hunks = hunks;
    const envelope = await executeOperation(
      'evaluate',
      { cwd: '/repo', state: broken, head: S1, observations: [] },
      { runner: w.runner },
    );
    assert.equal(envelope.ok, false, JSON.stringify(hunks));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
  assert.equal(w.calls.length, calls);
});

// A re-record passes the stored round's `after` into `merge-base --is-ancestor`, and its reasons
// decide whether it may re-record at all, so a foreign stored round is refused before any read.
test("a stored round that is not the helper's own shape is refused before any read", async () => {
  const w = world();
  w.commit(S1);
  const lagging = await record(w, null, {
    round: 1,
    before: H0,
    after: H0,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.deepEqual(lagging.round.reasons, ['returned-outside-range']);
  const calls = w.calls.length;
  for (const patchRound of [
    (round) => Object.assign(round, { after: '--output=/tmp/x' }),
    (round) => Object.assign(round, { after: S1.toUpperCase() }),
    (round) => Object.assign(round, { before: 'HEAD' }),
    (round) => Object.assign(round, { round: 0 }),
    (round) => Object.assign(round, { reasons: 'returned-outside-range' }),
    (round) => Object.assign(round, { reasons: ['returned-outside-range', 'made-up'] }),
  ]) {
    const broken = structuredClone(lagging.state);
    patchRound(broken.rounds[0]);
    const envelope = await executeOperation(
      'record',
      {
        cwd: '/repo',
        base: 'develop',
        state: broken,
        scope: SCOPE,
        round: 1,
        before: H0,
        after: S1,
        minted: { items: [item(X1, 'K1')], freeText: FREE, correction: CORR },
        returned: [{ identifier: X1, shas: [S1] }],
      },
      { runner: w.runner },
    );
    assert.equal(envelope.ok, false, JSON.stringify(broken.rounds[0]));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
  for (const rounds of [[null], ['round']]) {
    const envelope = await executeOperation(
      'evaluate',
      { cwd: '/repo', state: { ...lagging.state, rounds }, head: S1, observations: [] },
      { runner: w.runner },
    );
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
  assert.equal(w.calls.length, calls);
});

test('git reads ignore replace refs and mask every inherited redirecting variable', async () => {
  const env = gitReadEnv({
    PATH: '/usr/bin',
    HOME: '/home/x',
    GIT_DIR: '/elsewhere/.git',
    GIT_WORK_TREE: '/elsewhere',
    GIT_INDEX_FILE: '/elsewhere/index',
    GIT_OBJECT_DIRECTORY: '/elsewhere/objects',
    GIT_REPLACE_REF_BASE: 'refs/fake/',
    GIT_CONFIG_PARAMETERS: "'core.pager=x'",
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'diff.external',
    GIT_CONFIG_VALUE_0: 'x',
    GIT_OPTIONAL_LOCKS: '1',
  });
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_REPLACE_REF_BASE',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
  ]) {
    assert.ok(Object.hasOwn(env, key), key);
    assert.equal(env[key], undefined, key);
  }
  assert.equal(env.GIT_OPTIONAL_LOCKS, '0');
  assert.equal(env.LC_ALL, 'C');
  assert.ok(!Object.hasOwn(env, 'PATH') && !Object.hasOwn(env, 'HOME'), 'other variables stay');
  const calls = [];
  const reads = createGitReads(
    async (call) => {
      calls.push(call);
      return { status: 1, stdout: '', stderr: '' };
    },
    '/repo',
    { GIT_DIR: '/elsewhere/.git' },
  );
  await reads.isAncestor(S1, S2);
  assert.equal(calls[0].args[0], '--no-replace-objects');
  assert.equal(calls[0].env.GIT_DIR, undefined);
  assert.ok(Object.hasOwn(calls[0].env, 'GIT_DIR'));
});

test('a post-check failure recorded after a Phase-3 delegation stops the next Phase 2 step 1 before any read', async () => {
  const w = world();
  w.range(H0, S1, [S1]);
  w.commit(S1, {
    changes: [
      ['M', 'src/a.mjs'],
      ['M', 'package.json'],
    ],
  });
  const recorded = await record(w, null, {
    round: 1,
    before: H0,
    after: S1,
    items: [item(X1, 'K1')],
    returned: [{ identifier: X1, shas: [S1] }],
  });
  assert.equal(recorded.decision, 'stop');
  assert.deepEqual(recorded.stop, { reason: 'scope-expansion-committed', round: 1 });
  assert.deepEqual(recorded.report.outOfScope, [{ round: 1, sha: S1, path: 'package.json' }]);
  // Phase 2 step 1 evaluates before either base-merge trigger: the sticky stop answers first.
  const calls = w.calls.length;
  const step1 = await observe(w, recorded.state, S1, [thread('K1')]);
  assert.equal(step1.decision, 'stop');
  assert.deepEqual(step1.stop, recorded.stop);
  assert.equal(w.calls.length, calls, 'no read happens after a stop');
  const again = await record(w, recorded.state, { round: 2, before: S1, after: S2 });
  assert.equal(again.decision, 'stop');
  assert.equal(w.calls.length, calls);
});

test('an undetermined scope read blocks delegation only', async () => {
  const w = world();
  const blocked = await run(w, 'scope-read', { base: 'develop', head: H0 });
  assert.deepEqual(blocked, {
    status: 'undetermined',
    code: 'merge-base-unreadable',
    delegation: 'blocked',
  });
  // A run that never delegates keeps evaluating exactly as before: no stop.
  const evaluated = await observe(w, null, H0, [thread('K1')]);
  assert.equal(evaluated.decision, 'continue');
  assert.equal(evaluated.stop, null);
});

test('a resume uses the stored scope and reads nothing', async () => {
  const w = world();
  w.set(keys.mergeBase(H0), ok(`${MB}\n`));
  w.set(
    keys.scopeDiff(MB, H0),
    ok('M\0src/b.mjs\0R087\0src/old.mjs\0src/a.mjs\0A\0test/a.test.mjs\0M\0src/b.mjs\0'),
  );
  const read = await run(w, 'scope-read', { base: 'develop', head: H0 });
  assert.deepEqual(read, {
    status: 'read',
    scope: {
      mergeBase: MB,
      head: H0,
      paths: ['src/a.mjs', 'src/b.mjs', 'src/old.mjs', 'test/a.test.mjs'],
    },
  });
  const calls = w.calls.length;
  // A later head would yield another scope; the stored record wins and nothing is read.
  const resumed = await run(w, 'scope-read', { base: 'develop', head: S2, stored: read.scope });
  assert.deepEqual(resumed, { status: 'stored', scope: read.scope });
  assert.equal(w.calls.length, calls);
});

test('each undetermined git read has its specified outcome', async (t) => {
  assert.equal(UNDETERMINED_CODES.length, 10);
  await t.test('an unreadable tree keeps a modified out-of-scope test an expansion', async () => {
    const w = world();
    const result = await run(w, 'scope-check', {
      scope: SCOPE,
      changes: [{ status: 'D', path: 'test/gone.test.mjs' }],
    });
    assert.deepEqual(result, {
      status: 'expansion',
      outside: [],
      undetermined: [{ path: 'test/gone.test.mjs', code: 'tree-unreadable' }],
    });
    assert.deepEqual(w.calls, [keys.inTree(H0, 'test/gone.test.mjs')]);
  });
  await t.test('merge-base and scope diff block delegation', async () => {
    const w = world();
    w.set(keys.mergeBase(H0), ok(`${MB}\n`));
    const result = await run(w, 'scope-read', { base: 'develop', head: H0 });
    assert.deepEqual(result, {
      status: 'undetermined',
      code: 'scope-diff-unreadable',
      delegation: 'blocked',
    });
  });
  await t.test('attribution makes the round uncertain without an attempt or a stop', async () => {
    const w = world();
    w.commit(S1);
    const result = await record(w, null, {
      round: 1,
      before: H0,
      after: S1,
      items: [item(X1, 'K1')],
      returned: [{ identifier: X1, shas: [S1] }],
    });
    assert.equal(result.decision, 'continue');
    assert.equal(result.round.attribution.code, 'attribution-unreadable');
    assert.deepEqual(result.round.reasons, ['attribution-undetermined']);
    assert.deepEqual(result.counts.reviewer, []);
  });
  for (const [label, missing] of [
    ['parents', keys.parents(S1)],
    ['commit paths', keys.paths(S1)],
  ]) {
    await t.test(`${label} stops the run`, async () => {
      const w = world();
      w.range(H0, S1, [S1]);
      w.commit(S1);
      w.set(missing, failed);
      const result = await record(w, null, {
        round: 1,
        before: H0,
        after: S1,
        items: [item(X1, 'K1')],
        returned: [{ identifier: X1, shas: [S1] }],
      });
      assert.equal(result.decision, 'stop');
      assert.deepEqual(result.stop, { reason: 'post-check-undetermined', round: 1 });
      assert.equal(result.round.postCheck.undetermined[0].sha, S1);
      assert.equal(result.report.maintainerDecision, 'verify-returned-commits');
    });
  }
  await t.test('hunks keep the attempt and make an overlap uncertain', async () => {
    const w = world();
    const first = await observe(w, null, H0, [thread('K1')]);
    w.range(H0, S1, [S1]);
    w.commit(S1);
    w.set(keys.hunks(S1), failed);
    const recorded = await record(w, first.state, {
      round: 1,
      before: H0,
      after: S1,
      items: [item(X1, 'K1')],
      returned: [{ identifier: X1, shas: [S1] }],
    });
    assert.equal(causeCount(recorded, 'K1').attempts, 1);
    assert.equal(recorded.round.attempts[0].code, 'hunks-unreadable');
    const seen = await observe(w, recorded.state, S1, [thread('K2')]);
    assert.deepEqual(resultsOf(seen), [
      { key: 'K2', class: 'uncertain', reason: 'hunks-unreadable' },
    ]);
  });
  await t.test('a path change makes the match uncertain', async () => {
    const w = world();
    const state = await afterFirstRepair(w);
    w.ancestor(S1, M1);
    const seen = await observe(w, state, M1, [thread('K2')]);
    assert.deepEqual(resultsOf(seen), [
      { key: 'K2', class: 'uncertain', reason: 'path-change-unreadable' },
    ]);
    assert.equal(seen.decision, 'continue');
  });
  await t.test('ancestry establishes no evidence: no stop and no resolution', async () => {
    const w = world();
    const state = await afterSecondRepair(w);
    w.pathChanged(S2, M1, 'src/a.mjs', false);
    w.pathChanged(S1, M1, 'src/a.mjs', true);
    const stopping = await observe(w, state, M1, [thread('K3')]);
    assert.equal(stopping.decision, 'continue');
    assert.deepEqual(stopping.causes, [
      { cause: 'K1', reviewer: BOT, verdict: 'no-evidence', code: 'ancestry-unreadable' },
    ]);
    const clean = await observe(w, state, M1, []);
    assert.equal(causeCount(clean, 'K1').status, 'open');
  });
});

test('the name-status and hunk parsers fail closed on malformed or quoted output', () => {
  assert.deepEqual(parseNameStatus('M\0a b.mjs\0C100\0x\0y\0D\0z\0'), [
    { status: 'M', path: 'a b.mjs' },
    { status: 'C', from: 'x', path: 'y' },
    { status: 'D', path: 'z' },
  ]);
  assert.equal(parseNameStatus('R100\0only-one\0'), null);
  assert.equal(parseNameStatus('?\0x\0'), null);
  const output =
    'diff --git a/src/a.mjs b/src/a.mjs\n--- a/src/a.mjs\n+++ b/src/a.mjs\n' +
    '@@ -3,2 +3,0 @@\n-gone\n-gone\n@@ -9 +8,2 @@\n+++ not a header\n+x\n' +
    'diff --git a/old.mjs b/old.mjs\ndeleted file mode 100644\n--- a/old.mjs\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n';
  assert.deepEqual(parseHunks(output), [
    {
      path: 'src/a.mjs',
      ranges: [
        [3, 4],
        [8, 9],
      ],
    },
  ]);
  assert.equal(parseHunks('diff --git "a/q\\tx" "b/q\\tx"\n--- "a/q\\tx"\n+++ "b/q\\tx"\n'), null);
  // Git's own header for a path with a space ends `--- ` and `+++ ` with one tab.
  assert.deepEqual(
    parseHunks(
      'diff --git a/my file.txt b/my file.txt\nindex 1111111..2222222 100644\n' +
        '--- a/my file.txt\t\n+++ b/my file.txt\t\n@@ -4 +4,2 @@\n-x\n+y\n+z\n',
    ),
    [{ path: 'my file.txt', ranges: [[4, 5]] }],
  );
});

test('invalid input is refused with INVALID_INPUT and no read', async () => {
  const w = world();
  for (const [operation, input] of [
    ['nope', {}],
    ['scope-read', { cwd: 'relative', base: 'develop', head: H0 }],
    ['scope-read', { cwd: '/repo', base: '--upload-pack=x', head: H0 }],
    ['scope-read', { cwd: '/repo', base: 'develop', head: 'HEAD' }],
    ['scope-check', { scope: SCOPE, changes: [{ status: 'R', path: 'x' }] }],
    ['record', { cwd: '/repo', base: 'develop', state: { version: 9 }, scope: SCOPE }],
    ['evaluate', { cwd: '/repo', head: H0, observations: [], events: [{ type: 'other' }] }],
  ]) {
    const envelope = await executeOperation(operation, input, { runner: w.runner });
    assert.equal(envelope.ok, false, operation);
    assert.equal(envelope.error.code, 'INVALID_INPUT', operation);
  }
  assert.deepEqual(w.calls, []);
});
