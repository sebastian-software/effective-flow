import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { writeProject } from '../evals/_scaffold/scaffold.mjs';
import {
  REPAIR_AFTER_BASE_MERGE_SCENARIO,
  REPEATED_INEFFECTIVE_REPAIR_SCENARIO,
} from '../evals/merge-gate/_scaffold/configured-reviewer-scenario.mjs';
import {
  decisiveFindings,
  findings,
  parseIterateTrace,
  REPAIR_THREADS,
} from '../evals/merge-gate/_scaffold/evaluate.mjs';
import { REPAIRED_PATH } from '../evals/merge-gate/_scaffold/repair-origin.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';

// The two repair-accounting scenarios of #662 run against a real-commit `origin` whose head moves
// during the run: the `iterate` echo lands seeded repairs, the gate pushes its own base merge, and
// the stub answers every read from the head that `origin` carries. None of that is exercised by any
// recorded round yet, and none of it needs a model to prove: this file provisions a slot exactly as
// `scaffold.mjs` lays one out, plays both compositions through the shipped echo, a real `git push`
// and the shipped repair helper, and checks that each piece answers as the scenario files say.
//
// What it protects: (1) the stub serves the element of the head the origin carries, with every
// labelled placeholder replaced by the real SHA; (2) the echo lands the planned repair, replayed
// onto a gate base merge where one intervened, and records each delegation; (3) the receive hook
// records the gate's push, keeps `refs/pull/<N>/head` with the branch, and labels the base merge;
// (4) the shipped `repair-attempt.mjs` reaches the decisions each scenario expects on this history —
// one attempt and no stop after the base merge, a stop after the second ineffective repair; (5) the
// evaluator accepts the traces a correct run leaves and names what a wrong one adds.

process.env.EVAL_TRACKER_NO_MAIN = '1';
const { originHeadsProblem } = await import('../evals/_scaffold/remote-tracker.mjs');

const REPOSITORY = resolve(import.meta.dirname, '..');
const SUITE_ROOT = resolve(REPOSITORY, 'evals', 'merge-gate');
const STUB = resolve(REPOSITORY, 'evals', '_scaffold', 'remote-tracker.mjs');
const TRACE = resolve(SUITE_ROOT, '_scaffold', 'iterate-trace.mjs');
const REPAIR_HELPER = resolve(REPOSITORY, 'src', 'scripts', 'repair-attempt.mjs');
const RECEIVER = 'recensor';

function childEnv(extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== 'EVAL_TRACKER_NO_MAIN' && !key.startsWith('GIT_'),
    ),
  );
  return {
    ...env,
    // The receive hook runs `node` from the pushing environment's PATH.
    PATH: `${dirname(process.execPath)}${delimiter}${env.PATH ?? ''}`,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    ...extra,
  };
}

function loadFixture(scenario) {
  return JSON.parse(readFileSync(join(SUITE_ROOT, 'fixtures', `${scenario}.json`), 'utf8'));
}

// One slot, laid out as `scaffold.mjs` lays it out, with the checkout prepared by the suite.
function provision(scenario) {
  const attempt = mkdtempSync(join(tmpdir(), 'effective-flow-repair-slot-'));
  const scripts = join(attempt, 'skill', 'scripts');
  const projectRoot = join(attempt, 'project');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(projectRoot);
  mkdirSync(join(attempt, 'trace'));
  copyFileSync(STUB, join(scripts, 'remote-tracker.mjs'));
  copyFileSync(TRACE, join(scripts, 'iterate-trace.mjs'));
  copyFileSync(join(SUITE_ROOT, 'fixtures', `${scenario}.json`), join(attempt, 'fixture.json'));
  const fixture = loadFixture(scenario);
  writeProject(
    suite,
    projectRoot,
    scenario,
    fixture,
    suite.scenarioSetup(scenario).projectSetupRows,
  );
  return {
    attempt,
    projectRoot,
    remote: join(attempt, 'remote.git'),
    fixture,
    branch: fixture.originHeads.branch,
    tracePath: join(attempt, 'trace', 'iterate-calls.jsonl'),
  };
}

function originGit(slot, args) {
  return execFileSync('git', ['--git-dir', slot.remote, ...args], {
    encoding: 'utf8',
    env: childEnv(),
  }).trim();
}

function projectGit(slot, args, extra = {}) {
  return execFileSync('git', args, {
    cwd: slot.projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv(extra),
  }).trim();
}

function head(slot) {
  return originGit(slot, ['rev-parse', `refs/heads/${slot.branch}`]);
}

