// Unit tests of the autopilot decision core: score validation and classification (silent,
// documented, tie, tie re-score, floor, stop option, budget), the plan machine block, the run
// ledger in temporary Git repositories (consent, local-only storage, close), the pull-request
// appendix with its sanitization and content scan, `cleanup`'s ledger inventory and removal, the
// reviewed-plan and delivery records, the gated restore of the run's own plan edit, and the
// planning claim an issue-source run holds from `run-init` to `run-close`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  archivePathFor,
  validateAppendixMarkers,
} from '../src/scripts/autopilot-core.mjs';
import { main } from '../src/scripts/autopilot.mjs';
import {
  planningClaimAcquire,
  planningClaimKey,
  planningClaimRelease,
} from '../src/scripts/effective-flow-state-planning-claim-core.mjs';
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
  // One issue per run: each issue-source run holds its issue's planning claim until run-close.
  for (const [issue, visibility] of [
    [42, 'public'],
    [43, 'unknown'],
  ]) {
    const runId = await init(root, {
      visibility,
      source: { kind: 'issue', issue, repository: REPOSITORY },
    });
    const refused = await op('consent-check', {
      cwd: root,
      runId,
      issue,
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
  assert.deepEqual(closedRun.data.fit, {
    assessed: true,
    score: 7,
    reason: 'Follows ADRs',
    sources: ['docs/adr/a.md'],
  });
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

// Each closed run plans its own issue, so an open run of the same test keeps its planning claim.
let closedIssues = 1000;
async function closedRun(root, outcome, pullRequest) {
  const runId = await init(root, {
    source: { kind: 'issue', issue: (closedIssues += 1), repository: REPOSITORY },
  });
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
// unavailable form carries no score and takes no source list, so the fallback can never exceed the
// source limit or turn into a blocker.
test('fit-record records an unavailable fit and the appendix renders its line', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const recordedFit = await op('fit-record', { cwd: root, runId, unavailable: true });
  assert.deepEqual(recordedFit.data, {
    recorded: true,
    fit: { assessed: false, unavailable: true },
  });
  const rendered = await op('pr-appendix', { cwd: root, runId });
  assert.match(
    rendered.data.appendix,
    /### Architecture fit\n\nArchitecture fit: not assessed — scoring unavailable\n/,
  );
  assert.doesNotMatch(rendered.data.appendix, /no architecture or roadmap sources found/);
  for (const input of [
    { unavailable: true, sources: ['docs/adr/a.md'] },
    { unavailable: true, sources: [] },
    { unavailable: true, sources: Array.from({ length: 21 }, (_, i) => `docs/adr/${i}.md`) },
    { unavailable: false },
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

// Invariant: a lifecycle receipt machine line outside the appendix block survives both the append
// and the in-place replacement unchanged.
test('appendix-merge keeps a lifecycle receipt line outside its block intact', () => {
  const receipt =
    '<!-- effective-flow-issue-lifecycle:v1 {"target":"forge","repository":"example/flow","externalTool":null,"items":[{"issue":"#12","relationship":"refs","container":null,"containerMechanism":null}]} -->';
  const first = [APPENDIX_BEGIN, '## Autopilot', 'one', APPENDIX_END, ''].join('\n');
  const second = [APPENDIX_BEGIN, '## Autopilot', 'two', APPENDIX_END, ''].join('\n');
  const appended = mergeAppendix(`What it does.\n\nRefs #12\n\n${receipt}\n`, first);
  assert.equal(appended.body, `What it does.\n\nRefs #12\n\n${receipt}\n\n${first}`);
  const replaced = mergeAppendix(appended.body, second);
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.body, `What it does.\n\nRefs #12\n\n${receipt}\n\n${second}`);
  assert.equal(replaced.body.split('effective-flow-issue-lifecycle:v1').length - 1, 1);
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

// ---------------------------------------------------------------------------------------------
// Architecture fit at close, reviewed plan, delivery records

// Invariant: `run-close` returns the stored fit object without its timestamp, so the report can
// tell a score, "no sources", "scoring unavailable" and "never recorded" apart.
test('run-close returns every stored fit shape and null when none was recorded', async (t) => {
  const root = repository(t);
  const cases = [
    [null, null],
    [{ notAssessed: true }, { assessed: false }],
    [{ unavailable: true }, { assessed: false, unavailable: true }],
    [
      { score: 8, reason: 'Fits.', sources: ['docs/adr/a.md'] },
      { assessed: true, score: 8, reason: 'Fits.', sources: ['docs/adr/a.md'] },
    ],
  ];
  for (const [input, expected] of cases) {
    const runId = await init(root);
    if (input) assert.equal((await op('fit-record', { cwd: root, runId, ...input })).ok, true);
    const closedRun = await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
    assert.deepEqual(closedRun.data.fit, expected, JSON.stringify(input));
  }
});

const PLAN_PATH = 'docs/plan/p.md';
const ARCHIVE_PATH = 'docs/plan/archive/p.md';
const ORIGINAL = '# Plan\n\n**Plan status:** Not implemented\n';
const REVIEWED = '# Plan\n\n**Plan status:** Not implemented\n\nReviewed.\n';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function commitAll(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
}

// A plan-source run whose plan review edited the plan in the primary checkout. `tracked: false`
// leaves the plan uncommitted (State C).
async function planRun(t, { tracked = true, review = true, executable = false } = {}) {
  const root = repository(t);
  mkdirSync(join(root, 'docs/plan'), { recursive: true });
  writeFileSync(join(root, PLAN_PATH), ORIGINAL);
  if (executable) chmodSync(join(root, PLAN_PATH), 0o755);
  if (tracked) commitAll(root, 'plan');
  const runId = await init(root, {
    source: { kind: 'plan', planPath: PLAN_PATH, planSha256: digest(ORIGINAL) },
    visibility: 'public',
  });
  if (review) {
    writeFileSync(join(root, PLAN_PATH), REVIEWED);
    const reviewed = await op('plan-reviewed', { cwd: root, runId, sourceRoot: root });
    assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  }
  return { root, runId };
}

let branches = 0;
// The implementing workflow's delivery: a linked worktree on its own branch that commits the
// reviewed plan archived (or unarchived), then the two ledger writes.
async function deliver(t, root, runId, { archive = true, record = true, confirm = true } = {}) {
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-wt-')));
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  git(root, 'worktree', 'add', '-q', '-b', `delivery-${(branches += 1)}`, worktree);
  mkdirSync(join(worktree, 'docs/plan'), { recursive: true });
  writeFileSync(join(worktree, PLAN_PATH), REVIEWED);
  git(worktree, 'add', PLAN_PATH);
  if (archive) {
    mkdirSync(join(worktree, 'docs/plan/archive'));
    git(worktree, 'mv', PLAN_PATH, ARCHIVE_PATH);
  }
  commitAll(worktree, 'deliver');
  const headOid = git(worktree, 'rev-parse', 'HEAD');
  if (record) {
    const recorded = await op('delivery-record', {
      cwd: root,
      runId,
      ...(archive ? { archivePath: ARCHIVE_PATH } : { unarchived: true }),
    });
    assert.equal(recorded.ok, true, JSON.stringify(recorded));
  }
  if (confirm) {
    const confirmed = await op('delivery-confirm', { cwd: root, runId, headOid });
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
  }
  return { worktree, headOid };
}

function restore(root, runId, extra = {}, options = {}) {
  return executeOperation(
    'plan-copy-restore',
    { cwd: root, runId, sourceRoot: root, ...extra },
    deps(options),
  );
}

// Invariant: the reviewed-plan digest is the helper's own hash of the plan file in the invocation
// checkout, recorded with that checkout's root only for a plan source on an open run, and
// `run-check` hands both to the implementing workflow.
test('plan-reviewed hashes the plan itself and run-check returns it in source', async (t) => {
  const { root, runId } = await planRun(t);
  assert.equal(ledger(root, runId).source.reviewedPlanSha256, digest(REVIEWED));
  assert.equal(ledger(root, runId).source.sourceRoot, root);
  const checked = await op('run-check', { cwd: root, runId });
  assert.deepEqual(checked.data.source, {
    kind: 'plan',
    planPath: PLAN_PATH,
    planSha256: digest(ORIGINAL),
    reviewedPlanSha256: digest(REVIEWED),
    sourceRoot: root,
  });

  const review = (extra = {}) =>
    op('plan-reviewed', { cwd: root, runId, sourceRoot: root, ...extra });
  const extra = await review({ sha256: digest(REVIEWED) });
  assert.equal(extra.error.code, 'INVALID_INPUT');
  const withoutRoot = await op('plan-reviewed', { cwd: root, runId });
  assert.equal(withoutRoot.error.code, 'INVALID_INPUT');
  assert.equal((await review({ sourceRoot: 'docs' })).error.code, 'INVALID_INPUT');
  assert.equal((await review({ sourceRoot: join(root, 'docs') })).error.code, 'UNSAFE_TARGET');
  assert.equal((await review({ sourceRoot: repository(t) })).error.code, 'UNSAFE_TARGET');
  const issueRun = await init(root);
  const issue = await review({ runId: issueRun });
  assert.equal(issue.error.code, 'INVALID_INPUT');

  rmSync(join(root, PLAN_PATH));
  symlinkSync(join(root, '.gitignore'), join(root, PLAN_PATH));
  const linked = await review();
  assert.equal(linked.error.code, 'UNSAFE_TARGET');
  rmSync(join(root, PLAN_PATH));
  const missing = await review();
  assert.equal(missing.error.code, 'NOT_FOUND');
  assert.equal(ledger(root, runId).source.reviewedPlanSha256, digest(REVIEWED));

  await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
  writeFileSync(join(root, PLAN_PATH), REVIEWED);
  const closedRun = await review();
  assert.equal(closedRun.error.code, 'RUN_CLOSED');
});

// Invariant: in a harness worktree session the invocation checkout is a linked worktree, not
// `cwd`; `plan-reviewed` hashes the plan there and records that root, and `plan-copy-restore`
// restores only in the recorded root and keeps the copy for any other one.
test('plan-reviewed and plan-copy-restore follow a linked-worktree sourceRoot', async (t) => {
  const { root, runId } = await planRun(t, { review: false });
  const session = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-session-')));
  t.after(() => rmSync(session, { recursive: true, force: true }));
  git(root, 'worktree', 'add', '-q', '-b', 'session', session);
  const sessionReviewed = `${REVIEWED}Reviewed in the session.
`;
  writeFileSync(join(session, PLAN_PATH), sessionReviewed);
  writeFileSync(join(root, PLAN_PATH), REVIEWED);
  const reviewed = await op('plan-reviewed', { cwd: root, runId, sourceRoot: session });
  assert.deepEqual(reviewed.data, {
    recorded: true,
    reviewedPlanSha256: digest(sessionReviewed),
    sourceRoot: session,
  });
  const checked = await op('run-check', { cwd: root, runId });
  assert.equal(checked.data.source.sourceRoot, session);
  assert.equal(checked.data.source.reviewedPlanSha256, digest(sessionReviewed));

  await deliver(t, root, runId);
  const mismatch = await restore(root, runId);
  assert.deepEqual(mismatch.data, {
    result: 'kept',
    reason: 'source-root-mismatch',
    planPath: PLAN_PATH,
  });
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);

  const index = git(session, 'ls-files', '-s');
  const restored = await restore(root, runId, { sourceRoot: session });
  assert.deepEqual(restored.data, {
    result: 'restored',
    planPath: PLAN_PATH,
    retainedCopy: retainedIn(root, runId, restored.data.retainedCopy),
  });
  assert.equal(readFileSync(join(session, PLAN_PATH), 'utf8'), ORIGINAL);
  assert.equal(git(session, 'ls-files', '-s'), index);
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
});

// Invariant: `delivery-record` takes exactly the archive path plan archival produces, or an
// unarchived delivery, and only on an open plan-source run.
test('delivery-record accepts only the archive path or an unarchived delivery', async (t) => {
  const { root, runId } = await planRun(t);
  assert.equal(archivePathFor(PLAN_PATH), ARCHIVE_PATH);
  for (const input of [
    { archivePath: 'docs/plan/archive/other.md' },
    { archivePath: 'docs/archive/p.md' },
    { archivePath: '/abs/docs/plan/archive/p.md' },
    { archivePath: ARCHIVE_PATH, unarchived: true },
    { unarchived: false },
    { archivePath: ARCHIVE_PATH, headOid: 'a'.repeat(40) },
    {},
  ]) {
    const refused = await op('delivery-record', { cwd: root, runId, ...input });
    assert.equal(refused.error.code, 'INVALID_INPUT', JSON.stringify(input));
  }
  const archived = await op('delivery-record', { cwd: root, runId, archivePath: ARCHIVE_PATH });
  assert.deepEqual(archived.data, { recorded: true, delivery: { archivePath: ARCHIVE_PATH } });
  const unarchived = await op('delivery-record', { cwd: root, runId, unarchived: true });
  assert.deepEqual(unarchived.data, { recorded: true, delivery: { unarchived: true } });
  assert.equal(ledger(root, runId).delivery.archivePath, undefined);

  const issueRun = await init(root);
  const issue = await op('delivery-record', { cwd: root, runId: issueRun, unarchived: true });
  assert.equal(issue.error.code, 'INVALID_INPUT');
  await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
  const closedRun = await op('delivery-record', { cwd: root, runId, unarchived: true });
  assert.equal(closedRun.error.code, 'RUN_CLOSED');
});

// Invariant: `delivery-confirm` records only a full object id on an open run, and a new
// `delivery-record` describes a new delivery, so it drops an earlier confirmation.
test('delivery-confirm records the verified head and a new record drops it', async (t) => {
  const { root, runId } = await planRun(t);
  for (const headOid of ['abc123', 'A'.repeat(40), 'a'.repeat(41), 42]) {
    const refused = await op('delivery-confirm', { cwd: root, runId, headOid });
    assert.equal(refused.error.code, 'INVALID_INPUT', String(headOid));
  }
  const extra = await op('delivery-confirm', {
    cwd: root,
    runId,
    headOid: 'a'.repeat(40),
    archivePath: ARCHIVE_PATH,
  });
  assert.equal(extra.error.code, 'INVALID_INPUT');
  await op('delivery-record', { cwd: root, runId, archivePath: ARCHIVE_PATH });
  const confirmed = await op('delivery-confirm', { cwd: root, runId, headOid: 'b'.repeat(64) });
  assert.deepEqual(confirmed.data, { recorded: true, headOid: 'b'.repeat(64) });
  assert.equal(ledger(root, runId).delivery.archivePath, ARCHIVE_PATH);
  assert.equal(ledger(root, runId).delivery.headOid, 'b'.repeat(64));
  await op('delivery-record', { cwd: root, runId, archivePath: ARCHIVE_PATH });
  assert.equal(ledger(root, runId).delivery.headOid, undefined);
  await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
  const closedRun = await op('delivery-confirm', { cwd: root, runId, headOid: 'a'.repeat(40) });
  assert.equal(closedRun.error.code, 'RUN_CLOSED');
});

// Invariant: `plan-reviewed` and `delivery-record` change what the appendix renders and withdraw a
// rendered digest; `delivery-confirm` does not, so `appendix-merge` still accepts the digest
// rendered before the confirmed head.
test('plan-reviewed and delivery-record withdraw the appendix and delivery-confirm keeps it', async (t) => {
  for (const [operation, input] of [
    ['plan-reviewed', {}],
    ['delivery-record', { archivePath: ARCHIVE_PATH }],
  ]) {
    const { root, runId } = await planRun(t);
    if (operation === 'plan-reviewed') input.sourceRoot = root;
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
  }
  const { root, runId } = await planRun(t);
  await op('delivery-record', { cwd: root, runId, archivePath: ARCHIVE_PATH });
  const rendered = await op('pr-appendix', { cwd: root, runId });
  await op('delivery-confirm', { cwd: root, runId, headOid: 'c'.repeat(40) });
  assert.equal(ledger(root, runId).appendixSha256, rendered.data.sha256);
  const merged = await op('appendix-merge', {
    cwd: root,
    runId,
    appendixSha256: rendered.data.sha256,
    body: 'Prose.\n',
  });
  assert.equal(merged.ok, true, JSON.stringify(merged));
  assert.equal(merged.data.body, `Prose.\n\n${rendered.data.appendix}`);
});

// Invariant: the appendix names the archived plan path from `delivery-record`; an unarchived
// delivery or none at all keeps the original path.
test('pr-appendix renders the recorded archive path, else the original path', async (t) => {
  const { root, runId } = await planRun(t);
  const none = await op('pr-appendix', { cwd: root, runId });
  assert.match(none.data.appendix, /\*\*Source:\*\* plan `docs\/plan\/p\.md`\n/);
  await op('delivery-record', { cwd: root, runId, unarchived: true });
  const unarchived = await op('pr-appendix', { cwd: root, runId });
  assert.match(unarchived.data.appendix, /\*\*Source:\*\* plan `docs\/plan\/p\.md`\n/);
  await op('delivery-record', { cwd: root, runId, archivePath: ARCHIVE_PATH });
  const archived = await op('pr-appendix', { cwd: root, runId });
  assert.match(archived.data.appendix, /\*\*Source:\*\* plan `docs\/plan\/archive\/p\.md`\n/);
  assert.doesNotMatch(archived.data.appendix, /`docs\/plan\/p\.md`/);
});

// ---------------------------------------------------------------------------------------------
// plan-copy-restore

// Invariant: the run's own review edit of a tracked plan is restored to HEAD only when the
// delivery is confirmed, its head carries the archived plan, HEAD:<P> is the preflight plan,
// nothing is staged and the working copy is exactly the reviewed text; index entries never change.
test('plan-copy-restore restores the reviewed copy and leaves the index unchanged', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const index = git(root, 'ls-files', '-s');
  const restored = await restore(root, runId);
  assert.deepEqual(restored.data, {
    result: 'restored',
    planPath: PLAN_PATH,
    retainedCopy: retainedIn(root, runId, restored.data.retainedCopy),
  });
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), ORIGINAL);
  assert.equal(git(root, 'ls-files', '-s'), index);
  assert.equal(git(root, 'status', '--porcelain'), '');
  const again = await restore(root, runId);
  assert.deepEqual(again.data, {
    result: 'not-applicable',
    reason: 'unchanged',
    planPath: PLAN_PATH,
  });
});

// Invariant: every failed precondition keeps the user's copy byte for byte, names the
// precondition, and leaves the index entries unchanged.
test('plan-copy-restore keeps the copy and names each failed precondition', async (t) => {
  const cases = [
    [
      'user edit',
      'working-copy-changed',
      async ({ root }) => writeFileSync(join(root, PLAN_PATH), `${REVIEWED}User edit.\n`),
    ],
    ['staged change', 'staged-change', async ({ root }) => git(root, 'add', PLAN_PATH)],
    [
      'moved HEAD',
      'head-moved',
      async ({ root }) => {
        writeFileSync(join(root, PLAN_PATH), `${ORIGINAL}Upstream.\n`);
        commitAll(root, 'newer plan');
        writeFileSync(join(root, PLAN_PATH), REVIEWED);
      },
    ],
    ['no confirmed delivery', 'delivery-unconfirmed', null, { confirm: false }],
    ['no delivery record', 'delivery-unconfirmed', null, { record: false, confirm: false }],
    [
      'archive missing on the head',
      'archive-not-on-head',
      async ({ root, runId }) => {
        const headOid = git(root, 'rev-parse', 'HEAD');
        await op('delivery-confirm', { cwd: root, runId, headOid });
      },
    ],
    ['delivery-confirm without delivery-record', 'unarchived', null, { record: false }],
    [
      'symlinked parent directory',
      'working-copy-unsafe',
      async ({ root }) => {
        renameSync(join(root, 'docs/plan'), join(root, 'docs/real'));
        symlinkSync(join(root, 'docs/real'), join(root, 'docs/plan'));
      },
    ],
    ['unarchived delivery', 'unarchived', null, { archive: false }],
    [
      'symlinked plan',
      'working-copy-unsafe',
      async ({ root }) => {
        writeFileSync(join(root, 'reviewed.md'), REVIEWED);
        rmSync(join(root, PLAN_PATH));
        symlinkSync(join(root, 'reviewed.md'), join(root, PLAN_PATH));
      },
    ],
  ];
  for (const [label, reason, mutate, delivery = {}] of cases) {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId, delivery);
    if (mutate) await mutate({ root, runId });
    const before = existsSync(join(root, PLAN_PATH))
      ? readFileSync(join(root, PLAN_PATH), 'utf8')
      : null;
    const index = git(root, 'ls-files', '-s');
    const kept = await restore(root, runId);
    assert.equal(kept.ok, true, `${label}: ${JSON.stringify(kept)}`);
    assert.deepEqual(kept.data, { result: 'kept', reason, planPath: PLAN_PATH }, label);
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), before, label);
    assert.equal(git(root, 'ls-files', '-s'), index, label);
  }
});

// Invariant: the working copy is re-hashed immediately before the restore, so an edit after the
// checks keeps the copy; a failure of the install itself is `kept` with a `detail`, not a helper
// error, the reviewed copy stays retained in the run ledger and is linked back to the plan path
// (`putBack: true`), and the index is unchanged.
test('plan-copy-restore keeps an edit made after the checks and a failed restore', async (t) => {
  {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    const late = `${REVIEWED}Late edit.\n`;
    const kept = await restore(
      root,
      runId,
      {},
      { beforePlanRestore: () => writeFileSync(join(root, PLAN_PATH), late) },
    );
    assert.deepEqual(kept.data, {
      result: 'kept',
      reason: 'working-copy-changed',
      planPath: PLAN_PATH,
    });
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), late);
  }
  {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    const index = git(root, 'ls-files', '-s');
    // Removing the temporary file before the link makes the install fail with ENOENT.
    const kept = await restore(
      root,
      runId,
      {},
      {
        beforePlanInstall: () => {
          for (const name of planDirLeftovers(root)) rmSync(join(root, dirname(PLAN_PATH), name));
        },
      },
    );
    assert.equal(kept.ok, true, JSON.stringify(kept));
    assert.equal(kept.data.result, 'kept');
    assert.equal(kept.data.reason, 'restore-failed');
    assert.match(kept.data.detail, /ENOENT/);
    assert.equal(kept.data.putBack, true);
    assert.equal(readFileSync(retainedIn(root, runId, kept.data.retainedCopy), 'utf8'), REVIEWED);
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
    assert.deepEqual(planDirLeftovers(root), []);
    assert.equal(git(root, 'ls-files', '-s'), index);
  }
});

