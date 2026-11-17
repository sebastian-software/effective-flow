// Unit tests of the autopilot decision core: score validation and classification (silent,
// documented, tie, tie re-score, floor, stop option, budget), the plan machine block, the run
// ledger in temporary Git repositories (consent, local-only storage, close), the pull-request
// appendix with its sanitization and content scan, and `cleanup`'s ledger inventory and removal.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  APPENDIX_BEGIN,
  APPENDIX_END,
  AUTOPILOT_DIR,
  DECISION_CAP,
  MACHINE_BLOCK_BEGIN,
  MACHINE_BLOCK_END,
  classifyDecision,
  executeOperation,
  extractDecisions,
  exitCodeFor,
  hasResidualMention,
  ledgerRemoval,
  mergeAppendix,
  renderAppendix,
  sanitizeField,
  validateAppendixMarkers,
} from '../src/scripts/autopilot-core.mjs';
import { main } from '../src/scripts/autopilot.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const INSTANT = Date.parse('2026-11-17T08:30:00Z');
const REPOSITORY = 'github.com/example/project';
const SHA = 'a'.repeat(64);

function decision(scores, extra = {}) {
  return {
    site: 'S-CLR',
    question: 'Which storage layout should the cache use?',
    options: scores.map(([label]) => label),
    scores: scores.map(([label, score]) => ({ label, score, reason: `${label} reason` })),
    ...extra,
  };
}

function code(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Classification

test('a lead of 4 is silent and lists no alternatives', () => {
  const result = classifyDecision(
    decision([
      ['A', 9],
      ['B', 5],
    ]),
    DECISION_CAP,
  );
  assert.equal(result.outcome, 'decided');
  assert.equal(result.classification, 'silent');
  assert.equal(result.winner.label, 'A');
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.budgetRemaining, DECISION_CAP - 1);
});

test('a lead of 3 or 1 is documented with every alternative within 3 points', () => {
  const three = classifyDecision(
    decision([
      ['A', 5],
      ['B', 8],
      ['C', 2],
    ]),
    DECISION_CAP,
  );
  assert.equal(three.classification, 'documented');
  assert.equal(three.winner.label, 'B');
  assert.deepEqual(
    three.alternatives.map(({ label, score }) => [label, score]),
    [['A', 5]],
  );

  const one = classifyDecision(
    decision([
      ['A', 7],
      ['B', 8],
      ['C', 5],
      ['D', 4],
    ]),
    DECISION_CAP,
  );
  assert.equal(one.classification, 'documented');
  assert.deepEqual(
    one.alternatives.map(({ label }) => label),
    ['A', 'C'],
  );
});

test('a lead of 0 is a tie naming only the tied options', () => {
  const result = classifyDecision(
    decision([
      ['A', 7],
      ['B', 7],
      ['C', 3],
    ]),
    DECISION_CAP,
  );
  assert.equal(result.outcome, 'tie');
  assert.deepEqual(result.tied, ['A', 'B']);
  assert.equal(result.budgetRemaining, DECISION_CAP);
});

test('distinct tie re-scores pick the highest and are always documented', () => {
  const result = classifyDecision(
    decision(
      [
        ['A', 7],
        ['B', 7],
        ['C', 5],
      ],
      {
        tieScores: [
          { label: 'A', score: 6, reason: 'A deeper' },
          { label: 'B', score: 8, reason: 'B deeper' },
        ],
      },
    ),
    DECISION_CAP,
  );
  assert.equal(result.outcome, 'decided');
  assert.equal(result.classification, 'documented');
  assert.equal(result.tieResolved, true);
  assert.equal(result.winner.label, 'B');
  assert.equal(result.winner.rescore, 8);
  assert.deepEqual(
    result.alternatives.map(({ label, rescore }) => [label, rescore]),
    [
      ['A', 6],
      ['C', undefined],
    ],
  );
});

test('duplicate tie re-scores are rejected', () => {
  const input = decision(
    [
      ['A', 7],
      ['B', 7],
    ],
    {
      tieScores: [
        { label: 'A', score: 6, reason: 'x' },
        { label: 'B', score: 6, reason: 'y' },
      ],
    },
  );
  assert.equal(
    code(() => classifyDecision(input, DECISION_CAP)),
    'DUPLICATE_RESCORE',
  );
});

test('re-scores outside the tied set or missing a tied option are rejected', () => {
  const base = [
    ['A', 7],
    ['B', 7],
    ['C', 3],
  ];
  const extra = decision(base, {
    tieScores: [
      { label: 'A', score: 6, reason: 'x' },
      { label: 'B', score: 5, reason: 'y' },
      { label: 'C', score: 4, reason: 'z' },
    ],
  });
  assert.equal(
    code(() => classifyDecision(extra, DECISION_CAP)),
    'INVALID_SCORE',
  );
  const missing = decision(base, { tieScores: [{ label: 'A', score: 6, reason: 'x' }] });
  assert.equal(
    code(() => classifyDecision(missing, DECISION_CAP)),
    'INVALID_SCORE',
  );
});

test('out-of-range, non-integer, missing and escape-option scores are rejected', () => {
  const pair = [
    ['A', 7],
    ['B', 4],
  ];
  for (const bad of [0, 11, 7.5, '7', null]) {
    const input = decision(pair);
    input.scores[0].score = bad;
    assert.equal(
      code(() => classifyDecision(input, DECISION_CAP)),
      'INVALID_SCORE',
      `score ${bad}`,
    );
  }
  const missing = decision(pair);
  missing.scores.pop();
  assert.equal(
    code(() => classifyDecision(missing, DECISION_CAP)),
    'INVALID_SCORE',
  );
  const escape = decision(pair, { options: ['A', 'B', 'Decide later'], escape: ['Decide later'] });
  escape.scores.push({ label: 'Decide later', score: 3, reason: 'later' });
  assert.equal(
    code(() => classifyDecision(escape, DECISION_CAP)),
    'ESCAPE_SCORED',
  );
  const unscoredEscape = decision(pair, {
    options: ['A', 'B', 'Decide later'],
    escape: ['Decide later'],
  });
  assert.equal(classifyDecision(unscoredEscape, DECISION_CAP).winner.label, 'A');
});

test('a winner at or below 2 is a blocker in the first round and after a re-score', () => {
  const first = classifyDecision(
    decision([
      ['A', 2],
      ['B', 1],
    ]),
    DECISION_CAP,
  );
  assert.deepEqual([first.outcome, first.blocker], ['blocker', 'floor']);
  const rescored = classifyDecision(
    decision(
      [
        ['A', 4],
        ['B', 4],
      ],
      {
        tieScores: [
          { label: 'A', score: 2, reason: 'x' },
          { label: 'B', score: 1, reason: 'y' },
        ],
      },
    ),
    DECISION_CAP,
  );
  assert.deepEqual([rescored.outcome, rescored.blocker], ['blocker', 'floor']);
});

test('a single scorable option is chosen silently at 3 and blocked at 2', () => {
  assert.equal(classifyDecision(decision([['A', 3]]), DECISION_CAP).classification, 'silent');
  assert.equal(classifyDecision(decision([['A', 2]]), DECISION_CAP).blocker, 'floor');
});

