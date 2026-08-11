import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  bodyHash,
  buildCommandPlan,
  buildCommentPayload,
  buildEpicPayload,
  buildFindingPayload,
  buildReviewPayload,
  deduplicateFindings,
  executeOperation,
  labelQueryVariants,
  parseFindingSignature,
  parseReference,
  parseReferences,
  parseRemote,
  patchChecklistEntry,
  patchMarkedBlock,
  planSfLabelMigration,
  probeProvider,
  redact,
} from '../src/scripts/remote-tracker-core.mjs';

const githubRepository = {
  host: 'github.com',
  owner: 'example',
  repository: 'flow',
  provider: 'github',
};

const forgejoRepository = {
  host: 'code.example.test',
  owner: 'team',
  repository: 'flow',
  slug: 'team/flow',
  provider: 'forgejo',
  login: 'work',
};

function fakeRunner(results) {
  const calls = [];
  const runner = async (plan) => {
    calls.push(plan);
    const result = results[calls.length - 1];
    return typeof result === 'function' ? result(plan) : result;
  };
  runner.calls = calls;
  return runner;
}

function teaProbeResults(overrides = {}) {
  const help = (name, content) => overrides[name] ?? { status: 0, stdout: content, stderr: '' };
  return [
    { status: 0, stdout: 'Version: 0.14.2\n', stderr: '' },
    {
      status: 0,
      stdout: JSON.stringify([{ name: 'work', url: 'https://code.example.test' }]),
      stderr: '',
    },
    help('issues', '--output'),
    help('issueComments', '--comments'),
    help('issueCreate', '--title --description'),
    help('issueUpdate', '--description'),
    help('issueLabelAdd', '--add-labels'),
    help('issueLabelRemove', '--remove-labels'),
    help('pulls', '--output'),
    help('pullComments', '--comments'),
    help('pullReviewComments', '--output --fields'),
    help('pullResolve', '--output'),
    help('pullCreate', '--head --base'),
    help('pullCreateDraft', '--draft'),
    help('pullEdit', '--description'),
    help('comment', '--output'),
    help('commentUpdate', '--method --data'),
    help('labelCreate', '--output --name'),
    // Appended last, matching the probe appended last to the adapter's `Promise.all`. The fixture
    // is positional, so a new entry inserted anywhere else would silently reassign every probe
    // after it.
    help('labelList', '--output --exclude-org --page --limit'),
  ];
}

test('parses HTTPS, ssh URL, and SCP-style remotes deterministically', () => {
  for (const remote of [
    'https://github.com/example/flow.git',
    'ssh://git@github.com/example/flow.git',
    'git@github.com:example/flow.git',
  ]) {
    assert.deepEqual(parseRemote(remote), {
      host: 'github.com',
      owner: 'example',
      repository: 'flow',
      slug: 'example/flow',
      provider: 'github',
    });
  }
});

test('classifies Forgejo only through a matching login or explicit override', () => {
  assert.equal(
    parseRemote('git@code.example.test:team/flow.git', {
      teaLogins: [{ url: 'https://code.example.test' }],
    }).provider,
    'forgejo',
  );
  assert.equal(
    parseRemote('https://enterprise.example.test/team/flow', { provider: 'github' }).provider,
    'github',
  );
  assert.throws(
    () => parseRemote('https://unknown.example.test/team/flow'),
    (error) => error.code === 'AMBIGUOUS_HOST',
  );
});

test('parses host-neutral references and rejects kind/repository mismatches', () => {
  assert.deepEqual(parseReference('#42', { expectedKind: 'issue' }), {
    kind: 'issue',
    number: 42,
    repository: undefined,
  });
  assert.equal(
    parseReference('https://code.example.test/team/flow/pulls/9', {
      expectedKind: 'pull-request',
      repository: { host: 'code.example.test', owner: 'team', repository: 'flow' },
    }).number,
    9,
  );
  assert.equal(parseReferences('#1, #2', { expectedKind: 'issue' }).length, 2);
  assert.throws(
    () =>
      parseReference('https://github.com/other/repo/issues/1', {
        expectedKind: 'issue',
        repository: githubRepository,
      }),
    (error) => error.code === 'REFERENCE_REPOSITORY_MISMATCH',
  );
  assert.throws(
    () => parseReference('https://github.com/example/flow/pull/1', { expectedKind: 'issue' }),
    (error) => error.code === 'INVALID_REFERENCE',
  );
});

test('reads canonical Signature and legacy Signatur with one normalized identity', () => {
  const canonical = parseFindingSignature('- **Signature**: src/a.mjs:2 · Core · Duplicate issue');
  const legacy = parseFindingSignature('- **Signatur**:  src/a.mjs:2  ·  Core  · Duplicate issue');
  assert.equal(canonical.normalized, legacy.normalized);
  assert.equal(canonical.legacy, false);
  assert.equal(legacy.legacy, true);
  assert.throws(
    () => parseFindingSignature('- **Signature**: one\n- **Signatur**: two'),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
});

test('English finding writes remain canonical and use stable helper tokens', () => {
  const payload = buildFindingPayload({
    id: 'R-0000007',
    title: 'Normalize signatures',
    severity: 'Important',
    complexity: 'Low',
    area: 'Tracker',
    file: 'src/a.mjs:2',
    problem: 'Duplicate issue',
    recommendation: 'Normalize the field',
    action: 'effective-flow-fix',
    promptSuggestion: 'Normalize the signature field.',
  });
  assert.match(payload.body, /- \*\*Severity\*\*: Important/);
  assert.match(payload.body, /- \*\*Complexity\*\*: Low/);
  assert.match(payload.body, /\*\*Signature\*\*/);
  assert.doesNotMatch(payload.body, /\*\*Signatur\*\*/);
  assert.deepEqual(payload.labels, [
    'effective-flow-review-finding',
    'effective-flow-fix',
    'important',
  ]);
});

test('German finding writes localize display fields while preserving stable helper tokens', () => {
  const payload = buildFindingPayload({
    language: 'de',
    id: 'R-0000008',
    title: 'Signaturen normalisieren',
    severity: 'Important',
    complexity: 'Low',
    area: 'Tracker',
    file: 'src/a.mjs:2',
    problem: 'Doppelter Befund',
    recommendation: 'Feld normalisieren',
    action: 'effective-flow-fix',
    promptSuggestion: 'Normalisiere das Signaturfeld.',
    epic: 12,
  });

  assert.equal(payload.title, '[R-0000008] Signaturen normalisieren');
  assert.match(payload.body, /- \*\*Schweregrad\*\*: Wichtig/);
  assert.match(payload.body, /- \*\*Komplexität\*\*: Niedrig/);
  assert.match(payload.body, /- \*\*Bereich\*\*: Tracker/);
  assert.match(payload.body, /- \*\*Datei\*\*: src\/a\.mjs:2/);
  assert.match(payload.body, /- \*\*Empfehlung\*\*: Feld normalisieren/);
  assert.match(payload.body, /- \*\*Prompt-Vorschlag\*\*: Normalisiere/);
  assert.match(payload.body, /- \*\*Action\*\*: effective-flow-fix/);
  assert.match(payload.body, /- \*\*Epic\*\*: #12/);
  assert.match(payload.body, /- \*\*Signature\*\*: src\/a\.mjs:2 · Tracker · Doppelter Befund/);
  assert.doesNotMatch(
    payload.body,
    /\*\*(?:Severity|Complexity|Area|File|Recommendation|Prompt suggestion)\*\*/,
  );
  assert.deepEqual(payload.labels, [
    'effective-flow-review-finding',
    'effective-flow-fix',
    'important',
  ]);
  assert.equal(
    parseFindingSignature(payload.body).normalized,
    'src/a.mjs:2 · tracker · doppelter befund',
  );
});

test('planning, apply, and PR comment builders emit canonical markers and reject attribution', () => {
  assert.match(
    buildCommentPayload('planning', { body: 'Plan' }).body,
    /effective-flow-plan-issues/,
  );
  assert.match(
    buildCommentPayload('apply', { body: 'Applied' }).body,
    /effective-flow-apply-issues/,
  );
  assert.match(buildCommentPayload('pr', { body: 'Summary' }).body, /effective-flow-iterate/);
  assert.throws(
    () => buildCommentPayload('pr', { body: 'Generated with Codex' }),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
});

test('dedup unions issue numbers before comparing canonical and legacy signatures', () => {
  const signature = 'src/a.mjs:2 · Tracker · Duplicate issue';
  const result = deduplicateFindings(
    [
      { number: 5, body: `- **Signature**: ${signature}` },
      { number: 5, body: `- **Signatur**: ${signature}` },
      { number: 6, body: '- **Signatur**: another · value · here' },
    ],
    [{ signature }, { signature: 'fresh · area · finding' }],
  );
  assert.equal(result.existingIssues.length, 2);
  assert.deepEqual(
    result.duplicate.map((item) => item.issueNumber),
    [5],
  );
  assert.equal(result.fresh.length, 1);
});

test('English epic writes remain canonical and skipped findings carry no ID', () => {
  const payload = buildEpicPayload({
    date: '2026-07-20',
    scope: 'Tracker',
    projectType: 'Tooling',
    lastFindingNumber: 14,
    findings: [],
    skipped: [
      {
        title: 'Deliberate fallback',
        signature: 'src/a.mjs:2 · Tracker · Deliberate fallback',
        decisionReference: 'ADR remote-boundary',
      },
    ],
  });
  assert.equal(payload.title, 'Code review 2026-07-20');
  assert.match(payload.body, /^Code review of 2026-07-20 · Scope: Tracker · Project type: Tooling/);
  assert.match(payload.body, /## Findings/);
  assert.match(payload.body, /## Skipped \(design decisions\)/);
  assert.match(payload.body, /Deliberate fallback.*Signature:.*ADR remote-boundary/);
  assert.doesNotMatch(payload.body, /R-\d{7}/);
  assert.equal(payload.lastFindingNumber, 14);
  assert.throws(
    () =>
      buildEpicPayload({
        date: '2026-07-20',
        scope: 'Tracker',
        projectType: 'Tooling',
        skipped: [
          {
            id: 'R-0000015',
            title: 'Wrong',
            signature: 'a · b · c',
            decisionReference: 'ADR x',
          },
        ],
      }),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
});

test('German epic writes localize human prose while preserving checklist and helper tokens', () => {
  const payload = buildEpicPayload({
    language: 'de',
    date: '2026-07-21',
    suffix: '-2',
    scope: 'Gesamter Code',
    projectType: 'Werkzeug',
    lastFindingNumber: 15,
    findings: [
      {
        number: 42,
        id: 'R-0000015',
        title: 'Remote-Body lokalisieren',
        action: 'effective-flow-fix',
      },
    ],
    skipped: [
      {
        title: 'Bewusster Fallback',
        signature: 'src/a.mjs:2 · Tracker · Bewusster Fallback',
        decisionReference: 'ADR Remote-Grenze',
      },
    ],
  });

  assert.equal(payload.title, 'Code-Review 2026-07-21-2');
  assert.match(
    payload.body,
    /^Code-Review vom 2026-07-21 · Umfang: Gesamter Code · Projekttyp: Werkzeug/,
  );
  assert.match(payload.body, /## Befunde/);
  assert.match(payload.body, /## Übersprungen \(Architekturentscheidungen\)/);
  assert.match(
    payload.body,
    /- \[ \] #42 \[R-0000015\] Remote-Body lokalisieren — Action: effective-flow-fix/,
  );
  assert.match(
    payload.body,
    /Bewusster Fallback — Signature: .* — abgedeckt durch ADR Remote-Grenze/,
  );
  assert.doesNotMatch(payload.body, /Code review|Scope:|Project type:|## Findings|covered by/);
  assert.deepEqual(payload.labels, ['effective-flow-review-epic']);
  assert.equal(payload.lastFindingNumber, 15);
});

test('review body builders reject unsupported languages and route envelope language to nested input', async () => {
  assert.throws(
    () =>
      buildFindingPayload({
        language: 'fr',
        id: 'R-0000008',
        title: 'Finding',
        severity: 'Note',
        complexity: 'Medium',
        area: 'Tracker',
        file: 'src/a.mjs:2',
        problem: 'Problem',
        recommendation: 'Recommendation',
        action: 'effective-flow-docs',
        promptSuggestion: 'Document it.',
      }),
    (error) => error.code === 'INVALID_PAYLOAD' && error.details.value === 'fr',
  );
  assert.throws(
    () =>
      buildEpicPayload({
        language: 'EN',
        date: '2026-07-21',
        scope: 'All',
        projectType: 'Tooling',
      }),
    (error) => error.code === 'INVALID_PAYLOAD' && error.details.value === 'EN',
  );

  const envelope = await executeOperation('finding-build', {
    language: 'de',
    finding: {
      id: 'R-0000009',
      title: 'Body lokalisieren',
      severity: 'Note',
      complexity: 'Medium',
      area: 'Tracker',
      file: 'src/a.mjs:2',
      problem: 'Gemischte Sprache',
      recommendation: 'Vollständig lokalisieren',
      action: 'effective-flow-docs',
      promptSuggestion: 'Dokumentiere die Zuordnung.',
    },
  });
  assert.equal(envelope.ok, true);
  assert.match(envelope.data.body, /\*\*Schweregrad\*\*: Hinweis/);
  assert.match(envelope.data.body, /\*\*Komplexität\*\*: Mittel/);
  assert.match(envelope.data.body, /\*\*Action\*\*: effective-flow-docs/);
});

test('label compatibility emits separate prefix and legacy severity queries', () => {
  assert.deepEqual(labelQueryVariants(['effective-flow-review-finding']), [
    ['effective-flow-review-finding'],
    ['firmo-review-finding'],
  ]);
  assert.deepEqual(labelQueryVariants(['critical']), [['critical'], ['kritisch']]);
});

test('sf migration adds current labels before removing old labels and is marker-idempotent', () => {
  const plan = planSfLabelMigration([{ number: 9, labels: ['sf-fix', 'unrelated'] }]);
  assert.deepEqual(plan.steps, [
    { operation: 'add', issue: 9, label: 'effective-flow-fix' },
    { operation: 'remove', issue: 9, label: 'sf-fix' },
  ]);
  assert.deepEqual(plan.marker, { done: false });
  assert.deepEqual(plan.completionMarker, { done: true });
  assert.deepEqual(planSfLabelMigration([], { done: true }), {
    skipped: true,
    steps: [],
    marker: { done: true },
  });
});

test('provider label plans support add and remove with documented argument forms', () => {
  const githubRemove = buildCommandPlan(
    'issue-label-remove',
    { number: 9, payload: { label: 'sf-fix' } },
    githubRepository,
  );
  assert.deepEqual(githubRemove.args.slice(-3), [
    '-X',
    'DELETE',
    'repos/example/flow/issues/9/labels/sf-fix',
  ]);

  const forgejoAdd = buildCommandPlan(
    'issue-label-add',
    { number: 9, payload: { labels: ['effective-flow-fix'] } },
    forgejoRepository,
  );
  assert.deepEqual(forgejoAdd.args, [
    'issues',
    'edit',
    '9',
    '--login',
    'work',
    '--repo',
    'team/flow',
    '--add-labels',
    'effective-flow-fix',
  ]);
  const forgejoRemove = buildCommandPlan(
    'issue-label-remove',
    { number: 9, payload: { label: 'sf-fix' } },
    forgejoRepository,
  );
  assert.equal(forgejoRemove.args.at(-2), '--remove-labels');
  assert.equal(forgejoRemove.args.at(-1), 'sf-fix');
});

test('Forgejo command plans use supported tea forms and filter PR heads after reads', async () => {
  const comments = buildCommandPlan('issue-comments-read', { number: 3 }, forgejoRepository);
  assert.deepEqual(comments.args.slice(0, 3), ['issues', '3', '--login']);
  assert.ok(comments.args.includes('--comments'));
  assert.ok(comments.args.includes('--output'));

  const create = buildCommandPlan(
    'issue-create',
    { payload: { title: 'Title', body: 'Body', labels: ['one', 'two'] } },
    forgejoRepository,
  );
  assert.deepEqual(create.args.slice(0, 2), ['issues', 'create']);
  assert.equal(create.args.includes('--output'), false);
  assert.equal(create.args.at(-1), 'one,two');

  const reviewThreads = buildCommandPlan(
    'review-threads-read',
    { pullRequest: 7 },
    forgejoRepository,
  );
  assert.deepEqual(reviewThreads.args.slice(0, 3), ['pulls', 'review-comments', '7']);
  const resolve = buildCommandPlan('review-thread-resolve', { threadId: 44 }, forgejoRepository);
  assert.deepEqual(resolve.args.slice(0, 3), ['pulls', 'resolve', '44']);

  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([
        { index: 1, title: 'one', state: 'open', head: 'other', base: 'develop' },
        { index: 2, title: 'two', state: 'open', head: 'topic', base: 'develop' },
      ]),
      stderr: '',
    },
    { status: 0, stdout: '[]', stderr: '' },
  ]);
  const envelope = await executeOperation(
    'pr-list',
    { repository: forgejoRepository, head: 'topic' },
    { runner, skipProbe: true },
  );
  assert.equal(runner.calls[0].args.includes('--head'), false);
  assert.equal(runner.calls[0].args.includes('--limit'), true);
  assert.equal(runner.calls[1].args.at(runner.calls[1].args.indexOf('--page') + 1), '2');
  assert.equal(envelope.data.pagesFetched, 2);
  assert.deepEqual(
    envelope.data.result.map((item) => item.number),
    [2],
  );

  const createEnvelope = await executeOperation(
    'issue-create',
    {
      repository: forgejoRepository,
      payload: { title: 'Title', body: 'Body' },
    },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout:
            '# #17 Title (open)\n@member created now\n\nBody\n\nhttps://code.example.test/team/flow/issues/17\n',
          stderr: '',
        },
      ]),
      skipProbe: true,
      apply: true,
    },
  );
  assert.deepEqual(createEnvelope.data.result, {
    number: 17,
    title: 'Title',
    body: 'Body',
    state: 'open',
    labels: [],
    url: 'https://code.example.test/team/flow/issues/17',
    repository: 'team/flow',
  });

  const updateEnvelope = await executeOperation(
    'issue-update-body',
    {
      repository: forgejoRepository,
      number: 17,
      expectedBodyHash: bodyHash('Body'),
      payload: { body: 'Updated body' },
    },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout: JSON.stringify({
            index: 17,
            title: 'Title',
            body: 'Body',
            state: 'open',
            labels: [],
          }),
          stderr: '',
        },
        { status: 0, stdout: '', stderr: '' },
      ]),
      skipProbe: true,
      apply: true,
    },
  );
  assert.deepEqual(updateEnvelope.data.result, {
    completed: true,
    output: '',
    repository: 'team/flow',
  });
});

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ST = `${ESC}\\`;
const osc8 = (url, terminator = BEL) =>
  `${ESC}]8;id=463754605;${url}${terminator}${url}${ESC}]8;;${terminator}`;