// Invariant: nothing in the invocation checkout is run-owned for an issue source, an untracked
// plan, a plan already archived there (in-place delivery) or a working copy equal to HEAD.
test('plan-copy-restore is not applicable when nothing in the checkout is run-owned', async (t) => {
  {
    const root = repository(t);
    const runId = await init(root);
    const issue = await restore(root, runId);
    assert.deepEqual(issue.data, { result: 'not-applicable', reason: 'issue-source' });
  }
  {
    const { root, runId } = await planRun(t, { tracked: false });
    await deliver(t, root, runId);
    const untracked = await restore(root, runId);
    assert.deepEqual(untracked.data, {
      result: 'not-applicable',
      reason: 'untracked',
      planPath: PLAN_PATH,
    });
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
  }
  {
    const { root, runId } = await planRun(t);
    mkdirSync(join(root, 'docs/plan/archive'));
    git(root, 'mv', PLAN_PATH, ARCHIVE_PATH);
    commitAll(root, 'archive in place');
    await op('delivery-record', { cwd: root, runId, archivePath: ARCHIVE_PATH });
    await op('delivery-confirm', { cwd: root, runId, headOid: git(root, 'rev-parse', 'HEAD') });
    const archived = await restore(root, runId);
    assert.deepEqual(archived.data, {
      result: 'not-applicable',
      reason: 'untracked',
      planPath: PLAN_PATH,
    });
  }
  {
    const { root, runId } = await planRun(t, { review: false });
    await deliver(t, root, runId);
    const unchanged = await restore(root, runId);
    assert.deepEqual(unchanged.data, {
      result: 'not-applicable',
      reason: 'unchanged',
      planPath: PLAN_PATH,
    });
  }
});