test('a chosen stop option is a blocker', () => {
  const result = classifyDecision(
    decision(
      [
        ['Continue', 3],
        ['Stop', 9],
      ],
      { stop: ['Stop'] },
    ),
    DECISION_CAP,
  );
  assert.deepEqual([result.outcome, result.blocker], ['blocker', 'stop-option']);
});

test('an exhausted budget is a blocker before any score is read', () => {
  const result = classifyDecision(
    decision([
      ['A', 9],
      ['B', 1],
    ]),
    0,
  );
  assert.deepEqual([result.outcome, result.blocker], ['blocker', 'decision-cap']);
});

test('decision-classify is a pure envelope operation with a caller-error exit code', async () => {
  const ok = await executeOperation('decision-classify', {
    decision: decision([
      ['A', 9],
      ['B', 2],
    ]),
    budgetRemaining: 5,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.budgetRemaining, 4);
  const bad = await executeOperation('decision-classify', {
    decision: decision([
      ['A', 11],
      ['B', 2],
    ]),
    budgetRemaining: 5,
  });
  assert.equal(bad.error.code, 'INVALID_SCORE');
  assert.equal(exitCodeFor(bad), 2);
});

// ---------------------------------------------------------------------------------------------
// Machine block

function planWith(block, { heading = '## Assumptions and open points' } = {}) {
  return [
    '# Plan',
    '',
    '## Requirement',
    '',
    'Text.',
    '',
    heading,
    '',
    '- An assumption.',
    '',
    '### Decided by score',
    '',
    block,
    '',
    '## Open points',
    '',
    '- No open points.',
    '',
  ].join('\n');
}

function blockOf(records) {
  return [
    MACHINE_BLOCK_BEGIN,
    '```json',
    JSON.stringify(records, null, 2),
    '```',
    MACHINE_BLOCK_END,
  ].join('\n');
}

test('decision-extract parses a valid block and re-classifies every record', () => {
  const records = [
    decision([
      ['A', 9],
      ['B', 4],
    ]),
    decision(
      [
        ['A', 6],
        ['B', 6],
      ],
      {
        tieScores: [
          { label: 'A', score: 7, reason: 'x' },
          { label: 'B', score: 5, reason: 'y' },
        ],
      },
    ),
  ];
  const result = extractDecisions(planWith(blockOf(records)));
  assert.equal(result.status, 'valid');
  assert.deepEqual(
    result.records.map(({ result: classified }) => classified.classification),
    ['silent', 'documented'],
  );
  const german = extractDecisions(
    planWith(blockOf(records), { heading: '## Annahmen und offene Punkte' }),
  );
  assert.equal(german.status, 'valid');
});

test('decision-extract reports an absent block', async () => {
  assert.deepEqual(extractDecisions(planWith('No block here.')), { status: 'absent', records: [] });
  const envelope = await executeOperation('decision-extract', { text: planWith('none') });
  assert.equal(envelope.data.status, 'absent');
  assert.match(envelope.data.sha256, /^[0-9a-f]{64}$/);
});

test('decision-extract rejects malformed blocks', () => {
  const valid = [
    decision([
      ['A', 9],
      ['B', 4],
    ]),
  ];
  const malformed = [
    planWith(`${MACHINE_BLOCK_BEGIN}\n\`\`\`json\n[\n\`\`\``),
    planWith(`${blockOf(valid)}\n${blockOf(valid)}`),
    planWith([MACHINE_BLOCK_BEGIN, '```json', '{ not json', '```', MACHINE_BLOCK_END].join('\n')),
    planWith([MACHINE_BLOCK_BEGIN, '```json', '{}', '```', MACHINE_BLOCK_END].join('\n')),
    planWith(
      blockOf([
        decision([
          ['A', 11],
          ['B', 4],
        ]),
      ]),
    ),
    planWith(
      blockOf([
        decision([
          ['A', 6],
          ['B', 6],
        ]),
      ]),
    ),
    planWith(
      blockOf([
        decision([
          ['A', 2],
          ['B', 1],
        ]),
      ]),
    ),
    planWith(blockOf(valid), { heading: '## Implementation details' }),
    planWith('<!-- effective-flow-scored-decisions:begin v2 -->'),
  ];
  for (const [index, text] of malformed.entries()) {
    assert.equal(
      code(() => extractDecisions(text)),
      'MACHINE_BLOCK_INVALID',
      `case ${index}`,
    );
  }
});

test('markers inside a code fence are not a machine block', () => {
  const fenced = ['```text', MACHINE_BLOCK_BEGIN, MACHINE_BLOCK_END, '```'].join('\n');
  assert.equal(extractDecisions(planWith(fenced)).status, 'absent');
});

// Invariant: a fence left open at the end of the plan cannot swallow the machine block into
// `absent`; when it hides marker-shaped lines the plan is MACHINE_BLOCK_INVALID, while an open
// fence without any marker stays `absent`.
test('an unterminated fence hiding the machine block is invalid, not absent', () => {
  const valid = [
    decision([
      ['A', 9],
      ['B', 4],
    ]),
  ];
  assert.equal(
    code(() => extractDecisions(planWith(`~~~text\n${blockOf(valid)}`))),
    'MACHINE_BLOCK_INVALID',
  );
  assert.equal(
    code(() => extractDecisions(`${planWith('No block.')}\n\`\`\`\n${MACHINE_BLOCK_BEGIN}\n`)),
    'MACHINE_BLOCK_INVALID',
  );
  assert.equal(extractDecisions(planWith('~~~text\nno markers here')).status, 'absent');
});

// ---------------------------------------------------------------------------------------------
// Ledger

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { env: GIT_ENV });
  assert.equal(result.status, 0, String(result.stderr));
  return String(result.stdout).trim();
}

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  git(root, 'add', '.gitignore');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

let counter = 0;
function deps(extra = {}) {
  return {
    runner: createProcessRunner(),
    env: GIT_ENV,
    now: () => INSTANT,
    randomHex: () => (counter++).toString(16).padStart(8, '0'),
    ...extra,
  };
}

async function op(operation, input) {
  return executeOperation(operation, input, deps());
}

async function init(root, extra = {}) {
  const envelope = await op('run-init', {
    cwd: root,
    source: { kind: 'issue', issue: 42, repository: REPOSITORY },
    visibility: 'private',
    language: 'en',
    ...extra,
  });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.data.runId;
}

function ledger(root, runId) {
  return JSON.parse(readFileSync(join(root, AUTOPILOT_DIR, runId, 'run.json'), 'utf8'));
}

test('run-init mints a run id and records the source, visibility and budget', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  assert.match(runId, /^ap-20261117T083000Z-[0-9a-f]{8}$/);
  const stored = ledger(root, runId);
  assert.equal(stored.status, 'open');
  assert.deepEqual(stored.source, { kind: 'issue', issue: 42, repository: REPOSITORY });
  assert.equal(stored.budget, DECISION_CAP);
  const plan = await op('run-init', {
    cwd: root,
    source: { kind: 'plan', planPath: 'docs/plan/x.md', planSha256: SHA },
    visibility: 'public',
    language: 'de',
  });
  assert.equal(plan.ok, true);
  const absolute = await op('run-init', {
    cwd: root,
    source: { kind: 'plan', planPath: '/home/user/x.md', planSha256: SHA },
    visibility: 'public',
    language: 'en',
  });
  assert.equal(absolute.error.code, 'INVALID_INPUT');
});