async function teaCreate(operation, stdout, payload = { title: 'Title', body: 'Body' }) {
  return executeOperation(
    operation,
    { repository: forgejoRepository, payload },
    { runner: fakeRunner([{ status: 0, stdout, stderr: '' }]), skipProbe: true, apply: true },
  );
}

test('tea create output survives the escape sequences of an OSC 8 hyperlink', async () => {
  const prUrl = 'https://code.example.test/team/flow/pulls/2';
  const prPayload = { title: 'Title', body: 'Body', head: 'topic', base: 'main' };

  // The reported failure: a successful creation reported as INVALID_PAYLOAD.
  const bel = await teaCreate('pr-create', `${osc8(prUrl)}\n`, prPayload);
  assert.equal(bel.ok, true);
  assert.equal(bel.data.result.url, prUrl);
  assert.equal(bel.data.result.number, 2);

  // tea's terminator choice varies by build, so the ST form must work too.
  const st = await teaCreate('pr-create', `${osc8(prUrl, ST)}\n`, prPayload);
  assert.equal(st.data.result.url, prUrl);

  const colored = await teaCreate('pr-create', `${ESC}[36m${prUrl}${ESC}[0m\n`, prPayload);
  assert.equal(colored.data.result.url, prUrl);

  // The same normalizer serves issue creation, so it was broken there as well.
  const issueUrl = 'https://code.example.test/team/flow/issues/17';
  const issue = await teaCreate('issue-create', `${osc8(issueUrl)}\n`);
  assert.equal(issue.data.result.url, issueUrl);
  assert.equal(issue.data.result.number, 17);
});

test('tea create selects the result URL by reference validity, not by position', async () => {
  const prUrl = 'https://code.example.test/team/flow/pulls/2';
  const prPayload = { title: 'Title', body: 'Body', head: 'topic', base: 'main' };

  const embedded = await teaCreate('pr-create', `Created pull request: ${prUrl}\n`, prPayload);
  assert.equal(embedded.data.result.url, prUrl);

  const punctuated = await teaCreate('pr-create', `Opened ${prUrl}.\n`, prPayload);
  assert.equal(punctuated.data.result.url, prUrl);

  // A later foreign URL must not win: only a candidate that parses for this repository and kind
  // is eligible, so a docs or help link cannot be reported as the created pull request.
  const withDocs = await teaCreate(
    'pr-create',
    `${prUrl}\nSee https://docs.example.test/help/pulls for details\n`,
    prPayload,
  );
  assert.equal(withDocs.data.result.url, prUrl);

  // An issue URL is the wrong kind for pr-create and must be rejected as a candidate.
  const wrongKind = await teaCreate(
    'pr-create',
    `${prUrl}\nRelated: https://code.example.test/team/flow/issues/17\n`,
    prPayload,
  );
  assert.equal(wrongKind.data.result.url, prUrl);
});

test('tea create keeps failing closed when no valid result URL is present', async () => {
  const prPayload = { title: 'Title', body: 'Body', head: 'topic', base: 'main' };

  for (const stdout of [
    'See https://docs.example.test/help/pulls for details\n',
    'https://code.example.test/other/repo/pulls/2\n',
    'Pull request created.\n',
    '',
  ]) {
    const envelope = await teaCreate('pr-create', stdout, prPayload);
    assert.equal(envelope.ok, false, `expected failure for ${JSON.stringify(stdout)}`);
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
    // The honest report for a mutation whose outcome is unknown must survive the fix.
    assert.equal(envelope.error.details.mutationMayHaveSucceeded, true);
  }
});

test('escape sanitization covers every non-JSON tea result and leaves JSON untouched', async () => {
  const labelEnvelope = await executeOperation(
    'issue-label-add',
    { repository: forgejoRepository, number: 17, payload: { labels: ['effective-flow-fix'] } },
    {
      runner: fakeRunner([{ status: 0, stdout: `${ESC}[32mdone${ESC}[0m`, stderr: '' }]),
      skipProbe: true,
      apply: true,
    },
  );
  assert.equal(labelEnvelope.data.result.output, 'done');

  // Structured output is parsed as-is: a stripper over JSON could corrupt string content.
  const body = `${ESC}]8;id=1;https://code.example.test${BEL}link${ESC}]8;;${BEL}`;
  const readEnvelope = await executeOperation(
    'issue-read',
    { repository: forgejoRepository, number: 17 },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout: JSON.stringify({ index: 17, title: 'Title', body, state: 'open', labels: [] }),
          stderr: '',
        },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(readEnvelope.data.result.body, body);
});

test('tea list results normalize labels flattened into a string', async () => {
  const listEnvelope = async (operation, items) =>
    executeOperation(
      operation,
      { repository: forgejoRepository },
      {
        runner: fakeRunner([
          { status: 0, stdout: JSON.stringify(items), stderr: '' },
          { status: 0, stdout: '[]', stderr: '' },
        ]),
        skipProbe: true,
      },
    );

  // The reported crash: tea 0.14.x renders an empty label set as "" and `?? []` does not cover it.
  const empty = await listEnvelope('pr-list', [
    { index: 2, title: 'two', state: 'open', labels: '' },
  ]);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.data.result[0].labels, []);

  // Real labels are flattened into the same string, so they must be split, not discarded.
  const flattened = await listEnvelope('pr-list', [
    { index: 3, title: 'three', state: 'open', labels: 'one, two' },
  ]);
  assert.deepEqual(flattened.data.result[0].labels, ['one', 'two']);

  const unpadded = await listEnvelope('pr-list', [
    { index: 4, title: 'four', state: 'open', labels: 'one,two' },
  ]);
  assert.deepEqual(unpadded.data.result[0].labels, ['one', 'two']);

  const separatorsOnly = await listEnvelope('pr-list', [
    { index: 5, title: 'five', state: 'open', labels: ', ,' },
  ]);
  assert.deepEqual(separatorsOnly.data.result[0].labels, []);

  // Existing array shapes keep working: the single-item renderer and gh both return arrays.
  const arrays = await listEnvelope('pr-list', [
    { index: 6, title: 'six', state: 'open', labels: [{ name: 'x' }] },
    { index: 7, title: 'seven', state: 'open', labels: ['x'] },
    { index: 8, title: 'eight', state: 'open' },
  ]);
  assert.deepEqual(
    arrays.data.result.map((item) => item.labels),
    [['x'], ['x'], []],
  );

  // issue-list shares the normalizer, so the same crash applied there.
  const issues = await listEnvelope('issue-list', [
    { index: 9, title: 'nine', state: 'open', labels: '' },
  ]);
  assert.equal(issues.ok, true);
  assert.deepEqual(issues.data.result[0].labels, []);

  // An item without head/base must survive normalization so callers can still hydrate it.
  const thin = await listEnvelope('pr-list', [
    { index: 10, title: 'ten', state: 'open', labels: '' },
  ]);
  assert.equal(thin.data.result[0].head, undefined);
  assert.equal(thin.data.result[0].base, undefined);
});

test('tea pr-list requests the same fields as pr-read', () => {
  const list = buildCommandPlan('pr-list', {}, forgejoRepository);
  const read = buildCommandPlan('pr-read', { pullRequest: 2 }, forgejoRepository);
  const fields = 'index,title,state,body,labels,url,head,base';
  assert.equal(list.args.at(list.args.indexOf('--fields') + 1), fields);
  assert.equal(read.args.at(read.args.indexOf('--fields') + 1), fields);

  const github = buildCommandPlan('pr-list', {}, githubRepository);
  assert.equal(github.args.includes('--fields'), false);
});

test('sf label migration executes add before remove and reports partial completion', async () => {
  const input = {
    repository: githubRepository,
    issues: [{ number: 9, labels: ['sf-fix'] }],
  };
  const dryRun = await executeOperation('sf-label-migrate', input, { skipProbe: true });
  assert.equal(dryRun.dryRun, true);
  assert.deepEqual(dryRun.data.marker, { done: false });
  assert.deepEqual(dryRun.data.completionMarker, { done: true });
  assert.equal(dryRun.data.steps[1].command.args.includes('DELETE'), true);

  const appliedRunner = fakeRunner([
    { status: 0, stdout: '{}', stderr: '' },
    { status: 0, stdout: '', stderr: '' },
  ]);
  const applied = await executeOperation('sf-label-migrate', input, {
    runner: appliedRunner,
    skipProbe: true,
    apply: true,
  });
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.data.marker, { done: true });
  assert.deepEqual(
    applied.data.completedSteps.map((step) => step.operation),
    ['add', 'remove'],
  );

  const partialRunner = fakeRunner([
    { status: 0, stdout: '{}', stderr: '' },
    { status: 1, stdout: '', stderr: 'remove unavailable' },
  ]);
  const partial = await executeOperation('sf-label-migrate', input, {
    runner: partialRunner,
    skipProbe: true,
    apply: true,
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.error.code, 'COMMAND_FAILED');
  assert.deepEqual(partial.error.details.marker, { done: false });
  assert.deepEqual(partial.error.details.completedSteps, [
    { operation: 'add', issue: 9, label: 'effective-flow-fix' },
  ]);
});

const githubLabelPage = (labels) => ({
  status: 0,
  stdout: JSON.stringify([labels]),
  stderr: '',
});

const alreadyExistsResult = {
  status: 1,
  // `gh api` puts the provider's error body on stdout and only its own summary line on stderr, so
  // the machine-readable reason is where this fixture puts it.
  stdout: JSON.stringify({
    message: 'Validation Failed',
    errors: [{ resource: 'Label', code: 'already_exists', field: 'name' }],
  }),
  stderr: 'gh: Validation Failed (HTTP 422)\n',
};

function labelCreate(repository, results, apply = true) {
  const runner = fakeRunner(results);
  return executeOperation(
    'label-create',
    { repository, payload: { name: 'effective-flow-fix', color: 'ededed', description: '' } },
    { runner, skipProbe: true, apply },
  ).then((envelope) => ({ envelope, runner }));
}

test('the internal label list enumerates every label and stays uninvocable as an operation', async () => {
  const github = buildCommandPlan('label-list', {}, githubRepository);
  assert.equal(github.executable, 'gh');
  assert.equal(github.args.includes('--paginate'), true);
  assert.equal(github.args.includes('--slurp'), true);
  // Without the explicit page size the endpoint returns 30 labels, and a target name on page 2
  // would be read as absent — which is the duplicate this operation exists to stop.
  assert.match(github.args.at(-1), /^repos\/example\/flow\/labels\?per_page=100$/);

  const forgejo = buildCommandPlan('label-list', { page: 2, limit: 100 }, forgejoRepository);
  assert.deepEqual(forgejo.args.slice(0, 2), ['labels', 'list']);
  assert.equal(forgejo.args.includes('--exclude-org'), true);
  assert.equal(forgejo.args.at(forgejo.args.indexOf('--page') + 1), '2');
  assert.equal(forgejo.args.at(forgejo.args.indexOf('--limit') + 1), '100');

  // Constructible by the branch that owns it, refused as a public operation.
  const envelope = await executeOperation(
    'label-list',
    { repository: githubRepository },
    { runner: fakeRunner([]), skipProbe: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
});

test('label-create skips the create when the exact name is already present', async () => {
  const { envelope, runner } = await labelCreate(githubRepository, [
    githubLabelPage([
      { id: 3, name: 'wontfix', color: 'ffffff', description: '' },
      { id: 4, name: 'effective-flow-fix', color: 'ededed', description: 'fix' },
    ]),
  ]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.unchanged, true);
  assert.equal(envelope.data.result.created, false);
  assert.deepEqual(envelope.data.result.label, {
    id: 4,
    name: 'effective-flow-fix',
    color: 'ededed',
    description: 'fix',
  });
  // The read happened, the write did not.
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(
    envelope.data.steps.map((step) => step.step),
    ['list'],
  );
  assert.equal(
    envelope.data.steps.some((step) => step.command.args.includes('POST')),
    false,
  );
  // The create preview stays on `data.command`, so the generic mutation contract still holds.
  assert.equal(envelope.data.command.args.includes('POST'), true);
});

test('label-create creates exactly once when the list omits the name', async () => {
  const { envelope, runner } = await labelCreate(githubRepository, [
    githubLabelPage([{ id: 3, name: 'wontfix', color: 'ffffff', description: '' }]),
    {
      status: 0,
      stdout: JSON.stringify({
        id: 9,
        name: 'effective-flow-fix',
        color: 'ededed',
        description: '',
      }),
      stderr: '',
    },
  ]);
  assert.equal(envelope.data.unchanged, false);
  assert.equal(envelope.data.result.created, true);
  assert.deepEqual(envelope.data.result.label, {
    id: 9,
    name: 'effective-flow-fix',
    color: 'ededed',
    description: '',
  });
  assert.equal(runner.calls.length, 2);
  assert.deepEqual(
    envelope.data.steps.map((step) => step.step),
    ['list', 'create'],
  );
  assert.equal(runner.calls.filter((call) => call.args.includes('POST')).length, 1);
});

test('a lost create race is tolerated through the runner result, not a stdout sentinel', async () => {
  const { envelope } = await labelCreate(githubRepository, [
    githubLabelPage([]),
    alreadyExistsResult,
  ]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.unchanged, true);
  assert.equal(envelope.data.result.created, false);
  assert.equal(envelope.data.result.label, null);
  // The retired sentinel must not reappear anywhere in the envelope.
  assert.doesNotMatch(JSON.stringify(envelope), /\{"unchanged":true\}/);
});

test('the already-exists tolerance is keyed on plan metadata, not on the step label', async () => {
  for (const repository of [githubRepository, forgejoRepository]) {
    const plan = buildCommandPlan('label-create', { payload: { name: 'x' } }, repository);
    assert.equal(plan.tolerateAlreadyExists, true);
  }
  // Both step labels have moved away from the bare operation name the old tolerance matched
  // (`label-create list` and `label-create write`), and the race is still tolerated.
  const { envelope } = await labelCreate(githubRepository, [
    githubLabelPage([]),
    alreadyExistsResult,
  ]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.result.created, false);

  // The list plan carries no tolerance flag, so the identical provider response fails there. A
  // label-keyed match would have swallowed it, because that label starts with `label-create`.
  const preRead = await labelCreate(githubRepository, [alreadyExistsResult]);
  assert.equal(preRead.envelope.ok, false);
  assert.equal(preRead.envelope.error.code, 'COMMAND_FAILED');
  assert.match(preRead.envelope.error.message, /^label-create list failed$/);

  // And a write that failed for any other reason stays a failure.
  const other = await labelCreate(githubRepository, [
    githubLabelPage([]),
    { status: 1, stdout: '', stderr: 'server error' },
  ]);
  assert.equal(other.envelope.ok, false);
  assert.equal(other.envelope.error.code, 'COMMAND_FAILED');
  assert.match(other.envelope.error.message, /^label-create write failed$/);
});

test('label-create pages the Forgejo pre-check and matches a name on the second page', async () => {
  const { envelope, runner } = await labelCreate(forgejoRepository, [
    {
      status: 0,
      stdout: JSON.stringify([{ index: '1', name: 'wontfix', color: '#ffffff', description: '' }]),
      stderr: '',
    },
    {
      status: 0,
      stdout: JSON.stringify([
        { index: '2', name: 'effective-flow-fix', color: '#ededed', description: 'fix' },
      ]),
      stderr: '',
    },
    { status: 0, stdout: '[]', stderr: '' },
  ]);
  assert.equal(envelope.data.unchanged, true);
  assert.equal(envelope.data.result.created, false);
  assert.deepEqual(envelope.data.result.label, {
    id: '2',
    name: 'effective-flow-fix',
    color: '#ededed',
    description: 'fix',
  });
  assert.equal(runner.calls.at(1).args.at(runner.calls.at(1).args.indexOf('--page') + 1), '2');
  assert.equal(
    runner.calls.some((call) => call.args.includes('create')),
    false,
  );
});

test('the Forgejo create plan renders for humans and is never parsed as JSON', async () => {
  const plan = buildCommandPlan('label-create', { payload: { name: 'x' } }, forgejoRepository);
  assert.equal(plan.expectsJson, false);

  const { envelope } = await labelCreate(forgejoRepository, [
    { status: 0, stdout: '[]', stderr: '' },
    { status: 0, stdout: 'created label effective-flow-fix\n', stderr: '' },
  ]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.result.created, true);
  // tea states no label, so the created label falls back to what was asked for and leaves the
  // provider-assigned id unknown rather than inventing one.
  assert.deepEqual(envelope.data.result.label, {
    id: null,
    name: 'effective-flow-fix',
    color: 'ededed',
    description: '',
  });
});

test('an empty Forgejo label page that carries tea failure output never becomes a create', async () => {
  const { envelope, runner } = await labelCreate(forgejoRepository, [
    {
      status: 0,
      stdout: '[]',
      stderr: '2026/08/11 12:00:00 Failed to list repository labels: 500 Internal Server Error\n',
    },
  ]);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'COMMAND_FAILED');
  assert.equal(envelope.error.retryable, true);
  assert.equal(runner.calls.length, 1);

  // A genuinely label-free repository reports no such failure and still creates.
  const clean = await labelCreate(forgejoRepository, [
    { status: 0, stdout: '[]', stderr: '' },
    { status: 0, stdout: 'created\n', stderr: '' },
  ]);
  assert.equal(clean.envelope.data.result.created, true);
});

test('a failing label pre-read aborts label-create without attempting the create', async () => {
  const { envelope, runner } = await labelCreate(githubRepository, [
    { status: 1, stdout: '', stderr: 'bad credentials' },
  ]);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'COMMAND_FAILED');
  assert.equal(envelope.operation, 'label-create');
  // The label names the step, so the failure is not reported under a different operation.
  assert.match(envelope.error.message, /^label-create list failed$/);
  assert.equal(runner.calls.length, 1);

  // The paginated Forgejo read names the same owner, so its failure is not attributed to the
  // internal plan name no caller can invoke.
  const forgejo = await labelCreate(forgejoRepository, [
    { status: 1, stdout: '', stderr: 'no login' },
  ]);
  assert.equal(forgejo.envelope.operation, 'label-create');
  assert.match(forgejo.envelope.error.message, /^label-create list page 1 failed$/);
  assert.equal(forgejo.runner.calls.length, 1);
});

test('label-create dry runs preview both steps without calling the provider', async () => {
  const { envelope, runner } = await labelCreate(githubRepository, [], false);
  assert.equal(envelope.dryRun, true);
  assert.equal(runner.calls.length, 0);
  assert.deepEqual(
    envelope.data.steps.map((step) => step.step),
    ['list', 'create'],
  );
  assert.equal(envelope.data.steps[0].command.args.includes('--paginate'), true);
  assert.equal(envelope.data.command.args.includes('POST'), true);
  // The outcome stays undetermined until apply.
  assert.equal(envelope.data.result, undefined);
  assert.equal(envelope.data.unchanged, undefined);
  // `data.commands` stays unused, so it remains the sole property of `pr-checks-wait`.
  assert.equal(envelope.data.commands, undefined);
});