// Invariant: `sourceRoot` must be its own toplevel of the repository `cwd` belongs to and the root
// `plan-reviewed` recorded, the input is closed, and a closed run is rejected.
test('plan-copy-restore checks sourceRoot, its closed input and an open run', async (t) => {
  const { root, runId } = await planRun(t);
  const { worktree } = await deliver(t, root, runId);
  const subdirectory = await restore(root, runId, { sourceRoot: join(root, 'docs') });
  assert.equal(subdirectory.error.code, 'UNSAFE_TARGET');
  const other = repository(t);
  const foreign = await restore(root, runId, { sourceRoot: other });
  assert.equal(foreign.error.code, 'UNSAFE_TARGET');
  const relative = await restore(root, runId, { sourceRoot: 'docs' });
  assert.equal(relative.error.code, 'INVALID_INPUT');
  const extra = await restore(root, runId, { force: true });
  assert.equal(extra.error.code, 'INVALID_INPUT');
  const linked = await restore(root, runId, { sourceRoot: worktree });
  assert.deepEqual(linked.data, {
    result: 'kept',
    reason: 'source-root-mismatch',
    planPath: PLAN_PATH,
  });
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
  {
    // Without a plan-reviewed record no root or digest is known, so the edit stays.
    const unreviewed = await planRun(t, { review: false });
    await deliver(t, unreviewed.root, unreviewed.runId);
    writeFileSync(join(unreviewed.root, PLAN_PATH), REVIEWED);
    const kept = await restore(unreviewed.root, unreviewed.runId);
    assert.deepEqual(kept.data, {
      result: 'kept',
      reason: 'review-unrecorded',
      planPath: PLAN_PATH,
    });
    assert.equal(readFileSync(join(unreviewed.root, PLAN_PATH), 'utf8'), REVIEWED);
  }
  await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
  const closedRun = await restore(root, runId);
  assert.equal(closedRun.error.code, 'RUN_CLOSED');
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
});