test('run-init refuses a linked worktree and an unignored state directory', async (t) => {
  const root = repository(t);
  const linked = join(root, 'linked');
  git(root, 'worktree', 'add', '-q', linked);
  const refused = await op('run-init', {
    cwd: linked,
    source: { kind: 'issue', issue: 1, repository: REPOSITORY },
    visibility: 'private',
    language: 'en',
  });
  assert.equal(refused.error.code, 'UNSAFE_TARGET');

  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-')));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  git(bare, 'init', '-q', '--initial-branch=main');
  const unsafe = await op('run-init', {
    cwd: bare,
    source: { kind: 'issue', issue: 1, repository: REPOSITORY },
    visibility: 'private',
    language: 'en',
  });
  assert.equal(unsafe.error.code, 'RUNTIME_STATE_UNSAFE');
});

test('consent-check grants only an open ledger with the same run id and source', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const check = (input) =>
    op('consent-check', { cwd: root, runId, issue: 42, repository: REPOSITORY, ...input });
  assert.deepEqual((await check({})).data, { consent: 'granted', runId });
  assert.deepEqual((await check({ runId: 'ap-20261117T083000Z-ffffffff' })).data, {
    consent: 'refused',
    reason: 'no-ledger',
  });
  assert.equal((await check({ issue: 43 })).data.reason, 'wrong-source');
  assert.equal(
    (await check({ repository: 'github.com/example/other' })).data.reason,
    'wrong-source',
  );
  const planRun = await init(root, {
    source: { kind: 'plan', planPath: 'docs/plan/x.md', planSha256: SHA },
  });
  assert.equal((await check({ runId: planRun })).data.reason, 'wrong-source');
  await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
  assert.equal((await check({})).data.reason, 'run-closed');
});

// Invariant: the `Private publication: autopilot` consent holds only for a run whose ledger
// recorded the repository as private; public and unknown visibility are refused.
test('consent-check refuses a run whose recorded visibility is not private', async (t) => {
  const root = repository(t);
  for (const visibility of ['public', 'unknown']) {
    const runId = await init(root, { visibility });
    const refused = await op('consent-check', {
      cwd: root,
      runId,
      issue: 42,
      repository: REPOSITORY,
    });
    assert.deepEqual(refused.data, { consent: 'refused', reason: 'wrong-visibility' }, visibility);
  }
});

// Invariant: `run-check` reads only and answers ok exactly for an open ledger; a missing ledger,
// a closed run and a malformed run id are all RUN_NOT_OPEN with exit code 2, and a malformed
// request is INVALID_INPUT.
test('run-check confirms only an open run and fails closed otherwise', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const before = readFileSync(join(root, AUTOPILOT_DIR, runId, 'run.json'));
  const open = await op('run-check', { cwd: root, runId });
  assert.deepEqual(open, {
    ok: true,
    operation: 'run-check',
    data: {
      runId,
      status: 'open',
      source: { kind: 'issue', issue: 42, repository: REPOSITORY },
    },
  });
  assert.deepEqual(readFileSync(join(root, AUTOPILOT_DIR, runId, 'run.json')), before);
  for (const candidate of ['ap-20261117T083000Z-ffffffff', 'not-a-run', '../escape']) {
    const refused = await op('run-check', { cwd: root, runId: candidate });
    assert.equal(refused.error.code, 'RUN_NOT_OPEN', candidate);
    assert.equal(exitCodeFor(refused), 2);
  }
  await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
  const closedRun = await op('run-check', { cwd: root, runId });
  assert.equal(closedRun.error.code, 'RUN_NOT_OPEN');
  const extra = await op('run-check', { cwd: root, runId, issue: 42 });
  assert.equal(extra.error.code, 'INVALID_INPUT');
  assert.equal(exitCodeFor(extra), 2);
});

test('decision-record re-classifies, persists and counts against the budget', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const silent = await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 9],
      ['B', 4],
    ]),
  });
  assert.equal(silent.data.recorded, true);
  assert.equal(silent.data.budgetRemaining, DECISION_CAP - 1);
  const tie = await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 6],
      ['B', 6],
    ]),
  });
  assert.equal(tie.error.code, 'TIE_UNRESOLVED');
  const floor = await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 2],
      ['B', 2],
    ]),
  });
  assert.deepEqual([floor.data.recorded, floor.data.blocker], [false, 'floor']);
  const stored = ledger(root, runId);
  assert.equal(stored.decisions.length, 1);
  assert.deepEqual(
    stored.blockers.map(({ kind }) => kind),
    ['floor'],
  );
});

test('an exhausted ledger budget records a decision-cap blocker', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  for (let index = 0; index < DECISION_CAP; index += 1) {
    const envelope = await op('decision-record', {
      cwd: root,
      runId,
      record: decision([
        ['A', 9],
        ['B', 4],
      ]),
    });
    assert.equal(envelope.data.recorded, true);
  }
  const over = await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 9],
      ['B', 4],
    ]),
  });
  assert.deepEqual([over.data.recorded, over.data.blocker], [false, 'decision-cap']);
  assert.equal(ledger(root, runId).blockers.at(-1).kind, 'decision-cap');
});

test('local-only decisions and security blockers store only report path and finding ID', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const reference = { reportPath: '.effective-flow/review/report.md', findingId: 'R-0000007' };
  const local = await op('decision-record', {
    cwd: root,
    runId,
    record: { site: 'S-SEC', localOnly: reference, classification: 'documented' },
  });
  assert.equal(local.data.localOnly, true);
  const leaking = await op('decision-record', {
    cwd: root,
    runId,
    record: {
      site: 'S-SEC',
      localOnly: reference,
      classification: 'documented',
      question: 'SQL injection in login',
    },
  });
  assert.equal(leaking.error.code, 'INVALID_INPUT');
  const security = await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'security',
    localOnly: reference,
  });
  assert.equal(security.ok, true);
  const securityText = await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'security',
    localOnly: reference,
    summary: 'SQL injection in login',
  });
  assert.equal(securityText.error.code, 'INVALID_INPUT');
  const stored = ledger(root, runId);
  assert.deepEqual(Object.keys(stored.decisions[0]).sort(), [
    'classification',
    'localOnly',
    'recordedAt',
    'site',
  ]);
  assert.deepEqual(stored.decisions[0].localOnly, reference);
  assert.deepEqual(Object.keys(stored.blockers[0]).sort(), ['kind', 'localOnly', 'recordedAt']);
});