test('a tea without the label-list surface reports label-create as unsupported', async () => {
  const probe = await probeProvider(
    forgejoRepository,
    fakeRunner(teaProbeResults({ labelList: { status: 1, stdout: '', stderr: 'unknown flag' } })),
  );
  assert.equal(probe.capabilities.labelList, false);
  assert.equal(probe.capabilities.labelCreate, false);
  assert.equal(probe.capabilities.labels, false);

  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'label-create',
    { repository: forgejoRepository, payload: { name: 'effective-flow-fix' }, probe },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(runner.calls.length, 0);

  const supported = await probeProvider(forgejoRepository, fakeRunner(teaProbeResults()));
  assert.equal(supported.capabilities.labelList, true);
  assert.equal(supported.capabilities.labelCreate, true);
});

test('sf label migration emits one step pair per legacy label, not per duplicate copy', () => {
  const duplicated = planSfLabelMigration([{ number: 9, labels: ['sf-fix', 'sf-fix'] }]);
  assert.equal(duplicated.steps.length, 2);
  assert.deepEqual(duplicated.steps, [
    { operation: 'add', issue: 9, label: 'effective-flow-fix' },
    { operation: 'remove', issue: 9, label: 'sf-fix' },
  ]);

  // Distinct labels still migrate independently, and the same label on another issue is not a
  // duplicate — the dedup is per issue.
  const spread = planSfLabelMigration([
    { number: 9, labels: ['sf-fix', 'sf-fix', 'sf-review-epic'] },
    { number: 10, labels: ['sf-fix'] },
  ]);
  assert.equal(spread.steps.length, 6);
  assert.deepEqual(
    spread.steps.filter((step) => step.operation === 'add').map((step) => [step.issue, step.label]),
    [
      [9, 'effective-flow-fix'],
      [9, 'effective-flow-review-epic'],
      [10, 'effective-flow-fix'],
    ],
  );
});

test('marker patching changes exactly one block and is idempotent', () => {
  const original = 'Before\n<!-- effective-flow-summary -->\nold';
  const first = patchMarkedBlock(original, {
    marker: 'effective-flow-summary',
    replacement: 'new',
  });
  assert.equal(first.body, 'Before\n<!-- effective-flow-summary -->\nnew');
  assert.equal(first.changed, true);
  assert.equal(
    patchMarkedBlock(first.body, { marker: 'effective-flow-summary', replacement: 'new' }).changed,
    false,
  );
  assert.throws(
    () =>
      patchMarkedBlock('<!-- x -->\na\n<!-- x -->\nb', {
        marker: 'x',
        replacement: 'c',
      }),
    (error) => error.code === 'AMBIGUOUS_TARGET',
  );
});

test('checklist patching changes one semantic target and rejects zero/multiple matches', () => {
  const first = patchChecklistEntry('- [ ] #17 Finding', {
    reference: '#17',
    checked: true,
    append: '— https://example.test/pr/2',
  });
  assert.equal(first.body, '- [x] #17 Finding — https://example.test/pr/2');
  assert.equal(
    patchChecklistEntry(first.body, {
      reference: '#17',
      checked: true,
      append: '— https://example.test/pr/2',
    }).changed,
    false,
  );
  assert.throws(
    () => patchChecklistEntry('- [ ] #1 one', { reference: '#2' }),
    (error) => error.code === 'TARGET_NOT_FOUND',
  );
});

test('dry-run mutations emit redacted executable, argument vector, and stdin without running', async () => {
  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'issue-create',
    {
      repository: githubRepository,
      payload: { title: 'Finding', body: 'token=github_pat_secret', labels: ['important'] },
    },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, true);
  assert.equal(envelope.data.conditionalWriteAvailable, false);
  assert.equal(envelope.data.command.executable, 'gh');
  assert.ok(Array.isArray(envelope.data.command.args));
  assert.doesNotMatch(envelope.data.command.stdin, /github_pat_secret/);
  assert.equal(runner.calls.length, 0);
});

test('body mutation previews require a caller-supplied fresh body hash', async () => {
  const envelope = await executeOperation(
    'issue-update-body',
    { repository: githubRepository, number: 3, payload: { body: 'desired' } },
    { skipProbe: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
});

test('issue-comment-update builds the documented GitHub and Forgejo PATCH commands', () => {
  const github = buildCommandPlan(
    'issue-comment-update',
    { number: 17, commentId: 23, payload: { body: 'Updated plan' } },
    githubRepository,
  );
  assert.deepEqual(github.args, [
    'api',
    '-X',
    'PATCH',
    'repos/example/flow/issues/comments/23',
    '--input',
    '-',
  ]);
  assert.deepEqual(JSON.parse(github.stdin), { body: 'Updated plan' });

  const forgejo = buildCommandPlan(
    'issue-comment-update',
    { number: 17, commentId: 23, payload: { body: 'Updated plan' } },
    forgejoRepository,
  );
  assert.deepEqual(forgejo.args, [
    'api',
    'repos/team/flow/issues/17/comments/23',
    '--method',
    'PATCH',
    '--login',
    'work',
    '--repo',
    'team/flow',
    '--data',
    '@-',
  ]);
  assert.deepEqual(JSON.parse(forgejo.stdin), { body: 'Updated plan' });
});

test('issue-comment-update requires positive issue and comment IDs', () => {
  assert.throws(
    () =>
      buildCommandPlan(
        'issue-comment-update',
        { number: 0, commentId: 23, payload: { body: 'Updated plan' } },
        githubRepository,
      ),
    (error) => error.code === 'INVALID_REFERENCE' && error.details.field === 'issue number',
  );
  assert.throws(
    () =>
      buildCommandPlan(
        'issue-comment-update',
        { number: 17, commentId: -1, payload: { body: 'Updated plan' } },
        githubRepository,
      ),
    (error) => error.code === 'INVALID_REFERENCE' && error.details.field === 'commentId',
  );
});

test('issue-comment-update dry-run exposes the exact patch without executing it', async () => {
  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'issue-comment-update',
    {
      repository: githubRepository,
      number: 17,
      commentId: 23,
      expectedBodyHash: bodyHash('Old plan'),
      payload: { body: 'Updated plan' },
    },
    { runner, skipProbe: true },
  );

  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, true);
  assert.deepEqual(envelope.data.command.args.slice(0, 5), [
    'api',
    '-X',
    'PATCH',
    'repos/example/flow/issues/comments/23',
    '--input',
  ]);
  assert.equal(runner.calls.length, 0);
});

test('issue-comment-update re-reads by ID and applies when the body hash is fresh', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([[{ id: 23, body: 'Old plan', user: { login: 'maintainer' } }]]),
      stderr: '',
    },
    {
      status: 0,
      stdout: JSON.stringify({ id: 23, body: 'Updated plan', user: { login: 'maintainer' } }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'issue-comment-update',
    {
      repository: githubRepository,
      number: 17,
      commentId: 23,
      expectedBodyHash: bodyHash('Old plan'),
      payload: { body: 'Updated plan' },
    },
    { runner, skipProbe: true, apply: true },
  );

  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.result.id, 23);
  assert.equal(envelope.data.result.body, 'Updated plan');
  assert.equal(runner.calls.length, 2);
  assert.match(runner.calls[0].args.at(-1), /issues\/17\/comments$/);
  assert.match(runner.calls[1].args.join(' '), /issues\/comments\/23/);
});

test('issue-comment-update is idempotent when the desired body is already present', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([[{ id: 23, body: 'Updated plan' }]]),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'issue-comment-update',
    {
      repository: githubRepository,
      number: 17,
      commentId: 23,
      expectedBodyHash: bodyHash('Old plan'),
      payload: { body: 'Updated plan' },
    },
    { runner, skipProbe: true, apply: true },
  );

  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.unchanged, true);
  assert.equal(envelope.data.item.id, 23);
  assert.equal(runner.calls.length, 1);
});

test('issue-comment-update fails closed for stale and missing comments', async () => {
  const staleRunner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([[{ id: 23, body: 'Changed elsewhere' }]]),
      stderr: '',
    },
  ]);
  const stale = await executeOperation(
    'issue-comment-update',
    {
      repository: githubRepository,
      number: 17,
      commentId: 23,
      expectedBodyHash: bodyHash('Old plan'),
      payload: { body: 'Updated plan' },
    },
    { runner: staleRunner, skipProbe: true, apply: true },
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'STALE_WRITE');
  assert.equal(staleRunner.calls.length, 1);

  const missingRunner = fakeRunner([
    { status: 0, stdout: JSON.stringify([[{ id: 24, body: 'Other comment' }]]), stderr: '' },
  ]);
  const missing = await executeOperation(
    'issue-comment-update',
    {
      repository: githubRepository,
      number: 17,
      commentId: 23,
      expectedBodyHash: bodyHash('Old plan'),
      payload: { body: 'Updated plan' },
    },
    { runner: missingRunner, skipProbe: true, apply: true },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'TARGET_NOT_FOUND');
  assert.equal(missingRunner.calls.length, 1);
});

test('issue-comment-update aborts before writing when provider capability is unavailable', async () => {
  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'issue-comment-update',
    {
      repository: forgejoRepository,
      number: 17,
      commentId: 23,
      expectedBodyHash: bodyHash('Old plan'),
      payload: { body: 'Updated plan' },
      probe: { capabilities: { issueCommentUpdate: false } },
    },
    { runner, skipProbe: true, apply: true },
  );

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(envelope.error.details.capability, 'issueCommentUpdate');
  assert.equal(runner.calls.length, 0);
});

test('repository resolution distinguishes non-Git repositories and missing origins', async () => {
  const notGit = await executeOperation(
    'repository-resolve',
    {},
    {
      runner: fakeRunner([{ status: 128, stdout: '', stderr: 'not a repository' }]),
    },
  );
  assert.equal(notGit.error.code, 'NOT_GIT_REPOSITORY');

  const noOrigin = await executeOperation(
    'repository-resolve',
    {},
    {
      runner: fakeRunner([
        { status: 0, stdout: 'true\n', stderr: '' },
        { status: 2, stdout: '', stderr: 'No such remote' },
      ]),
    },
  );
  assert.equal(noOrigin.error.code, 'NO_ORIGIN');
});

test('applied body writes fail closed when the fresh body hash changed', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify({ number: 3, title: 'x', body: 'changed', labels: [] }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'issue-update-body',
    {
      repository: githubRepository,
      number: 3,
      expectedBodyHash: bodyHash('old'),
      payload: { body: 'desired' },
    },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'STALE_WRITE');
  assert.equal(runner.calls.length, 1);
});

test('already-applied body state is unchanged success without a write', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify({ number: 3, title: 'x', body: 'desired', labels: [] }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'issue-update-body',
    {
      repository: githubRepository,
      number: 3,
      expectedBodyHash: bodyHash('old'),
      payload: { body: 'desired' },
    },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.unchanged, true);
  assert.equal(runner.calls.length, 1);
});

test('a matching applied body write re-reads then mutates with no shell command', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify({ number: 3, title: 'x', body: 'old', labels: [] }),
      stderr: '',
    },
    {
      status: 0,
      stdout: JSON.stringify({ number: 3, title: 'x', body: 'desired', labels: [] }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'issue-update-body',
    {
      repository: githubRepository,
      number: 3,
      expectedBodyHash: bodyHash('old'),
      payload: { body: 'desired' },
    },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(runner.calls.length, 2);
  assert.equal(runner.calls[1].executable, 'gh');
  assert.equal('shell' in runner.calls[1], false);
  assert.deepEqual(runner.calls[1].args.slice(0, 4), [
    'api',
    '-X',
    'PATCH',
    'repos/example/flow/issues/3',
  ]);
});

test('GitHub reads expose ETags while writes accurately report non-atomic capability', async () => {
  const readRunner = fakeRunner([
    {
      status: 0,
      stdout:
        'HTTP/2 200 OK\netag: "version-1"\ncontent-type: application/json\n\n' +
        JSON.stringify({ number: 3, title: 'x', body: 'old', labels: [] }),
      stderr: '',
    },
  ]);
  const read = await executeOperation(
    'issue-read',
    { repository: githubRepository, number: 3 },
    { runner: readRunner, skipProbe: true },
  );
  assert.equal(read.ok, true);
  assert.equal(read.data.result.version, '"version-1"');
  assert.equal(readRunner.calls[0].args.includes('--include'), true);

  const writeRunner = fakeRunner([
    {
      status: 0,
      stdout:
        'HTTP/2 200 OK\netag: "version-1"\n\n' +
        JSON.stringify({ number: 3, title: 'x', body: 'old', labels: [] }),
      stderr: '',
    },
    {
      status: 0,
      stdout: JSON.stringify({ number: 3, title: 'x', body: 'desired', labels: [] }),
      stderr: '',
    },
  ]);
  const write = await executeOperation(
    'issue-update-body',
    {
      repository: githubRepository,
      number: 3,
      expectedBodyHash: bodyHash('old'),
      payload: { body: 'desired' },
      probe: { capabilities: { conditionalWrites: false } },
    },
    { runner: writeRunner, skipProbe: true, apply: true },
  );
  assert.equal(write.ok, true);
  assert.equal(writeRunner.calls[1].args.includes('If-Match: "version-1"'), false);
});