// Invariant: once a delivery is recorded, the reviewed digest is frozen: a later `plan-reviewed`
// is refused, so an edit made after delivery can never become the text the restore discards.
test('plan-reviewed is refused after a delivery and the later edit is kept', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const edited = `${REVIEWED}Edited after delivery.\n`;
  writeFileSync(join(root, PLAN_PATH), edited);
  const refused = await op('plan-reviewed', { cwd: root, runId, sourceRoot: root });
  assert.equal(refused.error.code, 'INVALID_STATE');
  assert.equal(ledger(root, runId).source.reviewedPlanSha256, digest(REVIEWED));
  const kept = await restore(root, runId);
  assert.deepEqual(kept.data, {
    result: 'kept',
    reason: 'working-copy-changed',
    planPath: PLAN_PATH,
  });
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), edited);
});

// A process runner that answers chosen git calls itself and passes every other call through.
function interceptingRunner(intercept) {
  const base = createProcessRunner();
  return (options) => intercept(options) ?? base(options);
}

// Invariant: a Git read that fails (nonzero exit, spawn error or timeout, an unknown revision
// included) keeps the copy as `git-read-failed` with a detail; it is never `not-applicable`.
test('plan-copy-restore keeps the copy when a Git read fails', async (t) => {
  {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    await op('delivery-confirm', { cwd: root, runId, headOid: 'd'.repeat(40) });
    const kept = await restore(root, runId);
    assert.equal(kept.data.result, 'kept');
    assert.equal(kept.data.reason, 'git-read-failed');
    assert.match(kept.data.detail, /^git ls-tree failed/);
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
  }
  const failures = [
    [
      'ls-tree exit',
      (args) => args.includes('ls-tree'),
      { status: 128, stdout: '', stderr: 'fatal: simulated' },
    ],
    [
      'ls-tree spawn error',
      (args) => args.includes('ls-tree'),
      { error: new Error('spawn timed out') },
    ],
    [
      'rev-parse exit',
      (args) => args.includes('HEAD^{commit}'),
      { status: 128, stdout: '', stderr: 'fatal: simulated' },
    ],
    [
      'ls-files exit',
      (args) => args.includes('ls-files') && args.includes('-s'),
      { status: 128, stdout: '', stderr: 'fatal: simulated' },
    ],
  ];
  for (const [label, matches, result] of failures) {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    const runner = interceptingRunner(({ args }) =>
      args.includes('-C') && args[args.indexOf('-C') + 1] === root && matches(args)
        ? result
        : undefined,
    );
    const kept = await restore(root, runId, {}, { runner });
    assert.equal(kept.ok, true, `${label}: ${JSON.stringify(kept)}`);
    assert.equal(kept.data.result, 'kept', label);
    assert.equal(kept.data.reason, 'git-read-failed', label);
    assert.equal(typeof kept.data.detail, 'string', label);
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED, label);
  }
});

// Invariant: the install writes the bytes read from the verified HEAD commit (no `git restore`
// runs), and HEAD, the index entry and the working copy are each re-checked after the checks and
// before the write.
test('plan-copy-restore re-checks HEAD, the index and the file before restoring the verified commit', async (t) => {
  {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    const commit = git(root, 'rev-parse', 'HEAD');
    const calls = [];
    const runner = interceptingRunner(({ args }) => {
      calls.push(args);
      return undefined;
    });
    const restored = await restore(root, runId, {}, { runner });
    assert.deepEqual(restored.data, {
      result: 'restored',
      planPath: PLAN_PATH,
      retainedCopy: retainedIn(root, runId, restored.data.retainedCopy),
    });
    assert.ok(!calls.some((args) => args.includes('restore')), JSON.stringify(calls));
    const readCall = calls.find((args) => args.includes('--filters'));
    assert.ok(readCall.includes(`${commit}:${PLAN_PATH}`), JSON.stringify(readCall));
    assert.ok(!readCall.includes(`HEAD:${PLAN_PATH}`));
  }
  const races = [
    [
      'moved HEAD',
      'head-moved',
      (root) => git(root, 'commit', '-q', '--allow-empty', '-m', 'race'),
    ],
    ['staged plan', 'staged-change', (root) => git(root, 'add', PLAN_PATH)],
    [
      'symlinked plan',
      'working-copy-unsafe',
      (root) => {
        writeFileSync(join(root, 'reviewed.md'), REVIEWED);
        rmSync(join(root, PLAN_PATH));
        symlinkSync(join(root, 'reviewed.md'), join(root, PLAN_PATH));
      },
    ],
  ];
  for (const [label, reason, race] of races) {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    const kept = await restore(root, runId, {}, { beforePlanRestore: () => race(root) });
    assert.deepEqual(kept.data, { result: 'kept', reason, planPath: PLAN_PATH }, label);
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED, label);
  }
});

// Invariant: an edit saved after the last precondition check but before the restore writes is
// kept, never overwritten, and no aside copy is left behind.
test('plan-copy-restore keeps a plan saved after the final check', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const late = `${REVIEWED}\nlate edit\n`;
  const kept = await restore(
    root,
    runId,
    {},
    { afterPlanRestoreChecks: () => writeFileSync(join(root, PLAN_PATH), late) },
  );
  assert.deepEqual(kept.data, {
    result: 'kept',
    reason: 'working-copy-changed',
    planPath: PLAN_PATH,
  });
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), late);
  assert.deepEqual(
    readdirSync(join(root, dirname(PLAN_PATH))).filter((name) =>
      name.includes('autopilot-restore'),
    ),
    [],
  );
});

function planDirLeftovers(root) {
  return readdirSync(join(root, dirname(PLAN_PATH))).filter(
    (name) => name !== 'p.md' && name !== 'archive',
  );
}

function retainedIn(root, runId, retained) {
  const dir = join(root, AUTOPILOT_DIR, runId);
  assert.equal(typeof retained, 'string');
  assert.equal(dirname(retained), dir);
  assert.match(retained.slice(dir.length + 1), /^plan-copy-.*\.md$/);
  return retained;
}

// Invariant: a plan path recreated between moving the reviewed copy aside and installing HEAD is
// never overwritten: the user's new file survives byte for byte, the reviewed copy is retained in
// the run ledger and no temporary file is left in the plan directory.
test('plan-copy-restore keeps a file recreated at the plan path before the install', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const created = '# Fresh\n\nSaved by the user in the gap.\n';
  const kept = await restore(
    root,
    runId,
    {},
    { beforePlanInstall: () => writeFileSync(join(root, PLAN_PATH), created) },
  );
  assert.equal(kept.data.result, 'kept');
  assert.equal(kept.data.reason, 'working-copy-changed');
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), created);
  assert.equal(readFileSync(retainedIn(root, runId, kept.data.retainedCopy), 'utf8'), REVIEWED);
  assert.deepEqual(planDirLeftovers(root), []);
});

// Invariant: a write through a descriptor opened before the move that lands in the moved-aside
// copy after its hash check is not lost: HEAD is installed and the retained copy holds the write.
test('plan-copy-restore retains a late write through an open descriptor', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const late = '\nlate write through an open descriptor\n';
  let fd;
  const restored = await restore(
    root,
    runId,
    {},
    {
      afterPlanRestoreChecks: () => {
        fd = openSync(join(root, PLAN_PATH), 'r+');
      },
      afterPlanAsideVerified: () => {
        const end = Buffer.byteLength(REVIEWED);
        writeSync(fd, late, end);
        closeSync(fd);
      },
    },
  );
  assert.equal(restored.data.result, 'restored');
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), ORIGINAL);
  assert.equal(
    readFileSync(retainedIn(root, runId, restored.data.retainedCopy), 'utf8'),
    REVIEWED + late,
  );
  assert.deepEqual(planDirLeftovers(root), []);
});