function label(slot, name) {
  return originGit(slot, ['rev-parse', `refs/eval/head/${name}`]);
}

function stub(slot, operation, apply = false) {
  const result = spawnSync(
    process.execPath,
    [
      join(slot.attempt, 'skill', 'scripts', 'remote-tracker.mjs'),
      operation,
      ...(apply ? ['--apply'] : []),
    ],
    {
      input: JSON.stringify({ cwd: slot.projectRoot, number: 42 }),
      encoding: 'utf8',
      env: childEnv(),
    },
  );
  return JSON.parse(result.stdout);
}

function helper(operation, input) {
  const result = spawnSync(process.execPath, [REPAIR_HELPER, operation], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: childEnv(),
  });
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true, `${operation}: ${result.stdout}`);
  return envelope.data;
}

// The served copy of a fixture element: its placeholders replaced by the labelled heads' SHAs.
function substituted(slot, envelope) {
  let text = JSON.stringify(envelope);
  for (const entry of slot.fixture.originHeads.heads) {
    try {
      text = text.split(entry.placeholder).join(label(slot, entry.label));
    } catch {
      // an unlabelled head keeps its placeholder
    }
  }
  return JSON.parse(text);
}

// Every read the fixture defines, answered for the head at `position`.
function assertServedAt(slot, position) {
  for (const [operation, entry] of Object.entries(slot.fixture.operations)) {
    if (operation === 'pr-merge') continue;
    const element = entry.sequence ? entry.sequence[position - 1] : entry;
    assert.deepEqual(
      stub(slot, operation),
      substituted(slot, element.envelope),
      `${operation} at head ${position}`,
    );
  }
}

function fetchLikeTheGate(slot) {
  projectGit(slot, [
    'fetch',
    '--quiet',
    '--no-write-fetch-head',
    'origin',
    '+refs/heads/develop:refs/remotes/origin/develop',
  ]);
  projectGit(slot, [
    'fetch',
    '--quiet',
    '--no-write-fetch-head',
    '--refmap=',
    'origin',
    'refs/pull/42/head',
  ]);
}

function handoff(slot, thread, identifier, scope) {
  const scopeLine = JSON.stringify({
    version: 1,
    scope,
    freeText: 'F'.repeat(32),
    correction: 'G'.repeat(32),
  });
  return [
    'Run state: non-interactive',
    `Item filter: threads=${thread}`,
    'Summary comment: suppressed',
    'Next steps: suppressed',
    'Review guard: established',
    `Authorized scope: ${scopeLine}`,
    `Boundary token: ${'C'.repeat(32)}`,
    `Thread item: ${identifier} | thread=${thread}`,
    '--- caller-supplied item text follows ---',
  ].join('\n');
}

