import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
                          author: { __typename: 'User', login: 'reviewer' },
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
    comments: [
      {
        id: 'comment-1',
        databaseId: 7,
        body: 'Handle this case',
        author: { login: 'reviewer', isBot: false, authorType: 'human' },
        path: 'src/a.mjs',
        line: 42,
        startLine: undefined,
      },
    ],
  });
  assert.deepEqual(envelope.data.result[1].comments[0].author, {
    login: 'review-app[bot]',
    isBot: true,
    authorType: 'bot',
  });
  assert.match(runner.calls[0].stdin, /reviewThreads.*path line startLine/s);
  assert.match(runner.calls[0].stdin, /author\{__typename login\}/);
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