// Invariant: a `blocker` row of the question-site table records `site-blocker`, which always names
// its site; other kinds keep `site` optional.
test('a site-blocker requires its question site and other kinds keep site optional', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const missing = await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'site-blocker',
    summary: 'An ambiguous forge host stops the run.',
  });
  assert.equal(missing.error.code, 'INVALID_INPUT');
  const withSite = await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'site-blocker',
    site: 'S-HOST',
    summary: 'An ambiguous forge host stops the run.',
  });
  assert.equal(withSite.ok, true, JSON.stringify(withSite));
  const noSite = await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'post-branch-failure',
    summary: 'The plan-only branch exists without its draft pull request.',
  });
  assert.equal(noSite.ok, true, JSON.stringify(noSite));
  assert.deepEqual(
    ledger(root, runId).blockers.map(({ kind, site }) => [kind, site]),
    [
      ['site-blocker', 'S-HOST'],
      ['post-branch-failure', undefined],
    ],
  );
});

// Invariant: a run that left an existing plan pull request unchanged records that pull request, so
// `cleanup` keeps its ledger while the pull request is open; the outcome needs the number.
test('plan-pull-request-unchanged records the plan pull request for cleanup', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const refused = await op('run-close', {
    cwd: root,
    runId,
    outcome: 'plan-pull-request-unchanged',
  });
  assert.equal(refused.error.code, 'INVALID_INPUT');
  const closed = await closedRun(root, 'plan-pull-request-unchanged', 9);
  const listed = await op('ledger-list', { cwd: root });
  const run = listed.data.runs.find((entry) => entry.runId === closed);
  assert.equal(run.removal, 'needs-pull-request-state');
  assert.equal(run.pullRequest, 9);
  const kept = await op('ledger-prune', {
    cwd: root,
    runs: [{ runId: closed, pullRequestState: 'open', pullRequest: 9 }],
  });
  assert.deepEqual(kept.data.items, [
    { runId: closed, result: 'retained', reason: 'pull-request-open' },
  ]);
  assert.deepEqual(
    ledgerRemoval({ status: 'closed', outcome: 'plan-pull-request-unchanged' }, 'merged'),
    { removable: false, reason: 'ledger-invalid' },
  );
});

// Invariant: `appendix-update` closes only an issue source's run, since only an issue source has a
// plan pull request whose appendix autopilot updates alone; `plan-pull-request-unchanged` closes
// either source, because a plan source's failed rerun update also leaves its verified draft as is.
test('run-close accepts appendix-update only on an issue source', async (t) => {
  const root = repository(t);
  const plan = { kind: 'plan', planPath: 'docs/plan/x.md', planSha256: SHA };
  const planRun = await init(root, { source: plan });
  const refused = await op('run-close', {
    cwd: root,
    runId: planRun,
    outcome: 'appendix-update',
    pullRequest: 5,
  });
  assert.equal(refused.error.code, 'INVALID_INPUT');
  assert.equal(ledger(root, planRun).status, 'open');
  const unchanged = await op('run-close', {
    cwd: root,
    runId: planRun,
    outcome: 'plan-pull-request-unchanged',
    pullRequest: 5,
  });
  assert.equal(unchanged.ok, true, JSON.stringify(unchanged));
  await closedRun(root, 'appendix-update', 6);
});

test('run-close reports counts and refuses further writes', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 9],
      ['B', 4],
    ]),
  });
  await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 8],
      ['B', 6],
    ]),
  });
  await op('fit-record', {
    cwd: root,
    runId,
    score: 7,
    reason: 'Follows ADRs',
    sources: ['docs/adr/a.md'],
  });
  const closedRun = await op('run-close', {
    cwd: root,
    runId,
    outcome: 'pull-request',
    pullRequest: 12,
  });
  assert.deepEqual(closedRun.data.counts, {
    silent: 1,
    documented: 1,
    tieResolved: 0,
    localOnly: 0,
    decisions: 2,
    blockers: 0,
    budgetRemaining: DECISION_CAP - 2,
  });
  assert.equal(closedRun.data.fit, 7);
  const again = await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'validation-red',
    summary: 'x',
  });
  assert.equal(again.error.code, 'RUN_CLOSED');
});

// ---------------------------------------------------------------------------------------------
// Ledger cleanup

// Invariant: `cleanup` removes a ledger only when its run is closed and it produced no pull request
// or its pull request is merged or closed; an open run, an open pull request, an unavailable forge
// and a missing state retain it.
test('ledgerRemoval removes only closed runs without a live pull request', () => {
  const closedWith = (pullRequest) => ({
    status: 'closed',
    outcome: pullRequest ? 'pull-request' : 'no-pull-request',
    ...(pullRequest ? { pullRequest } : {}),
  });
  assert.deepEqual(ledgerRemoval({ status: 'open' }, 'merged'), {
    removable: false,
    reason: 'run-open',
  });
  assert.deepEqual(ledgerRemoval(closedWith(null), undefined), {
    removable: true,
    reason: 'no-pull-request',
  });
  for (const [state, expected] of [
    ['merged', { removable: true, reason: 'pull-request-merged' }],
    ['closed', { removable: true, reason: 'pull-request-closed' }],
    ['open', { removable: false, reason: 'pull-request-open' }],
    ['unavailable', { removable: false, reason: 'forge-unavailable' }],
    [undefined, { removable: false, reason: 'pull-request-state-missing' }],
  ]) {
    assert.deepEqual(ledgerRemoval(closedWith(12), state), expected, String(state));
  }
});

// Invariant: removability needs a consistent closed ledger: `no-pull-request` is removable only
// when stated explicitly and without a pull request, and any other outcome needs its pull-request
// number; a ledger whose outcome and pull request disagree is retained as `ledger-invalid`.
test('ledgerRemoval retains inconsistent closed ledgers as ledger-invalid', () => {
  for (const inconsistent of [
    { status: 'closed' },
    { status: 'closed', outcome: 'pull-request' },
    { status: 'closed', outcome: 'pull-request', pullRequest: 0 },
    { status: 'closed', outcome: 'no-pull-request', pullRequest: 5 },
    { status: 'closed', outcome: 'something-else', pullRequest: 5 },
  ]) {
    assert.deepEqual(
      ledgerRemoval(inconsistent, 'merged'),
      { removable: false, reason: 'ledger-invalid' },
      JSON.stringify(inconsistent),
    );
  }
});

async function closedRun(root, outcome, pullRequest) {
  const runId = await init(root);
  const envelope = await op('run-close', {
    cwd: root,
    runId,
    outcome,
    ...(pullRequest === undefined ? {} : { pullRequest }),
  });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return runId;
}

// Invariant: the cleanup tool's prose keeps the same removal rule as the helper: merged or closed
// pull requests are candidates, an open one and any unreadable forge keep the ledger with the
// reason `forge-unavailable`, and removal goes through `ledger-prune` after confirmation. The
// ledger rules live in the lazy fragment `cleanup-autopilot-ledgers`, which `cleanup` points to.
test('the cleanup tool keeps the ledger removal and retention rules', () => {
  const flat = (relative) =>
    readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const cleanup = flat('../src/tools/cleanup.md');
  const ledgers = flat('../src/shared/cleanup-autopilot-ledgers.md');
  assert.match(cleanup, /```lazy-include cleanup-autopilot-ledgers when: \S.*? ```/);
  assert.match(
    ledgers,
    /removable only when its run is closed and either produced no pull request or its pull request is merged or closed; an open run, an open pull request and a pull request whose state cannot be read keep it/,
  );
  assert.match(
    ledgers,
    /`merged` or `closed` makes a candidate, `open` keeps it\. A missing CLI, failed authentication, an unreachable forge or any failed read records `unavailable` and keeps the ledger with the reason `forge-unavailable`/,
  );
  assert.match(
    ledgers,
    /`removal: "removable"` \(a closed run without a pull request\) is a candidate/,
  );
  assert.match(cleanup, /confirmed autopilot run ledger removed by `ledger-prune`/);
});

