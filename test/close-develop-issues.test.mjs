import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  closeReferencedIssues,
  parseClosingIssueNumbers,
} from '../.github/scripts/close-develop-issues.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW_PATH = join(ROOT_DIR, '.github', 'workflows', 'close-develop-issues.yml');

function httpError(status, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

function fakeOctokit({ issues = {}, updateErrors = {} } = {}) {
  const getCalls = [];
  const updateCalls = [];
  return {
    getCalls,
    updateCalls,
    rest: {
      issues: {
        async get(parameters) {
          getCalls.push(parameters);
          const result = issues[parameters.issue_number];
          if (result instanceof Error) throw result;
          if (result === undefined) throw httpError(404);
          return { data: result };
        },
        async update(parameters) {
          updateCalls.push(parameters);
          const error = updateErrors[parameters.issue_number];
          if (error) throw error;
          return { data: { number: parameters.issue_number, state: 'closed' } };
        },
      },
    },
  };
}

function fakeCore() {
  const calls = { notice: [], warning: [], error: [] };
  return {
    calls,
    notice(value) {
      calls.notice.push(value);
    },
    warning(value) {
      calls.warning.push(value);
    },
    error(value) {
      calls.error.push(value);
    },
  };
}

function annotationText(values) {
  return values.map((value) => (value instanceof Error ? value.message : String(value))).join('\n');
}

test('parses every documented closing keyword', () => {
  const keywords = [
    'close',
    'closes',
    'closed',
    'fix',
    'fixes',
    'fixed',
    'resolve',
    'resolves',
    'resolved',
  ];
  const body = keywords.map((keyword, index) => `${keyword} #${index + 1}`).join('\n');

  assert.deepEqual(
    parseClosingIssueNumbers(body),
    keywords.map((_, index) => index + 1),
  );
});

test('accepts case, optional colons, and ordinary whitespace variants', () => {
  assert.deepEqual(
    parseClosingIssueNumbers('CLOSE:#21\nClOsEs :\t#22\nRESOLVED    #23'),
    [21, 22, 23],
  );
});

test('requires a keyword for each reference and deduplicates in first-seen order', () => {
  assert.deepEqual(
    parseClosingIssueNumbers('Closes #12, #13; fixes: #12; resolved #14; close #13'),
    [12, 14, 13],
  );
});

test('ignores cross-repository, URL, bare, malformed, and unrelated references', () => {
  const body = [
    'Closes owner/repository#12',
    'Fixes https://github.com/owner/repository/issues/13',
    'Resolves https://example.test/path#14',
    '#15',
    'Closes #0',
    'Closes #-16',
    'Closes #not-a-number',
    'Closes #17abc',
    'Closes #18.5',
    'discloses #19',
    'prefixes #20',
    'This text is unrelated.',
  ].join('\n');

  assert.deepEqual(parseClosingIssueNumbers(body), []);
});

test('returns no references for null, undefined, empty, and whitespace-only bodies', () => {
  for (const body of [null, undefined, '', ' \n\t ']) {
    assert.deepEqual(parseClosingIssueNumbers(body), []);
  }
});

test('empty bodies complete without making API calls', async () => {
  for (const body of [null, undefined, '', ' \n\t ']) {
    const octokit = fakeOctokit();

    await closeReferencedIssues({
      octokit,
      owner: 'example',
      repo: 'flow',
      body,
      core: fakeCore(),
    });

    assert.deepEqual(octokit.getCalls, []);
    assert.deepEqual(octokit.updateCalls, []);
  }
});

test('closes each unique open issue in first-seen order with a completed state reason', async () => {
  const octokit = fakeOctokit({
    issues: {
      7: { number: 7, state: 'open' },
      8: { number: 8, state: 'open' },
    },
  });
  const core = fakeCore();

  await closeReferencedIssues({
    octokit,
    owner: 'example',
    repo: 'flow',
    body: 'Closes #7. Fixes #7. Resolves #8.',
    core,
  });

  assert.deepEqual(octokit.getCalls, [
    { owner: 'example', repo: 'flow', issue_number: 7 },
    { owner: 'example', repo: 'flow', issue_number: 8 },
  ]);
  assert.deepEqual(octokit.updateCalls, [
    {
      owner: 'example',
      repo: 'flow',
      issue_number: 7,
      state: 'closed',
      state_reason: 'completed',
    },
    {
      owner: 'example',
      repo: 'flow',
      issue_number: 8,
      state: 'closed',
      state_reason: 'completed',
    },
  ]);
  assert.deepEqual(core.calls.error, []);
});

test('skips closed issues, pull requests, and inaccessible targets without failing', async () => {
  const octokit = fakeOctokit({
    issues: {
      1: { number: 1, state: 'closed' },
      2: { number: 2, state: 'open', pull_request: { url: 'https://example.test/pr/2' } },
      3: httpError(403, 'forbidden'),
      4: httpError(404, 'not found'),
      5: httpError(410, 'gone'),
      6: { number: 6, state: 'open' },
    },
  });
  const core = fakeCore();

  await closeReferencedIssues({
    octokit,
    owner: 'example',
    repo: 'flow',
    body: 'Closes #1. Closes #2. Closes #3. Closes #4. Closes #5. Closes #6.',
    core,
  });

  assert.deepEqual(
    octokit.getCalls.map(({ issue_number }) => issue_number),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(octokit.updateCalls, [
    {
      owner: 'example',
      repo: 'flow',
      issue_number: 6,
      state: 'closed',
      state_reason: 'completed',
    },
  ]);
  const skipAnnotations = annotationText([...core.calls.notice, ...core.calls.warning]);
  assert.match(skipAnnotations, /#1/);
  assert.match(skipAnnotations, /#2/);
  for (const issueNumber of [3, 4, 5]) {
    assert.match(annotationText(core.calls.warning), new RegExp(`#${issueNumber}\\b`));
  }
  assert.deepEqual(core.calls.error, []);
});

test('aggregates unexpected failures after attempting every reference', async () => {
  const octokit = fakeOctokit({
    issues: {
      1: httpError(401, 'bad credentials'),
      2: { number: 2, state: 'open' },
      3: new Error('socket closed'),
      4: { number: 4, state: 'open' },
    },
    updateErrors: {
      2: httpError(503, 'service unavailable'),
    },
  });
  const core = fakeCore();

  await assert.rejects(
    closeReferencedIssues({
      octokit,
      owner: 'example',
      repo: 'flow',
      body: 'Closes #1. Closes #2. Closes #3. Closes #4.',
      core,
    }),
    (error) => error instanceof AggregateError && error.errors.length === 3,
  );

  assert.deepEqual(
    octokit.getCalls.map(({ issue_number }) => issue_number),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    octokit.updateCalls.map(({ issue_number }) => issue_number),
    [2, 4],
  );
  assert.equal(core.calls.error.length, 3);
  for (const issueNumber of [1, 2, 3]) {
    assert.match(annotationText(core.calls.error), new RegExp(`#${issueNumber}\\b`));
  }
});

test('workflow has the narrow trusted-event trigger, guard, and permission contract', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const trigger = workflow.match(/^on:\s*\n([\s\S]*?)(?=^permissions:)/m)?.[0];
  const permissions = workflow.match(/^permissions:\s*\n([\s\S]*?)(?=^jobs:)/m)?.[1];

  assert.ok(trigger, 'workflow must define its trigger before permissions');
  assert.match(trigger, /^on:\s*\n\s+pull_request_target:\s*$/m);
  assert.match(trigger, /^\s+types:\s*\[closed\]\s*$/m);
  assert.match(trigger, /^\s+branches:\s*\[develop\]\s*$/m);
  assert.doesNotMatch(trigger, /^\s{2}(?:push|pull_request|workflow_dispatch|schedule):/m);

  assert.ok(permissions, 'workflow must define top-level permissions before jobs');
  const permissionLines = permissions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  assert.deepEqual(permissionLines, ['contents: read', 'issues: write']);
  assert.match(
    workflow,
    /if:\s*(?:\$\{\{\s*)?github\.event\.pull_request\.merged\s*==\s*true\s*(?:\}\})?/,
  );
  assert.doesNotMatch(workflow, /\bsecrets\./);
});

test('workflow pins actions and checks out only the trusted event commit', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const actionReferences = [...workflow.matchAll(/^\s+uses:\s*([^\s#]+)/gm)].map(
    ([, reference]) => reference,
  );

  assert.ok(actionReferences.length > 0, 'workflow must use at least one reviewed action');
  for (const reference of actionReferences.filter((value) => !value.startsWith('./'))) {
    assert.match(reference, /^[^@]+@[0-9a-f]{40}$/);
  }
  assert.match(
    workflow,
    /uses:\s*actions\/checkout@[0-9a-f]{40}[\s\S]{0,300}?ref:\s*["']?\$\{\{\s*github\.sha\s*\}\}["']?/,
  );
  assert.doesNotMatch(
    workflow,
    /github\.(?:head_ref|event\.pull_request\.(?:head|merge_commit_sha))|refs\/pull\//,
  );
  assert.doesNotMatch(workflow, /^\s+ref:\s*develop\s*$/m);
});

test('workflow consumes the pull request body as JavaScript data without shell execution', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

  assert.match(workflow, /context\.payload\.pull_request\.body/);
  assert.match(workflow, /closeReferencedIssues/);
  assert.doesNotMatch(workflow, /\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/);
  assert.doesNotMatch(workflow, /^\s*-?\s*run:/m);
});