function dispatch(slot, thread, identifier, scope) {
  const result = spawnSync(
    process.execPath,
    [join(slot.attempt, 'skill', 'scripts', 'iterate-trace.mjs'), '42'],
    {
      cwd: slot.projectRoot,
      input: handoff(slot, thread, identifier, scope),
      encoding: 'utf8',
      env: childEnv(),
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const returned = JSON.parse(result.stdout.match(/^Returned commits: (.*)$/m)[1]);
  assert.match(result.stdout, /^Scope expansion: \[\]$/m);
  assert.match(result.stdout, /\nDONE\n$/);
  return { stdout: result.stdout, returned };
}

// The gate's trigger-(a) base merge as Phase 2 step 1 performs it in place: fetch the head, fast
// forward, merge `origin/<base>` as a merge commit, push normally.
function gateBaseMerge(slot) {
  const identity = {
    GIT_AUTHOR_NAME: 'Flow Gate',
    GIT_AUTHOR_EMAIL: 'gate@example.invalid',
    GIT_COMMITTER_NAME: 'Flow Gate',
    GIT_COMMITTER_EMAIL: 'gate@example.invalid',
  };
  projectGit(slot, [
    'fetch',
    '--quiet',
    'origin',
    `+refs/heads/${slot.branch}:refs/remotes/origin/${slot.branch}`,
  ]);
  projectGit(slot, [
    'fetch',
    '--quiet',
    'origin',
    '+refs/heads/develop:refs/remotes/origin/develop',
  ]);
  projectGit(slot, ['merge', '--quiet', '--ff-only', `refs/remotes/origin/${slot.branch}`]);
  projectGit(slot, ['merge', '--quiet', '--no-edit', '--no-ff', 'origin/develop'], identity);
  projectGit(slot, ['push', '--quiet', 'origin', `HEAD:refs/heads/${slot.branch}`]);
  return projectGit(slot, ['rev-parse', 'HEAD']);
}

function traceRecords(slot) {
  const { records, problems } = parseIterateTrace(
    readFileSync(slot.tracePath, 'utf8'),
    slot.projectRoot,
  );
  assert.deepEqual(problems, []);
  return records;
}

// The configured reviewer's unresolved threads at the current head, as the gate hands them to
// `evaluate`.
function observation(slot, sha) {
  const threads = stub(slot, 'review-threads-read').data.result;
  return [
    {
      reviewer: RECEIVER,
      head: sha,
      findings: threads
        .filter((thread) => !thread.isResolved)
        .map((thread) => ({
          key: thread.id,
          anchor: {
            path: thread.path,
            line: thread.line,
            startLine: thread.startLine,
            lineOutdated: thread.lineOutdated,
          },
        })),
    },
  ];
}

function record(
  slot,
  { state, scope, round, before, after, gateMerges = [], thread, identifier, returned },
) {
  return helper('record', {
    cwd: slot.projectRoot,
    base: 'develop',
    ...(state ? { state } : {}),
    scope,
    round,
    before,
    after,
    gateMerges,
    minted: {
      items: [{ identifier, key: thread, reviewer: RECEIVER, outcome: 'implemented' }],
      freeText: 'F'.repeat(32),
      correction: 'G'.repeat(32),
    },
    returned,
    scopeExpansion: [],
  });
}

function lifecycle(operations) {
  const records = [];
  for (const [index, [operation, apply, at]] of operations.entries()) {
    const callId = `call-${index}`;
    records.push({
      seq: records.length + 1,
      event: 'start',
      callId,
      operation,
      apply,
      at,
      cwd: null,
    });
    records.push({ seq: records.length + 1, event: 'complete', callId, at });
  }
  return records;
}

test('repair-after-base-merge-merges: the echo, the gate push and the helper move through the four declared heads', () => {
  const slot = provision(REPAIR_AFTER_BASE_MERGE_SCENARIO);
  try {
    const seed = head(slot);
    assert.equal(label(slot, 'seed'), seed);
    assert.equal(originGit(slot, ['rev-parse', 'refs/pull/42/head']), seed);
    assert.equal(projectGit(slot, ['branch', '--show-current']), slot.branch);
    assertServedAt(slot, 1);
    assert.equal(stub(slot, 'pr-status-read').data.result.headSha, seed);

    fetchLikeTheGate(slot);
    const { scope } = helper('scope-read', { cwd: slot.projectRoot, base: 'develop', head: seed });
    assert.deepEqual(scope.paths, [REPAIRED_PATH]);

    // Delegation 1 lands the seeded capping repair and moves the base on.
    const first = dispatch(slot, REPAIR_THREADS.first, 'A'.repeat(32), scope);
    const repair1 = head(slot);
    assert.equal(repair1, originGit(slot, ['rev-parse', 'refs/eval/dispatch/1']));
    assert.deepEqual(first.returned, [{ identifier: 'A'.repeat(32), shas: [repair1] }]);
    assert.match(first.stdout, new RegExp(`^- ${'A'.repeat(32)}: implemented$`, 'm'));
    assert.equal(
      originGit(slot, ['rev-parse', 'refs/heads/develop']),
      originGit(slot, ['rev-parse', 'refs/eval/base/1']),
    );
    assert.equal(originGit(slot, ['rev-parse', 'refs/pull/42/head']), repair1);
    assertServedAt(slot, 2);
    assert.equal(stub(slot, 'pr-status-read').data.result.mergeState, 'BEHIND');

    fetchLikeTheGate(slot);
    let state = record(slot, {
      scope,
      round: 1,
      before: seed,
      after: repair1,
      thread: REPAIR_THREADS.first,
      identifier: 'A'.repeat(32),
      returned: first.returned,
    }).state;

    // The gate's own base merge, pushed through the receive hook.
    const merge = gateBaseMerge(slot);
    assert.equal(head(slot), merge);
    assert.equal(label(slot, 'base-merge'), merge);
    assert.equal(originGit(slot, ['rev-parse', 'refs/pull/42/head']), merge);
    assertServedAt(slot, 3);

    // The finding re-reported on the base-merge head: same cause, one attempt, no stop.
    fetchLikeTheGate(slot);
    const atMerge = helper('evaluate', {
      cwd: slot.projectRoot,
      state,
      head: merge,
      observations: observation(slot, merge),
      events: [{ type: 'base-merge', sha: merge }],
    });
    assert.equal(atMerge.decision, 'continue');
    assert.deepEqual(
      atMerge.classifications[0].results.map((result) => result.class),
      ['same'],
    );
    assert.deepEqual(
      atMerge.counts.reviewer.map((cause) => cause.attempts),
      [1],
    );
    state = atMerge.state;

    // Delegation 2 replays the effective repair onto the gate base merge.
    const second = dispatch(slot, REPAIR_THREADS.second, 'B'.repeat(32), scope);
    const repair2 = head(slot);
    assert.equal(originGit(slot, ['rev-parse', `${repair2}^1`]), merge);
    assert.equal(originGit(slot, ['diff', '--name-only', merge, repair2]), REPAIRED_PATH);
    assert.equal(
      originGit(slot, ['rev-parse', `${repair2}^{tree}`]) !==
        originGit(slot, ['rev-parse', 'refs/eval/dispatch/2^{tree}']),
      true,
      'the replayed repair carries the base change as well',
    );
    assert.equal(label(slot, 'repair-2'), repair2);
    assert.deepEqual(second.returned, [{ identifier: 'B'.repeat(32), shas: [repair2] }]);
    assertServedAt(slot, 4);
    const merged = stub(slot, 'pr-merge', true);
    assert.equal(merged.data.result.headSha, repair2);

    fetchLikeTheGate(slot);
    const recorded = record(slot, {
      state,
      scope,
      round: 2,
      before: merge,
      after: repair2,
      gateMerges: [merge],
      thread: REPAIR_THREADS.second,
      identifier: 'B'.repeat(32),
      returned: second.returned,
    });
    assert.equal(recorded.decision, 'continue');
    const resolved = helper('evaluate', {
      cwd: slot.projectRoot,
      state: recorded.state,
      head: repair2,
      observations: observation(slot, repair2),
    });
    assert.equal(resolved.decision, 'continue');
    assert.deepEqual(
      resolved.counts.reviewer.map((cause) => cause.status),
      ['resolved'],
    );

    // The trace a correct run leaves passes the evaluator; the merge timed before the second
    // delegation, or no push at all, does not.
    const records = traceRecords(slot);
    assert.deepEqual(
      records.map((entry) => entry.kind),
      ['dispatch', 'push', 'dispatch'],
    );
    const late = new Date(Date.now() + 60_000).toISOString();
    const log = lifecycle([
      ['pr-merge', false, late],
      ['pr-merge', true, late],
    ]);
    const input = {
      scenario: REPAIR_AFTER_BASE_MERGE_SCENARIO,
      records: log,
      fixture: slot.fixture,
      auxiliaryRecords: records,
      requiresAuxiliary: true,
    };
    assert.deepEqual(findings(input), []);
    assert.deepEqual(decisiveFindings(input), []);
    const early = lifecycle([['pr-merge', true, '2000-01-01T00:00:00.000Z']]);
    assert.match(
      findings({ ...input, records: early }).join('\n'),
      /before the second repair landed/,
    );
    const withoutPush = records.filter((entry) => entry.kind !== 'push');
    assert.match(findings({ ...input, auxiliaryRecords: withoutPush }).join('\n'), /never pushed/);
  } finally {
    rmSync(slot.attempt, { recursive: true, force: true });
  }
});

test('repeated-ineffective-repair-stops: two seeded repairs land exactly, and the helper stops after the second', () => {
  const slot = provision(REPEATED_INEFFECTIVE_REPAIR_SCENARIO);
  try {
    const seed = head(slot);
    assertServedAt(slot, 1);
    fetchLikeTheGate(slot);
    const { scope } = helper('scope-read', { cwd: slot.projectRoot, base: 'develop', head: seed });

    const first = dispatch(slot, REPAIR_THREADS.first, 'A'.repeat(32), scope);
    const repair1 = head(slot);
    assert.equal(repair1, originGit(slot, ['rev-parse', 'refs/eval/dispatch/1']));
    assert.equal(
      originGit(slot, ['rev-parse', 'refs/heads/develop']),
      originGit(slot, ['rev-parse', `${seed}^1`]),
    );
    assertServedAt(slot, 2);
    fetchLikeTheGate(slot);
    let state = record(slot, {
      scope,
      round: 1,
      before: seed,
      after: repair1,
      thread: REPAIR_THREADS.first,
      identifier: 'A'.repeat(32),
      returned: first.returned,
    }).state;
    const atRepair1 = helper('evaluate', {
      cwd: slot.projectRoot,
      state,
      head: repair1,
      observations: observation(slot, repair1),
    });
    assert.equal(atRepair1.decision, 'continue');
    state = atRepair1.state;

    const second = dispatch(slot, REPAIR_THREADS.second, 'B'.repeat(32), scope);
    const repair2 = head(slot);
    assert.equal(
      repair2,
      originGit(slot, ['rev-parse', 'refs/eval/dispatch/2']),
      'no gate merge intervened, so the seeded commit lands as it is',
    );
    assertServedAt(slot, 3);
    fetchLikeTheGate(slot);
    state = record(slot, {
      state,
      scope,
      round: 2,
      before: repair1,
      after: repair2,
      thread: REPAIR_THREADS.second,
      identifier: 'B'.repeat(32),
      returned: second.returned,
    }).state;
    const stopped = helper('evaluate', {
      cwd: slot.projectRoot,
      state,
      head: repair2,
      observations: observation(slot, repair2),
    });
    assert.equal(stopped.decision, 'stop');
    assert.equal(stopped.stop.reason, 'ineffective-repairs');
    assert.equal(stopped.report.maintainerDecision, 'choose-repair-approach');

    const records = traceRecords(slot);
    const log = lifecycle([
      ['review-threads-read', false, new Date(Date.now() + 60_000).toISOString()],
    ]);
    const input = {
      scenario: REPEATED_INEFFECTIVE_REPAIR_SCENARIO,
      records: log,
      fixture: slot.fixture,
      auxiliaryRecords: records,
      requiresAuxiliary: true,
    };
    assert.deepEqual(findings(input), []);
    assert.deepEqual(decisiveFindings(input), []);
    assert.match(
      findings({
        ...input,
        records: lifecycle([['review-threads-read', false, '2000-01-01T00:00:00.000Z']]),
      }).join('\n'),
      /never read the review threads after the second repair/,
    );

    // A third delegation lands nothing, returns `deferred`, and is decisive for the evaluator.
    const third = dispatch(slot, 'PRRT_kwDOrepairCauseThree', 'D'.repeat(32), scope);
    assert.deepEqual(third.returned, []);
    assert.match(third.stdout, new RegExp(`^- ${'D'.repeat(32)}: deferred$`, 'm'));
    assert.equal(head(slot), repair2);
    const withThird = traceRecords(slot);
    assert.equal(withThird.at(-1).planned, false);
    assert.match(
      decisiveFindings({ ...input, auxiliaryRecords: withThird }).join('\n'),
      /delegated 3 times/,
    );
    // So is any push.
    const pushed = [...records, { ...withThird[0], kind: 'push', seq: records.length + 1 }];
    assert.match(
      decisiveFindings({ ...input, auxiliaryRecords: pushed }).join('\n'),
      /received 1 push/,
    );
  } finally {
    rmSync(slot.attempt, { recursive: true, force: true });
  }
});

test('the stub refuses a head the fixture does not declare instead of serving a declared state', () => {
  const slot = provision(REPEATED_INEFFECTIVE_REPAIR_SCENARIO);
  try {
    // A commit nobody labelled — what an undeclared push or repair would leave.
    originGit(slot, ['update-ref', `refs/heads/${slot.branch}`, 'refs/eval/dispatch/2']);
    const envelope = stub(slot, 'pr-status-read');
    assert.equal(envelope.ok, false);
    assert.match(envelope.error.message, /is no head the fixture declares/);
    // A missing origin fails loudly too.
    rmSync(slot.remote, { recursive: true, force: true });
    assert.match(stub(slot, 'viewer-read').error.message, /could not read the origin head/);
  } finally {
    rmSync(slot.attempt, { recursive: true, force: true });
  }
});

test('a malformed originHeads declaration is refused with its reason', () => {
  const fixture = loadFixture(REPAIR_AFTER_BASE_MERGE_SCENARIO);
  assert.equal(originHeadsProblem(fixture), null);
  const variant = (change) => {
    const copy = structuredClone(fixture);
    change(copy);
    return originHeadsProblem(copy);
  };
  assert.match(
    variant((f) => (f.originHeads.heads = [])),
    /non-empty/,
  );
  assert.match(
    variant((f) => (f.originHeads.heads[1].source = 'seed')),
    /only the first is the seed/,
  );
  assert.match(
    variant((f) => (f.originHeads.heads[2].placeholder = f.originHeads.heads[1].placeholder)),
    /repeats/,
  );
  assert.match(
    variant((f) => (f.originHeads.branch = '../x')),
    /plain branch name/,
  );
  assert.match(
    variant((f) => f.operations['pr-status-read'].sequence.pop()),
    /one element per declared head/,
  );
  assert.match(
    variant((f) => (f.operations['pr-status-read'].repeatLast = true)),
    /cannot declare repeatLast/,
  );
});