// Invariant: the inventory reads only and says which ledgers `pr-read` still has to decide.
test('ledger-list classifies every run directory without writing', async (t) => {
  const root = repository(t);
  assert.deepEqual((await op('ledger-list', { cwd: root })).data, {
    directory: 'absent',
    runs: [],
    ignored: [],
  });
  const open = await init(root);
  const noPr = await closedRun(root, 'no-pull-request');
  const withPr = await closedRun(root, 'pull-request', 7);
  writeFileSync(join(root, AUTOPILOT_DIR, 'notes.txt'), 'x');
  const listed = await op('ledger-list', { cwd: root });
  assert.equal(listed.ok, true, JSON.stringify(listed));
  const byId = Object.fromEntries(listed.data.runs.map((run) => [run.runId, run]));
  assert.equal(byId[open].removal, 'run-open');
  assert.equal(byId[noPr].removal, 'removable');
  assert.equal(byId[withPr].removal, 'needs-pull-request-state');
  assert.equal(byId[withPr].pullRequest, 7);
  assert.deepEqual(listed.data.ignored, ['notes.txt']);
  assert.ok(existsSync(join(root, AUTOPILOT_DIR, noPr, 'run.json')));
});

// Invariant: a closed run whose pull request is merged or closed is removed with its appendix;
// an unavailable forge, an open pull request and an open run keep the ledger.
test('ledger-prune removes merged or closed runs and retains on an unavailable forge', async (t) => {
  const root = repository(t);
  const merged = await closedRun(root, 'pull-request', 1);
  const closedPr = await closedRun(root, 'plan-only-pull-request', 2);
  const unavailable = await closedRun(root, 'pull-request', 3);
  const live = await closedRun(root, 'appendix-update', 4);
  const open = await init(root);
  const appendix = await op('pr-appendix', { cwd: root, runId: open });
  assert.equal(appendix.data.status, 'rendered');
  writeFileSync(join(root, AUTOPILOT_DIR, merged, 'appendix.md'), 'appendix\n');
  const pruned = await op('ledger-prune', {
    cwd: root,
    runs: [
      { runId: merged, pullRequestState: 'merged', pullRequest: 1 },
      { runId: closedPr, pullRequestState: 'closed', pullRequest: 2 },
      { runId: unavailable, pullRequestState: 'unavailable', pullRequest: 3 },
      { runId: live, pullRequestState: 'open', pullRequest: 4 },
      { runId: open },
    ],
  });
  assert.equal(pruned.ok, true, JSON.stringify(pruned));
  assert.deepEqual(pruned.data.items, [
    { runId: merged, result: 'removed', reason: 'pull-request-merged' },
    { runId: closedPr, result: 'removed', reason: 'pull-request-closed' },
    { runId: unavailable, result: 'retained', reason: 'forge-unavailable' },
    { runId: live, result: 'retained', reason: 'pull-request-open' },
    { runId: open, result: 'retained', reason: 'run-open' },
  ]);
  assert.equal(existsSync(join(root, AUTOPILOT_DIR, merged)), false);
  assert.equal(existsSync(join(root, AUTOPILOT_DIR, closedPr)), false);
  for (const runId of [unavailable, live, open]) {
    assert.ok(existsSync(join(root, AUTOPILOT_DIR, runId, 'run.json')), runId);
  }
});

// Invariant: `ledger-prune` acts on a pull-request state only for the pull request the ledger
// records: a missing, different or superfluous number retains the run as `pull-request-mismatch`,
// and a hand-edited inconsistent ledger is retained as `ledger-invalid`.
test('ledger-prune retains a run whose pull-request number does not match', async (t) => {
  const root = repository(t);
  const withPr = await closedRun(root, 'pull-request', 5);
  const noPr = await closedRun(root, 'no-pull-request');
  const edited = await closedRun(root, 'pull-request', 6);
  const target = join(root, AUTOPILOT_DIR, edited, 'run.json');
  const stored = JSON.parse(readFileSync(target, 'utf8'));
  delete stored.pullRequest;
  writeFileSync(target, `${JSON.stringify(stored, null, 2)}\n`);
  for (const [entry, reason] of [
    [{ runId: withPr, pullRequestState: 'merged' }, 'pull-request-mismatch'],
    [{ runId: withPr, pullRequestState: 'merged', pullRequest: 4 }, 'pull-request-mismatch'],
    [{ runId: noPr, pullRequest: 5 }, 'pull-request-mismatch'],
    [{ runId: edited, pullRequestState: 'merged' }, 'ledger-invalid'],
  ]) {
    const pruned = await op('ledger-prune', { cwd: root, runs: [entry] });
    assert.deepEqual(
      pruned.data.items,
      [{ runId: entry.runId, result: 'retained', reason }],
      JSON.stringify(entry),
    );
  }
  const matched = await op('ledger-prune', {
    cwd: root,
    runs: [{ runId: withPr, pullRequestState: 'merged', pullRequest: 5 }, { runId: noPr }],
  });
  assert.deepEqual(
    matched.data.items.map(({ result }) => result),
    ['removed', 'removed'],
  );
  for (const runs of [[{ runId: withPr, pullRequest: 0 }], [{ runId: withPr, pullRequest: '5' }]]) {
    const refused = await op('ledger-prune', { cwd: root, runs });
    assert.equal(refused.error.code, 'INVALID_INPUT', JSON.stringify(runs));
  }
});

// Invariant: removal touches only the ledger and its appendix; a foreign entry keeps the run, and a
// malformed request is rejected before anything is read.
test('ledger-prune keeps a run with a foreign entry and rejects malformed input', async (t) => {
  const root = repository(t);
  const runId = await closedRun(root, 'no-pull-request');
  writeFileSync(join(root, AUTOPILOT_DIR, runId, 'extra.txt'), 'x');
  const kept = await op('ledger-prune', { cwd: root, runs: [{ runId }] });
  assert.deepEqual(kept.data.items, [{ runId, result: 'retained', reason: 'unexpected-entry' }]);
  const missing = await op('ledger-prune', {
    cwd: root,
    runs: [{ runId: 'ap-20261117T083000Z-ffffffff' }],
  });
  assert.deepEqual(missing.data.items, [
    { runId: 'ap-20261117T083000Z-ffffffff', result: 'missing' },
  ]);
  for (const runs of [[], [{ runId, pullRequestState: 'gone' }], [{ runId }, { runId }]]) {
    const refused = await op('ledger-prune', { cwd: root, runs });
    assert.equal(refused.error.code, 'INVALID_INPUT', JSON.stringify(runs));
  }
});

// ---------------------------------------------------------------------------------------------
// Appendix

function ledgerFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: 'ap-20261117T083000Z-00000000',
    status: 'open',
    source: { kind: 'issue', issue: 42, repository: REPOSITORY },
    visibility: 'private',
    language: 'en',
    budget: DECISION_CAP,
    decisions: [],
    blockers: [],
    fit: null,
    ...overrides,
  };
}

function recorded(input) {
  const result = classifyDecision(input, DECISION_CAP);
  return {
    site: input.site,
    question: input.question,
    classification: result.classification,
    tieResolved: result.tieResolved,
    winner: result.winner,
    alternatives: result.alternatives,
  };
}

test('the appendix renders documented, silent, blocker and fit sections between markers', () => {
  const { appendix } = renderAppendix(
    ledgerFixture({
      decisions: [
        recorded(
          decision([
            ['A', 9],
            ['B', 3],
          ]),
        ),
        recorded(
          decision([
            ['Keep', 8],
            ['Split', 6],
          ]),
        ),
        recorded(
          decision(
            [
              ['X', 7],
              ['Y', 7],
            ],
            {
              tieScores: [
                { label: 'X', score: 8, reason: 'X deeper' },
                { label: 'Y', score: 5, reason: 'Y deeper' },
              ],
            },
          ),
        ),
      ],
      blockers: [{ kind: 'validation-red', summary: 'Unit tests failed after repair.' }],
      fit: { assessed: true, score: 7, reason: 'Follows the ADRs.', sources: ['docs/adr/a.md'] },
    }),
    { planPullRequest: 99 },
  );
  const lines = appendix.trimEnd().split('\n');
  assert.equal(lines[0], APPENDIX_BEGIN);
  assert.equal(lines.at(-1), APPENDIX_END);
  assert.ok(validateAppendixMarkers(appendix));
  assert.match(appendix, /\*\*Source:\*\* Refs #42; continues plan pull request #99/);
  assert.match(appendix, /chosen: \*\*Keep\*\* \(8\/10 — Keep reason\)/);
  assert.match(appendix, /Alternative: Split \(6\/10 — Split reason\)/);
  assert.match(appendix, /tie re-scored: X 7\/10 → 8\/10 — X deeper; Y 7\/10 → 5\/10 — Y deeper/);
  assert.match(appendix, /1 decision was taken automatically/);
  assert.match(appendix, /### Blockers\n\n- Unit tests failed after repair\./);
  assert.match(appendix, /7\/10 — Follows the ADRs\. Sources: `docs\/adr\/a\.md`/);
  assert.doesNotMatch(appendix, /A reason/);
});

test('the appendix omits blockers when there are none and renders the not-assessed line', () => {
  const { appendix } = renderAppendix(
    ledgerFixture({
      source: { kind: 'plan', planPath: 'docs/plan/x.md', planSha256: SHA },
      fit: { assessed: false },
    }),
  );
  assert.doesNotMatch(appendix, /### Blockers/);
  assert.match(appendix, /\*\*Source:\*\* plan `docs\/plan\/x\.md`/);
  assert.match(appendix, /### Close decisions\n\nNone\./);
  assert.match(
    appendix,
    /Architecture fit: not assessed — no architecture or roadmap sources found/,
  );
});

test('local-only decisions are absent and a private security blocker is neutral', () => {
  const reference = { reportPath: '.effective-flow/review/report.md', findingId: 'R-0000007' };
  const { appendix } = renderAppendix(
    ledgerFixture({
      decisions: [
        { site: 'S-SEC', localOnly: reference, classification: 'documented' },
        { site: 'S-SEC', localOnly: reference, classification: 'silent' },
      ],
      blockers: [{ kind: 'security', localOnly: reference }],
    }),
  );
  assert.match(appendix, /### Close decisions\n\nNone\./);
  assert.match(appendix, /0 decisions were taken automatically/);
  assert.match(appendix, /needs maintainer attention/);
  assert.doesNotMatch(appendix, /R-0000007|report\.md|security/i);
});

test('sanitization strips closing keywords, mentions, footers and comment openers', () => {
  assert.deepEqual(sanitizeField('This fixes #12 and closes: org/repo#3'), {
    text: 'This #12 and org/repo#3',
    applied: ['closing-keyword'],
  });
  assert.deepEqual(sanitizeField('Ping @octocat, mail a@b.example'), {
    text: 'Ping octocat, mail a@b.example',
    applied: ['mention'],
  });
  // Invariant: an `@` before an alphanumeric is a mention unless a word character precedes it, so
  // punctuation, a slash or an unbalanced backtick cannot shield a mention.
  for (const [input, expected] of [
    ['see -@octocat', 'see -octocat'],
    ['see .@octocat', 'see .octocat'],
    ['see /@octocat', 'see /octocat'],
    ['see `@octocat', 'see `octocat'],
    ['see +@octocat and %@hubot', 'see +octocat and %hubot'],
  ]) {
    assert.deepEqual(sanitizeField(input), { text: expected, applied: ['mention'] }, input);
  }
  const footers = sanitizeField(
    'Reason\nRelease-As: 9.0.0\nBREAKING CHANGE: gone\nmore BREAKING CHANGE: inline',
  );
  assert.equal(footers.text, 'Reason more BREAKING CHANGE inline');
  assert.deepEqual(footers.applied.sort(), ['footer-line', 'footer-token']);
  const comment = sanitizeField('x <!-- effective-flow-autopilot-appendix:end --> y');
  assert.equal(comment.text, 'x &lt;!-- effective-flow-autopilot-appendix:end --> y');
  assert.deepEqual(comment.applied, ['comment-opener']);
  const { appendix } = renderAppendix(
    ledgerFixture({
      blockers: [
        { kind: 'validation-red', summary: '<!-- effective-flow-autopilot-appendix:end -->' },
      ],
    }),
  );
  assert.ok(validateAppendixMarkers(appendix));
});

// Invariant: a mention left after sanitization (`@@name` becomes `@name`) blocks the appendix
// instead of being published; the rendered copy itself carries no mention.
test('a residual mention in the rendered appendix blocks it', async (t) => {
  assert.equal(hasResidualMention('Ping @octocat'), true);
  assert.equal(hasResidualMention('mail a@b.example'), false);
  assert.equal(hasResidualMention(renderAppendix(ledgerFixture()).appendix), false);
  const root = repository(t);
  const runId = await init(root);
  await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'validation-red',
    summary: 'Ask @@octocat for review',
  });
  const blocked = await op('pr-appendix', { cwd: root, runId });
  assert.equal(blocked.data.status, 'blocked');
  assert.ok(blocked.data.blocking.includes('mention'), JSON.stringify(blocked.data.blocking));
  assert.equal(ledger(root, runId).blockers.at(-1).kind, 'appendix-scan');
});

// Invariant: a decision-cap blocker hit by a local-only decision keeps its question local: it stores
// a fixed neutral summary with the local-only reference, and the appendix renders the neutral
// blocker line; a blocker without a summary renders that line too instead of failing.
test('a local-only decision-cap blocker renders the neutral line', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const reference = { reportPath: '.effective-flow/review/report.md', findingId: 'R-0000009' };
  for (let index = 0; index < DECISION_CAP; index += 1) {
    await op('decision-record', {
      cwd: root,
      runId,
      record: decision([
        ['A', 9],
        ['B', 4],
      ]),
    });
  }
  const capped = await op('decision-record', {
    cwd: root,
    runId,
    record: { site: 'S-SEC', localOnly: reference, classification: 'documented' },
  });
  assert.deepEqual([capped.data.recorded, capped.data.blocker], [false, 'decision-cap']);
  const stored = ledger(root, runId).blockers.at(-1);
  assert.equal(stored.kind, 'decision-cap');
  assert.equal(typeof stored.summary, 'string');
  assert.deepEqual(stored.localOnly, reference);
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  assert.equal(rendered.data.status, 'rendered');
  assert.match(rendered.data.appendix, /### Blockers\n\n- Implementation stopped at a blocker/);
  assert.doesNotMatch(rendered.data.appendix, /R-0000009|report\.md|budget/);
  const { appendix } = renderAppendix(ledgerFixture({ blockers: [{ kind: 'decision-cap' }] }));
  assert.match(appendix, /needs maintainer attention/);
});

// Invariant: a plan path reaches the appendix only after validation and the field sanitizer:
// control characters and backticks are rejected at input, and a mention in the path is stripped.
test('plan and source paths reject control characters and backticks and are sanitized', async (t) => {
  const root = repository(t);
  for (const planPath of ['docs/plan/a`b.md', 'docs/plan/a\nb.md', 'docs/plan/a\u0007b.md']) {
    const refused = await op('run-init', {
      cwd: root,
      source: { kind: 'plan', planPath, planSha256: SHA },
      visibility: 'private',
      language: 'en',
    });
    assert.equal(refused.error.code, 'INVALID_INPUT', JSON.stringify(planPath));
  }
  const runId = await init(root);
  const fit = await op('fit-record', {
    cwd: root,
    runId,
    score: 6,
    reason: 'ok',
    sources: ['docs/adr/a`b.md'],
  });
  assert.equal(fit.error.code, 'INVALID_INPUT');
  const { appendix, sanitized } = renderAppendix(
    ledgerFixture({
      source: { kind: 'plan', planPath: 'docs/plan/@octocat.md', planSha256: SHA },
    }),
  );
  assert.match(appendix, /plan `docs\/plan\/octocat\.md`/);
  assert.deepEqual(sanitized, [{ field: 'source.planPath', rule: 'mention' }]);
});

// Invariant: when architecture or roadmap sources exist but scoring produced no score, the fit
// section says exactly "scoring unavailable"; the no-sources form keeps its own line, and the
// unavailable form names its sources and carries no score.
test('fit-record records an unavailable fit and the appendix renders its line', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const recordedFit = await op('fit-record', {
    cwd: root,
    runId,
    unavailable: true,
    sources: ['docs/adr/a.md', 'docs/adr/a.md'],
  });
  assert.deepEqual(recordedFit.data, {
    recorded: true,
    fit: { assessed: false, unavailable: true, sources: ['docs/adr/a.md'] },
  });
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.match(
    rendered.data.appendix,
    /### Architecture fit\n\nArchitecture fit: not assessed — scoring unavailable\n/,
  );
  assert.doesNotMatch(rendered.data.appendix, /no architecture or roadmap sources found/);
  for (const input of [
    { unavailable: true, sources: [] },
    { unavailable: true },
    { unavailable: true, sources: ['docs/adr/a.md'], score: 5 },
    { unavailable: true, notAssessed: true },
  ]) {
    const refused = await op('fit-record', { cwd: root, runId, ...input });
    assert.equal(refused.error.code, 'INVALID_INPUT', JSON.stringify(input));
  }
  await op('fit-record', { cwd: root, runId, notAssessed: true });
  const none = await op('pr-appendix', { cwd: root, runId });
  assert.match(
    none.data.appendix,
    /Architecture fit: not assessed — no architecture or roadmap sources found/,
  );
});

test('pr-appendix writes a scanned appendix beside the ledger', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 8],
      ['B', 6],
    ]),
  });
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.equal(rendered.data.status, 'rendered');
  assert.equal(readFileSync(rendered.data.appendixPath, 'utf8'), rendered.data.appendix);
  assert.ok(rendered.data.appendixPath.startsWith(join(root, AUTOPILOT_DIR, runId)));
});