test('review-thread reads normalize file, line, author, text, and resolution', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: 'thread-1',
                    isResolved: false,
                    path: 'src/a.mjs',
                    line: 42,
                    comments: {
                      nodes: [
                        {
                          id: 'comment-1',
                          databaseId: 7,
                          body: 'Handle this case',
                          path: 'src/a.mjs',
                          line: 42,
                          createdAt: '2026-07-28T20:30:00Z',
                          author: { __typename: 'User', login: 'reviewer' },
                        },
                        {
                          id: 'comment-1-reply',
                          databaseId: 8,
                          body: 'Answered',
                          path: 'src/a.mjs',
                          line: 42,
                          createdAt: '2026-07-28T21:00:00Z',
                          author: { __typename: 'Bot', login: 'review-app[bot]' },
                        },
                      ],
                    },
                  },
                  {
                    id: 'thread-2',
                    isResolved: true,
                    path: 'src/b.mjs',
                    line: 7,
                    comments: {
                      nodes: [
                        {
                          id: 'comment-2',
                          body: 'Automated note',
                          path: 'src/b.mjs',
                          line: 7,
                          author: { __typename: 'Bot', login: 'review-app[bot]' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'review-threads-read',
    { repository: githubRepository, pullRequest: 2 },
    { runner, skipProbe: true },
  );
  assert.deepEqual(envelope.data.result[0], {
    id: 'thread-1',
    isResolved: false,
    path: 'src/a.mjs',
    line: 42,
    startLine: undefined,
    // The thread's own instant is its first comment's; the reply keeps its later one, because a bot
    // that answers after the head commit must count as newer than it.
    createdAt: '2026-07-28T20:30:00.000Z',
    comments: [
      {
        id: 'comment-1',
        databaseId: 7,
        body: 'Handle this case',
        author: { login: 'reviewer', isBot: false, authorType: 'human' },
        path: 'src/a.mjs',
        line: 42,
        startLine: undefined,
        createdAt: '2026-07-28T20:30:00.000Z',
      },
      {
        id: 'comment-1-reply',
        databaseId: 8,
        body: 'Answered',
        author: { login: 'review-app[bot]', isBot: true, authorType: 'bot' },
        path: 'src/a.mjs',
        line: 42,
        startLine: undefined,
        createdAt: '2026-07-28T21:00:00.000Z',
      },
    ],
  });
  assert.deepEqual(envelope.data.result[1].comments[0].author, {
    login: 'review-app[bot]',
    isBot: true,
    authorType: 'bot',
  });
  // The second thread's fixture states no timestamp, so neither it nor its comment invents one.
  assert.equal(Object.hasOwn(envelope.data.result[1], 'createdAt'), false);
  assert.equal(Object.hasOwn(envelope.data.result[1].comments[0], 'createdAt'), false);
  assert.match(runner.calls[0].stdin, /reviewThreads.*path line startLine/s);
  assert.match(runner.calls[0].stdin, /author\{__typename login\}/);
  // The timestamp has to be requested before it can be normalized.
  assert.match(runner.calls[0].stdin, /originalStartLine createdAt author/);
});

test('a flat review-thread record carries its timestamp on the thread and its comment', async () => {
  // The Forgejo shape has one record per thread instead of a comment list, so the same instant
  // describes both. A record without a timestamp still produces none.
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([
        {
          id: 5,
          body: 'Automated note',
          reviewer: { login: 'review-app[bot]' },
          path: 'src/a.mjs',
          line: 42,
          created_at: '2026-07-28T22:30:00+02:00',
        },
        {
          id: 6,
          body: 'Undated note',
          reviewer: { login: 'reviewer' },
          path: 'src/b.mjs',
          line: 1,
        },
      ]),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'review-threads-read',
    { repository: forgejoRepository, pullRequest: 2 },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.data.result[0].createdAt, '2026-07-28T20:30:00.000Z');
  assert.equal(envelope.data.result[0].comments[0].createdAt, '2026-07-28T20:30:00.000Z');
  assert.equal(Object.hasOwn(envelope.data.result[1], 'createdAt'), false);
  assert.equal(Object.hasOwn(envelope.data.result[1].comments[0], 'createdAt'), false);
});

test('provider probes normalize missing CLI, auth failure, and Forgejo capabilities', async () => {
  await assert.rejects(
    () =>
      probeProvider(
        { ...githubRepository },
        fakeRunner([{ status: null, error: { code: 'ENOENT' } }]),
      ),
    (error) => error.code === 'CLI_MISSING',
  );
  await assert.rejects(
    () =>
      probeProvider(
        { ...githubRepository },
        fakeRunner([
          { status: 0, stdout: 'gh version 2.70.0\n', stderr: '' },
          { status: 1, stdout: '', stderr: 'not logged in' },
        ]),
      ),
    (error) => error.code === 'AUTH_FAILED',
  );
  const github = await probeProvider(
    githubRepository,
    fakeRunner([
      { status: 0, stdout: 'gh version 2.70.0\n', stderr: '' },
      { status: 0, stdout: '', stderr: '' },
    ]),
  );
  assert.equal(github.capabilities.conditionalWrites, false);
  assert.equal(github.capabilities.reviewCreate, true);
  const forgejo = await probeProvider(
    { host: 'code.example.test', owner: 'team', repository: 'flow', provider: 'forgejo' },
    fakeRunner(teaProbeResults()),
  );
  assert.equal(forgejo.login, 'work');
  assert.equal(forgejo.capabilities.reviewThreads, true);
  assert.equal(forgejo.capabilities.reviewThreadResolution, true);
  assert.equal(forgejo.capabilities.reviewThreadReplies, false);
  assert.equal(forgejo.capabilities.reviewCreate, false);
  assert.equal(forgejo.capabilities.labelMigration, true);
});

test('Forgejo probe reports missing commands and flags as unsupported capabilities', async () => {
  const probe = await probeProvider(
    forgejoRepository,
    fakeRunner(
      teaProbeResults({
        issueLabelRemove: { status: 1, stdout: '', stderr: 'unknown flag' },
        pullResolve: { status: 1, stdout: '', stderr: 'unknown command' },
      }),
    ),
  );
  assert.equal(probe.capabilities.issueUpdate, true);
  assert.equal(probe.capabilities.issueLabelAdd, true);
  assert.equal(probe.capabilities.issueLabelRemove, false);
  assert.equal(probe.capabilities.labelMigration, false);
  assert.equal(probe.capabilities.pullRequestRead, true);
  assert.equal(probe.capabilities.reviewThreads, true);
  assert.equal(probe.capabilities.reviewThreadResolution, false);

  const envelope = await executeOperation(
    'issue-label-remove',
    {
      repository: forgejoRepository,
      number: 4,
      payload: { label: 'sf-fix' },
      probe,
    },
    { skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
});

test('Forgejo probes keep base reads and lists independent from comment flags', async () => {
  const probe = await probeProvider(
    forgejoRepository,
    fakeRunner(
      teaProbeResults({
        issueComments: { status: 1, stdout: '', stderr: 'unknown flag' },
        pullComments: { status: 1, stdout: '', stderr: 'unknown flag' },
      }),
    ),
  );
  assert.equal(probe.capabilities.issueRead, true);
  assert.equal(probe.capabilities.issueList, true);
  assert.equal(probe.capabilities.issueCommentsRead, false);
  assert.equal(probe.capabilities.pullRequestRead, true);
  assert.equal(probe.capabilities.pullRequestList, true);
  assert.equal(probe.capabilities.prCommentsRead, false);
});

test('Forgejo draft PR creation requires and uses a probed draft flag', async () => {
  const unsupportedProbe = await probeProvider(
    forgejoRepository,
    fakeRunner(
      teaProbeResults({
        pullCreateDraft: { status: 1, stdout: '', stderr: 'unknown flag' },
      }),
    ),
  );
  assert.equal(unsupportedProbe.capabilities.pullRequestCreate, true);
  assert.equal(unsupportedProbe.capabilities.pullRequestDraftCreate, false);

  const unsupported = await executeOperation(
    'pr-create',
    {
      repository: forgejoRepository,
      payload: { title: 'Draft', body: 'Body', head: 'topic', base: 'develop', draft: true },
      probe: unsupportedProbe,
    },
    { skipProbe: true },
  );
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(unsupported.error.details.capability, 'pullRequestDraftCreate');

  const topLevelUnsupported = await executeOperation(
    'pr-create',
    {
      repository: forgejoRepository,
      title: 'Draft',
      body: 'Body',
      head: 'topic',
      base: 'develop',
      draft: true,
      probe: unsupportedProbe,
    },
    { skipProbe: true },
  );
  assert.equal(topLevelUnsupported.ok, false);
  assert.equal(topLevelUnsupported.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(topLevelUnsupported.error.details.capability, 'pullRequestDraftCreate');

  const supported = await executeOperation(
    'pr-create',
    {
      repository: forgejoRepository,
      payload: { title: 'Draft', body: 'Body', head: 'topic', base: 'develop', draft: true },
      probe: {
        ...unsupportedProbe,
        capabilities: { ...unsupportedProbe.capabilities, pullRequestDraftCreate: true },
      },
    },
    { skipProbe: true },
  );
  assert.equal(supported.ok, true);
  assert.equal(supported.dryRun, true);
  assert.equal(supported.data.command.args.includes('--draft'), true);
});

test('provider probes distinguish old versions and missing JSON capability', async () => {
  await assert.rejects(
    () =>
      probeProvider(
        { ...githubRepository },
        fakeRunner([{ status: 0, stdout: 'gh version 1.9.0\n', stderr: '' }]),
      ),
    (error) => error.code === 'UNSUPPORTED_CAPABILITY' && error.details.capability === 'version',
  );
  await assert.rejects(
    () =>
      probeProvider(
        {
          host: 'code.example.test',
          owner: 'team',
          repository: 'flow',
          provider: 'forgejo',
        },
        fakeRunner([
          // Must stay at or above the tea floor so this case still proves the JSON capability
          // rather than tripping the earlier version check.
          { status: 0, stdout: 'Version: 0.14.2\n', stderr: '' },
          { status: 0, stdout: 'table output', stderr: '' },
        ]),
      ),
    (error) => error.code === 'UNSUPPORTED_CAPABILITY' && error.details.capability === 'json',
  );
  await assert.rejects(
    () =>
      probeProvider(
        {
          host: 'code.example.test',
          owner: 'team',
          repository: 'flow',
          provider: 'forgejo',
        },
        fakeRunner([{ status: 0, stdout: 'Version: 0.14.1\n', stderr: '' }]),
      ),
    (error) =>
      error.code === 'UNSUPPORTED_CAPABILITY' &&
      error.details.capability === 'version' &&
      error.details.installed === '0.14.1' &&
      error.details.minimum === '0.14.2',
  );
});

test('unsupported Forgejo review-thread operations return a structured error', async () => {
  const envelope = await executeOperation(
    'review-thread-resolve',
    {
      repository: {
        host: 'code.example.test',
        owner: 'team',
        repository: 'flow',
        provider: 'forgejo',
      },
      pullRequest: 1,
      threadId: 'thread',
      probe: { capabilities: { reviewThreadResolution: false } },
    },
    { skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
});

test('malformed provider JSON becomes INVALID_PAYLOAD', async () => {
  const envelope = await executeOperation(
    'issue-read',
    { repository: githubRepository, number: 4 },
    {
      skipProbe: true,
      runner: fakeRunner([{ status: 0, stdout: 'not json', stderr: '' }]),
    },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
});

test('redaction removes credentials recursively', () => {
  const redacted = redact({
    token: 'secret',
    body: 'Authorization: Bearer abc123',
    remote: 'https://alice:verysecret@github.com/example/flow.git',
  });
  assert.deepEqual(redacted, {
    token: '[REDACTED]',
    body: 'Authorization: Bearer [REDACTED]',
    remote: 'https://[REDACTED]@github.com/example/flow.git',
  });
});

test('structured parse failures redact URL userinfo', async () => {
  const envelope = await executeOperation('remote-parse', {
    remote: 'https://alice:verysecret@github.com/only-one-segment',
  });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.details.remote.includes('verysecret'), false);
  assert.match(envelope.error.details.remote, /\[REDACTED\]@github\.com/);
});

// `redact` runs over every command plan, including its stdin, so its input is whatever an issue or
// pull-request body carried — text the repository does not control. The pattern has two independent
// guards against backtracking, and one shape below catches the loss of each. Neither shape catches
// both, so removing either would be a silent half-fix without the pair.
//
// The time bound sits three to four orders of magnitude above the linear cost, so a loaded machine
// is very unlikely to fail it; quadratic behaviour is what it is built to catch. Both shapes are
// sized so the quadratic cost clears the bound by more than an order of magnitude — a thin margin
// would decay into a silent pass as machines get faster.
test('redaction stays linear on unbroken runs', () => {
  const shapes = {
    // Catches the loss of the lookbehind. No `://` ever matches here, so the whole cost is the
    // scheme prefix giving its run back one character at a time at every start position: ~7 s
    // without the lookbehind, ~1 ms with it.
    'plain run': 'x'.repeat(128_000),
    // Catches the return of the optional `(?::[^\s/@]*)?` after the userinfo. Here `://` does
    // match, and that group would let its `*` re-consume to the end at every backtrack step of the
    // preceding `+` over the same class: ~14 s with the group, ~1 ms without. Twice as long as it
    // needs to be to reproduce, for about 16 ms of suite time.
    'colon run': `a://${'x:'.repeat(128_000)}`,
  };
  for (const [name, input] of Object.entries(shapes)) {
    const startedAt = Date.now();
    redact(input);
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 1000, `redacting a ${name} took ${elapsed}ms`);
  }
});

// The cost bound above is satisfied by any pattern that stops matching, so it has to be paired
// with the coverage it must not buy back. Two shapes are the traps.
//
// The empty username is the first: excluding colons from the userinfo is the obvious way to break
// the quantifier overlap, and it silently stops redacting a password with no username in front of
// it.
//
// A long scheme is the second, and it is the one a reviewer caught here. Bounding the scheme is
// the obvious way to stop the prefix backtracking, and it stops redacting any scheme longer than
// the bound whose last characters hold no letter for the engine to restart from — while
// `parseRemote` goes on accepting that same string as a URL and funnelling it into an error
// envelope. The three long-scheme cases below cover exactly that: each one must survive any future
// attempt to reintroduce a bound.
//
// Both loops assert the whole output rather than a match. A `match` on `://[REDACTED]@` proves
// that *a* redaction happened somewhere and would accept an output that redacted one userinfo and
// left a second credential standing later in the string.
test('redaction keeps covering every URL userinfo shape', () => {
  for (const [remote, expected] of [
    [
      'https://alice:verysecret@github.com/example/flow.git',
      'https://[REDACTED]@github.com/example/flow.git',
    ],
    ['ssh://git@github.com/example/flow.git', 'ssh://[REDACTED]@github.com/example/flow.git'],
    ['git+ssh://user:pw@host/p', 'git+ssh://[REDACTED]@host/p'],
    ['mongodb+srv://u:p@cluster.example.com/db', 'mongodb+srv://[REDACTED]@cluster.example.com/db'],
    ['HTTPS://Alice:S3cret@GitHub.com/x', 'HTTPS://[REDACTED]@GitHub.com/x'],
    ['https://a:b:c@host/x', 'https://[REDACTED]@host/x'],
    ['https://:onlypass@host/x', 'https://[REDACTED]@host/x'],
    ['https://user:@host/x', 'https://[REDACTED]@host/x'],
    ['https://u:p@h/a@b', 'https://[REDACTED]@h/a@b'],
    [`${'a'.repeat(40)}://u:p@h/x`, `${'a'.repeat(40)}://[REDACTED]@h/x`],
    [`a${'0'.repeat(31)}://u:p@h/x`, `a${'0'.repeat(31)}://[REDACTED]@h/x`],
    [`a${'1'.repeat(33)}://user:secret@host`, `a${'1'.repeat(33)}://[REDACTED]@host`],
  ]) {
    assert.equal(redact(remote), expected);
  }
  for (const untouched of [
    'https://github.com/example/flow.git',
    'https://@host/x',
    'mailto:a@b.c',
    'no scheme user:pw@host',
  ]) {
    assert.equal(redact(untouched), untouched);
  }
});

test('CLI reads JSON stdin and returns stable success/error envelopes and exit codes', () => {
  const success = spawnSync(process.execPath, ['src/scripts/remote-tracker.mjs', 'remote-parse'], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify({ remote: 'git@github.com:example/flow.git' }),
    encoding: 'utf8',
  });
  assert.equal(success.status, 0);
  assert.deepEqual(Object.keys(JSON.parse(success.stdout)), [
    'ok',
    'operation',
    'provider',
    'data',
    'dryRun',
  ]);

  const failure = spawnSync(process.execPath, ['src/scripts/remote-tracker.mjs', 'remote-parse'], {
    cwd: new URL('..', import.meta.url),
    input: '{',
    encoding: 'utf8',
  });
  assert.notEqual(failure.status, 0);
  const envelope = JSON.parse(failure.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.equal(typeof envelope.error.retryable, 'boolean');
});

const prReviewMarker = '<!-- effective-flow-pr-review -->';

test('review-create builds a GitHub review submission with the pinned neutral event and inline comments', () => {
  const plan = buildCommandPlan(
    'review-create',
    {
      number: 7,
      payload: {
        body: 'Summary of findings',
        comments: [{ path: 'src/app.js', line: 12, side: 'LEFT', body: 'Comment text' }],
      },
    },
    githubRepository,
  );
  assert.deepEqual(plan.args, [
    'api',
    '-X',
    'POST',
    'repos/example/flow/pulls/7/reviews',
    '--input',
    '-',
  ]);
  assert.deepEqual(JSON.parse(plan.stdin), {
    body: `${prReviewMarker}\nSummary of findings`,
    event: 'COMMENT',
    comments: [
      { path: 'src/app.js', line: 12, side: 'LEFT', body: `${prReviewMarker}\nComment text` },
    ],
  });
});

test('review-create defaults an omitted comment side to RIGHT and coerces a digit-only string line', () => {
  const payload = buildReviewPayload({
    body: 'Summary',
    comments: [{ path: 'src/app.js', line: '15', body: 'Comment text' }],
  });
  assert.deepEqual(payload.comments, [
    { path: 'src/app.js', line: 15, side: 'RIGHT', body: `${prReviewMarker}\nComment text` },
  ]);
});

test('review-create accepts a body-only submission and defaults a missing comment array to empty', () => {
  // Both body-only cases the publication contract mandates: the explicit entry point posts a
  // summary even when nothing was found, and a finding outside the diff goes into the body.
  const summaryOnly = buildReviewPayload({ body: 'No findings in this review.' });
  assert.deepEqual(summaryOnly.comments, []);
  assert.equal(summaryOnly.event, 'COMMENT');
  assert.equal(summaryOnly.body, `${prReviewMarker}\nNo findings in this review.`);
  assert.deepEqual(buildReviewPayload({ body: 'Summary', comments: [] }).comments, []);

  const plan = buildCommandPlan(
    'review-create',
    { number: 7, payload: { body: 'No findings in this review.' } },
    githubRepository,
  );
  assert.deepEqual(JSON.parse(plan.stdin).comments, []);
});

test('review-create requires body text and rejects a comment array that is not an array', () => {
  for (const body of [undefined, '', '   ']) {
    assert.throws(
      () => buildReviewPayload({ body, comments: [{ path: 'src/app.js', line: 3, body: 'Text' }] }),
      (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.body',
      `body ${JSON.stringify(body)} must be rejected`,
    );
  }
  assert.throws(
    () => buildReviewPayload({ body: 'Summary', comments: 'not-an-array' }),
    (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.comments',
  );
});

test('review-create stamps the pr-review marker exactly once on the body and on every comment', () => {
  const payload = buildReviewPayload({
    body: `${prReviewMarker}\nSummary`,
    comments: [
      { path: 'src/app.js', line: 3, body: 'Fresh comment' },
      { path: 'src/app.js', line: 9, body: `${prReviewMarker}\nRebuilt comment` },
    ],
  });
  const occurrences = (text) => text.split(prReviewMarker).length - 1;
  assert.equal(occurrences(payload.body), 1);
  assert.equal(payload.body, `${prReviewMarker}\nSummary`);
  for (const comment of payload.comments) assert.equal(occurrences(comment.body), 1);
  assert.equal(payload.comments[0].body, `${prReviewMarker}\nFresh comment`);
  assert.equal(payload.comments[1].body, `${prReviewMarker}\nRebuilt comment`);

  // The marker is never hand-written into a body: it comes from the marker table, and the
  // iterate marker stays a separate kind so the two tools never read each other's output.
  assert.doesNotMatch(payload.body, /effective-flow-iterate/);
});

test('the Forgejo review fallback comment carries the pr-review marker, not the iterate marker', async () => {
  const envelope = await executeOperation('pr-review-comment-build', {
    body: 'src/app.js:12 — Finding text',
  });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.marker, 'effective-flow-pr-review');
  assert.equal(envelope.data.body, `${prReviewMarker}\nsrc/app.js:12 — Finding text`);
  assert.doesNotMatch(envelope.data.body, /effective-flow-iterate/);
});

test('a stamped marker opens the body, which is what a quote-reply cannot reproduce', async () => {
  // The merge gate's human-comment guard excludes an `iterate` reply inside a resolved thread by
  // its marker, because in manual mode the tool and the operator share one account and authorship
  // alone cannot separate them. That rule is only safe while the marker is the body's LEADING
  // line: both providers prefix a quoted body with `>`, so a quote-reply carries a copied marker
  // inside a blockquote where it no longer opens the body. If the helper ever appended the marker
  // instead, or tolerated it mid-body, any person could reproduce one by pressing quote and have
  // their own objection read as this tool's output.
  for (const kind of ['pr', 'pr-review']) {
    const operation = kind === 'pr' ? 'pr-comment-build' : 'pr-review-comment-build';
    const envelope = await executeOperation(operation, { body: 'first line\nsecond line' });
    assert.equal(envelope.ok, true);
    const [leading, ...rest] = envelope.data.body.split('\n');
    assert.equal(
      leading,
      `<!-- ${envelope.data.marker} -->`,
      `${operation} must stamp its marker as the body's first line`,
    );
    assert.deepEqual(rest, ['first line', 'second line']);
  }
});

test('an already-quoted marker is not treated as a stamp and does not suppress a new one', async () => {
  // A quote-reply body literally contains the marker behind a `>` prefix. The stamper's
  // idempotency check must not mistake that for an existing stamp, or a genuine reply quoting an
  // earlier one would go out unmarked and the guard would later read it as a human's.
  const quoted = '> <!-- effective-flow-iterate -->\n> earlier reply\n\nmy answer';
  const envelope = await executeOperation('pr-comment-build', { body: quoted });
  assert.equal(envelope.ok, true);
  assert.ok(
    envelope.data.body.startsWith('<!-- effective-flow-iterate -->\n>'),
    'a body whose only marker is quoted must still receive its own leading stamp',
  );
});

test('review-thread-reply stamps the iterate marker as the reply body’s leading line', () => {
  // The marker contract states that these markers are never written by hand, but this operation
  // used to pass the caller's body through untouched — no payload builder involved — while
  // `iterate` was told to "use the marker". The merge gate matches it as an exact string, so an
  // unstamped reply came back on the next run as a human comment and blocked the merge on this
  // tool's own output.
  const plan = buildCommandPlan(
    'review-thread-reply',
    { number: 7, commentId: 42, payload: { body: 'Fixed in the latest commit.' } },
    githubRepository,
  );
  assert.deepEqual(plan.args, [
    'api',
    '-X',
    'POST',
    'repos/example/flow/pulls/7/comments/42/replies',
    '--input',
    '-',
  ]);
  assert.deepEqual(JSON.parse(plan.stdin), {
    body: '<!-- effective-flow-iterate -->\nFixed in the latest commit.',
  });
});

test('review-thread-reply stamps the iterate marker exactly once and never the pr-review marker', () => {
  // Idempotency: a caller that already built its body through the `pr` payload builder must not
  // collect a second marker. And the direction matters — stamping the pr-review marker here would
  // make `iterate` read foreign replies as its own already-processed work.
  const preStamped = buildCommandPlan(
    'review-thread-reply',
    {
      number: 7,
      commentId: 42,
      payload: { body: '<!-- effective-flow-iterate -->\nAlready stamped.' },
    },
    githubRepository,
  );
  const body = JSON.parse(preStamped.stdin).body;
  assert.equal(body, '<!-- effective-flow-iterate -->\nAlready stamped.');
  assert.equal(body.match(/<!-- effective-flow-iterate -->/g).length, 1);
  assert.doesNotMatch(body, /effective-flow-pr-review/);

  // A quoted marker is not a stamp: it sits behind a `>` and no longer opens the body, so the
  // reply still needs its own leading one.
  const quoted = buildCommandPlan(
    'review-thread-reply',
    {
      number: 7,
      commentId: 42,
      payload: { body: '> <!-- effective-flow-iterate -->\n> earlier reply\n\nmy answer' },
    },
    githubRepository,
  );
  assert.ok(
    JSON.parse(quoted.stdin).body.startsWith('<!-- effective-flow-iterate -->\n>'),
    'a reply whose only marker is quoted must still receive its own leading stamp',
  );
});

test('review-thread-reply rejects an empty body instead of publishing a marker-only reply', () => {
  for (const body of [undefined, '', '   ']) {
    assert.throws(
      () =>
        buildCommandPlan(
          'review-thread-reply',
          { number: 7, commentId: 42, payload: { body } },
          githubRepository,
        ),
      (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.body',
      `body ${JSON.stringify(body)} must be rejected`,
    );
  }
});

test('review-create on Forgejo fails with UNSUPPORTED_CAPABILITY and performs no runner call', async () => {
  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'review-create',
    {
      repository: forgejoRepository,
      number: 7,
      payload: {
        body: 'Summary',
        comments: [{ path: 'src/app.js', line: 1, body: 'Comment text' }],
      },
    },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(runner.calls.length, 0);
});

test('review-create payload validation fails closed with INVALID_PAYLOAD before any request is planned', () => {
  assert.throws(
    () =>
      buildReviewPayload({
        body: 'Summary',
        comments: [{ line: 3, body: 'Comment text' }],
      }),
    (error) =>
      error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.comments[0].path',
  );
  assert.throws(
    () =>
      buildReviewPayload({
        body: 'Summary',
        comments: [{ path: 'src/app.js', line: 'not-a-number', body: 'Comment text' }],
      }),
    (error) =>
      error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.comments[0].line',
  );
  assert.throws(
    () =>
      buildReviewPayload({
        body: 'Summary',
        comments: [{ path: 'src/app.js', line: 3, side: 'UP', body: 'Comment text' }],
      }),
    (error) =>
      error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.comments[0].side',
  );
  assert.throws(
    () =>
      buildReviewPayload({
        body: 'Summary',
        comments: [{ path: 'src/app.js', line: 3, body: '   ' }],
      }),
    (error) =>
      error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.comments[0].body',
  );
});

test('review-create validates through the executor before the runner is reached', async () => {
  // The real path, not the payload builder in isolation: an invalid payload must surface as the
  // INVALID_PAYLOAD envelope and must not have planned, previewed, or issued a single request.
  const runner = fakeRunner([{ status: 0, stdout: '{}', stderr: '' }]);
  const envelope = await executeOperation(
    'review-create',
    {
      repository: githubRepository,
      number: 7,
      payload: {
        body: '   ',
        comments: [{ path: 'src/app.js', line: 3, body: 'Comment text' }],
      },
    },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.equal(envelope.error.details.field, 'payload.body');
  assert.equal(runner.calls.length, 0);

  const badLine = fakeRunner([{ status: 0, stdout: '{}', stderr: '' }]);
  const lineEnvelope = await executeOperation(
    'review-create',
    {
      repository: githubRepository,
      number: 7,
      payload: {
        body: 'Summary',
        comments: [{ path: 'src/app.js', line: 0, body: 'Comment text' }],
      },
    },
    { runner: badLine, skipProbe: true, apply: true },
  );
  assert.equal(lineEnvelope.ok, false);
  assert.equal(lineEnvelope.error.code, 'INVALID_PAYLOAD');
  assert.equal(lineEnvelope.error.details.field, 'payload.comments[0].line');
  assert.equal(badLine.calls.length, 0);
});

test('review-create rejects generation attribution in the review body and in a comment body', () => {
  assert.throws(
    () =>
      buildReviewPayload({
        body: 'Summary\n\nGenerated with Claude Code',
        comments: [{ path: 'src/app.js', line: 3, body: 'Comment text' }],
      }),
    (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.body',
  );
  assert.throws(
    () =>
      buildReviewPayload({
        body: 'Summary',
        comments: [
          { path: 'src/app.js', line: 3, body: 'Comment text\n\nCo-Authored-By: Someone <a@b.c>' },
        ],
      }),
    (error) =>
      error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.comments[0].body',
  );
});

test('review-create redacts a forge token in the dry-run preview while keeping stdin approvable', async () => {
  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'review-create',
    {
      repository: githubRepository,
      number: 7,
      payload: {
        body: 'Summary — leaked ghp_ABCDEF1234567890abcdef while pasting',
        comments: [
          { path: 'src/app.js', line: 3, body: 'Comment with github_pat_11ABCDEFG0abcdefghij' },
        ],
      },
    },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, true);
  assert.equal(runner.calls.length, 0);

  // The preview keeps stdin: the user has to see the exact body to approve the write.
  const { stdin } = envelope.data.command;
  assert.equal(typeof stdin, 'string');
  const previewed = JSON.parse(stdin);
  assert.equal(previewed.body.includes('ghp_'), false);
  assert.match(previewed.body, /Summary — leaked \[REDACTED\] while pasting/);
  assert.equal(previewed.comments[0].body.includes('github_pat_'), false);
  assert.match(previewed.comments[0].body, /Comment with \[REDACTED\]/);
  assert.match(previewed.comments[0].body, /effective-flow-pr-review/);
});

test('review-create rejects an APPROVE or REQUEST_CHANGES event so the tool never issues a verdict', () => {
  for (const event of ['APPROVE', 'REQUEST_CHANGES']) {
    assert.throws(
      () =>
        buildReviewPayload({
          body: 'Summary',
          event,
          comments: [{ path: 'src/app.js', line: 3, body: 'Comment text' }],
        }),
      (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.event',
    );
  }
});

test('review-create dry-run previews the command and only mutates with apply: true', async () => {
  const input = {
    repository: githubRepository,
    number: 7,
    payload: {
      body: 'Summary',
      comments: [{ path: 'src/app.js', line: 3, body: 'Comment text' }],
    },
  };
  const previewRunner = fakeRunner([]);
  const preview = await executeOperation('review-create', input, {
    runner: previewRunner,
    skipProbe: true,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.data.command.executable, 'gh');
  assert.ok(Array.isArray(preview.data.command.args));
  assert.equal(previewRunner.calls.length, 0);

  const appliedRunner = fakeRunner([{ status: 0, stdout: '{}', stderr: '' }]);
  const applied = await executeOperation('review-create', input, {
    runner: appliedRunner,
    skipProbe: true,
    apply: true,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.dryRun, false);
  assert.equal(appliedRunner.calls.length, 1);

  // The request that actually went out: the reviews endpoint of PR 7, the pinned neutral event.
  const [call] = appliedRunner.calls;
  assert.equal(call.executable, 'gh');
  assert.deepEqual(call.args, [
    'api',
    '-X',
    'POST',
    'repos/example/flow/pulls/7/reviews',
    '--input',
    '-',
  ]);
  const submitted = JSON.parse(call.stdin);
  assert.equal(submitted.event, 'COMMENT');
  assert.equal(submitted.comments.length, 1);
  assert.equal(submitted.comments[0].path, 'src/app.js');
  assert.equal(submitted.comments[0].line, 3);
});

// The pull-request gate reports the repository slug in every envelope, so its cases carry one.
const gateRepository = { ...githubRepository, slug: 'example/flow' };
const verifiedHead = 'a'.repeat(40);
const movedHead = 'b'.repeat(40);
const earlierHead = 'c'.repeat(40);
const headCommittedAt = '2026-07-28T20:01:19Z';

// Builds the GraphQL envelope `pr-status-read` reads: one query, `data.repository.pullRequest`,
// with the head commit's own instant and its check rollup nested under a single `commits(last:1)`
// selection so the two describe the same instant as the merge state next to them.
// `commits` and `statusCheckRollup` are handled apart from the flat `...overrides` spread because
// they no longer live at the top level of the provider record; every other field still does, and a
// value explicitly set to `undefined` there is still dropped by `JSON.stringify` exactly as before,
// so "the provider states no draft flag" keeps meaning what it always meant.
function prStatusStdout(headRefOid = verifiedHead, overrides = {}) {
  const { commits, statusCheckRollup, totalCount, ...rest } = overrides;
  // `commits(last:1)` returns exactly one node, so the fixture defaults to exactly one — the head
  // commit itself, named by `oid` rather than by its place in a list gh could otherwise paginate.
  const commitList = Object.prototype.hasOwnProperty.call(overrides, 'commits')
    ? commits
    : [{ oid: headRefOid, committedDate: headCommittedAt }];
  // `null` is the real GraphQL shape for "the provider has nothing to report here" — distinct from
  // an empty `contexts.nodes`, which says the rollup exists and is simply empty.
  const rollup =
    statusCheckRollup === null
      ? null
      : {
          contexts: {
            totalCount: totalCount ?? (statusCheckRollup ?? []).length,
            nodes: statusCheckRollup ?? [],
          },
        };
  const nodes = Array.isArray(commitList)
    ? commitList.map((commit, index) => ({
        commit: index === commitList.length - 1 ? { ...commit, statusCheckRollup: rollup } : commit,
      }))
    : [];
  return JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 12,
          title: 'feat: add the gate',
          state: 'OPEN',
          isDraft: false,
          headRefOid,
          baseRefName: 'develop',
          mergeStateStatus: 'BLOCKED',
          mergeable: 'MERGEABLE',
          url: 'https://github.com/example/flow/pull/12',
          ...rest,
          commits: { nodes },
        },
      },
    },
  });
}

test('pr-status-read reads head, base, merge state, and checks in a single GitHub call', async () => {
  const plan = buildCommandPlan('pr-status-read', { number: 12 }, githubRepository);
  assert.equal(plan.executable, 'gh');
  // One GraphQL call, not `gh pr view --json` plus a second request for requiredness: only a query
  // that can carry `isRequired` alongside the merge state keeps "checks and mergeability read at one
  // instant" true, the same invariant the REST-era read was pinned to guard.
  assert.deepEqual(plan.args.slice(0, 2), ['api', 'graphql']);
  assert.deepEqual(plan.args.slice(-2), ['--input', '-']);
  const payload = JSON.parse(plan.stdin);
  assert.equal(typeof payload.query, 'string');
  assert.deepEqual(payload.variables, { owner: 'example', repo: 'flow', number: 12 });
  for (const field of [
    'baseRefName',
    'headRefOid',
    'isDraft',
    'mergeStateStatus',
    'mergeable',
    'state',
    // The head commit's timestamp and its check rollup come out of this same selection; a second
    // request would describe a different instant than the merge state it is correlated with.
    'commits',
    'committedDate',
    'statusCheckRollup',
    'contexts',
    'totalCount',
    // The one field the old `--json` projection could never expose at all.
    'isRequired',
  ]) {
    assert.ok(payload.query.includes(field), `query does not request ${field}`);
  }
  // Both inline-fragment shapes the rollup can hand back must carry `isRequired`, or a caller that
  // landed on the plain `StatusContext` fragment would silently lose requiredness the `CheckRun`
  // fragment does report.
  assert.match(payload.query, /CheckRun[^{]*\{[^}]*isRequired/);
  assert.match(payload.query, /StatusContext[^{]*\{[^}]*isRequired/);

  assert.deepEqual(
    buildCommandPlan(
      'pr-status-read',
      { number: 12 },
      { ...githubRepository, host: 'code.example.test' },
    ).args.slice(0, 4),
    ['api', '--hostname', 'code.example.test', 'graphql'],
  );

  const runner = fakeRunner([
    {
      status: 0,
      stdout: prStatusStdout(verifiedHead, {
        statusCheckRollup: [
          {
            __typename: 'CheckRun',
            name: 'unit',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            detailsUrl: 'https://github.com/example/flow/actions/runs/1',
          },
          {
            __typename: 'CheckRun',
            name: 'lint',
            status: 'IN_PROGRESS',
            conclusion: null,
            detailsUrl: '',
          },
          {
            __typename: 'StatusContext',
            context: 'ci/legacy',
            state: 'FAILURE',
            targetUrl: 'https://ci.example.test/9',
          },
        ],
      }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, false);
  assert.deepEqual(envelope.data.result, {
    number: 12,
    repository: 'example/flow',
    // The squash subject is the release signal, so the same read carries the title.
    title: 'feat: add the gate',
    state: 'open',
    draft: false,
    headSha: verifiedHead,
    // Canonical UTC, so a caller can compare it against a comment timestamp as a plain string.
    headCommittedAt: '2026-07-28T20:01:19.000Z',
    baseRef: 'develop',
    mergeState: 'BLOCKED',
    mergeable: 'MERGEABLE',
    url: 'https://github.com/example/flow/pull/12',
    checksReported: true,
    checkCount: 3,
    checks: [
      {
        name: 'unit',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: 'https://github.com/example/flow/actions/runs/1',
      },
      { name: 'lint', status: 'PENDING' },
      {
        name: 'ci/legacy',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
        url: 'https://ci.example.test/9',
      },
    ],
  });
});

test('the check list states a required flag only where the provider exposes one', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: prStatusStdout(verifiedHead, {
        mergeStateStatus: undefined,
        mergeable: undefined,
        // The GraphQL rollup is the one read that exposes `isRequired` per context at all: the first
        // entry stands for a context the query asked about but the provider stated nothing for, the
        // second and third for the two answers the same query can hand back for the same field.
        statusCheckRollup: [
          { __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS' },
          {
            __typename: 'CheckRun',
            name: 'gate',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            isRequired: true,
          },
          {
            __typename: 'StatusContext',
            context: 'ci/optional',
            state: 'SUCCESS',
            isRequired: false,
          },
        ],
      }),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.equal(Object.hasOwn(envelope.data.result.checks[0], 'required'), false);
  assert.equal(envelope.data.result.checks[1].required, true);
  assert.equal(envelope.data.result.checks[2].required, false);
  assert.equal(Object.hasOwn(envelope.data.result, 'mergeState'), false);
  assert.equal(Object.hasOwn(envelope.data.result, 'mergeable'), false);
});

async function statusFrom(overrides) {
  const envelope = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([
        { status: 0, stdout: prStatusStdout(verifiedHead, overrides), stderr: '' },
      ]),
      skipProbe: true,
    },
  );
  return envelope.data.result;
}

test('the head commit timestamp is matched by object name, not by position', async () => {
  // The bot-freshness precondition compares a reviewer's comment against this value, so it must
  // belong to the commit that is about to be merged and to no other.
  assert.equal((await statusFrom({})).headCommittedAt, '2026-07-28T20:01:19.000Z');

  // `commits(last:1)` returns exactly one node instead of a paginated list, but the timestamp is
  // still attached by comparing that node's `oid` against `headRefOid` rather than assumed from its
  // position: a provider inconsistency between the two fields must not silently certify a stale
  // instant as belonging to the commit that is about to be merged.
  const mismatched = await statusFrom({
    commits: [{ oid: earlierHead, committedDate: '2026-07-28T09:00:00Z' }],
  });
  assert.equal(Object.hasOwn(mismatched, 'headCommittedAt'), false);
  assert.equal(mismatched.headSha, verifiedHead);
  // The rollup is selected by the same match, because a check list belonging to an earlier commit
  // is the more dangerous of the two values: reported as the head's it would let "all checks green"
  // pass on checks the commit about to be merged never ran.
  assert.equal(mismatched.checksReported, false);

  // An omitted or empty `commits` selection carries no timestamp either.
  for (const commits of [undefined, []]) {
    assert.equal(Object.hasOwn(await statusFrom({ commits }), 'headCommittedAt'), false);
  }
  assert.equal(
    Object.hasOwn(await statusFrom({ commits: [{ oid: verifiedHead }] }), 'headCommittedAt'),
    false,
  );

  // An offset-form instant is re-emitted in UTC, so comparing it against a `Z` timestamp as a
  // string cannot order the two wrongly.
  const offsetForm = await statusFrom({
    commits: [{ oid: verifiedHead, committedDate: '2026-07-28T22:01:19+02:00' }],
  });
  assert.equal(offsetForm.headCommittedAt, '2026-07-28T20:01:19.000Z');
});

test('a directly stated head timestamp outranks the object-name match', async () => {
  // The query selects no top-level timestamp, so today nothing can produce this shape; the field
  // reaches the record only if someone adds one to `PR_STATUS_QUERY` or to the flattener as a
  // convenience. This case pins what happens at that moment: the stated value is taken as it is and
  // the `oid` comparison below it never runs, so head verification would disappear without any other
  // test noticing. The read stays the merge gate's evidence, so that precedence must be a decision
  // somebody makes deliberately rather than a side effect of adding a field.
  const stated = await statusFrom({
    headCommittedAt: '2026-07-28T09:00:00Z',
    commits: [{ oid: earlierHead, committedDate: '2026-07-27T09:00:00Z' }],
  });
  assert.equal(stated.headSha, verifiedHead);
  assert.equal(stated.headCommittedAt, '2026-07-28T09:00:00.000Z');
  // The rollup is still chosen by the `oid` match, so the very same read reports no checks while
  // handing back a timestamp for a commit it never identified — the asymmetry this precedence
  // creates, stated here so it cannot be introduced unnoticed.
  assert.equal(stated.checksReported, false);
});

test('comment reads carry the provider timestamp and omit it when unstated', async () => {
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([
        {
          id: 7,
          body: 'Automated note',
          user: { login: 'review-app[bot]' },
          html_url: 'https://github.com/example/flow/pull/12#issuecomment-7',
          created_at: '2026-07-28T20:30:00Z',
        },
        { id: 8, body: 'Older note', user: { login: 'reviewer' } },
      ]),
      stderr: '',
    },
  ]);
  const envelope = await executeOperation(
    'pr-comments-read',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.data.result[0].createdAt, '2026-07-28T20:30:00.000Z');
  // Absent, not defaulted: a comment without a timestamp cannot prove it belongs to this head.
  assert.equal(Object.hasOwn(envelope.data.result[1], 'createdAt'), false);

  // The Gitea spelling and its local offset resolve to the same canonical instant.
  const forgejo = await executeOperation(
    'issue-comments-read',
    { repository: forgejoRepository, number: 12 },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout: JSON.stringify({
            comments: [{ id: 3, body: 'Note', created: '2026-07-28T22:30:00+02:00' }],
          }),
          stderr: '',
        },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(forgejo.data.result[0].createdAt, '2026-07-28T20:30:00.000Z');
});

test('an empty check list is reported as empty and never as complete', async () => {
  // The head has no runs attached yet — the state right after a fix push. "No checks" and "all
  // checks green" must not collapse into the same answer.
  const status = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([
        { status: 0, stdout: prStatusStdout(verifiedHead, { statusCheckRollup: [] }), stderr: '' },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(status.data.result.checksReported, true);
  assert.equal(status.data.result.checkCount, 0);
  assert.deepEqual(status.data.result.checks, []);

  // A provider that reports the rollup itself as `null` is a third state again — the real GraphQL
  // shape for "nothing to report here" — and is reported as such.
  const withoutRollup = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout: prStatusStdout(verifiedHead, { statusCheckRollup: null }),
          stderr: '',
        },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(withoutRollup.data.result.checksReported, false);
  assert.equal(withoutRollup.data.result.checkCount, 0);

  const wait = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12 },
    {
      // The watch step's own result is discarded except for its timeout signal, so its exact shape
      // does not matter here — only the read step's empty array does.
      runner: fakeRunner([
        { status: 0, stdout: '', stderr: '' },
        { status: 0, stdout: '[]', stderr: '' },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(wait.ok, true);
  assert.equal(wait.data.result.timedOut, false);
  // The load-bearing assertion: `every` over an empty list is vacuously true, and a gate that
  // believed it would merge a commit whose CI never ran.
  assert.equal(wait.data.result.complete, false);
  assert.equal(wait.data.result.checksReported, true);
  assert.equal(wait.data.result.checkCount, 0);
  // This is a different fact from "no required checks are defined": here gh queried checks
  // successfully and reported none attached yet, so `requiredChecksDefined` must not appear —
  // that discriminator is reserved for the detected no-required-checks case.
  assert.equal('requiredChecksDefined' in wait.data.result, false);
});

test('a rollup whose totalCount exceeds its returned nodes fails closed instead of merging on a partial list', async () => {
  // `contexts(first:100)` can itself be paginated on a pull request with more than a hundred
  // contexts. A caller that evaluated "all checks green" against a page that silently dropped
  // contexts would merge a commit whose actual check list it never saw in full, so a `totalCount`
  // ahead of the returned nodes has to fail the read outright rather than report a plausible-looking
  // partial list.
  const truncated = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout: prStatusStdout(verifiedHead, {
            statusCheckRollup: [
              { __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS' },
            ],
            totalCount: 2,
          }),
          stderr: '',
        },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(truncated.ok, false);
  assert.equal(truncated.error.code, 'INVALID_PAYLOAD');
  // Both numbers the mismatch is between, so the failure names what it saw and what it was told.
  assert.equal(truncated.error.details.totalCount, 2);
  assert.equal(truncated.error.details.returnedCount, 1);

  // The equal-counts case is the ordinary one and must keep succeeding.
  const complete = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([
        {
          status: 0,
          stdout: prStatusStdout(verifiedHead, {
            statusCheckRollup: [
              { __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS' },
            ],
            totalCount: 1,
          }),
          stderr: '',
        },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(complete.ok, true);
  assert.equal(complete.data.result.checkCount, 1);
});

test('a status read carrying GraphQL errors is refused even when it also carries data', async () => {
  // GraphQL answers a partial failure with both halves at once: `data` for the fields that resolved
  // and `errors` for the ones that did not. Reading such a response as a clean payload would let the
  // merge gate decide on a check list the provider never finished assembling, and nothing in this
  // repository pins that `gh` exits non-zero for it, so the envelope has to state the failure on its
  // own evidence.
  const clean = JSON.parse(prStatusStdout(verifiedHead, { statusCheckRollup: [] }));
  const readWith = (extra) =>
    executeOperation(
      'pr-status-read',
      { repository: gateRepository, number: 12 },
      {
        runner: fakeRunner([
          { status: 0, stdout: JSON.stringify({ ...clean, ...extra }), stderr: '' },
        ]),
        skipProbe: true,
      },
    );

  const partial = await readWith({
    errors: [
      { message: 'API rate limit exceeded for installation ID 42' },
      { type: 'FORBIDDEN', message: 'Resource not accessible by integration' },
    ],
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.error.code, 'INVALID_PAYLOAD');
  // The provider's own wording travels with the failure, so a caller can tell a rate limit from a
  // permission problem without a second read.
  assert.deepEqual(partial.error.details.messages, [
    'API rate limit exceeded for installation ID 42',
    'Resource not accessible by integration',
  ]);

  // An empty `errors` array is not a failure, and refusing it would turn a perfectly good read into
  // a blocked merge.
  const stated = await readWith({ errors: [] });
  assert.equal(stated.ok, true);
  assert.equal(stated.data.result.headSha, verifiedHead);
});

test('a missing draft flag stays missing instead of defaulting to mergeable', async () => {
  const envelope = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([
        { status: 0, stdout: prStatusStdout(verifiedHead, { isDraft: undefined }), stderr: '' },
      ]),
      skipProbe: true,
    },
  );
  assert.equal(Object.hasOwn(envelope.data.result, 'draft'), false);

  for (const [reported, expected] of [
    [true, true],
    [false, false],
  ]) {
    const stated = await executeOperation(
      'pr-status-read',
      { repository: gateRepository, number: 12 },
      {
        runner: fakeRunner([
          { status: 0, stdout: prStatusStdout(verifiedHead, { isDraft: reported }), stderr: '' },
        ]),
        skipProbe: true,
      },
    );
    assert.equal(stated.data.result.draft, expected);
  }
});

test('the GitHub probe ties the gate capabilities to the gh version the flags need', async () => {
  const probeAt = async (version) =>
    probeProvider(
      githubRepository,
      fakeRunner([
        { status: 0, stdout: `gh version ${version}\n`, stderr: '' },
        { status: 0, stdout: '', stderr: '' },
      ]),
    );

  // `gh pr checks --json` arrived in gh 2.50.0 and is the newest of the four flags the gate needs.
  const tooOld = await probeAt('2.49.2');
  assert.equal(tooOld.capabilities.pullRequestStatus, false);
  assert.equal(tooOld.capabilities.pullRequestChecksWait, false);
  assert.equal(tooOld.capabilities.pullRequestMerge, false);
  // Everything the older line does support keeps working; only the gate degrades.
  assert.equal(tooOld.capabilities.pullRequestRead, true);
  assert.equal(tooOld.capabilities.reviewCreate, true);

  for (const version of ['2.50.0', '2.70.0', '3.0.0']) {
    const supported = await probeAt(version);
    assert.equal(supported.capabilities.pullRequestStatus, true);
    assert.equal(supported.capabilities.pullRequestChecksWait, true);
    assert.equal(supported.capabilities.pullRequestMerge, true);
  }

  // An old gh reports the honest reason instead of dying on an unknown flag mid-merge.
  const envelope = await executeOperation(
    'pr-merge',
    {
      repository: gateRepository,
      number: 12,
      probe: tooOld,
      payload: { method: 'squash', expectedHeadSha: verifiedHead },
    },
    { runner: fakeRunner([]), skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(envelope.error.details.capability, 'pullRequestMerge');
});

test('pr-merge builds the GitHub merge command with the method flag and the expected head', () => {
  const plan = buildCommandPlan(
    'pr-merge',
    { number: 12, payload: { method: 'squash', expectedHeadSha: verifiedHead } },
    githubRepository,
  );
  assert.deepEqual(plan.args, [
    'pr',
    'merge',
    '12',
    '--repo',
    'example/flow',
    '--squash',
    '--match-head-commit',
    verifiedHead,
  ]);
  assert.equal(plan.expectsJson, false);

  for (const [method, flag] of [
    ['merge', '--merge'],
    ['rebase', '--rebase'],
  ]) {
    const methodPlan = buildCommandPlan(
      'pr-merge',
      { number: 12, payload: { method, expectedHeadSha: verifiedHead } },
      githubRepository,
    );
    assert.ok(methodPlan.args.includes(flag));
  }

  assert.throws(
    () =>
      buildCommandPlan(
        'pr-merge',
        { number: 12, payload: { method: 'fast-forward', expectedHeadSha: verifiedHead } },
        githubRepository,
      ),
    (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.method',
  );
  assert.throws(
    () =>
      buildCommandPlan(
        'pr-merge',
        { number: 12, payload: { method: 'squash', expectedHeadSha: 'aaaaaaa' } },
        githubRepository,
      ),
    (error) =>
      error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.expectedHeadSha',
  );
});

test('a squash merge pins its subject so the published one cannot diverge', () => {
  // With `squash_merge_commit_title: COMMIT_OR_PR_TITLE` GitHub may publish the single commit's
  // subject instead of the verified pull-request title, and release-please reads that subject.
  const plan = buildCommandPlan(
    'pr-merge',
    {
      number: 12,
      payload: {
        method: 'squash',
        subject: 'feat: add the gate',
        expectedHeadSha: verifiedHead,
      },
    },
    githubRepository,
  );
  assert.deepEqual(plan.args.slice(5), [
    '--squash',
    '--subject',
    'feat: add the gate',
    '--match-head-commit',
    verifiedHead,
  ]);

  // Omitting it stays valid and adds no flag.
  assert.equal(
    buildCommandPlan(
      'pr-merge',
      { number: 12, payload: { method: 'squash', expectedHeadSha: verifiedHead } },
      githubRepository,
    ).args.includes('--subject'),
    false,
  );

  // A subject for a method that publishes no release signal is a caller mistake, not a no-op.
  for (const method of ['merge', 'rebase']) {
    assert.throws(
      () =>
        buildCommandPlan(
          'pr-merge',
          { number: 12, payload: { method, subject: 'feat: x', expectedHeadSha: verifiedHead } },
          githubRepository,
        ),
      (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === 'payload.subject',
    );
  }

  for (const subject of ['', '   ', 'feat: x\n\nGenerated with Claude Code']) {
    assert.throws(
      () =>
        buildCommandPlan(
          'pr-merge',
          {
            number: 12,
            payload: { method: 'squash', subject, expectedHeadSha: verifiedHead },
          },
          githubRepository,
        ),
      (error) => error.code === 'INVALID_PAYLOAD',
    );
  }
});

test('pr-merge without an expected head SHA fails before anything is planned or sent', async () => {
  for (const payload of [
    { method: 'squash' },
    { method: 'squash', expectedHeadSha: '' },
    { method: 'squash', expectedHeadSha: null },
  ]) {
    const runner = fakeRunner([]);
    const envelope = await executeOperation(
      'pr-merge',
      { repository: gateRepository, number: 12, payload },
      { runner, skipProbe: true, apply: true },
    );
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
    // The guard is never allowed to become "merge whatever head we just read".
    assert.equal(runner.calls.length, 0);
  }
});

test('a failed merge is reported as possibly applied and never as retryable', async () => {
  const runner = fakeRunner([
    { status: 0, stdout: prStatusStdout(verifiedHead), stderr: '' },
    { status: 1, stdout: '', stderr: 'connection reset by peer' },
  ]);
  const envelope = await executeOperation(
    'pr-merge',
    {
      repository: gateRepository,
      number: 12,
      payload: { method: 'squash', expectedHeadSha: verifiedHead },
    },
    { runner, skipProbe: true, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'COMMAND_FAILED');
  // The forge may have accepted the merge before the connection dropped, so the caller must
  // re-read instead of firing a second merge at an unverified state.
  assert.equal(envelope.error.retryable, false);
  assert.equal(envelope.error.details.mutationMayHaveSucceeded, true);

  // Every other operation keeps its retryable command failure.
  const readFailure = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([{ status: 1, stdout: '', stderr: 'connection reset by peer' }]),
      skipProbe: true,
    },
  );
  assert.equal(readFailure.error.retryable, true);
  assert.equal(Object.hasOwn(readFailure.error.details, 'mutationMayHaveSucceeded'), false);
});

test('pr-merge without apply previews the merge and executes nothing', async () => {
  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'pr-merge',
    {
      repository: gateRepository,
      number: 12,
      payload: { method: 'squash', expectedHeadSha: verifiedHead },
    },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, true);
  assert.equal(envelope.data.command.executable, 'gh');
  assert.deepEqual(envelope.data.command.args.slice(0, 3), ['pr', 'merge', '12']);
  assert.equal(envelope.data.command.args.at(-2), '--match-head-commit');
  assert.equal(envelope.data.command.args.at(-1), verifiedHead);
  // Not even the precondition read runs: a dry run touches the forge zero times.
  assert.equal(runner.calls.length, 0);
});

test('pr-merge fails closed when the head moved and merges only the verified commit', async () => {
  const movedRunner = fakeRunner([{ status: 0, stdout: prStatusStdout(movedHead), stderr: '' }]);
  const moved = await executeOperation(
    'pr-merge',
    {
      repository: gateRepository,
      number: 12,
      payload: { method: 'squash', expectedHeadSha: verifiedHead },
    },
    { runner: movedRunner, skipProbe: true, apply: true },
  );
  assert.equal(moved.ok, false);
  assert.equal(moved.error.code, 'STALE_WRITE');
  assert.equal(moved.error.details.expectedHeadSha, verifiedHead);
  assert.equal(moved.error.details.actualHeadSha, movedHead);
  assert.equal(moved.error.details.merged, false);
  // Only the precondition read reached the forge; no merge command was issued.
  assert.equal(movedRunner.calls.length, 1);
  assert.deepEqual(movedRunner.calls[0].args.slice(0, 2), ['api', 'graphql']);

  const mergeRunner = fakeRunner([
    { status: 0, stdout: prStatusStdout(verifiedHead), stderr: '' },
    {
      status: 0,
      // gh echoes the remote it pushed to, and that string can carry an embedded credential.
      stdout: 'Merged pull request #12 from https://user:ghp_secrettoken@github.com/example/flow\n',
      stderr: '',
    },
  ]);
  const merged = await executeOperation(
    'pr-merge',
    {
      repository: gateRepository,
      number: 12,
      payload: { method: 'squash', expectedHeadSha: verifiedHead },
    },
    { runner: mergeRunner, skipProbe: true, apply: true },
  );
  assert.equal(merged.ok, true);
  assert.equal(merged.dryRun, false);
  assert.deepEqual(merged.data.result, {
    number: 12,
    repository: 'example/flow',
    merged: true,
    method: 'squash',
    headSha: verifiedHead,
    output: 'Merged pull request #12 from https://[REDACTED]@github.com/example/flow',
  });
  assert.doesNotMatch(JSON.stringify(merged), /ghp_secrettoken/);
  assert.equal(mergeRunner.calls.length, 2);
  assert.deepEqual(mergeRunner.calls[1].args.slice(-2), ['--match-head-commit', verifiedHead]);
});

test('pr-checks-wait watches with the supplied bound and never filters the watch itself', () => {
  const plan = buildCommandPlan(
    'pr-checks-wait',
    { number: 12, timeoutMinutes: 20, intervalSeconds: 15 },
    githubRepository,
  );
  assert.deepEqual(plan.args.slice(0, 5), ['pr', 'checks', '12', '--repo', 'example/flow']);
  assert.ok(plan.args.includes('--watch'));
  assert.equal(plan.args.at(plan.args.indexOf('--interval') + 1), '15');
  // `gh pr checks` has no timeout flag of its own, so the bound travels with the plan.
  assert.equal(plan.timeoutMs, 20 * 60 * 1000);
  assert.equal(plan.args.includes('--required'), false);
  // This is the watch alone, not the structured read that follows it: `gh pr checks` rejects
  // `--watch` together with `--json` outright, so the plan a caller previews here never carries
  // `--json` and ends with the interval value instead.
  assert.equal(plan.args.at(-1), '15');
  assert.equal(plan.args.includes('--json'), false);

  // `--required` on the watch is what made it exit the moment gh has nothing to report yet instead
  // of blocking, so a caller asking for the required-checks-only criterion still gets a watch that
  // waits for every check. The criterion itself rides on `buildChecksReadPlan` alone, where
  // `--required` and `--json` do combine.
  const requiredOnly = buildCommandPlan(
    'pr-checks-wait',
    { number: 12, timeoutMinutes: 5, requiredOnly: true },
    githubRepository,
  );
  assert.equal(requiredOnly.args.includes('--required'), false);
  assert.equal(requiredOnly.timeoutMs, 5 * 60 * 1000);

  const defaults = buildCommandPlan('pr-checks-wait', { number: 12 }, githubRepository);
  assert.equal(defaults.timeoutMs, 20 * 60 * 1000);
  assert.equal(defaults.args.at(defaults.args.indexOf('--interval') + 1), '10');
  assert.equal(defaults.args.includes('--required'), false);

  // The wait settings resolve through `payload` like every other builder input, so a caller that
  // wraps its arguments does not silently fall back to the defaults.
  const wrapped = buildCommandPlan(
    'pr-checks-wait',
    { number: 12, payload: { timeoutMinutes: 5, intervalSeconds: 30, requiredOnly: true } },
    githubRepository,
  );
  assert.equal(wrapped.timeoutMs, 5 * 60 * 1000);
  assert.equal(wrapped.args.at(wrapped.args.indexOf('--interval') + 1), '30');
  assert.equal(wrapped.args.includes('--required'), false);
});

test('pr-checks-wait never combines --watch with --json, which gh rejects outright', () => {
  // `gh pr checks` refuses the combination with a hard `cannot use --watch with --json flag`
  // error (exit 1), even though each flag works perfectly well on its own. Any plan that carries
  // both is therefore not a slow poll, it's a guaranteed COMMAND_FAILED on every invocation.
  const defaults = buildCommandPlan('pr-checks-wait', { number: 12 }, githubRepository);
  assert.ok(
    !(defaults.args.includes('--watch') && defaults.args.includes('--json')),
    'default pr-checks-wait plan must not combine --watch and --json',
  );

  const requiredOnly = buildCommandPlan(
    'pr-checks-wait',
    { number: 12, requiredOnly: true },
    githubRepository,
  );
  assert.ok(
    !(requiredOnly.args.includes('--watch') && requiredOnly.args.includes('--json')),
    'requiredOnly pr-checks-wait plan must not combine --watch and --json',
  );
});

test('the wait bound rejects unusable numbers as payload errors, not reference errors', () => {
  for (const [field, input] of [
    ['payload.timeoutMinutes', { number: 12, timeoutMinutes: 0 }],
    ['payload.timeoutMinutes', { number: 12, timeoutMinutes: -5 }],
    ['payload.timeoutMinutes', { number: 12, timeoutMinutes: 1.5 }],
    ['payload.timeoutMinutes', { number: 12, timeoutMinutes: 'soon' }],
    ['payload.timeoutMs', { number: 12, timeoutMs: 0 }],
    ['payload.intervalSeconds', { number: 12, intervalSeconds: 0 }],
  ]) {
    assert.throws(
      () => buildCommandPlan('pr-checks-wait', input, githubRepository),
      (error) => error.code === 'INVALID_PAYLOAD' && error.details.field === field,
      `expected ${field} to fail as INVALID_PAYLOAD`,
    );
  }

  // Above the timer ceiling Node clamps the delay to 1 ms, which would turn the bound into an
  // instant fake timeout on every round rather than a longer wait.
  for (const input of [
    { number: 12, timeoutMs: 2_147_483_648 },
    { number: 12, timeoutMinutes: 40_000 },
  ]) {
    assert.throws(
      () => buildCommandPlan('pr-checks-wait', input, githubRepository),
      (error) =>
        error.code === 'INVALID_PAYLOAD' &&
        error.details.field === 'payload.timeoutMs' &&
        error.details.maximum === 2_147_483_647,
    );
  }
  assert.equal(
    buildCommandPlan('pr-checks-wait', { number: 12, timeoutMs: 2_147_483_647 }, githubRepository)
      .timeoutMs,
    2_147_483_647,
  );
});

test('a pending exit code and a killed watch become a timeout result, not an error', async () => {
  const waitInput = { repository: gateRepository, number: 12, timeoutMinutes: 1 };
  // The wait is two `gh` invocations now, so every case below has to feed `fakeRunner` a result
  // for the watch and a second one for the read that follows it.
  const pendingChecks = {
    status: 8,
    stdout: JSON.stringify([
      { name: 'unit', state: 'SUCCESS', bucket: 'pass', link: 'https://ci.example.test/1' },
      { name: 'e2e', state: 'PENDING', bucket: 'pending', link: '' },
    ]),
    stderr: '',
  };
  const pendingRunner = fakeRunner([pendingChecks, pendingChecks]);
  const pending = await executeOperation('pr-checks-wait', waitInput, {
    runner: pendingRunner,
    skipProbe: true,
  });
  assert.equal(pending.ok, true);
  assert.deepEqual(pending.data.result, {
    number: 12,
    repository: 'example/flow',
    complete: false,
    timedOut: true,
    checksReported: true,
    checkCount: 2,
    checks: [
      {
        name: 'unit',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: 'https://ci.example.test/1',
      },
      { name: 'e2e', status: 'PENDING' },
    ],
  });

  // A watch killed on the plan's bound can leave a truncated payload behind; that is still a
  // timeout, never malformed provider JSON. The read that follows is killed the same way here, so
  // the pending list stays unreported rather than being fabricated from a truncated read.
  const killedResult = { status: null, signal: 'SIGTERM', stdout: '[{"name":"e2e"', stderr: '' };
  const killed = await executeOperation('pr-checks-wait', waitInput, {
    runner: fakeRunner([killedResult, killedResult]),
    skipProbe: true,
  });
  assert.equal(killed.ok, true);
  assert.equal(killed.data.result.timedOut, true);
  assert.equal(killed.data.result.complete, false);
  assert.equal(killed.data.result.checksReported, false);
  assert.equal(killed.data.result.checkCount, 0);
  assert.deepEqual(killed.data.result.checks, []);

  // A finished watch is a completed result — including the run whose red check makes gh exit
  // non-zero while it still prints the list the gate has to read.
  const greenChecks = {
    status: 0,
    stdout: JSON.stringify([{ name: 'unit', state: 'SUCCESS', bucket: 'pass' }]),
  };
  const green = await executeOperation('pr-checks-wait', waitInput, {
    runner: fakeRunner([greenChecks, greenChecks]),
    skipProbe: true,
  });
  assert.equal(green.data.result.complete, true);
  assert.equal(green.data.result.timedOut, false);

  // A red check makes `gh pr checks` exit 1 whichever step runs it, and neither one turns that
  // into a COMMAND_FAILED: the watch's exit status is discarded entirely, and the read's non-zero
  // exit still carries the check list the caller waited for.
  const redChecks = {
    status: 1,
    stdout: JSON.stringify([{ name: 'unit', state: 'FAILURE', bucket: 'fail' }]),
    stderr: '',
  };
  const red = await executeOperation('pr-checks-wait', waitInput, {
    runner: fakeRunner([redChecks, redChecks]),
    skipProbe: true,
  });
  assert.equal(red.ok, true);
  assert.equal(red.data.result.complete, true);
  assert.equal(red.data.result.timedOut, false);
  assert.deepEqual(red.data.result.checks, [
    { name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE' },
  ]);

  // An operational failure prints no check list and stays a failure. The watch alone can never
  // report it — its exit status is discarded — so the read is the only step that has to fail here.
  const brokenResult = { status: 1, stdout: '', stderr: 'no checks reported' };
  const broken = await executeOperation('pr-checks-wait', waitInput, {
    runner: fakeRunner([brokenResult, brokenResult]),
    skipProbe: true,
  });
  assert.equal(broken.ok, false);
  assert.equal(broken.error.code, 'COMMAND_FAILED');
});

test("the structured read after the watch carries --json and the caller's --required criterion, never --watch", async () => {
  const readResult = {
    status: 0,
    stdout: JSON.stringify([{ name: 'unit', state: 'SUCCESS', bucket: 'pass' }]),
    stderr: '',
  };
  const runner = fakeRunner([{ status: 0, stdout: '', stderr: '' }, readResult]);
  await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12, requiredOnly: true },
    { runner, skipProbe: true },
  );
  // `runner.calls[1]` is what actually executed for the read, which is stronger evidence than the
  // preview: `buildChecksReadPlan` is not exported, so nothing else lets a test observe its output.
  const readArgs = runner.calls[1].args;
  assert.equal(readArgs.includes('--watch'), false);
  assert.ok(readArgs.includes('--required'));
  assert.equal(readArgs.at(-2), '--json');
  assert.equal(readArgs.at(-1), 'bucket,link,name,state');

  const withoutRequired = fakeRunner([{ status: 0, stdout: '', stderr: '' }, readResult]);
  await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12 },
    { runner: withoutRequired, skipProbe: true },
  );
  assert.equal(withoutRequired.calls[1].args.includes('--required'), false);
});

test('a branch with no required checks reported becomes a discriminated envelope instead of COMMAND_FAILED', async () => {
  // `gh pr checks --required` (2.96.0) filters `statusCheckRollup.contexts` by a per-context
  // `isRequired` flag that only ever accompanies a context that has already reported. A required
  // check that has not reported yet is therefore absent from the list exactly like a branch with no
  // required checks defined at all, so this stderr proves only that gh found nothing to report —
  // never that the forge defines no required checks. `complete` stays false because that is unproven;
  // this only has to stop being an operational failure.
  const noRequiredChecks = {
    status: 1,
    stdout: '',
    stderr: "no required checks reported on the 'some-branch' branch\n",
  };
  const runner = fakeRunner([noRequiredChecks, noRequiredChecks]);
  const result = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12, requiredOnly: true },
    { runner, skipProbe: true },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.result, {
    number: 12,
    repository: 'example/flow',
    complete: false,
    timedOut: false,
    requiredChecksDefined: false,
    // `checksReported` stays part of the envelope and stays false: gh returned no rollup at all
    // here. Dropping the field in this one case would make the shape irregular for a consumer that
    // reads it unconditionally, and `requiredChecksDefined` is what explains the empty list.
    checksReported: false,
    checkCount: 0,
    checks: [],
  });
});

test('a different `--required` failure stays a COMMAND_FAILED, not the no-required-checks pass', async () => {
  // This guards against the fix above being written too broadly: only the specific "no required
  // checks reported" stderr may be normalized into a pass. Any other `--required` failure — an
  // unresolvable PR here — still has to surface as an operational failure.
  const unresolvable = {
    status: 1,
    stdout: '',
    stderr: 'could not resolve to a PullRequest with the number of 12.',
  };
  const runner = fakeRunner([unresolvable, unresolvable]);
  const result = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12, requiredOnly: true },
    { runner, skipProbe: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'COMMAND_FAILED');
});

test('the no-required-checks stderr only pardons a read that actually asked for --required', async () => {
  // `isNoRequiredChecksResponse` guards on the plan carrying `--required`, not merely on the stderr
  // text. A caller who never asked for the required-checks-only criterion has no criterion to
  // trivially satisfy, so the identical stderr on its read must still surface as an operational
  // failure. Removing that guard from the predicate keeps every other test in this file green, which
  // is exactly what this one exists to catch.
  const noRequiredChecks = {
    status: 1,
    stdout: '',
    stderr: "no required checks reported on the 'some-branch' branch\n",
  };
  const runner = fakeRunner([noRequiredChecks, noRequiredChecks]);
  const result = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'COMMAND_FAILED');
});

test('the no-required-checks fact rides on the read, not on a watch that hit the identical stderr', async () => {
  // The watch is asked for nothing but the blocking itself — its exit status and stderr are
  // discarded entirely — so a watch that happens to fail with the exact "no required checks
  // reported" text must not let that leak into the envelope. Only the read that follows is the
  // authority for `requiredChecksDefined`, and here it comes back with an ordinary, still-pending
  // payload instead.
  const watchNoRequiredChecks = {
    status: 1,
    stdout: '',
    stderr: "no required checks reported on the 'some-branch' branch\n",
  };
  const readPending = {
    status: 8,
    stdout: JSON.stringify([{ name: 'e2e', state: 'PENDING', bucket: 'pending', link: '' }]),
    stderr: '',
  };
  const runner = fakeRunner([watchNoRequiredChecks, readPending]);
  const result = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12, requiredOnly: true },
    { runner, skipProbe: true },
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.result.complete, false);
  assert.equal(result.data.result.checkCount, 1);
  assert.equal('requiredChecksDefined' in result.data.result, false);
});

test('the read bound stays fixed at 60 seconds no matter what the caller asks the watch to wait', async () => {
  const readResult = {
    status: 0,
    stdout: JSON.stringify([{ name: 'unit', state: 'SUCCESS', bucket: 'pass' }]),
    stderr: '',
  };
  for (const timeoutMinutes of [1, 5, 45]) {
    const runner = fakeRunner([{ status: 0, stdout: '', stderr: '' }, readResult]);
    await executeOperation(
      'pr-checks-wait',
      { repository: gateRepository, number: 12, timeoutMinutes },
      { runner, skipProbe: true },
    );
    // The watch's bound tracks the caller; the read's bound stays the fixed constant regardless —
    // that fixed ceiling is the guarantee that the split operation still has an end-to-end limit.
    assert.equal(runner.calls[0].timeoutMs, timeoutMinutes * 60 * 1000);
    assert.equal(runner.calls[1].timeoutMs, 60_000);
  }
});

test('a red check that only makes the watch exit non-zero still reaches the read and its payload', async () => {
  // The watch's own exit status never reaches the caller, so a red check on the watch alone — with
  // a clean read behind it — must not turn into a COMMAND_FAILED either.
  const runner = fakeRunner([
    { status: 1, stdout: '', stderr: 'checks failing' },
    { status: 0, stdout: JSON.stringify([{ name: 'unit', state: 'SUCCESS', bucket: 'pass' }]) },
  ]);
  const result = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.result.complete, true);
  assert.equal(result.data.result.timedOut, false);
});

test('a timed-out watch still lets the read report the real, non-empty pending list', async () => {
  // This is the behaviour the split was made for: a watch that ran out of its bound must not
  // withhold the pending check list the caller has to act on, because the read runs regardless.
  const runner = fakeRunner([
    { status: 8, stdout: '', stderr: '' },
    {
      status: 0,
      stdout: JSON.stringify([
        { name: 'unit', state: 'SUCCESS', bucket: 'pass' },
        { name: 'e2e', state: 'PENDING', bucket: 'pending' },
      ]),
      stderr: '',
    },
  ]);
  const result = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.equal(result.data.result.timedOut, true);
  assert.equal(result.data.result.complete, false);
  assert.equal(result.data.result.checksReported, true);
  assert.equal(result.data.result.checkCount, 2);
});

test('pr-checks-wait reports both command previews in execution order, unlike a single-command operation', async () => {
  const runner = fakeRunner([
    { status: 0, stdout: '', stderr: '' },
    { status: 0, stdout: '[]', stderr: '' },
  ]);
  const wait = await executeOperation(
    'pr-checks-wait',
    { repository: gateRepository, number: 12 },
    { runner, skipProbe: true },
  );
  assert.ok(Array.isArray(wait.data.commands));
  assert.equal(wait.data.commands.length, 2);
  assert.ok(wait.data.commands[0].args.includes('--watch'));
  assert.equal(wait.data.commands[1].args.includes('--watch'), false);
  assert.equal(wait.data.commands[1].args.at(-2), '--json');
  assert.equal(Object.hasOwn(wait.data, 'command'), false);

  // A single-command operation is unaffected by the split and still reports one preview.
  const status = await executeOperation(
    'pr-status-read',
    { repository: gateRepository, number: 12 },
    {
      runner: fakeRunner([{ status: 0, stdout: prStatusStdout(verifiedHead), stderr: '' }]),
      skipProbe: true,
    },
  );
  assert.equal(status.data.command.executable, 'gh');
  assert.equal(Object.hasOwn(status.data, 'commands'), false);
});

test('the Forgejo probe reports every pull-request gate operation as unsupported', async () => {
  const probe = await probeProvider(forgejoRepository, fakeRunner(teaProbeResults()));
  assert.equal(probe.capabilities.pullRequestStatus, false);
  assert.equal(probe.capabilities.pullRequestChecksWait, false);
  assert.equal(probe.capabilities.pullRequestMerge, false);
  // The reads the adapter does support stay untouched by the new capabilities.
  assert.equal(probe.capabilities.pullRequestRead, true);

  for (const [operation, capability] of [
    ['pr-status-read', 'pullRequestStatus'],
    ['pr-checks-wait', 'pullRequestChecksWait'],
    ['pr-merge', 'pullRequestMerge'],
  ]) {
    const runner = fakeRunner([]);
    const envelope = await executeOperation(
      operation,
      {
        repository: forgejoRepository,
        number: 12,
        probe,
        payload: { method: 'squash', expectedHeadSha: verifiedHead },
      },
      { runner, skipProbe: true, apply: true },
    );
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
    assert.equal(envelope.error.details.capability, capability);
    assert.equal(runner.calls.length, 0);

    // Even a caller that bypasses the capability gate cannot get a tea command for them.
    assert.throws(
      () =>
        buildCommandPlan(
          operation,
          {
            number: 12,
            payload: { method: 'squash', expectedHeadSha: verifiedHead },
          },
          forgejoRepository,
        ),
      (error) => error.code === 'UNSUPPORTED_CAPABILITY' && error.details.provider === 'forgejo',
    );
  }
});

test('viewer-read asks GitHub for the authenticated account and stays a read', async () => {
  const plan = buildCommandPlan('viewer-read', {}, githubRepository);
  assert.equal(plan.executable, 'gh');
  assert.deepEqual(plan.args, ['api', 'user']);
  // The credential is selected per host, so the identity is read against the same host the
  // repository lives on rather than against whichever one gh happens to consider its default.
  assert.deepEqual(
    buildCommandPlan('viewer-read', {}, { ...githubRepository, host: 'code.example.test' }).args,
    ['api', '--hostname', 'code.example.test', 'user'],
  );

  const runner = fakeRunner([
    { status: 0, stdout: '{"id":209969,"login":"fastner","type":"User"}', stderr: '' },
  ]);
  // No `apply`: the identity read is not a mutation, so it runs instead of returning a dry-run
  // preview. A caller that had to opt in with an apply flag would never get an identity at all.
  const envelope = await executeOperation(
    'viewer-read',
    { repository: gateRepository },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, false);
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(envelope.data.result, { login: 'fastner', type: 'User' });

  // The account type is the discriminator between the two operating modes, so it survives the
  // normalizer unchanged for a dedicated bot account as well.
  const asBot = await executeOperation(
    'viewer-read',
    { repository: gateRepository },
    {
      runner: fakeRunner([
        { status: 0, stdout: '{"id":42,"login":"flow-gate[bot]","type":"Bot"}', stderr: '' },
      ]),
      skipProbe: true,
    },
  );
  assert.deepEqual(asBot.data.result, { login: 'flow-gate[bot]', type: 'Bot' });
});

test('the GitHub probe reports the identity read independently of the gate version floor', async () => {
  const probeAt = async (version) =>
    probeProvider(
      githubRepository,
      fakeRunner([
        { status: 0, stdout: `gh version ${version}\n`, stderr: '' },
        { status: 0, stdout: '', stderr: '' },
      ]),
    );

  // `gh api user` needs none of the four flags the gate's floor exists for, so an older gh that
  // cannot merge can still say who it is authenticated as.
  for (const version of ['2.0.0', '2.49.2', '2.70.0']) {
    const probe = await probeAt(version);
    assert.equal(probe.capabilities.viewerRead, true);
  }
  assert.equal((await probeAt('2.49.2')).capabilities.pullRequestMerge, false);
});

async function viewerEnvelope(stdout) {
  return executeOperation(
    'viewer-read',
    { repository: gateRepository },
    { runner: fakeRunner([{ status: 0, stdout, stderr: '' }]), skipProbe: true },
  );
}

async function viewerResult(stdout) {
  const envelope = await viewerEnvelope(stdout);
  assert.equal(envelope.ok, true, `expected a stated identity for ${stdout}`);
  return envelope.data.result;
}

async function viewerRejection(stdout) {
  const envelope = await viewerEnvelope(stdout);
  assert.equal(envelope.ok, false, `expected no identity for ${stdout}`);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  return envelope.error;
}

test('an unstated account type yields no field instead of a default', async () => {
  // A guessed default here would let a caller claim a stranger's comment as its own, so an absent
  // provider value stays absent and the caller reads the account class as unprovable.
  const withoutType = await viewerResult('{"id":209969,"login":"fastner"}');
  assert.deepEqual(withoutType, { login: 'fastner' });
  assert.equal(Object.hasOwn(withoutType, 'type'), false);

  // An empty string is no more a stated value than a missing key.
  assert.deepEqual(await viewerResult('{"login":"fastner","type":"   "}'), { login: 'fastner' });

  // Nor is a value that is not a string at all. Pinned because a coercing rewrite of the field
  // reader — `String(value ?? '').trim()` — would keep every other case green while inventing a
  // type out of a number or a boolean.
  for (const stdout of [
    '{"login":"fastner","type":42}',
    '{"login":"fastner","type":true}',
    '{"login":"fastner","type":["User"]}',
    '{"login":"fastner","type":{"name":"User"}}',
    '{"login":"fastner","type":null}',
  ]) {
    assert.deepEqual(await viewerResult(stdout), { login: 'fastner' });
  }
});

test('an account class outside User and Bot is reported as unprovable, not passed through', async () => {
  // A consumer that branches `type === 'User'` for the shared-account path would read any other
  // class as a dedicated bot account and skip the identity comparison — the fail-open direction.
  for (const type of ['EnterpriseUserAccount', 'Mannequin', 'Organization', 'user_or_bot']) {
    assert.deepEqual(await viewerResult(`{"login":"fastner","type":"${type}"}`), {
      login: 'fastner',
    });
  }

  // Case is spelling, not class, so it is normalized to the form a caller compares against.
  for (const [stated, canonical] of [
    ['User', 'User'],
    ['user', 'User'],
    ['Bot', 'Bot'],
    ['BOT', 'Bot'],
    [' bot ', 'Bot'],
  ]) {
    assert.deepEqual(await viewerResult(`{"login":"fastner","type":"${stated}"}`), {
      login: 'fastner',
      type: canonical,
    });
  }
});

test('a viewer-read that states no login fails instead of answering with an empty identity', async () => {
  // The login is not one field among many — it is the entire purpose of this read, so a response
  // without one is no answer rather than a partial one, and the caller cannot mistake it for a
  // proven identity. Every unprovable case therefore ends in the same structured error.
  for (const stdout of [
    '{}',
    '{"id":209969,"type":"Bot"}',
    '{"login":""}',
    '{"login":"   "}',
    // A coercing field reader would turn each of these into a present, fabricated login.
    '{"login":42}',
    '{"login":null}',
    '{"login":true}',
    '{"login":["fastner"]}',
    '{"login":{"login":"fastner"}}',
    // Not an identity object at all: an array, a bare string, and an empty provider response.
    '["fastner"]',
    '"fastner"',
    '',
  ]) {
    await viewerRejection(stdout);
  }
});

test('the Forgejo probe reports viewer-read as unsupported', async () => {
  const probe = await probeProvider(forgejoRepository, fakeRunner(teaProbeResults()));
  assert.equal(probe.capabilities.viewerRead, false);
  // The reads the adapter does support are untouched by the new capability.
  assert.equal(probe.capabilities.pullRequestRead, true);

  const runner = fakeRunner([]);
  const envelope = await executeOperation(
    'viewer-read',
    { repository: forgejoRepository, probe },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(envelope.error.details.capability, 'viewerRead');
  assert.equal(runner.calls.length, 0);

  // Even a caller that bypasses the capability gate gets no invented tea equivalent.
  assert.throws(
    () => buildCommandPlan('viewer-read', {}, forgejoRepository),
    (error) => error.code === 'UNSUPPORTED_CAPABILITY' && error.details.provider === 'forgejo',
  );
});

test('a supplied cwd roots every process invocation of an operation', async () => {
  const runner = fakeRunner([
    { status: 0, stdout: 'true\n', stderr: '' },
    { status: 0, stdout: 'https://github.com/example/flow.git\n', stderr: '' },
    { status: 0, stdout: '[]', stderr: '' },
  ]);
  const envelope = await executeOperation(
    'issue-list',
    { cwd: '/main/checkout' },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, true);
  assert.equal(runner.calls.length, 3);
  for (const call of runner.calls) assert.equal(call.cwd, '/main/checkout');
});

test('an absent cwd leaves every process invocation unrooted', async () => {
  const runner = fakeRunner([
    { status: 0, stdout: 'true\n', stderr: '' },
    { status: 0, stdout: 'https://github.com/example/flow.git\n', stderr: '' },
    { status: 0, stdout: '[]', stderr: '' },
  ]);
  await executeOperation('issue-list', {}, { runner, skipProbe: true });
  assert.equal(runner.calls.length, 3);
  for (const call of runner.calls) assert.equal(call.cwd, undefined);
});

test('a non-string cwd is rejected as an invalid payload', async () => {
  const envelope = await executeOperation(
    'issue-list',
    { cwd: 42 },
    { runner: fakeRunner([]), skipProbe: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
});

test('an unusable working directory is reported as such, not as a missing CLI', async () => {
  const runner = fakeRunner([
    { status: null, stdout: '', stderr: '', error: { code: 'INVALID_CWD', path: '/removed/tree' } },
  ]);
  const envelope = await executeOperation(
    'issue-list',
    { cwd: '/removed/tree' },
    { runner, skipProbe: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.notEqual(envelope.error.code, 'CLI_MISSING');
  assert.equal(envelope.error.details.cwd, '/removed/tree');
});

// A stand-in for the gh CLI. It answers the probe, blocks far beyond any bound on the watch, and
// needs a moment for an ordinary read — the cases that show what the plan's bound applies to, and
// what happens when the child refuses the polite stop. `exec` matters: the sleeping process must be
// the spawned child itself, so the runner's signal reaches it directly instead of leaving an orphan
// holding the child's pipes open. An ignored disposition survives `exec`, so the deaf branch really
// does produce a process that cannot be stopped with SIGTERM. The wait now runs `gh pr checks`
// twice, and only the first of the two — the one carrying `--watch` — is the one that must hang;
// the structured read that follows carries no `--watch` at all and has to answer immediately, or
// this fixture would make the read sleep out its own 60-second bound on every single test run.
const FAKE_GH = `#!/bin/sh
case "$1" in
  --version) echo 'gh version 2.70.0 (2026-01-01)'; exit 0 ;;
  auth) exit 0 ;;
esac
case "$2" in
  checks)
    case " $* " in
      *' --watch '*)
        if [ -n "$FAKE_GH_IGNORE_TERM" ]; then trap '' TERM; fi
        exec sleep 30
        ;;
    esac
    printf '%s' '[]'
    exit 0
    ;;
  graphql)
    sleep 1
    printf '%s' '{"data":{"repository":{"pullRequest":{"number":12,"title":"feat: add the gate","url":"https://github.com/example/flow/pull/12","state":"OPEN","isDraft":false,"headRefOid":"${verifiedHead}","baseRefName":"develop","mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","commits":{"nodes":[{"commit":{"oid":"${verifiedHead}","committedDate":"2026-07-28T20:01:19Z","statusCheckRollup":{"contexts":{"totalCount":0,"nodes":[]}}}}]}}}}}'
    exit 0
    ;;
esac
exit 1
`;

function runShippedCli(operation, input, env = {}, flags = []) {
  const directory = mkdtempSync(join(tmpdir(), 'effective-flow-runner-'));
  try {
    writeFileSync(join(directory, 'gh'), FAKE_GH, { mode: 0o755 });
    const result = spawnSync(
      process.execPath,
      ['src/scripts/remote-tracker.mjs', operation, ...flags],
      {
        cwd: new URL('..', import.meta.url),
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: { ...process.env, ...env, PATH: `${directory}:${process.env.PATH}` },
      },
    );
    // A run that dies before printing anything is itself a result worth asserting on, so an empty
    // stdout arrives at the caller as a missing envelope instead of as a parse error raised here,
    // where no test could say what it was looking at.
    return {
      ...result,
      envelope: result.stdout.trim() === '' ? undefined : JSON.parse(result.stdout),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the shipped process runner bounds a watch and leaves every other spawn unbounded', () => {
  const repository = { host: 'github.com', owner: 'example', repository: 'flow' };

  // Only the wait carries a bound; no other plan does, so no other spawn can be cut short.
  assert.equal(
    buildCommandPlan('pr-checks-wait', { number: 12, timeoutMinutes: 20 }, githubRepository)
      .timeoutMs,
    20 * 60 * 1000,
  );
  for (const operation of ['pr-status-read', 'pr-read', 'issue-list']) {
    assert.equal(
      buildCommandPlan(operation, { number: 12 }, githubRepository).timeoutMs,
      undefined,
    );
  }

  // The watch blocks for 30 seconds; the plan allows 250 ms. The killed child reports a null status
  // plus its signal, which the core turns into a timeout result instead of a failure.
  const startedAt = Date.now();
  const bounded = runShippedCli('pr-checks-wait', { repository, number: 12, timeoutMs: 250 });
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 15_000, `the bound did not stop the watch (${elapsed}ms)`);
  assert.equal(bounded.status, 0);
  assert.equal(bounded.envelope.ok, true);
  assert.equal(bounded.envelope.error, undefined);
  assert.equal(bounded.envelope.data.result.timedOut, true);
  assert.equal(bounded.envelope.data.result.complete, false);
  assert.deepEqual(bounded.envelope.data.result.checks, []);
  // A child that stops on SIGTERM was stopped cleanly, and the result says so by omission.
  assert.equal(Object.hasOwn(bounded.envelope.data.result, 'forcedKill'), false);

  // The same fake CLI, an operation without a bound: a read that outlives the wait's limit still
  // runs to completion, so the timeout reaches exactly the plan that asked for one.
  const unbounded = runShippedCli('pr-status-read', { repository, number: 12 });
  assert.equal(unbounded.envelope.ok, true);
  assert.equal(unbounded.envelope.data.result.headSha, verifiedHead);
  assert.equal(unbounded.envelope.data.result.baseRef, 'develop');
});

test('a watch that ignores the polite stop is killed and reported as forced', () => {
  // SIGTERM is catchable, so a bound enforced with SIGTERM alone is only a request. This child
  // ignores it outright — without the escalation the run would hang for the full 30 seconds.
  const startedAt = Date.now();
  const forced = runShippedCli(
    'pr-checks-wait',
    {
      repository: { host: 'github.com', owner: 'example', repository: 'flow' },
      number: 12,
      timeoutMs: 250,
    },
    { FAKE_GH_IGNORE_TERM: '1' },
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 20_000, `the escalation did not stop the watch (${elapsed}ms)`);
  assert.equal(forced.status, 0);
  assert.equal(forced.envelope.ok, true);
  assert.equal(forced.envelope.data.result.timedOut, true);
  assert.equal(forced.envelope.data.result.complete, false);
  // Distinguishable from a clean bounded stop: the provider had to be killed.
  assert.equal(forced.envelope.data.result.forcedKill, true);
});

test('the shipped process runner reports a child that dies before its payload lands', () => {
  // Every `gh api --input -` plan hands its payload to the child on stdin, and `pr-status-read` —
  // the read the merge gate performs immediately before merging — travels on that path too. A child
  // that fails at once closes the pipe while the write is still outstanding, and the EPIPE that
  // follows is emitted on the stdin stream, not on the child: without a listener there it becomes an
  // uncaught exception, the process dies, and the caller waiting for a structured envelope receives
  // nothing at all. The payload is deliberately larger than the kernel's pipe buffer on either
  // platform, because a smaller one is accepted whole before the child can exit and the write then
  // never fails — the same reason this gap survived unnoticed for so long. It is ordinary prose
  // rather than one long token so that the redaction pass over the plan stays linear in its length.
  const failed = runShippedCli(
    'issue-comment',
    {
      repository: { host: 'github.com', owner: 'example', repository: 'flow' },
      number: 12,
      payload: { body: 'review note '.repeat(30_000) },
    },
    {},
    ['--apply'],
  );
  assert.notEqual(
    failed.envelope,
    undefined,
    `the runner crashed instead of reporting the failure: ${failed.stderr}`,
  );
  assert.equal(failed.envelope.ok, false);
  // The child's own outcome is what the caller must see, not a stream error raised in the parent.
  assert.equal(failed.envelope.error.code, 'COMMAND_FAILED');
  assert.equal(failed.status, 1);
});

test('the shipped process runner detects a removed working directory before spawning', () => {
  const result = spawnSync(
    process.execPath,
    ['src/scripts/remote-tracker.mjs', 'repository-resolve'],
    {
      cwd: new URL('..', import.meta.url),
      input: JSON.stringify({ cwd: '/effective-flow/definitely/removed/worktree' }),
      encoding: 'utf8',
    },
  );
  assert.notEqual(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.equal(envelope.error.details.cwd, '/effective-flow/definitely/removed/worktree');
});

test('pull-request comments normalize their author exactly as review threads do', async () => {
  // GitHub's REST API reports a bot account *with* the `[bot]` suffix and states its class in the
  // simple-user `type` field, while the GraphQL review-thread query reports the same account without
  // the suffix and spells the same class as `__typename: "Bot"`. Leaving this read unnormalized cost
  // more than a spelling: a top-level comment carried no `authorType` at all, so merge-gate's
  // human-comment guard could establish bot authorship only from a configured login, and its Phase-3
  // trigger idempotency — which reads `authorType: bot` to recognize its own comment in app mode —
  // could never be proven.
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify([
        {
          id: 11,
          body: 'Found two issues',
          user: { login: 'greptile-apps[bot]', type: 'Bot' },
          created_at: '2026-07-28T20:30:00Z',
        },
        { id: 12, body: 'Looks good', user: { login: 'maintainer' } },
        { id: 13, body: 'Orphaned comment' },
        { id: 14, body: 'Reviewed', user: { login: 'maintainer', type: 'User' } },
        { id: 15, body: 'Automated note', user: { login: 'flow-gate', type: 'bot' } },
        { id: 16, body: 'Imported note', user: { login: 'legacy-account', type: 'Mannequin' } },
        { id: 17, body: 'All checks have passed', user: { login: 'github-actions[bot]' } },
      ]),
      stderr: '',
    },
  ]);

  const envelope = await executeOperation(
    'pr-comments-read',
    { repository: githubRepository, pullRequest: 2 },
    { runner, skipProbe: true },
  );

  // The stated class proves the bot here, exactly as `__typename` does on the other surface.
  assert.deepEqual(envelope.data.result[0].author, {
    login: 'greptile-apps[bot]',
    isBot: true,
    authorType: 'bot',
  });
  assert.equal(envelope.data.result[0].createdAt, '2026-07-28T20:30:00.000Z');

  // A payload that states no class and carries no suffix decides nothing, so this stays `unknown`
  // rather than being guessed as human — the same discipline every surface follows when no field
  // decides.
  assert.deepEqual(envelope.data.result[1].author, {
    login: 'maintainer',
    isBot: null,
    authorType: 'unknown',
  });

  // An author the provider does not expose must not fail the read the way a missing *viewer* login
  // does: a comment without an author is data, not a broken identity lookup.
  assert.equal(envelope.data.result[2].author.login, undefined);
  assert.equal(envelope.data.result[2].author.authorType, 'unknown');

  // `User` is a statement, not an absence: the provider said this is a person, so the record says so
  // too instead of falling through to `unknown`.
  assert.deepEqual(envelope.data.result[3].author, {
    login: 'maintainer',
    isBot: false,
    authorType: 'human',
  });

  // A dedicated bot account whose login carries no suffix is still proven by its class, and case is
  // spelling rather than class.
  assert.deepEqual(envelope.data.result[4].author, {
    login: 'flow-gate',
    isBot: true,
    authorType: 'bot',
  });

  // A class outside `{User, Bot}` proves nothing about automation. Reading it as human would claim
  // evidence the provider never gave, so the allow-list leaves it undecided.
  assert.deepEqual(envelope.data.result[5].author, {
    login: 'legacy-account',
    isBot: null,
    authorType: 'unknown',
  });

  // The unconfigured-bot arm, and the one that carries the merge-gate consequence of this
  // normalization. `github-actions[bot]` appears in no `mergeGate.bots` table, and this payload
  // states no class at all, so the login suffix is the only evidence there is. This record is what
  // merge-gate's Phase 1 rule 1 reads: `authorType: bot` excludes the comment right there, before
  // rule 5's catch-all can count it as human and hold the human-comment guard. Before this read
  // normalized its author, a top-level comment carried a bare login string and no `authorType` at
  // all, so every unconfigured bot's comment reached rule 5 and blocked the merge — which makes
  // this arm, and not its prose counterpart, the assertion that fails on the old shape.
  //
  // Its counterpart is the merge-gate prose test `a bot-typed author is excluded before the
  // catch-all counts it as human` in `test/workflow-contracts.test.mjs`. That one is a forward
  // regression guard only: Phase 1's rules 1 and 5 are textually unchanged by this normalization,
  // so it passes on the old and the new behaviour alike and proves nothing about the widening.
  assert.deepEqual(envelope.data.result[6].author, {
    login: 'github-actions[bot]',
    isBot: true,
    authorType: 'bot',
  });

  // The same arm on the surface that never states a class. Forgejo's comment records spell the
  // author `poster` and carry no `type`, `__typename`, or `is_bot` field whatsoever, so the suffix
  // is not merely the fallback there — it is the whole evidence. Both provider surfaces reach the
  // guard through this one normalizer, so both are asserted here.
  const forgejoRunner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify({
        index: 2,
        comments: [
          {
            id: 21,
            body: 'Bump the lockfile',
            poster: { login: 'dependabot[bot]' },
            created_at: '2026-07-29T08:15:00+02:00',
          },
          {
            id: 22,
            body: 'Do not merge — the migration is missing',
            poster: { login: 'operator' },
          },
        ],
      }),
      stderr: '',
    },
  ]);

  const forgejo = await executeOperation(
    'pr-comments-read',
    { repository: forgejoRepository, pullRequest: 2 },
    { runner: forgejoRunner, skipProbe: true },
  );

  assert.deepEqual(forgejo.data.result[0].author, {
    login: 'dependabot[bot]',
    isBot: true,
    authorType: 'bot',
  });

  // The contrasting arm, and the reason the one above is a narrowing of the guard rather than a
  // hole in it: an ordinary login on that same class-less surface stays out of `bot`, so rule 1
  // does not reach it and rule 5 still counts it as human. Exactly one human comment keeps the
  // guard active, which is the property the bot arm must not have widened away.
  assert.deepEqual(forgejo.data.result[1].author, {
    login: 'operator',
    isBot: null,
    authorType: 'unknown',
  });
});

test('a GraphQL actor class outside the allow-list leaves bot authorship undecided', async () => {
  // `__typename` is matched against the same two classes as the REST `type` field, and for the same
  // reason: GitHub spells more actor types than these two — `Mannequin` for an imported account,
  // `Organization`, `EnterpriseUserAccount` on GHES — and a bare `!== 'Bot'` comparison would report
  // every one of them as a proven human.
  const runner = fakeRunner([
    {
      status: 0,
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: 'thread-1',
                    isResolved: false,
                    path: 'src/a.mjs',
                    line: 42,
                    comments: {
                      nodes: [
                        {
                          id: 'comment-1',
                          body: 'Imported review note',
                          path: 'src/a.mjs',
                          line: 42,
                          author: { __typename: 'Mannequin', login: 'legacy-account' },
                        },
                        {
                          id: 'comment-2',
                          body: 'Automated note',
                          path: 'src/a.mjs',
                          line: 42,
                          author: { __typename: 'bot', login: 'review-app' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
      stderr: '',
    },
  ]);

  const envelope = await executeOperation(
    'review-threads-read',
    { repository: githubRepository, pullRequest: 2 },
    { runner, skipProbe: true },
  );

  assert.deepEqual(envelope.data.result[0].comments[0].author, {
    login: 'legacy-account',
    isBot: null,
    authorType: 'unknown',
  });
  // The allow-list ignores case on this surface too, so a differently spelled class still decides.
  assert.deepEqual(envelope.data.result[0].comments[1].author, {
    login: 'review-app',
    isBot: true,
    authorType: 'bot',
  });
});