// Invariant: a restore installs HEAD's working-tree bytes without touching the index, keeps the
// reviewed copy in the run ledger directory (never deleted) and leaves the user checkout clean;
// `.effective-flow/` is gitignored in the fixture, so the ledger copy does not show in status.
test('plan-copy-restore installs HEAD and retains the reviewed copy in the run ledger', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const index = git(root, 'ls-files', '-s');
  const restored = await restore(root, runId);
  assert.equal(restored.data.result, 'restored');
  assert.equal(restored.data.planPath, PLAN_PATH);
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), ORIGINAL);
  assert.equal(readFileSync(retainedIn(root, runId, restored.data.retainedCopy), 'utf8'), REVIEWED);
  assert.equal(git(root, 'ls-files', '-s'), index);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.deepEqual(planDirLeftovers(root), []);
});

const EXDEV = () => {
  throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
};

// Invariant: when the reviewed copy cannot be linked into the ledger (EXDEV, since the ledger
// directory must share the checkout's filesystem), the restore reports `retain-failed` with the
// cause, copies nothing and puts the user's file back untouched at the plan path.
test('plan-copy-restore keeps the plan when the retain link fails', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const kept = await restore(root, runId, {}, { retainLink: EXDEV });
  assert.equal(kept.data.result, 'kept');
  assert.equal(kept.data.reason, 'retain-failed');
  assert.match(kept.data.detail, /^EXDEV: cross-device link not permitted$/);
  assert.equal(kept.data.putBack, true);
  assert.equal(kept.data.retainedCopy, undefined);
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
  assert.deepEqual(planDirLeftovers(root), []);
  assert.deepEqual(readdirSync(join(root, AUTOPILOT_DIR, runId)), ['run.json']);
});

// Invariant: a failed retain never clobbers a file recreated at the plan path: the put-back fails
// on it, the `detail` names the moved-aside copy, and both files keep their bytes.
test('plan-copy-restore keeps a recreated plan and the aside copy when the retain fails', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const created = '# Fresh\n\nSaved by the user in the gap.\n';
  const kept = await restore(
    root,
    runId,
    {},
    {
      afterPlanAsideVerified: () => writeFileSync(join(root, PLAN_PATH), created),
      retainLink: EXDEV,
    },
  );
  assert.equal(kept.data.reason, 'retain-failed');
  assert.equal(kept.data.putBack, false);
  const [aside] = planDirLeftovers(root);
  assert.match(aside, /^p\.md\.autopilot-restore-[0-9a-f]+$/);
  const asidePath = join(root, dirname(PLAN_PATH), aside);
  assert.ok(
    kept.data.detail.includes(`the reviewed copy is kept at ${asidePath}`),
    kept.data.detail,
  );
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), created);
  assert.equal(readFileSync(asidePath, 'utf8'), REVIEWED);
});

// Invariant: the retained copy passes the runtime-state guard before it is linked; a refusal (here
// a run directory swapped for a symlink) is `retain-failed`, links nothing through the symlink and
// puts the plan back.
test('plan-copy-restore reports a guard refusal of the retained copy as retain-failed', async (t) => {
  const { root, runId } = await planRun(t);
  await deliver(t, root, runId);
  const runDir = join(root, AUTOPILOT_DIR, runId);
  const moved = join(root, AUTOPILOT_DIR, 'moved-run');
  const kept = await restore(
    root,
    runId,
    {},
    {
      afterPlanAsideVerified: () => {
        renameSync(runDir, moved);
        symlinkSync(moved, runDir);
      },
    },
  );
  assert.equal(kept.data.reason, 'retain-failed');
  assert.match(kept.data.detail, /is a symlink/);
  assert.equal(kept.data.putBack, true);
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED);
  assert.deepEqual(readdirSync(moved), ['run.json']);
  assert.deepEqual(planDirLeftovers(root), []);
});

// Invariant: the install writes HEAD's file mode, so an executable plan (`100755`) stays
// executable and the checkout stays clean.
test('plan-copy-restore installs an executable plan with its mode', async (t) => {
  const { root, runId } = await planRun(t, { executable: true });
  assert.match(git(root, 'ls-files', '-s', PLAN_PATH), /^100755 /);
  await deliver(t, root, runId);
  const restored = await restore(root, runId);
  assert.equal(restored.data.result, 'restored');
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), ORIGINAL);
  assert.equal(statSync(join(root, PLAN_PATH)).mode & 0o111, 0o111 & ~process.umask());
  assert.equal(git(root, 'status', '--porcelain'), '');
});

// Invariant: a plan copy the restore retained is never deleted by the prune, since no check can
// exclude a save landing between check and unlink; `ledger-list` and `ledger-prune` retain its
// closed run as `retained-plan-copy` with the copy's path, identical to the reviewed copy or not.
test('ledger-prune retains a run holding a plan copy whether or not it changed', async (t) => {
  const closedRestoredRun = async () => {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    const restored = await restore(root, runId);
    assert.equal(restored.data.result, 'restored');
    const closed = await op('run-close', { cwd: root, runId, outcome: 'no-pull-request' });
    assert.equal(closed.ok, true, JSON.stringify(closed));
    return { root, runId, copy: restored.data.retainedCopy };
  };
  {
    const { root, runId, copy } = await closedRestoredRun();
    const listed = await op('ledger-list', { cwd: root });
    assert.equal(listed.data.runs[0].removal, 'retained-plan-copy');
    assert.deepEqual(listed.data.runs[0].planCopies, [copy]);
    const pruned = await op('ledger-prune', { cwd: root, runs: [{ runId }] });
    assert.deepEqual(pruned.data.items, [
      { runId, result: 'retained', reason: 'retained-plan-copy', planCopies: [copy] },
    ]);
    assert.equal(readFileSync(copy, 'utf8'), REVIEWED);
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), ORIGINAL);
  }
  {
    const { root, runId, copy } = await closedRestoredRun();
    appendFileSync(copy, 'late save\n');
    const listed = await op('ledger-list', { cwd: root });
    assert.equal(listed.data.runs[0].removal, 'retained-plan-copy');
    assert.deepEqual(listed.data.runs[0].planCopies, [copy]);
    const pruned = await op('ledger-prune', { cwd: root, runs: [{ runId }] });
    assert.deepEqual(pruned.data.items, [
      { runId, result: 'retained', reason: 'retained-plan-copy', planCopies: [copy] },
    ]);
    assert.equal(readFileSync(copy, 'utf8'), `${REVIEWED}late save\n`);
    assert.ok(existsSync(join(root, AUTOPILOT_DIR, runId, 'run.json')));
  }
  {
    // A ledger without `reviewedPlanSha256` cannot prove any copy is its own.
    const root = repository(t);
    const runId = await closedRun(root, 'no-pull-request');
    const copy = join(root, AUTOPILOT_DIR, runId, 'plan-copy-0123456789abcdef.md');
    writeFileSync(copy, REVIEWED);
    const listed = await op('ledger-list', { cwd: root });
    assert.equal(listed.data.runs[0].removal, 'retained-plan-copy');
    const pruned = await op('ledger-prune', { cwd: root, runs: [{ runId }] });
    assert.deepEqual(pruned.data.items, [
      { runId, result: 'retained', reason: 'retained-plan-copy', planCopies: [copy] },
    ]);
    assert.equal(readFileSync(copy, 'utf8'), REVIEWED);
  }
});

// Invariant: a tracked plan without a working copy has nothing run-owned to restore, and a
// symlinked parent directory is never followed when hashing the reviewed plan.
test('plan-copy-restore reports a missing copy and plan-reviewed refuses a symlinked directory', async (t) => {
  {
    const { root, runId } = await planRun(t);
    await deliver(t, root, runId);
    rmSync(join(root, PLAN_PATH));
    const missing = await restore(root, runId);
    assert.deepEqual(missing.data, {
      result: 'not-applicable',
      reason: 'missing',
      planPath: PLAN_PATH,
    });
    assert.equal(existsSync(join(root, PLAN_PATH)), false);
  }
  {
    const { root, runId } = await planRun(t);
    renameSync(join(root, 'docs/plan'), join(root, 'docs/real'));
    symlinkSync(join(root, 'docs/real'), join(root, 'docs/plan'));
    const refused = await op('plan-reviewed', { cwd: root, runId, sourceRoot: root });
    assert.equal(refused.error.code, 'UNSAFE_TARGET');
  }
});