test('a secret or absolute local path blocks the appendix and records a blocker', async (t) => {
  for (const summary of [
    'Token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked',
    'Logs are in /home/alice/project/out.log',
  ]) {
    const root = repository(t);
    const runId = await init(root);
    await op('blocker-record', { cwd: root, runId, kind: 'validation-red', summary });
    const blocked = await op('pr-appendix', { cwd: root, runId });
    assert.equal(blocked.data.status, 'blocked', summary);
    assert.ok(blocked.data.blocking.length > 0);
    assert.equal(blocked.data.appendix, undefined);
    assert.equal(ledger(root, runId).blockers.at(-1).kind, 'appendix-scan');
  }
});

test('a security blocker on a public or unknown repository withholds the appendix', async (t) => {
  for (const visibility of ['public', 'unknown']) {
    const root = repository(t);
    const runId = await init(root, { visibility });
    await op('blocker-record', {
      cwd: root,
      runId,
      kind: 'security',
      localOnly: { reportPath: '.effective-flow/review/r.md', findingId: 'R-0000001' },
    });
    const withheld = await op('pr-appendix', { cwd: root, runId });
    assert.deepEqual(withheld.data, { status: 'withheld', reason: 'public-security-blocker' });
  }
});

// Invariant: `pr`'s `Appendix:` input replaces an existing appendix block in place and never
// stacks a second one; without a block it appends one after the prose, leaving the prose intact.
test('appendix-merge appends once and replaces an existing block instead of stacking', () => {
  const first = [APPENDIX_BEGIN, '## Autopilot', 'one', APPENDIX_END, ''].join('\n');
  const second = [APPENDIX_BEGIN, '## Autopilot', 'two', APPENDIX_END, ''].join('\n');
  const appended = mergeAppendix('What it does.\n\nRefs #12\n', first);
  assert.equal(appended.replaced, false);
  assert.equal(appended.body, `What it does.\n\nRefs #12\n\n${first}`);
  const replaced = mergeAppendix(`${appended.body}trailing line\n`, second);
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.body, `What it does.\n\nRefs #12\n\n${second}trailing line\n`);
  assert.equal(replaced.body.split(APPENDIX_BEGIN).length - 1, 1);
});

// Invariant: a malformed appendix or body marker state is refused rather than repaired.
test('appendix-merge refuses malformed appendices and body marker states', () => {
  const good = [APPENDIX_BEGIN, 'x', APPENDIX_END, ''].join('\n');
  for (const [body, appendix] of [
    ['prose', ['x', APPENDIX_END, ''].join('\n')],
    ['prose', [APPENDIX_BEGIN, '<!-- fake -->', APPENDIX_END, ''].join('\n')],
    [[APPENDIX_BEGIN, 'a', APPENDIX_END, APPENDIX_BEGIN, 'b', APPENDIX_END].join('\n'), good],
    [[APPENDIX_END, 'a', APPENDIX_BEGIN].join('\n'), good],
    [[APPENDIX_BEGIN, 'unterminated'].join('\n'), good],
    ['<!-- effective-flow-autopilot-appendix:begin v9 -->', good],
  ]) {
    assert.equal(
      code(() => mergeAppendix(body, appendix)),
      'APPENDIX_MARKERS_INVALID',
    );
  }
});