// Invariant: an issue source answers before any root check, a Git read that fails while checking
// `sourceRoot` keeps the copy as `git-read-failed`, and a directory outside any repository stays
// an UNSAFE_TARGET error.
test('plan-copy-restore checks sourceRoot only for a plan source and maps its Git failures', async (t) => {
  {
    const root = repository(t);
    const runId = await init(root);
    for (const sourceRoot of [join(root, 'docs'), join(root, 'no-such-directory')]) {
      const issue = await restore(root, runId, { sourceRoot });
      assert.deepEqual(
        issue.data,
        { result: 'not-applicable', reason: 'issue-source' },
        sourceRoot,
      );
    }
    assert.equal((await restore(root, runId, { sourceRoot: 'docs' })).error.code, 'INVALID_INPUT');
  }
  const { root, runId } = await planRun(t, { review: false });
  const session = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-session-')));
  t.after(() => rmSync(session, { recursive: true, force: true }));
  git(root, 'worktree', 'add', '-q', '-b', 'session-git', session);
  writeFileSync(join(session, PLAN_PATH), REVIEWED);
  const failingCommonDir = interceptingRunner(({ args }) =>
    args[args.indexOf('-C') + 1] === session && args.includes('--git-common-dir')
      ? { status: 128, stdout: '', stderr: 'fatal: simulated common-dir failure' }
      : undefined,
  );
  const reviewFailure = await executeOperation(
    'plan-reviewed',
    { cwd: root, runId, sourceRoot: session },
    deps({ runner: failingCommonDir }),
  );
  assert.equal(reviewFailure.error.code, 'GIT_FAILED');
  assert.equal(ledger(root, runId).source.reviewedPlanSha256, undefined);
  assert.equal((await op('plan-reviewed', { cwd: root, runId, sourceRoot: session })).ok, true);
  await deliver(t, root, runId);
  const kept = await restore(root, runId, { sourceRoot: session }, { runner: failingCommonDir });
  assert.deepEqual(kept.data, {
    result: 'kept',
    reason: 'git-read-failed',
    planPath: PLAN_PATH,
    detail: 'git rev-parse failed: fatal: simulated common-dir failure',
  });
  assert.equal(readFileSync(join(session, PLAN_PATH), 'utf8'), REVIEWED);
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const unsafe = await restore(root, runId, { sourceRoot: outside });
  assert.equal(unsafe.error.code, 'UNSAFE_TARGET');
  const restored = await restore(root, runId, { sourceRoot: session });
  assert.deepEqual(restored.data, {
    result: 'restored',
    planPath: PLAN_PATH,
    retainedCopy: retainedIn(root, runId, restored.data.retainedCopy),
  });
});

// A repository whose plan checks out with CRLF line endings (`eol=crlf`), so the working copy and
// the preflight hash differ from the raw blob. Returns the run and the working-tree texts.
async function crlfPlanRun(t) {
  const root = repository(t);
  writeFileSync(join(root, '.gitattributes'), '*.md text eol=crlf\n');
  mkdirSync(join(root, 'docs/plan'), { recursive: true });
  writeFileSync(join(root, PLAN_PATH), ORIGINAL);
  commitAll(root, 'crlf plan');
  rmSync(join(root, PLAN_PATH));
  git(root, 'checkout', '--', PLAN_PATH);
  const original = ORIGINAL.replace(/\n/g, '\r\n');
  assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), original);
  const runId = await init(root, {
    source: { kind: 'plan', planPath: PLAN_PATH, planSha256: digest(original) },
    visibility: 'public',
  });
  return { root, runId, original };
}

// Invariant: `HEAD:<P>` is compared in working-tree form (`git cat-file --filters`), so an
// end-of-line conversion never turns an unchanged plan into a kept copy, and the preflight hash of
// the converted working copy still matches HEAD for a real restore.
test('plan-copy-restore compares HEAD in working-tree form under eol=crlf', async (t) => {
  {
    const { root, runId } = await crlfPlanRun(t);
    assert.equal((await op('plan-reviewed', { cwd: root, runId, sourceRoot: root })).ok, true);
    await deliver(t, root, runId);
    const unchanged = await restore(root, runId);
    assert.deepEqual(unchanged.data, {
      result: 'not-applicable',
      reason: 'unchanged',
      planPath: PLAN_PATH,
    });
  }
  {
    const { root, runId, original } = await crlfPlanRun(t);
    writeFileSync(join(root, PLAN_PATH), REVIEWED.replace(/\n/g, '\r\n'));
    assert.equal((await op('plan-reviewed', { cwd: root, runId, sourceRoot: root })).ok, true);
    await deliver(t, root, runId);
    const index = git(root, 'ls-files', '-s');
    const restored = await restore(root, runId);
    assert.deepEqual(restored.data, {
      result: 'restored',
      planPath: PLAN_PATH,
      retainedCopy: retainedIn(root, runId, restored.data.retainedCopy),
    });
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), original);
    assert.equal(git(root, 'ls-files', '-s'), index);
  }
});

// Invariant: a HEAD entry the helper cannot compare (a symlink, or a blob over the plan bound) is
// its own kept reason, never `head-moved` or `unchanged`.
test('plan-copy-restore keeps the copy when HEAD:<P> is unreadable', async (t) => {
  for (const [label, commitHead] of [
    [
      'symlink entry',
      (root) => {
        writeFileSync(join(root, 'target.md'), ORIGINAL);
        symlinkSync('../../target.md', join(root, PLAN_PATH));
      },
    ],
    ['oversized blob', (root) => writeFileSync(join(root, PLAN_PATH), 'x'.repeat(600 * 1024))],
  ]) {
    const root = repository(t);
    mkdirSync(join(root, 'docs/plan'), { recursive: true });
    commitHead(root);
    commitAll(root, label);
    rmSync(join(root, PLAN_PATH));
    writeFileSync(join(root, PLAN_PATH), REVIEWED);
    const runId = await init(root, {
      source: { kind: 'plan', planPath: PLAN_PATH, planSha256: digest(ORIGINAL) },
      visibility: 'public',
    });
    assert.equal((await op('plan-reviewed', { cwd: root, runId, sourceRoot: root })).ok, true);
    const kept = await restore(root, runId);
    assert.deepEqual(
      kept.data,
      { result: 'kept', reason: 'head-unreadable', planPath: PLAN_PATH },
      label,
    );
    assert.equal(readFileSync(join(root, PLAN_PATH), 'utf8'), REVIEWED, label);
  }
});