// Invariant: the operation reads only the appendix of the named run, at the path its run
// directory decides, and only while the file still has the digest `pr-appendix` returned and
// recorded in the ledger; a caller-supplied path is no longer accepted.
test('appendix-merge reads the run appendix only under the recorded digest', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  await op('decision-record', {
    cwd: root,
    runId,
    record: decision([
      ['A', 8],
      ['B', 6],
    ]),
  });
  const notRendered = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: SHA,
    body: '',
  });
  assert.equal(notRendered.error.code, 'APPENDIX_MISMATCH');
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.equal(ledger(root, runId).appendixSha256, rendered.data.sha256);
  const merged = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: rendered.data.sha256,
    body: 'Prose.\n',
  });
  assert.equal(merged.ok, true, JSON.stringify(merged));
  assert.equal(merged.data.replaced, false);
  assert.equal(merged.data.body, `Prose.\n\n${rendered.data.appendix}`);
  assert.equal(merged.data.appendixSha256, rendered.data.sha256);

  const wrong = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: SHA,
    body: '',
  });
  assert.equal(wrong.error.code, 'APPENDIX_MISMATCH');
  writeFileSync(rendered.data.appendixPath, `${rendered.data.appendix}tampered\n`);
  const tampered = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: rendered.data.sha256,
    body: '',
  });
  assert.equal(tampered.error.code, 'APPENDIX_MISMATCH');
  const legacy = await op('appendix-merge', {
    appendixPath: rendered.data.appendixPath,
    body: '',
  });
  assert.equal(legacy.error.code, 'INVALID_INPUT');
  const badRun = await op('appendix-merge', {
    cwd: root,
    runId: '../x',
    appendixSha256: rendered.data.sha256,
    body: '',
  });
  assert.equal(badRun.error.code, 'INVALID_INPUT');
});

// Invariant: a blocked render withdraws the earlier digest, so a stale appendix can no longer be
// merged after the content scan failed.
test('a blocked pr-appendix withdraws the recorded appendix digest', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.equal(rendered.data.status, 'rendered');
  await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'validation-red',
    summary: 'Logs are in /home/alice/project/out.log',
  });
  const blocked = await op('pr-appendix', { cwd: root, runId });
  assert.equal(blocked.data.status, 'blocked');
  assert.equal(ledger(root, runId).appendixSha256, undefined);
  const refused = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: rendered.data.sha256,
    body: '',
  });
  assert.equal(refused.error.code, 'APPENDIX_MISMATCH');
});

// Invariant: a `withheld` render withdraws an earlier digest, so a pre-blocker appendix can never
// reach a public repository's pull request after a security blocker.
test('a withheld pr-appendix withdraws the recorded appendix digest', async (t) => {
  const root = repository(t);
  const runId = await init(root, { visibility: 'public' });
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.equal(rendered.data.status, 'rendered');
  await op('blocker-record', {
    cwd: root,
    runId,
    kind: 'security',
    localOnly: { reportPath: '.effective-flow/review/r.md', findingId: 'R-0000001' },
  });
  // blocker-record already withdrew the digest; restore it so only the withheld branch can.
  const target = join(root, AUTOPILOT_DIR, runId, 'run.json');
  const stored = JSON.parse(readFileSync(target, 'utf8'));
  stored.appendixSha256 = rendered.data.sha256;
  writeFileSync(target, `${JSON.stringify(stored, null, 2)}\n`);
  const withheld = await op('pr-appendix', { cwd: root, runId });
  assert.equal(withheld.data.status, 'withheld');
  assert.equal(ledger(root, runId).appendixSha256, undefined);
  const refused = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: rendered.data.sha256,
    body: '',
  });
  assert.equal(refused.error.code, 'APPENDIX_MISMATCH');
});

// Invariant: every ledger change after a render (a decision, a blocker, the architecture fit)
// withdraws the digest, so a stale render that misses that change can never be merged.
test('decision-record, blocker-record and fit-record withdraw a recorded appendix', async (t) => {
  const changes = [
    [
      'decision-record',
      {
        record: decision([
          ['A', 9],
          ['B', 4],
        ]),
      },
    ],
    ['blocker-record', { kind: 'validation-red', summary: 'Tests still fail.' }],
    ['fit-record', { notAssessed: true }],
  ];
  for (const [operation, input] of changes) {
    const root = repository(t);
    const runId = await init(root);
    const rendered = await op('pr-appendix', { cwd: root, runId });
    assert.equal(rendered.data.status, 'rendered');
    const changed = await op(operation, { cwd: root, runId, ...input });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(ledger(root, runId).appendixSha256, undefined, operation);
    const refused = await op('appendix-merge', {
      cwd: root,
      runId,
      appendixSha256: rendered.data.sha256,
      body: '',
    });
    assert.equal(refused.error.code, 'APPENDIX_MISMATCH', operation);
    const fresh = await op('pr-appendix', { cwd: root, runId });
    const merged = await op('appendix-merge', {
      cwd: root,
      runId,
      appendixSha256: fresh.data.sha256,
      body: '',
    });
    assert.equal(merged.ok, true, operation);
  }
});

// Invariant: even a ledger that still names a digest (edited by hand) never merges an appendix
// while a security blocker stands on a repository whose recorded visibility is not private.
test('appendix-merge refuses under a public security blocker despite a matching digest', async (t) => {
  for (const visibility of ['public', 'unknown']) {
    const root = repository(t);
    const runId = await init(root, { visibility });
    const rendered = await op('pr-appendix', { cwd: root, runId });
    await op('blocker-record', {
      cwd: root,
      runId,
      kind: 'security',
      localOnly: { reportPath: '.effective-flow/review/r.md', findingId: 'R-0000001' },
    });
    const target = join(root, AUTOPILOT_DIR, runId, 'run.json');
    const stored = JSON.parse(readFileSync(target, 'utf8'));
    stored.appendixSha256 = rendered.data.sha256;
    writeFileSync(target, `${JSON.stringify(stored, null, 2)}\n`);
    const refused = await op('appendix-merge', {
      cwd: root,
      runId,
      appendixSha256: rendered.data.sha256,
      body: '',
    });
    assert.equal(refused.error.code, 'APPENDIX_WITHHELD', visibility);
  }
});

test('the CLI writes one envelope and exits 2 on an unknown operation', async () => {
  let written = '';
  let exit = 0;
  const envelope = await main(['nope'], {
    input: {},
    stdout: { write: (chunk) => (written += chunk) },
    stderr: { write: () => {} },
    setExitCode: (value) => (exit = value),
  });
  assert.equal(envelope.ok, false);
  assert.equal(JSON.parse(written).error.code, 'INVALID_INPUT');
  assert.equal(exit, 2);
});