// Invariant: a directory without a working tree (the repository's own `.git` directory, or a bare
// repository) is an unsafe sourceRoot, never a Git read failure.
test('plan-reviewed and plan-copy-restore refuse a sourceRoot without a working tree', async (t) => {
  const { root, runId } = await planRun(t, { review: false });
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-bare-')));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  git(bare, 'init', '-q', '--bare');
  for (const sourceRoot of [join(root, '.git'), bare]) {
    const reviewed = await op('plan-reviewed', { cwd: root, runId, sourceRoot });
    assert.equal(reviewed.error.code, 'UNSAFE_TARGET', `plan-reviewed ${sourceRoot}`);
    const restored = await restore(root, runId, { sourceRoot });
    assert.equal(restored.error.code, 'UNSAFE_TARGET', `plan-copy-restore ${sourceRoot}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Planning claim of an issue source

const CLAIM_TARGET = { kind: 'forge', host: 'github.com', owner: 'example', repository: 'project' };
const CLAIM_TOKEN = 'c'.repeat(32);
const AT_INSTANT = new Date(INSTANT).toISOString();

function issueSource(issue) {
  return { source: { kind: 'issue', issue, repository: REPOSITORY } };
}

function claimPath(root, issue) {
  const { targetKey, issueKey } = planningClaimKey({ target: CLAIM_TARGET, issue });
  return join(root, '.effective-flow/planning-claims', targetKey, `${issueKey}.json`);
}

function closeRun(root, runId, outcome = 'no-pull-request', extra = {}, options = {}) {
  return executeOperation('run-close', { cwd: root, runId, outcome, ...extra }, deps(options));
}

// Invariant: `run-init` on an issue source takes the issue's planning claim before it creates the
// run directory, stores the token only in the internal ledger field `planningClaim`, and returns
// the same output as before. The claim key is the one any workflow derives from the
// `repository-resolve` identity of the same repository.
test('run-init takes the issue claim before it creates the run directory and ledger', async (t) => {
  const root = repository(t);
  let runDirectoryAtClaim = null;
  const envelope = await executeOperation(
    'run-init',
    { cwd: root, visibility: 'private', language: 'en', ...issueSource(42) },
    deps({
      randomToken: () => {
        runDirectoryAtClaim = existsSync(join(root, AUTOPILOT_DIR));
        return CLAIM_TOKEN;
      },
    }),
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(runDirectoryAtClaim, false);
  const { runId } = envelope.data;
  assert.deepEqual(Object.keys(envelope.data).sort(), ['budget', 'ledgerDirectory', 'runId']);
  const key = planningClaimKey({
    target: { ...CLAIM_TARGET, owner: 'Example', repository: 'Project.git' },
    issue: 42,
  });
  assert.deepEqual(ledger(root, runId).planningClaim, {
    claimId: CLAIM_TOKEN,
    targetKey: key.targetKey,
    issueKey: key.issueKey,
    acquiredAt: AT_INSTANT,
  });
  const record = JSON.parse(readFileSync(claimPath(root, 42), 'utf8'));
  assert.equal(record.workflow, 'autopilot');
  assert.equal(record.runId, runId);
  assert.equal(record.claimId, CLAIM_TOKEN);
  assert.ok(!JSON.stringify(envelope).includes(CLAIM_TOKEN));
});

// Invariant: a held claim stops `run-init` with ISSUE_CLAIMED naming the holder (workflow, run or
// pass id, age, stale flag), never its token, and leaves no run directory or ledger behind; a
// different issue starts in parallel.
test('a held claim stops run-init with ISSUE_CLAIMED and creates no run', async (t) => {
  const root = repository(t);
  const first = await init(root);
  const token = ledger(root, first).planningClaim.claimId;
  const runs = readdirSync(join(root, AUTOPILOT_DIR)).sort();
  const second = await op('run-init', {
    cwd: root,
    visibility: 'private',
    language: 'en',
    ...issueSource(42),
  });
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'ISSUE_CLAIMED');
  assert.equal(exitCodeFor(second), 1);
  const { holder, ...rest } = second.error.details;
  assert.deepEqual(rest, { issue: 42, repository: REPOSITORY });
  const { liveness, ...stable } = holder;
  assert.ok(['alive', 'dead', 'unknown'].includes(liveness));
  assert.deepEqual(stable, {
    workflow: 'autopilot',
    runId: first,
    acquiredAt: AT_INSTANT,
    ageMs: 0,
    stale: false,
  });
  assert.ok(!JSON.stringify(second).includes(token));
  assert.deepEqual(readdirSync(join(root, AUTOPILOT_DIR)).sort(), runs);
  const parallel = await init(root, issueSource(43));
  assert.notEqual(parallel, first);

  // An Issue Buddy pass holding a stale claim: the stop names the pass, and no run state exists.
  const fresh = repository(t);
  const held = await planningClaimAcquire(
    { cwd: fresh, target: CLAIM_TARGET, issue: 7, workflow: 'issue-buddy', passId: 'pass-1' },
    deps({ now: () => INSTANT - 3 * 3_600_000 }),
  );
  const blocked = await op('run-init', {
    cwd: fresh,
    visibility: 'public',
    language: 'en',
    ...issueSource(7),
  });
  assert.equal(blocked.error.code, 'ISSUE_CLAIMED');
  assert.equal(blocked.error.details.holder.workflow, 'issue-buddy');
  assert.equal(blocked.error.details.holder.passId, 'pass-1');
  assert.equal(blocked.error.details.holder.ageMs, 3 * 3_600_000);
  assert.equal(blocked.error.details.holder.stale, true);
  assert.ok(!JSON.stringify(blocked).includes(held.claimId));
  assert.equal(existsSync(join(fresh, AUTOPILOT_DIR)), false);
});

// Invariant: a legacy Issue Buddy `pass.lock` stops an issue-source `run-init` before any write;
// a plan source takes no claim and starts.
test('a legacy pass lock stops an issue-source run-init and a plan source takes no claim', async (t) => {
  const root = repository(t);
  mkdirSync(join(root, '.effective-flow/issue-buddy'), { recursive: true });
  writeFileSync(join(root, '.effective-flow/issue-buddy/pass.lock'), '{}\n');
  const refused = await op('run-init', {
    cwd: root,
    visibility: 'private',
    language: 'en',
    ...issueSource(42),
  });
  assert.equal(refused.error.code, 'LEGACY_PASS_LOCK');
  assert.deepEqual(refused.error.details, { path: '.effective-flow/issue-buddy/pass.lock' });
  assert.equal(existsSync(join(root, AUTOPILOT_DIR)), false);
  assert.equal(existsSync(claimPath(root, 42)), false);

  const planRunId = await init(root, {
    source: { kind: 'plan', planPath: 'docs/plan/x.md', planSha256: SHA },
  });
  assert.equal(Object.hasOwn(ledger(root, planRunId), 'planningClaim'), false);
  assert.equal(existsSync(join(root, '.effective-flow/planning-claims')), false);
  const closedPlan = await closeRun(root, planRunId);
  assert.equal(closedPlan.ok, true, JSON.stringify(closedPlan));
  assert.deepEqual(Object.keys(closedPlan.data).sort(), ['counts', 'fit', 'outcome', 'runId']);
});

// Invariant: when the ledger cannot be created after the claim was taken, `run-init` gives the
// claim back, so a failed start never blocks the issue.
test('run-init releases the claim when the ledger cannot be created', async (t) => {
  const root = repository(t);
  mkdirSync(join(root, '.effective-flow'));
  writeFileSync(join(root, AUTOPILOT_DIR), 'not a directory\n');
  const failed = await op('run-init', {
    cwd: root,
    visibility: 'private',
    language: 'en',
    ...issueSource(42),
  });
  assert.equal(failed.ok, false);
  assert.notEqual(failed.error.code, 'ISSUE_CLAIMED');
  assert.equal(existsSync(claimPath(root, 42)), false);
  rmSync(join(root, AUTOPILOT_DIR));
  await init(root);
});

// Invariant: a claim release that fails while `run-init` gives the claim back never hides the
// original ledger failure: the caller sees exactly the error it would see without the release
// failure, and the left claim stays for `cleanup`.
test('run-init reports the ledger failure even when the claim release throws', async (t) => {
  const start = { visibility: 'private', language: 'en', ...issueSource(42) };
  const baseline = repository(t);
  mkdirSync(join(baseline, '.effective-flow'));
  writeFileSync(join(baseline, AUTOPILOT_DIR), 'not a directory\n');
  const expected = await op('run-init', { cwd: baseline, ...start });
  assert.equal(expected.ok, false);

  const root = repository(t);
  mkdirSync(join(root, '.effective-flow'));
  writeFileSync(join(root, AUTOPILOT_DIR), 'not a directory\n');
  const real = createProcessRunner();
  let releaseFailures = 0;
  // Once the claim exists, the release's root resolution (`git rev-parse`) throws.
  const runner = async (call) => {
    if (existsSync(claimPath(root, 42)) && call.args?.includes('rev-parse')) {
      releaseFailures += 1;
      throw new Error('release exploded');
    }
    return real(call);
  };
  const failed = await executeOperation('run-init', { cwd: root, ...start }, deps({ runner }));
  assert.ok(releaseFailures > 0, 'the release was attempted and failed');
  const neutral = (envelope, at) => JSON.parse(JSON.stringify(envelope).replaceAll(at, '<root>'));
  assert.deepEqual(neutral(failed, root), neutral(expected, baseline));
  assert.doesNotMatch(JSON.stringify(failed), /release exploded/);
  assert.equal(existsSync(claimPath(root, 42)), true, 'the unreleased claim is left for cleanup');
});

// Invariant: `run-close` releases the claim for every outcome, a recorded blocker included, and
// reports the release without the token; the issue is plannable again afterwards.
test('run-close releases the claim with and without a pull request and after a blocker', async (t) => {
  const root = repository(t);
  const cases = [
    [51, 'pull-request', 5, false],
    [52, 'no-pull-request', undefined, false],
    [53, 'no-pull-request', undefined, true],
    [54, 'appendix-update', 6, true],
    [55, 'plan-pull-request-unchanged', 7, true],
  ];
  for (const [issue, outcome, pullRequest, withBlocker] of cases) {
    const runId = await init(root, issueSource(issue));
    const held = ledger(root, runId).planningClaim;
    if (withBlocker) {
      const recorded = await op('blocker-record', {
        cwd: root,
        runId,
        kind: 'plan-not-approved',
        summary: 'The plan review did not approve the plan.',
      });
      assert.equal(recorded.ok, true, JSON.stringify(recorded));
    }
    const closed = await closeRun(
      root,
      runId,
      outcome,
      pullRequest === undefined ? {} : { pullRequest },
    );
    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.deepEqual(
      closed.data.planningClaim,
      { targetKey: held.targetKey, issueKey: held.issueKey, released: true },
      outcome,
    );
    assert.ok(!JSON.stringify(closed).includes(held.claimId));
    assert.equal(existsSync(claimPath(root, issue)), false, outcome);
    assert.equal(ledger(root, runId).status, 'closed');
    const again = await init(root, issueSource(issue));
    assert.equal((await closeRun(root, again)).data.planningClaim.released, true);
  }
});

// Invariant: a claim that is already gone is reported as `missing` (idempotent), one taken over by
// another holder as `not-owner` and kept, and a failed release as `release-failed` with its code;
// none of them keeps the run open. A ledger written before claims existed closes unchanged.
test('run-close reports a missing, foreign or failed release and still closes', async (t) => {
  const root = repository(t);
  const missing = await init(root, issueSource(61));
  rmSync(claimPath(root, 61));
  const gone = await closeRun(root, missing);
  assert.equal(gone.ok, true, JSON.stringify(gone));
  assert.equal(gone.data.planningClaim.released, false);
  assert.equal(gone.data.planningClaim.reason, 'missing');
  assert.equal(ledger(root, missing).status, 'closed');

  const foreign = await init(root, issueSource(62));
  const held = ledger(root, foreign).planningClaim;
  const input = { cwd: root, target: CLAIM_TARGET, issue: 62 };
  assert.equal(
    (await planningClaimRelease({ ...input, claimId: held.claimId }, deps())).released,
    true,
  );
  await planningClaimAcquire({ ...input, workflow: 'issue-buddy', passId: 'pass-2' }, deps());
  const taken = await closeRun(root, foreign);
  assert.equal(taken.ok, true, JSON.stringify(taken));
  assert.deepEqual(taken.data.planningClaim, {
    targetKey: held.targetKey,
    issueKey: held.issueKey,
    released: false,
    reason: 'not-owner',
    detail: 'token-mismatch',
  });
  assert.equal(JSON.parse(readFileSync(claimPath(root, 62), 'utf8')).passId, 'pass-2');

  const failing = await init(root, issueSource(63));
  const token = ledger(root, failing).planningClaim.claimId;
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  const failed = await closeRun(
    root,
    failing,
    'no-pull-request',
    {},
    {
      fs: {
        unlink: async () => {
          throw denied;
        },
      },
    },
  );
  assert.equal(failed.ok, true, JSON.stringify(failed));
  assert.equal(failed.data.planningClaim.released, false);
  assert.equal(failed.data.planningClaim.reason, 'release-failed');
  assert.equal(failed.data.planningClaim.code, 'WRITE_FAILED');
  assert.ok(!JSON.stringify(failed).includes(token));
  assert.equal(ledger(root, failing).status, 'closed');
  assert.ok(existsSync(claimPath(root, 63)));
  assert.equal(
    (await op('run-close', { cwd: root, runId: failing, outcome: 'no-pull-request' })).error.code,
    'RUN_CLOSED',
  );

  const legacy = await init(root, issueSource(64));
  const target = join(root, AUTOPILOT_DIR, legacy, 'run.json');
  const { planningClaim: _claim, ...withoutClaim } = ledger(root, legacy);
  writeFileSync(target, `${JSON.stringify(withoutClaim, null, 2)}\n`);
  rmSync(claimPath(root, 64));
  const closedLegacy = await closeRun(root, legacy, 'pull-request', { pullRequest: 8 });
  assert.equal(closedLegacy.ok, true, JSON.stringify(closedLegacy));
  assert.deepEqual(Object.keys(closedLegacy.data).sort(), ['counts', 'fit', 'outcome', 'runId']);
});

// Invariant: `run-close` writes the closed ledger before it releases the claim, so a failed ledger
// write leaves the run open with its claim (never an open run without one), and a repeated
// `run-close` then closes the run and releases the claim.
test('run-close keeps the claim when the closed ledger cannot be written', async (t) => {
  const root = repository(t);
  const runId = await init(root, issueSource(71));
  const real = createProcessRunner();
  const ledgerTemporary = /\.run\.json\.[0-9a-f]{16}\.tmp$/;
  // The guard of the ledger's write temporary reports it not ignored: the write is refused.
  const runner = async (call) =>
    call.args.some((arg) => ledgerTemporary.test(arg))
      ? { status: 1, stdout: '', stderr: '' }
      : real(call);
  const refused = await closeRun(root, runId, 'no-pull-request', {}, { runner });
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.equal(ledger(root, runId).status, 'open');
  assert.equal(JSON.parse(readFileSync(claimPath(root, 71), 'utf8')).runId, runId);
  const closed = await closeRun(root, runId);
  assert.equal(closed.ok, true, JSON.stringify(closed));
  assert.equal(closed.data.planningClaim.released, true);
  assert.equal(ledger(root, runId).status, 'closed');
  assert.equal(existsSync(claimPath(root, 71)), false);
});

// Invariant: the claim token never leaves the helper: no operation output, the CLI envelope and
// the rendered and merged appendix carry it, and the appendix names no claim at all.
test('the claim token appears in no operation output and not in the appendix', async (t) => {
  const root = repository(t);
  const outputs = [];
  const call = async (operation, input) => {
    const envelope = await op(operation, { cwd: root, ...input });
    assert.equal(envelope.ok, true, `${operation}: ${JSON.stringify(envelope)}`);
    outputs.push(envelope);
    return envelope;
  };
  const started = await call('run-init', {
    visibility: 'private',
    language: 'en',
    ...issueSource(42),
  });
  const { runId } = started.data;
  const token = ledger(root, runId).planningClaim.claimId;
  await call('decision-record', {
    runId,
    record: decision([
      ['A', 8],
      ['B', 6],
    ]),
  });
  await call('blocker-record', { runId, kind: 'plan-not-approved', summary: 'Not approved yet.' });
  await call('fit-record', { runId, notAssessed: true });
  await call('run-check', { runId });
  await call('consent-check', { runId, issue: 42, repository: REPOSITORY });
  const rendered = await call('pr-appendix', { runId, planPullRequest: 99 });
  const merged = await call('appendix-merge', {
    runId,
    appendixSha256: rendered.data.sha256,
    body: 'Prose.\n',
  });
  await call('plan-copy-restore', { runId, sourceRoot: root });
  await call('ledger-list', {});
  const appendix = readFileSync(join(root, AUTOPILOT_DIR, runId, 'appendix.md'), 'utf8');
  const direct = renderAppendix(ledger(root, runId), { planPullRequest: 99 }).appendix;
  let written = '';
  await main(['run-close'], {
    input: { cwd: root, runId, outcome: 'pull-request', pullRequest: 99 },
    stdout: { write: (chunk) => (written += chunk) },
    stderr: { write: () => {} },
    setExitCode: () => {},
    runner: createProcessRunner(),
    options: { env: GIT_ENV, now: () => INSTANT },
  });
  assert.equal(JSON.parse(written).data.planningClaim.released, true);
  await call('ledger-list', {});
  for (const envelope of outputs) {
    assert.ok(!JSON.stringify(envelope).includes(token), envelope.operation);
  }
  assert.ok(!written.includes(token));
  for (const text of [appendix, merged.data.body, direct]) {
    assert.ok(!text.includes(token));
    assert.ok(!/planningClaim|claimId/.test(text));
  }
});

// Invariant: autopilot keeps the restored plan of an issue source in a run-owned delivery
// worktree, never at `<RUNTIME_STATE_ROOT>/<P>`: that worktree is a valid `sourceRoot` and
// `decision-extract` reads the plan there, `plan-copy-restore` touches nothing in it for an issue
// source, and a linked worktree as `cwd` is still refused, so the ledger and the claim stay in
// the primary checkout.
test('the restored plan lives in a delivery worktree while cwd stays primary', async (t) => {
  const root = repository(t);
  const runId = await init(root);
  const delivery = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-autopilot-delivery-')));
  t.after(() => rmSync(delivery, { recursive: true, force: true }));
  git(root, 'worktree', 'add', '-q', '-b', 'effective-flow/plan/issue-42', delivery);
  mkdirSync(join(delivery, 'docs/plan'), { recursive: true });
  writeFileSync(join(delivery, PLAN_PATH), REVIEWED);

  const extracted = await op('decision-extract', { planPath: join(delivery, PLAN_PATH) });
  assert.equal(extracted.ok, true, JSON.stringify(extracted));
  assert.equal(extracted.data.sha256, digest(REVIEWED));
  const restored = await restore(root, runId, { sourceRoot: delivery });
  assert.deepEqual(restored.data, { result: 'not-applicable', reason: 'issue-source' });
  assert.equal(readFileSync(join(delivery, PLAN_PATH), 'utf8'), REVIEWED);
  assert.equal(existsSync(join(root, PLAN_PATH)), false);

  for (const [operation, input] of [
    ['plan-copy-restore', { runId, sourceRoot: delivery }],
    ['run-check', { runId }],
    ['run-close', { runId, outcome: 'no-pull-request' }],
  ]) {
    const refused = await op(operation, { cwd: delivery, ...input });
    assert.equal(refused.error.code, 'UNSAFE_TARGET', operation);
  }
  assert.ok(existsSync(claimPath(root, 42)));
  assert.equal(existsSync(join(delivery, '.effective-flow')), false);
  const closed = await closeRun(root, runId);
  assert.equal(closed.data.planningClaim.released, true);
});
