import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import nodeFs, {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  BASE_MOVE_REASONS,
  BASE_MOVE_STOPPING_REASONS,
  BASE_MOVE_VERDICTS,
  MAX_BASE_MOVE_PATHS,
  MAX_BODY_CHARS,
  MAX_COMMIT_MESSAGE_BYTES,
  MAX_PLAN_BYTES,
  MAX_TITLE_CHARS,
  PLAN_PR_MARKER_OPENER,
  PlanPublicationError,
  SCAN_CLASSES,
  assessBaseMove,
  baseMoveRepublishes,
  buildBaseMoveFlag,
  buildFurtherBaseMoveFlag,
  buildPlanPrMarkerLine,
  buildPullRequestBody,
  decodePlanBytes,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
  extractCitedTokens,
  hasClosingKeyword,
  normalizeCitedToken,
  parseIssueHeader,
  parsePlanBranch,
  planBranchName,
  planFileIdentity,
  scanEntries,
  scanText,
  validateCommitMessage,
  validateTitle,
} from '../src/scripts/plan-publication-core.mjs';
import { forwardTermination, main } from '../src/scripts/plan-publication.mjs';
import { inspectPlanPrMarker, redact } from '../src/scripts/remote-tracker-core.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = fileURLToPath(new URL('../src/scripts/plan-publication.mjs', import.meta.url));

// ---------------------------------------------------------------------------------------------
// Helpers

function tempDirectory(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-plan-publication-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function write(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

// A runner that records every call and answers each with `handler`. Most tests here assert that
// the runner was never reached.
function recordingRunner(handler = () => ({ status: 1, stdout: '', stderr: 'unexpected call' })) {
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    return handler(call);
  };
  runner.calls = calls;
  return runner;
}

// Fixtures are assembled at runtime from fragments, so this repository holds no literal secret
// shape: a prefix is joined from parts and the body of a token is generated.
function cat(...parts) {
  return parts.join('');
}

const ALNUM = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const ALNUM_UNDERSCORE = `${ALNUM}_`;
const ALNUM_DASH = `${ALNUM}-`;
const ALNUM_UNDERSCORE_DASH = `${ALNUM}_-`;
const UPPER_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BEARER_ALPHABET = `${ALNUM}._~+=-`;

// Deterministic, mixed-case, never a run of lowercase words.
function chars(length, alphabet = ALNUM, seed = 0) {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += alphabet[(index * 7 + seed * 3 + index * index) % alphabet.length];
  }
  return out;
}

function classesOf(text, field = 'body') {
  return scanText(text, field).map((finding) => finding.class);
}

async function run(operation, input, options = {}) {
  return executeOperation(operation, input, { runner: recordingRunner(), ...options });
}

// ---------------------------------------------------------------------------------------------
// Branch name and parser

test('the plan-branch parser accepts exactly <prefix>/plan/issue-<N> and plan/issue-<N>', () => {
  assert.deepEqual(parsePlanBranch('effective-flow/plan/issue-12'), {
    branchPrefix: 'effective-flow',
    issue: 12,
  });
  assert.deepEqual(parsePlanBranch('plan/issue-12'), { branchPrefix: '', issue: 12 });
  assert.deepEqual(parsePlanBranch('team/flow/plan/issue-3'), {
    branchPrefix: 'team/flow',
    issue: 3,
  });
  assert.deepEqual(parsePlanBranch('plan/issue-100'), { branchPrefix: '', issue: 100 });

  for (const rejected of [
    'effective-flow/plan/issue-abc',
    'effective-flow/plan/issue-01',
    'effective-flow/plan/issue-1x',
    'effective-flow/plan/issue-0',
    'plan/issue-abc',
    'plan/issue-01',
    'plan/issue-1x',
    'plan/issue-0',
    'plan/issue-',
    'plan/issue--1',
    'plan/issue-1/extra',
    'plan/issue-1 ',
    'xplan/issue-1',
    'x/yplan/issue-1',
    'effective-flow/issue-12',
    'effective-flow/plan/issue-12.lock',
    'effective-flow//plan/issue-12',
    '/plan/issue-12',
    '../plan/issue-12',
    'a/../plan/issue-12',
    'a.lock/plan/issue-12',
    'issue-12',
    '',
  ]) {
    assert.equal(parsePlanBranch(rejected), null, `rejects ${JSON.stringify(rejected)}`);
  }
  for (const notAString of [undefined, null, 12, {}, []]) {
    assert.equal(parsePlanBranch(notAString), null);
  }
});

test('planBranchName derives <prefix>/plan/issue-<N> and round-trips through the parser', () => {
  assert.equal(
    planBranchName({ branchPrefix: 'effective-flow', issue: 7 }),
    'effective-flow/plan/issue-7',
  );
  assert.equal(planBranchName({ branchPrefix: '', issue: 7 }), 'plan/issue-7');
  assert.equal(planBranchName({ branchPrefix: 'a/b', issue: '41' }), 'a/b/plan/issue-41');
  for (const [branchPrefix, issue] of [
    ['effective-flow', 12],
    ['', 12],
    ['a/b', 900],
  ]) {
    assert.deepEqual(parsePlanBranch(planBranchName({ branchPrefix, issue })), {
      branchPrefix,
      issue,
    });
  }
});

test('planBranchName validates the prefix and the issue in-process', () => {
  for (const branchPrefix of [
    '..',
    'a/..',
    'a..b',
    '/leading',
    'trailing/',
    'a//b',
    '.hidden',
    'trailing.',
    'a/.hidden',
    'a/trailing./b',
    'name.lock',
    'a/name.lock/b',
    'has space',
    'tab\tchar',
    'new\nline',
    'nul\0char',
    'tilde~',
    'caret^',
    'colon:',
    'question?',
    'star*',
    'bracket[',
    'back\\slash',
    'at@{brace',
    '@',
  ]) {
    assert.throws(
      () => planBranchName({ branchPrefix, issue: 1 }),
      (error) => error instanceof PlanPublicationError && error.code === 'INVALID_INPUT',
      `rejects ${JSON.stringify(branchPrefix)}`,
    );
  }
  assert.throws(
    () => planBranchName({ branchPrefix: undefined, issue: 1 }),
    (error) => error.code === 'INVALID_INPUT',
  );
  for (const issue of [0, -1, 1.5, '01', 'x', '', null, undefined, Number.NaN, 2 ** 60]) {
    assert.throws(
      () => planBranchName({ branchPrefix: 'p', issue }),
      (error) => error.code === 'INVALID_INPUT',
      `rejects issue ${String(issue)}`,
    );
  }
});

function checkRefFormatRunner(options = {}) {
  return recordingRunner(({ executable, args }) => {
    if (executable === 'git' && args[0] === 'check-ref-format') {
      return options.invalid
        ? { status: 1, stdout: '', stderr: 'fatal: not a valid branch name' }
        : { status: 0, stdout: `${args.at(-1)}\n`, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: 'unexpected call' };
  });
}

test('branch-name with only issue and branchPrefix returns the same name as the derivation', async (t) => {
  const cwd = tempDirectory(t);
  const runner = checkRefFormatRunner();
  const envelope = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'effective-flow', issue: 12 },
    { runner },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.operation, 'branch-name');
  assert.equal(envelope.dryRun, false);
  assert.deepEqual(envelope.data, { branch: 'effective-flow/plan/issue-12', issue: 12 });
  assert.equal(envelope.data.branch, planBranchName({ branchPrefix: 'effective-flow', issue: 12 }));
  // The only process the operation spawns is the ref-name check.
  assert.deepEqual(
    runner.calls.map((call) => [call.executable, call.args[0], call.args[1]]),
    [['git', 'check-ref-format', '--branch']],
  );

  const emptyPrefix = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: '', issue: '12' },
    { runner: checkRefFormatRunner() },
  );
  assert.deepEqual(emptyPrefix.data, { branch: 'plan/issue-12', issue: 12 });
});

test('branch-name without any issue returns ISSUE_REQUIRED', async (t) => {
  const cwd = tempDirectory(t);
  const runner = checkRefFormatRunner();
  const none = await executeOperation('branch-name', { cwd, branchPrefix: 'p' }, { runner });
  assert.equal(none.ok, false);
  assert.equal(none.error.code, 'ISSUE_REQUIRED');

  write(cwd, 'docs/plan/2026-10-17-no-header.md', '# Plan\n\n**Plan status:** Not implemented\n');
  const noHeader = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'p', planFile: 'docs/plan/2026-10-17-no-header.md' },
    { runner },
  );
  assert.equal(noHeader.error.code, 'ISSUE_REQUIRED');
  assert.equal(runner.calls.length, 0, 'no git call before the issue is known');
});

test('branch-name reads the issue from the plan header and reports ISSUE_MISMATCH on a difference', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'docs/plan/plan.md', '# Plan\n\n**Plan status:** Not implemented\n**Issue:** #12\n');
  const fromHeader = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'p', planFile: 'docs/plan/plan.md' },
    { runner: checkRefFormatRunner() },
  );
  assert.equal(fromHeader.data.branch, 'p/plan/issue-12');

  const agreeing = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'p', planFile: 'docs/plan/plan.md', issue: 12 },
    { runner: checkRefFormatRunner() },
  );
  assert.equal(agreeing.data.branch, 'p/plan/issue-12');

  const runner = checkRefFormatRunner();
  const mismatch = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'p', planFile: 'docs/plan/plan.md', issue: 13 },
    { runner },
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'ISSUE_MISMATCH');
  assert.deepEqual(
    { issue: mismatch.error.details.issue, header: mismatch.error.details.header },
    { issue: 13, header: 12 },
  );
  assert.equal(runner.calls.length, 0);
});

test('branch-name refuses a malformed or repeated issue header and a bad branch name', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'docs/plan/bad.md', '# Plan\n\n**Issue:** twelve\n');
  write(cwd, 'docs/plan/twice.md', '# Plan\n\n**Issue:** #1\n**Issue:** #1\n');
  write(cwd, 'docs/plan/late.md', '# Plan\n\n## Requirement\n\n**Issue:** #99\n');
  for (const planFile of ['docs/plan/bad.md', 'docs/plan/twice.md']) {
    const envelope = await executeOperation(
      'branch-name',
      { cwd, branchPrefix: 'p', planFile },
      { runner: checkRefFormatRunner() },
    );
    assert.equal(envelope.error.code, 'ISSUE_HEADER_INVALID', planFile);
  }
  // Only the header block counts; a later line with the same text is not a header.
  const late = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'p', planFile: 'docs/plan/late.md', issue: 5 },
    { runner: checkRefFormatRunner() },
  );
  assert.equal(late.data.branch, 'p/plan/issue-5');

  const invalid = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'p', issue: 1 },
    { runner: checkRefFormatRunner({ invalid: true }) },
  );
  assert.equal(invalid.error.code, 'BRANCH_INVALID');

  const badPrefix = await executeOperation(
    'branch-name',
    { cwd, branchPrefix: 'a..b', issue: 1 },
    { runner: checkRefFormatRunner() },
  );
  assert.equal(badPrefix.error.code, 'INVALID_INPUT');
});

test('parseIssueHeader reads the header block only', () => {
  assert.equal(parseIssueHeader('# T\n\n**Issue:** #7\n\n## Req\n'), 7);
  assert.equal(parseIssueHeader('# T\n\n## Req\n\n**Issue:** #7\n'), null);
  assert.equal(parseIssueHeader('# T\n'), null);
  assert.throws(() => parseIssueHeader('# T\n**Issue:** #07\n'), /header/);
});

// ---------------------------------------------------------------------------------------------
// Scan classes: both directions

test('private-key: the header line matches, a one-character shorter header does not', () => {
  for (const kind of ['', 'RSA ', 'EC ', 'OPENSSH ', 'ENCRYPTED ', 'DSA ']) {
    const header = cat('-----BEGIN ', kind, 'PRIVATE KEY-----');
    assert.deepEqual(classesOf(header), ['private-key'], header);
    assert.deepEqual(classesOf(cat('  > ', header)), ['private-key']);
    assert.deepEqual(classesOf(header.slice(0, -1)), [], `shorter: ${header.slice(0, -1)}`);
  }
  // Public material is deliberately not a finding.
  for (const harmless of [
    '-----BEGIN CERTIFICATE-----',
    '-----BEGIN PUBLIC KEY-----',
    '-----BEGIN CERTIFICATE REQUEST-----',
    '-----END PRIVATE KEY-----',
    '-----BEGIN PRIVATE-----',
  ]) {
    assert.deepEqual(classesOf(harmless), [], harmless);
  }
});

const PROVIDER_TOKEN_SHAPES = [
  ...['o', 'p', 'u', 's', 'r'].map((kind) => ({
    name: `gh${kind}_`,
    prefix: cat('gh', kind, '_'),
    minimum: 36,
    alphabet: ALNUM,
  })),
  { name: 'github_pat_', prefix: cat('github', '_pat_'), minimum: 22, alphabet: ALNUM_UNDERSCORE },
  { name: 'glpat-', prefix: cat('gl', 'pat-'), minimum: 20, alphabet: ALNUM_UNDERSCORE_DASH },
  { name: 'gitea_', prefix: cat('gi', 'tea_'), minimum: 20, alphabet: ALNUM_UNDERSCORE_DASH },
  { name: 'npm_', prefix: cat('np', 'm_'), minimum: 20, alphabet: ALNUM_UNDERSCORE_DASH },
  ...['a', 'b', 'p', 'r', 's'].map((kind) => ({
    name: `xox${kind}-`,
    prefix: cat('xo', 'x', kind, '-'),
    minimum: 10,
    alphabet: ALNUM_DASH,
  })),
  { name: 'AKIA', prefix: cat('AK', 'IA'), minimum: 16, alphabet: UPPER_DIGITS, exact: true },
  { name: 'sk-', prefix: cat('s', 'k-'), minimum: 20, alphabet: ALNUM_UNDERSCORE_DASH },
  { name: 'sk-ant-', prefix: cat('s', 'k-ant-'), minimum: 20, alphabet: ALNUM_UNDERSCORE_DASH },
];

function tokenSentence(token) {
  return `The value ${token} was pasted here.`;
}

test('provider-token: every shape matches at exactly its minimum length and not one shorter', () => {
  for (const shape of PROVIDER_TOKEN_SHAPES) {
    const atMinimum = cat(shape.prefix, chars(shape.minimum, shape.alphabet));
    const shorter = cat(shape.prefix, chars(shape.minimum - 1, shape.alphabet));
    assert.deepEqual(classesOf(tokenSentence(atMinimum)), ['provider-token'], `${shape.name} min`);
    assert.deepEqual(classesOf(tokenSentence(shorter)), [], `${shape.name} one shorter`);
    // A longer run of token characters still matches (except for the exact-length AWS shape).
    const longer = cat(shape.prefix, chars(shape.minimum + 12, shape.alphabet));
    assert.deepEqual(
      classesOf(tokenSentence(longer)),
      shape.exact ? [] : ['provider-token'],
      `${shape.name} longer`,
    );
  }
});

test('provider-token: boundary rules, the finding id and quoted placement', () => {
  const token = cat('gh', 'p_', chars(36));
  for (const wrapper of [
    (value) => `"${value}"`,
    (value) => `'${value}'`,
    (value) => `\`${value}\``,
    (value) => `(${value})`,
    (value) => `x=${value}`,
    (value) => `x:${value}`,
    (value) => `-${value}`,
    (value) => value,
  ]) {
    assert.deepEqual(classesOf(wrapper(token)), ['provider-token'], wrapper(token).slice(0, 12));
  }
  // A prefix glued to a preceding word character is not a token start.
  for (const glued of ['x', '7', '_']) {
    assert.deepEqual(classesOf(cat(glued, token)), [], `glued to ${glued}`);
  }
  const findings = scanText(`line one\nsecond ${token}\n`, 'commitMessage');
  assert.deepEqual(findings, [
    {
      id: 'provider-token:commitMessage:2',
      class: 'provider-token',
      confidence: 'high',
      field: 'commitMessage',
      line: 2,
    },
  ]);
});

test('provider-token: AWS access key ids are exactly 16 characters after the prefix', () => {
  const prefix = cat('AK', 'IA');
  assert.deepEqual(classesOf(tokenSentence(cat(prefix, chars(16, UPPER_DIGITS)))), [
    'provider-token',
  ]);
  assert.deepEqual(classesOf(tokenSentence(cat(prefix, chars(15, UPPER_DIGITS)))), []);
  assert.deepEqual(classesOf(tokenSentence(cat(prefix, chars(17, UPPER_DIGITS)))), []);
});

test('provider-token: lowercase words joined by separators are slugs, not tokens', () => {
  for (const slug of [
    cat('s', 'k-', 'this-is-a-slug-made-of-lowercase-words'),
    cat('np', 'm_', 'install_all_the_things_now'),
    cat('gi', 'tea_', 'default_branch_protection_rules'),
    cat('gl', 'pat-', 'rotate-the-project-access-token'),
    cat('gi', 'tea_', 'base_url'),
    cat('gi', 'tea_', 'login_name_config'),
  ]) {
    assert.deepEqual(classesOf(tokenSentence(slug)), [], slug);
  }
  // Kebab-case file names and branch names are never findings.
  for (const slug of [
    'docs/plan/2026-10-01-issue-1-demo.md',
    'effective-flow/plan/issue-12',
    'sk-ill-set-learning-slug',
    'a-very-long-kebab-case-slug-with-many-words-in-it',
  ]) {
    assert.deepEqual(classesOf(slug), [], slug);
  }
});

test('jwt: three base64url segments of at least 10 characters, the first starting eyJ', () => {
  const first = cat('ey', 'J', chars(7));
  const second = chars(10, ALNUM_UNDERSCORE_DASH, 1);
  const third = chars(10, ALNUM_UNDERSCORE_DASH, 2);
  assert.equal(first.length, 10);
  assert.deepEqual(classesOf(`jwt ${first}.${second}.${third}`), ['jwt']);
  assert.deepEqual(classesOf(`jwt ${first.slice(0, -1)}.${second}.${third}`), [], 'first shorter');
  assert.deepEqual(classesOf(`jwt ${first}.${second.slice(0, -1)}.${third}`), [], 'second shorter');
  assert.deepEqual(classesOf(`jwt ${first}.${second}.${third.slice(0, -1)}`), [], 'third shorter');
  assert.deepEqual(classesOf(`jwt ${first}.${second}`), [], 'two segments only');
  assert.deepEqual(classesOf(`jwt x${first}.${second}.${third}`), [], 'glued to a word');
  assert.deepEqual(classesOf(`jwt ${chars(10)}.${second}.${third}`), [], 'first not eyJ');
});

test('authorization-value: a value of at least 8 characters after Bearer, token or Basic', () => {
  for (const scheme of ['Bearer', 'token', 'Basic', 'bearer', 'BASIC']) {
    const header = `Authorization: ${scheme} ${chars(8)}`;
    assert.deepEqual(classesOf(header), ['authorization-value'], header);
    assert.deepEqual(
      classesOf(`Authorization: ${scheme} ${chars(7)}`),
      [],
      `${scheme} one shorter`,
    );
  }
  assert.deepEqual(classesOf(`authorization:Bearer ${chars(8)}`), ['authorization-value']);
  assert.deepEqual(classesOf(`curl -H "Authorization: Bearer ${chars(12)}" https://x.test/`), [
    'authorization-value',
  ]);
  // Placeholders of at least 8 characters stay silent.
  for (const placeholder of [
    '${GITHUB_TOKEN}',
    '$GITHUB_TOKEN',
    '<your-access-token>',
    '***********',
    '[REDACTED]',
    'token',
    'password',
  ]) {
    assert.deepEqual(classesOf(`Authorization: Bearer ${placeholder}`), [], placeholder);
  }
});

test('authorization-value: a standalone Bearer value needs at least 20 token characters', () => {
  assert.deepEqual(classesOf(`Send Bearer ${chars(20, BEARER_ALPHABET)} now`), [
    'authorization-value',
  ]);
  assert.deepEqual(classesOf(`Send Bearer ${chars(19, BEARER_ALPHABET)} now`), []);
  assert.deepEqual(classesOf(`xBearer ${chars(24, BEARER_ALPHABET)}`), [], 'glued to a word');
  // A slug after the word "Bearer" is prose.
  assert.deepEqual(classesOf('Bearer tokens-are-sent-in-the-header-of-every-request'), []);
});

test('url-credential: a non-empty password between the colon and the at sign', () => {
  for (const scheme of ['https', 'http', 'ftp', 'postgres', 'git+https']) {
    const url = `${scheme}://user:${chars(1)}@example.test/o/r.git`;
    assert.deepEqual(classesOf(url), ['url-credential'], url);
  }
  assert.deepEqual(classesOf('https://user:@example.test/o/r.git'), [], 'empty password');
  assert.deepEqual(classesOf(`clone https://deploy:${chars(24)}@example.test/o/r.git`), [
    'url-credential',
  ]);
  // Userinfo without a password, scp-style and ssh remotes, and placeholders are not findings.
  for (const harmless of [
    'git@github.com:owner/repo.git',
    'ssh://git@host.test/owner/repo',
    'https://user@host.test/owner/repo',
    'https://user:password@host.test/owner/repo',
    'https://user:${PASS}@host.test/owner/repo',
    'https://user:$PASS@host.test/owner/repo',
    'https://user:<password>@host.test/owner/repo',
    'https://user:***@host.test/owner/repo',
    'https://user:[REDACTED]@host.test/owner/repo',
    'https://example.test/owner/repo',
    'mailto:someone@example.test',
  ]) {
    assert.deepEqual(classesOf(harmless), [], harmless);
  }
});

test('attribution: the generation-attribution patterns, case-insensitively', () => {
  for (const text of [
    cat('Generated with ', 'Claude Code'),
    cat('generated WITH ', 'codex'),
    cat('claude', '.ai/code/session_1'),
    cat('Co-Authored', '-By: Someone <a@b.test>'),
    cat('co-authored', '-by: x'),
  ]) {
    assert.deepEqual(classesOf(text), ['attribution'], text);
  }
  for (const harmless of [
    cat('Generated with ', 'Code'),
    cat('claude', '.ai/cod'),
    cat('Co-Authored', '-By trailer is forbidden'),
    'The Claude Code harness is a target.',
  ]) {
    assert.deepEqual(classesOf(harmless), [], harmless);
  }
  // The finding is a high-confidence one in every field.
  for (const field of ['plan', 'title', 'body', 'commitMessage']) {
    const [finding] = scanText(cat('Generated with ', 'Claude Code'), field);
    assert.equal(finding.confidence, 'high');
    assert.equal(finding.id, `attribution:${field}:1`);
  }
});

test('credential-assignment: a closed key list assigned a literal value', () => {
  for (const assignment of [
    'token=x',
    'password: hunter2',
    'API_KEY=abc123',
    'GITHUB_TOKEN=abc',
    'AWS_SECRET_ACCESS_KEY=abc',
    '"secret": "value"',
    "'client_secret': 'value'",
    'export db_password=value',
    'access-token: value',
    'private key = value',
    'session_id=abc',
    'Password : value',
  ]) {
    assert.deepEqual(classesOf(assignment), ['credential-assignment'], assignment);
    const [finding] = scanText(assignment, 'body');
    assert.equal(finding.confidence, 'lower');
  }
  assert.deepEqual(classesOf('token='), [], 'no value');
  assert.deepEqual(classesOf('token:'), [], 'no value after a colon');
  assert.deepEqual(classesOf('password ='), []);
});

test('credential-assignment: names, placeholders and instructions are not findings', () => {
  for (const harmless of [
    'GH_TOKEN',
    'Set GH_TOKEN before running the script.',
    'token: <token>',
    'password=***',
    'secret: [REDACTED]',
    'token=${TOKEN}',
    'password: $VAR',
    'password: $PASSWORD',
    'token={{x}}',
    'GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '  GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}"',
    'token: ${{secrets.NPM_TOKEN}}',
    'password: {{ vault_password }}',
    'password: password',
    'token: token',
    'api_key: secret',
    'secret: pass',
    'pwd=pwd',
    'Token: never store it in the repository',
    'password: do not commit it',
    'max_tokens: 4096',
    'tokenizer: foo',
    'secrets: none',
    'the token is rotated weekly',
  ]) {
    assert.deepEqual(classesOf(harmless), [], harmless);
  }
});

test('absolute-local-path: the listed roots match, near misses and relative paths do not', () => {
  for (const sample of [
    'see /Users/someone/work',
    'in /home/runner/work',
    'at /root/.ssh',
    'under /private/var/folders/xy',
    'cache /var/folders/ab/cd',
    'scratch /tmp/build',
    'path C:\\Users\\x',
    'path d:\\work',
  ]) {
    assert.deepEqual(classesOf(sample), ['absolute-local-path'], sample);
    assert.equal(scanText(sample, 'plan')[0].confidence, 'lower');
  }
  // Exactly the minimum: the root with its trailing separator.
  assert.deepEqual(classesOf('/tmp/'), ['absolute-local-path']);
  assert.deepEqual(classesOf('/tmp'), [], '/tmp without the separator');
  assert.deepEqual(classesOf('/Users'), []);
  assert.deepEqual(classesOf('/hom/x'), []);
  assert.deepEqual(classesOf('C:'), []);
  assert.deepEqual(classesOf('C:/x'), []);
  // Repository-relative paths and paths that merely contain a root segment are not findings.
  for (const harmless of [
    'src/shared/plan-publication.md',
    'docs/plan/2026-10-01-shared-plan-publication-core.md',
    '.effective-flow/runtime/state.json',
    './tmp/build',
    '~/tmp/build',
    'src/tmp/build',
    'https://example.test/home/user',
    'a/Users/b',
    'cd ../home/x',
  ]) {
    assert.deepEqual(classesOf(harmless), [], harmless);
  }
});

test('every listed non-finding produces no finding in any field', () => {
  const nonFindings = [
    'src/shared/plan-publication.md',
    'docs/plan/2026-10-01-shared-plan-publication-core.md',
    '.effective-flow/.worktrees/x',
    'GH_TOKEN',
    'export GH_TOKEN before the run',
    '<token>',
    '***',
    '[REDACTED]',
    '${VAR}',
    'git@github.com:owner/repo',
    'ssh://git@host.test/owner/repo',
    'https://user@host.test/owner/repo',
    'gitea_base_url',
    'effective-flow-plan-publication-core',
    '2026-10-17-issue-12-demo',
  ];
  for (const field of ['plan', 'title', 'body', 'commitMessage']) {
    for (const text of nonFindings) {
      assert.deepEqual(scanText(`docs: note ${text} end`, field), [], `${field}: ${text}`);
    }
  }
});

test('fenced code blocks are scanned like prose and the line number counts every line', () => {
  const token = cat('gh', 'o_', chars(36));
  const text = ['# Title', '', '```sh', 'echo hi', `export X=${token}`, '```', ''].join('\n');
  assert.deepEqual(
    scanText(text, 'plan').map((finding) => finding.id),
    ['provider-token:plan:5'],
  );
  const crlf = `first\r\nsecond ${token}\r\nthird\r\n`;
  assert.deepEqual(
    scanText(crlf, 'plan').map((finding) => finding.line),
    [2],
  );
});

test('one line can carry several classes and they stay in class order', () => {
  const token = cat('gh', 'p_', chars(36));
  const line = `password: hunter2x ${token} /Users/someone/x`;
  assert.deepEqual(
    scanText(line, 'body').map((finding) => finding.class),
    ['provider-token', 'credential-assignment', 'absolute-local-path'],
  );
});

test('the class table lists the eight classes with their confidence', () => {
  assert.deepEqual(
    SCAN_CLASSES.map((entry) => [entry.class, entry.confidence]),
    [
      ['private-key', 'high'],
      ['provider-token', 'high'],
      ['jwt', 'high'],
      ['authorization-value', 'high'],
      ['url-credential', 'high'],
      ['attribution', 'high'],
      ['credential-assignment', 'lower'],
      ['absolute-local-path', 'lower'],
    ],
  );
});

// ---------------------------------------------------------------------------------------------
// redact() and scan agree on a fixed list of realistic secrets

// Each entry is one realistic secret in a context both detectors read: the prefix with its real
// length, assembled at runtime. Userinfo-only URLs and prefix-only identifiers are deliberately
// absent. `redact()` has no pattern for the glpat, npm, xox, AKIA, sk and JWT shapes, so those are
// proven against `scan` alone, in the class tests above.
function realisticSecrets() {
  const secrets = [];
  for (const kind of ['o', 'p', 'u', 's', 'r']) {
    const value = cat('gh', kind, '_', chars(36, ALNUM, kind.charCodeAt(0)));
    secrets.push({ name: `gh${kind}_ (36)`, value, line: `GH_TOKEN was set to ${value} here` });
  }
  const pat = cat('github', '_pat_', chars(11, ALNUM), '_', chars(59, ALNUM));
  secrets.push({ name: 'github_pat_ (82)', value: pat, line: `fine-grained token ${pat}` });
  const gitea = cat('gi', 'tea_', chars(40, ALNUM_UNDERSCORE_DASH, 5));
  secrets.push({ name: 'gitea_ (40)', value: gitea, line: `pasted ${gitea} by mistake` });
  const bearer = chars(40, ALNUM, 9);
  secrets.push({
    name: 'Authorization Bearer',
    value: bearer,
    line: `Authorization: Bearer ${bearer}`,
  });
  const scheme = chars(40, ALNUM, 11);
  secrets.push({
    name: 'Authorization token',
    value: scheme,
    line: `Authorization: token ${scheme}`,
  });
  const basic = Buffer.from(`deploy:${chars(12)}`).toString('base64');
  secrets.push({
    name: 'Authorization Basic',
    value: basic,
    line: `Authorization: Basic ${basic}`,
  });
  const password = chars(24, ALNUM, 13);
  secrets.push({
    name: 'url password',
    value: password,
    line: `git clone https://deploy:${password}@git.example.test/o/r.git`,
  });
  const dbPassword = chars(16, ALNUM, 17);
  secrets.push({
    name: 'database url',
    value: dbPassword,
    line: `DATABASE_URL=postgres://app:${dbPassword}@db.example.test:5432/app`,
  });
  return secrets;
}

test('redact() and scan agree on a fixed list of realistic secrets', () => {
  const secrets = realisticSecrets();
  assert.ok(secrets.length >= 12);
  for (const secret of secrets) {
    const redacted = redact(secret.line);
    assert.ok(!redacted.includes(secret.value), `redact() removes ${secret.name}`);
    const findings = scanText(secret.line, 'body');
    assert.ok(
      findings.some((finding) => finding.confidence === 'high'),
      `scan reports a high-confidence finding for ${secret.name}`,
    );
  }
});

// `redact()` over-redacts both: it replaces any userinfo and any `gitea_`-prefixed identifier. That
// is why neither is in the fixed list above, and why scan, which refuses publication, must not
// share the over-reach.
test('scan reports nothing for userinfo-only URLs and prefix-only identifiers', () => {
  for (const harmless of [
    'git@github.com:owner/repo.git',
    'ssh://git@host.test/owner/repo',
    'https://user@host.test/owner/repo',
    'gitea_base_url',
    'GH_TOKEN',
  ]) {
    assert.deepEqual(classesOf(`remote ${harmless}`), [], harmless);
  }
});

// ---------------------------------------------------------------------------------------------
// Confidence rules and the envelope never carries a matched value

function everyClassFixture() {
  const secrets = {
    token: cat('gh', 'p_', chars(36)),
    jwt: `${cat('ey', 'J', chars(7))}.${chars(10, ALNUM_UNDERSCORE_DASH, 1)}.${chars(10, ALNUM_UNDERSCORE_DASH, 2)}`,
    authorization: chars(10, ALNUM, 4),
    urlPassword: chars(14, ALNUM, 6),
    assignment: cat('hunter', '2x'),
    userPath: '/Users/someone/work',
  };
  const lines = [
    cat('-----BEGIN ', 'PRIVATE KEY-----'),
    `The value ${secrets.token} is leaked.`,
    secrets.jwt,
    `Authorization: Bearer ${secrets.authorization}`,
    `https://user:${secrets.urlPassword}@example.test/a.git`,
    cat('Generated with ', 'Claude Code'),
    `password: ${secrets.assignment}`,
    `see ${secrets.userPath}`,
  ];
  return { secrets, text: `${lines.join('\n')}\n` };
}

const EVERY_CLASS_IDS = [
  'private-key:plan:1',
  'provider-token:plan:2',
  'jwt:plan:3',
  'authorization-value:plan:4',
  'url-credential:plan:5',
  'attribution:plan:6',
  'credential-assignment:plan:7',
  'absolute-local-path:plan:8',
];
const HIGH_IDS = EVERY_CLASS_IDS.slice(0, 6);
const LOWER_IDS = EVERY_CLASS_IDS.slice(6);

test('scan: on an unattended run every finding is blocking and nothing is acknowledgeable', async (t) => {
  const cwd = tempDirectory(t);
  const { text, secrets } = everyClassFixture();
  write(cwd, 'plan.md', text);
  const envelope = await run('scan', { cwd, runState: 'unattended', planFile: 'plan.md' });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.operation, 'scan');
  assert.equal(envelope.dryRun, false);
  assert.deepEqual(
    envelope.data.findings.map((finding) => finding.id),
    EVERY_CLASS_IDS,
  );
  assert.deepEqual(envelope.data.blocking, EVERY_CLASS_IDS);
  assert.deepEqual(envelope.data.acknowledgeable, []);
  assert.equal(envelope.data.runState, 'unattended');
  assert.equal(envelope.data.planFile, 'plan.md');
  assertNoSecrets(envelope, secrets);
});

test('scan: on an interactive run high findings block and lower findings are acknowledgeable', async (t) => {
  const cwd = tempDirectory(t);
  const { text, secrets } = everyClassFixture();
  write(cwd, 'plan.md', text);
  const envelope = await run('scan', { cwd, runState: 'interactive', planFile: 'plan.md' });
  assert.equal(envelope.ok, true);
  assert.deepEqual(envelope.data.blocking, HIGH_IDS);
  assert.deepEqual(envelope.data.acknowledgeable, LOWER_IDS);
  for (const id of LOWER_IDS) assert.ok(!envelope.data.blocking.includes(id));
  for (const finding of envelope.data.findings) {
    assert.deepEqual(Object.keys(finding).sort(), ['class', 'confidence', 'field', 'id', 'line']);
    assert.equal(finding.id, `${finding.class}:${finding.field}:${finding.line}`);
  }
  assertNoSecrets(envelope, secrets);

  // Only lower findings: nothing blocks, everything is acknowledgeable.
  write(cwd, 'lower.md', `password: ${secrets.assignment}\nsee ${secrets.userPath}\n`);
  const lowerOnly = await run('scan', { cwd, runState: 'interactive', planFile: 'lower.md' });
  assert.deepEqual(lowerOnly.data.blocking, []);
  assert.deepEqual(lowerOnly.data.acknowledgeable, [
    'credential-assignment:plan:1',
    'absolute-local-path:plan:2',
  ]);
});

function assertNoSecrets(envelope, secrets) {
  const serialized = JSON.stringify(envelope);
  for (const value of Object.values(secrets)) {
    assert.ok(!serialized.includes(value), `the envelope never carries ${value.slice(0, 6)}…`);
  }
  assert.ok(!serialized.includes('hunter'), 'no assigned literal');
}

test('scan: title, body and commit message are scanned as their own fields and reported by field', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'plan.md', '# Plan\n\nClean text.\n');
  const token = cat('gh', 'p_', chars(36));
  const envelope = await run('scan', {
    cwd,
    runState: 'unattended',
    planFile: 'plan.md',
    title: `docs: plan ${token}`,
    body: `Line one.\nAuthorization: token ${chars(12)}\n`,
    commitMessage: `docs: plan\n\npassword: ${cat('hunter', '2x')}\n`,
  });
  assert.equal(envelope.ok, true);
  assert.deepEqual(
    envelope.data.findings.map((finding) => finding.id),
    [
      'provider-token:title:1',
      'authorization-value:body:2',
      'credential-assignment:commitMessage:3',
    ],
  );
  assert.deepEqual(
    envelope.data.blocking,
    envelope.data.findings.map((finding) => finding.id),
  );
  assert.ok(!JSON.stringify(envelope).includes(token));
});

test('scan: a clean plan returns ok with no findings', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'docs/plan/plan.md', '# Plan\n\nSee `src/shared/plan-publication.md`.\n');
  for (const runState of ['interactive', 'unattended']) {
    const envelope = await run('scan', { cwd, runState, planFile: 'docs/plan/plan.md' });
    assert.deepEqual(envelope.data, {
      planFile: 'docs/plan/plan.md',
      runState,
      findings: [],
      blocking: [],
      acknowledgeable: [],
    });
  }
});

test('scan: the in-process entry scans blob bytes strictly', () => {
  const token = cat('gh', 'p_', chars(36));
  const result = scanEntries(
    [{ field: 'plan', bytes: Buffer.from(`value ${token}\n`) }],
    'unattended',
  );
  assert.deepEqual(result.blocking, ['provider-token:plan:1']);
  assert.throws(
    () => scanEntries([{ field: 'plan', bytes: Buffer.from([0x61, 0xff, 0x62]) }], 'unattended'),
    (error) => error.code === 'INVALID_CONTENT' && error.details.reason === 'invalid-utf8',
  );
  assert.throws(
    () => scanEntries([{ field: 'plan', bytes: Buffer.from([0x61, 0x00, 0x62]) }], 'unattended'),
    (error) => error.code === 'INVALID_CONTENT' && error.details.reason === 'nul',
  );
  assert.throws(
    () => scanEntries([{ field: 'plan', text: 'x' }], 'bogus'),
    (error) => error.code === 'INVALID_INPUT',
  );
  assert.throws(
    () => decodePlanBytes(Buffer.from([0xc3, 0x28])),
    (error) => error.code === 'INVALID_CONTENT',
  );
  assert.equal(decodePlanBytes(Buffer.from('ümlaut ✓', 'utf8')), 'ümlaut ✓');
});

// ---------------------------------------------------------------------------------------------
// scan: self-scan and input rules

// The plan of this work is archived once it is implemented, so its path is resolved from whichever
// of `docs/plan/` and `docs/plan/archive/` holds it; archiving it must not break this suite.
function resolvePlanPath(name) {
  for (const directory of ['docs/plan', 'docs/plan/archive']) {
    const candidate = `${directory}/${name}`;
    if (existsSync(join(REPOSITORY_ROOT, candidate))) return candidate;
  }
  return `docs/plan/${name}`;
}

for (const planFile of [
  resolvePlanPath('2026-10-01-shared-plan-publication-core.md'),
  'src/shared/plan-publication.md',
]) {
  test(`scan: interactive self-scan of ${planFile} reports no high-confidence finding`, async () => {
    const envelope = await run('scan', {
      cwd: REPOSITORY_ROOT,
      runState: 'interactive',
      planFile,
    });
    assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
    const high = envelope.data.findings.filter((finding) => finding.confidence === 'high');
    assert.deepEqual(high, [], `high-confidence findings in ${planFile}`);
    assert.deepEqual(
      envelope.data.blocking,
      [],
      `an interactive run blocks only high findings in ${planFile}`,
    );
  });
}

test('scan: the closed schema refuses unknown keys, missing keys and a bad runState', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'plan.md', '# Plan\n');
  const valid = { cwd, runState: 'interactive', planFile: 'plan.md' };
  assert.equal((await run('scan', valid)).ok, true);
  for (const extra of [
    { bytes: 'abc' },
    { blob: 'abc' },
    { issue: 1 },
    { visibility: 'standard' },
    { planDir: 'docs/plan' },
    { dryRun: true },
  ]) {
    const envelope = await run('scan', { ...valid, ...extra });
    assert.equal(envelope.ok, false, JSON.stringify(extra));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.deepEqual(envelope.error.details.keys, Object.keys(extra));
  }
  for (const missing of ['cwd', 'runState', 'planFile']) {
    const { [missing]: _omitted, ...rest } = valid;
    assert.equal((await run('scan', rest)).error.code, 'INVALID_INPUT', missing);
  }
  assert.equal((await run('scan', { ...valid, runState: 'batch' })).error.code, 'INVALID_INPUT');
  assert.equal((await run('scan', { ...valid, cwd: 'relative/dir' })).error.code, 'INVALID_INPUT');
  assert.equal(
    (await run('scan', { ...valid, cwd: join(cwd, 'missing') })).error.code,
    'INVALID_INPUT',
  );
  assert.equal((await run('scan', { ...valid, title: 7 })).error.code, 'INVALID_INPUT');
  assert.equal((await run('scan', null)).error.code, 'INVALID_INPUT');
  assert.equal((await run('scan', [])).error.code, 'INVALID_INPUT');
});

test('scan: the plan must be a regular Markdown file physically inside cwd', async (t) => {
  const cwd = tempDirectory(t);
  const outside = tempDirectory(t);
  write(cwd, 'plan.md', '# Plan\n');
  write(outside, 'outside.md', '# Outside\n');
  symlinkSync(join(outside, 'outside.md'), join(cwd, 'link.md'));
  symlinkSync(outside, join(cwd, 'linked-dir'));
  mkdirSync(join(cwd, 'dir.md'));
  const base = { cwd, runState: 'interactive' };
  const cases = [
    ['../outside.md', 'UNSAFE_PATH'],
    [join(outside, 'outside.md'), 'UNSAFE_PATH'],
    ['a/../../outside.md', 'UNSAFE_PATH'],
    ['plan.txt', 'UNSAFE_PATH'],
    ['link.md', 'UNSAFE_PATH'],
    ['linked-dir/outside.md', 'UNSAFE_PATH'],
    ['dir.md', 'UNSAFE_PATH'],
    ['missing.md', 'NOT_FOUND'],
    ['', 'INVALID_INPUT'],
    ['back\\slash.md', 'UNSAFE_PATH'],
  ];
  for (const [planFile, code] of cases) {
    const envelope = await run('scan', { ...base, planFile });
    assert.equal(envelope.ok, false, planFile);
    assert.equal(envelope.error.code, code, planFile);
  }
});

test('scan: a plan with NUL or invalid UTF-8 is refused from its bytes', async (t) => {
  const cwd = tempDirectory(t);
  writeFileSync(join(cwd, 'nul.md'), Buffer.from('# Plan\n\nbefore\0after\n'));
  writeFileSync(join(cwd, 'utf8.md'), Buffer.from([0x23, 0x20, 0x50, 0xff, 0xfe, 0x0a]));
  writeFileSync(join(cwd, 'ok.md'), Buffer.from('# Plan ü ✓\n', 'utf8'));
  const base = { cwd, runState: 'unattended' };
  const nul = await run('scan', { ...base, planFile: 'nul.md' });
  assert.equal(nul.error.code, 'INVALID_CONTENT');
  assert.equal(nul.error.details.reason, 'nul');
  const utf8 = await run('scan', { ...base, planFile: 'utf8.md' });
  assert.equal(utf8.error.code, 'INVALID_CONTENT');
  assert.equal(utf8.error.details.reason, 'invalid-utf8');
  assert.equal((await run('scan', { ...base, planFile: 'ok.md' })).ok, true);
  const nulTitle = await run('scan', { ...base, planFile: 'ok.md', title: 'docs: a\0b' });
  assert.equal(nulTitle.error.code, 'INVALID_CONTENT');
});

test('an unknown operation is INVALID_INPUT with a null operation', async () => {
  const envelope = await executeOperation('frobnicate', {}, { runner: recordingRunner() });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.operation, null);
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assert.equal(exitCodeFor(envelope), 2);
  const internal = errorEnvelope('scan', new Error('boom'));
  assert.equal(internal.error.code, 'INTERNAL');
  assert.equal(exitCodeFor(internal), 1);
});

// ---------------------------------------------------------------------------------------------
// Publication input rules: nothing reaches Git or the forge

const KEYWORDS = [
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
const REFERENCES = ['#12', 'owner/repo#12', 'https://github.com/owner/repo/issues/12'];

function publishInput(overrides = {}) {
  return {
    cwd: REPOSITORY_ROOT,
    runState: 'unattended',
    visibility: 'standard',
    issue: 12,
    planDir: 'docs/plan',
    planFile: 'docs/plan/2026-10-17-issue-12-demo.md',
    branchPrefix: 'effective-flow',
    remote: 'origin',
    baseBranch: 'main',
    title: 'docs: plan demo',
    body: 'Adds the plan for the demo.\n\nRequirement: ship the demo.',
    commitMessage: 'docs: plan demo',
    ...overrides,
  };
}

function completeBranchInput(overrides = {}) {
  const { planFile: _planFile, commitMessage: _commitMessage, ...rest } = publishInput();
  return { ...rest, branch: 'effective-flow/plan/issue-12', ...overrides };
}

const MUTATING = [
  ['publish', publishInput],
  ['complete-branch', completeBranchInput],
];

for (const [operation, makeInput] of MUTATING) {
  test(`${operation}: schema, runState, visibility and hidden mode are refused with zero runner calls`, async () => {
    const refusals = [
      ['runState interactive', { runState: 'interactive' }, 'INVALID_INPUT'],
      ['runState missing', { runState: undefined }, 'INVALID_INPUT'],
      ['runState other', { runState: 'batch' }, 'INVALID_INPUT'],
      ['unknown key', { surprise: true }, 'INVALID_INPUT'],
      ['dropped key branchMode', { branchMode: 'update' }, 'INVALID_INPUT'],
      ['dropped key target', { target: 'direct-commit' }, 'INVALID_INPUT'],
      ['dropped key baseRef', { baseRef: 'origin/main' }, 'INVALID_INPUT'],
      ['dropped key allowArchiveReturn', { allowArchiveReturn: true }, 'INVALID_INPUT'],
      ['dropped key expectedBranchOid', { expectedBranchOid: 'a'.repeat(40) }, 'INVALID_INPUT'],
      ['dropped key acknowledged', { acknowledged: ['x'] }, 'INVALID_INPUT'],
      ['missing issue', { issue: undefined }, 'INVALID_INPUT'],
      ['issue zero', { issue: 0 }, 'INVALID_INPUT'],
      ['issue leading zero', { issue: '012' }, 'INVALID_INPUT'],
      ['issue negative', { issue: -3 }, 'INVALID_INPUT'],
      ['issue fraction', { issue: 1.5 }, 'INVALID_INPUT'],
      ['issue text', { issue: 'twelve' }, 'INVALID_INPUT'],
      ['missing visibility', { visibility: undefined }, 'INVALID_INPUT'],
      ['visibility other', { visibility: 'public' }, 'INVALID_INPUT'],
      ['visibility empty', { visibility: '' }, 'INVALID_INPUT'],
      ['hidden', { visibility: 'hidden' }, 'HIDDEN_MODE_UNSUPPORTED'],
      ['missing cwd', { cwd: undefined }, 'INVALID_INPUT'],
      ['missing planDir', { planDir: undefined }, 'INVALID_INPUT'],
      ['missing remote', { remote: undefined }, 'INVALID_INPUT'],
      ['remote as a URL', { remote: 'https://github.com/o/r.git' }, 'INVALID_INPUT'],
      ['remote with a slash', { remote: 'a/b' }, 'INVALID_INPUT'],
      ['remote with a leading dash', { remote: '-origin' }, 'INVALID_INPUT'],
      ['missing baseBranch', { baseBranch: undefined }, 'INVALID_INPUT'],
      ['baseBranch with dots', { baseBranch: 'a..b' }, 'INVALID_INPUT'],
      ['baseBranch with a space', { baseBranch: 'my branch' }, 'INVALID_INPUT'],
      ['missing title', { title: undefined }, 'INVALID_INPUT'],
      ['missing body', { body: undefined }, 'INVALID_INPUT'],
      ['empty body', { body: '   ' }, 'INVALID_INPUT'],
      ['absolute planDir', { planDir: '/etc' }, 'UNSAFE_PATH'],
      ['planDir with ..', { planDir: '../x' }, 'UNSAFE_PATH'],
    ];
    for (const [label, overrides, code] of refusals) {
      for (const apply of [false, true]) {
        const runner = recordingRunner();
        const envelope = await executeOperation(operation, makeInput(overrides), {
          apply,
          runner,
        });
        assert.equal(envelope.ok, false, `${label} (apply: ${apply})`);
        assert.equal(envelope.operation, operation);
        assert.equal(envelope.dryRun, !apply);
        assert.equal(envelope.error.code, code, `${label}: ${envelope.error.message}`);
        assert.equal(exitCodeFor(envelope), code === 'INVALID_INPUT' ? 2 : 1, label);
        assert.equal(runner.calls.length, 0, `${label}: no Git or forge call`);
      }
    }
  });

  test(`${operation}: non-object input is INVALID_INPUT with zero runner calls`, async () => {
    for (const input of [null, [], 'text', 7]) {
      const runner = recordingRunner();
      const envelope = await executeOperation(operation, input, { apply: true, runner });
      assert.equal(envelope.error.code, 'INVALID_INPUT');
      assert.equal(runner.calls.length, 0);
    }
  });

  test(`${operation}: without an injected runner the operation refuses instead of spawning`, async () => {
    const envelope = await executeOperation(operation, makeInput(), { apply: true });
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.match(envelope.error.message, /injected process runner/);
  });
}

test('publish: the title rule refuses a multi-line or non-docs title with zero runner calls', async () => {
  const refusals = [
    'feat: plan demo',
    'fix: plan demo',
    'docs plan demo',
    'docs:plan demo',
    'Docs: plan demo',
    'docs(: plan demo',
    'docs(scope with space): plan demo',
    'plan demo',
    'docs: plan demo\nsecond line',
    'docs: plan demo\r\nsecond line',
    'docs: first\rsecond',
    '\ndocs: plan demo',
    ' docs: plan demo',
    'docs: ',
    'docs:',
  ];
  for (const title of refusals) {
    const runner = recordingRunner();
    const envelope = await executeOperation('publish', publishInput({ title }), {
      apply: true,
      runner,
    });
    assert.equal(envelope.error.code, 'INVALID_TITLE', JSON.stringify(title));
    assert.equal(runner.calls.length, 0, JSON.stringify(title));
  }
  assert.equal(validateTitle('docs: plan demo'), 'docs: plan demo');
  assert.equal(validateTitle('docs(plan): demo'), 'docs(plan): demo');

  for (const commitMessage of ['feat: x', 'docs x', '\ndocs: x', 'docs:x']) {
    const runner = recordingRunner();
    const envelope = await executeOperation('publish', publishInput({ commitMessage }), {
      apply: true,
      runner,
    });
    assert.equal(envelope.error.code, 'INVALID_COMMIT_MESSAGE', JSON.stringify(commitMessage));
    assert.equal(runner.calls.length, 0);
  }
  assert.equal(validateCommitMessage('docs: demo\n\nbody\n'), 'docs: demo\n\nbody\n');
});

// ---------------------------------------------------------------------------------------------
// Closing keywords

const CASINGS = [
  (value) => value,
  (value) => value.toUpperCase(),
  (value) => value[0].toUpperCase() + value.slice(1),
  (value) => value.replace(/./g, (c, i) => (i % 2 ? c.toUpperCase() : c)),
];
const SEPARATORS = [' ', ': ', ':', '  '];

function* closingTexts({ casings = CASINGS, separators = SEPARATORS } = {}) {
  for (const keyword of KEYWORDS) {
    for (const casing of casings) {
      for (const separator of separators) {
        for (const reference of REFERENCES) {
          yield `${casing(keyword)}${separator}${reference}`;
        }
      }
    }
  }
}

test('closing keywords: all nine, any case, with and without a colon, in all three reference forms', () => {
  let count = 0;
  for (const text of closingTexts()) {
    count += 1;
    assert.equal(hasClosingKeyword(text), true, text);
    assert.throws(
      () => validateTitle(`docs: ${text}`),
      (error) => error.code === 'CLOSING_KEYWORD' && error.details.field === 'title',
      `title: ${text}`,
    );
    assert.throws(
      () => validateCommitMessage(`docs: demo\n\n${text}\n`),
      (error) => error.code === 'CLOSING_KEYWORD' && error.details.field === 'commitMessage',
      `commit message: ${text}`,
    );
  }
  assert.equal(count, 9 * 4 * 4 * 3);
});

test('closing keywords: publish refuses them in the title, the commit message and the body with zero runner calls', async () => {
  const fieldOverrides = {
    title: (text) => ({ title: `docs: plan ${text}` }),
    commitMessage: (text) => ({ commitMessage: `docs: plan demo\n\n${text}\n` }),
    body: (text) => ({ body: `Adds the plan.\n\n${text}\n\nMore prose.` }),
  };
  let checked = 0;
  // The full matrix runs through the validators above; the operation sees every keyword in two
  // casings, with and without a colon, and all three reference forms.
  const sample = closingTexts({ casings: [CASINGS[0], CASINGS[1]], separators: [' ', ': ', ':'] });
  for (const text of sample) {
    for (const [field, make] of Object.entries(fieldOverrides)) {
      const runner = recordingRunner();
      const envelope = await executeOperation('publish', publishInput(make(text)), {
        apply: true,
        runner,
      });
      assert.equal(envelope.ok, false, `${field}: ${text}`);
      assert.equal(envelope.error.code, 'CLOSING_KEYWORD', `${field}: ${text}`);
      assert.equal(envelope.error.details.field, field);
      assert.equal(runner.calls.length, 0, `${field}: ${text}`);
      checked += 1;
    }
  }
  assert.equal(checked, 9 * 2 * 3 * 3 * 3);
});

test('closing keywords: non-closing references and unrelated words pass', () => {
  for (const text of [
    'Refs #12',
    'refs owner/repo#12',
    'See #12 for the discussion',
    'prefix: #3',
    'fixture #3',
    'closest #3',
    'discloses #4',
    'fix the bug in #12',
    'closed form solutions #12',
    'resolves the conflict',
    'Closes the loop',
    'fixes: none',
    'issue #12',
  ]) {
    assert.equal(hasClosingKeyword(text), false, text);
    assert.equal(validateTitle(`docs: ${text}`), `docs: ${text}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Marker and body

const PLAN_PATH = 'docs/plan/2026-10-17-issue-12-demo.md';

test('the body ends with the marker line and then Refs #<N>, and the marker round-trips', () => {
  const body = buildPullRequestBody('Adds the plan.\n\nRequirement: ship it.\n\n', PLAN_PATH, 12);
  const lines = body.split('\n');
  assert.equal(lines.at(-1), 'Refs #12');
  assert.equal(
    lines.at(-2),
    `<!-- effective-flow-plan-pr:v1 ${JSON.stringify({ plan: PLAN_PATH })} -->`,
  );
  assert.equal(lines.at(-2), buildPlanPrMarkerLine(PLAN_PATH));
  assert.equal(lines.at(-3), '', 'the marker is separated from the prose by an empty line');
  assert.equal(lines.filter((line) => line.includes('effective-flow-plan-pr')).length, 1);
  assert.ok(body.startsWith('Adds the plan.\n\nRequirement: ship it.\n\n<!--'));
  assert.deepEqual(inspectPlanPrMarker(body), { status: 'valid', plan: PLAN_PATH });
});

test('the marker is exact for a path holding a quote or spaces', () => {
  for (const planPath of [
    'docs/plan/2026-10-17-issue-12-the "quoted" name.md',
    'docs/plan/2026-10-17-issue-12-with spaces here.md',
    "docs/plan/2026-10-17-issue-12-a & b ; $x `y` 'z'.md",
    'docs/plan/2026-10-17-issue-12-ümlaut.md',
  ]) {
    const body = buildPullRequestBody('Prose.', planPath, 5);
    const lines = body.split('\n');
    assert.equal(
      lines.at(-2),
      `<!-- effective-flow-plan-pr:v1 ${JSON.stringify({ plan: planPath })} -->`,
    );
    assert.equal(lines.at(-1), 'Refs #5');
    assert.deepEqual(inspectPlanPrMarker(body), { status: 'valid', plan: planPath }, planPath);
  }
  assert.ok(
    buildPlanPrMarkerLine('a/"b".md').includes('\\"b\\"'),
    'a quote travels JSON-escaped, in the canonical spelling',
  );
});

test('a caller body with a marker line or marker comment is MARKER_INVALID', () => {
  const marker = buildPlanPrMarkerLine(PLAN_PATH);
  for (const prose of [
    `Prose.\n\n${marker}`,
    `${marker}\nProse.`,
    `Prose with ${marker} inline`,
    `Prose.\n\n<!-- effective-flow-plan-pr:v1 {"plan":"other.md"} -->`,
    'Prose.\n\n<!-- effective-flow-plan-pr:v1 not json -->',
    'Prose.\n\n<!-- effective-flow-plan-pr:v2 {} -->',
    `Prose.\n\n${marker}\n${marker}`,
    '   <!-- effective-flow-plan-pr:v1 {"plan":"x.md"} -->   ',
  ]) {
    assert.throws(
      () => buildPullRequestBody(prose, PLAN_PATH, 12),
      (error) => error.code === 'MARKER_INVALID',
      prose,
    );
  }
  // A path the shipped marker grammar refuses cannot be published either.
  for (const planPath of ['a/\u202eb.md', 'a/b\u200b.md', ':x.md', 'a/b.txt']) {
    assert.throws(
      () => buildPullRequestBody('Prose.', planPath, 12),
      (error) => error.code === 'MARKER_INVALID',
      JSON.stringify(planPath),
    );
  }
});

test('publish: a caller body holding a marker is MARKER_INVALID with zero runner calls', async () => {
  const marker = buildPlanPrMarkerLine(PLAN_PATH);
  for (const body of [
    `Prose.\n\n${marker}`,
    'Prose <!-- effective-flow-plan-pr:v1 {"plan":"x.md"} --> trailing',
  ]) {
    const runner = recordingRunner();
    const envelope = await executeOperation('publish', publishInput({ body }), {
      apply: true,
      runner,
    });
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'MARKER_INVALID');
    assert.equal(runner.calls.length, 0);
  }
  const runner = recordingRunner();
  const unsafe = await executeOperation(
    'publish',
    publishInput({ planFile: 'docs/plan/a\u202eb.md' }),
    { apply: true, runner },
  );
  assert.equal(unsafe.error.code, 'MARKER_INVALID');
  assert.equal(runner.calls.length, 0);
});

// The plan's file rules come before the marker: a planFile that is no Markdown file fails its own
// `.md` check, not the marker path rule that a non-`.md` plan path would also break.
test('publish: a non-Markdown planFile is UNSAFE_PATH before the marker rule, with zero runner calls', async () => {
  for (const planFile of ['docs/plan/2026-10-17-issue-12-demo.txt', 'docs/plan/demo']) {
    const runner = recordingRunner();
    const envelope = await executeOperation('publish', publishInput({ planFile }), {
      apply: true,
      runner,
    });
    assert.equal(envelope.ok, false, planFile);
    assert.equal(envelope.error.code, 'UNSAFE_PATH', `${planFile}: ${envelope.error.message}`);
    assert.equal(envelope.error.message, 'planFile is not a Markdown file');
    assert.equal(runner.calls.length, 0, planFile);
  }
});

// ---------------------------------------------------------------------------------------------
// Provider rule

const GIT_WRITE_COMMANDS = new Set([
  'fetch',
  'push',
  'commit-tree',
  'write-tree',
  'read-tree',
  'update-index',
  'update-ref',
  'commit',
  'hook',
]);

function isGitWrite(call) {
  if (call.executable !== 'git') return false;
  if (GIT_WRITE_COMMANDS.has(call.args[0])) return true;
  return call.args[0] === 'hash-object' && call.args.includes('-w');
}

// Binding decision D3: the unattended path is GitHub only. The tracker classifies only github.com
// on its own and answers AMBIGUOUS_HOST for any other host, which the core reports as
// UNSUPPORTED_PROVIDER before any Git write or forge command, for both mutating operations.
function providerRunner(cwd, url, { gh } = {}) {
  return recordingRunner(({ executable, args }) => {
    if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return { status: 0, stdout: `${cwd}\n`, stderr: '' };
    }
    if (executable === 'git' && args[0] === 'remote' && args[1] === 'get-url') {
      return { status: 0, stdout: `${url}\n`, stderr: '' };
    }
    if (executable === 'gh' && gh) return gh(args);
    return { status: 1, stdout: '', stderr: 'unexpected call' };
  });
}

for (const [operation, makeInput] of MUTATING) {
  for (const [label, url, host] of [
    ['a self-hosted forge', 'https://code.example.test/o/r.git', 'code.example.test'],
    ['an enterprise host', 'https://github.example.test/o/r.git', 'github.example.test'],
    ['an ssh remote on another host', 'git@gitlab.example.test:o/r.git', 'gitlab.example.test'],
  ]) {
    test(`${operation}: ${label} stops with UNSUPPORTED_PROVIDER before any write`, async (t) => {
      const cwd = tempDirectory(t);
      write(cwd, 'docs/plan/2026-10-17-issue-12-demo.md', '# Plan\n');
      for (const apply of [false, true]) {
        const runner = providerRunner(cwd, url);
        const envelope = await executeOperation(operation, makeInput({ cwd }), {
          apply,
          runner,
        });
        assert.equal(envelope.ok, false);
        assert.equal(envelope.dryRun, !apply);
        assert.equal(envelope.error.code, 'UNSUPPORTED_PROVIDER', envelope.error.message);
        assert.equal(envelope.error.details.provider, null);
        assert.equal(envelope.error.details.host, host);
        assert.equal(runner.calls.filter(isGitWrite).length, 0, 'zero Git writes');
        assert.equal(
          runner.calls.filter((call) => call.executable !== 'git').length,
          0,
          'no forge command (the provider is learned from the remote URL alone)',
        );
        assert.ok(
          !runner.calls.some((call) => call.executable === 'git' && call.args[0] === 'fetch'),
        );
      }
    });
  }
}

// A GitHub remote keeps the tracker's own failure codes: the provider rule maps only the
// non-GitHub classification.
test('publish: a GitHub remote without gh keeps the tracker code CLI_MISSING', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'docs/plan/2026-10-17-issue-12-demo.md', '# Plan\n');
  const runner = providerRunner(cwd, 'https://github.com/acme/widgets.git', {
    gh: () => ({ status: null, stdout: '', stderr: '', error: { code: 'ENOENT', path: 'gh' } }),
  });
  const envelope = await executeOperation('publish', publishInput({ cwd }), {
    apply: true,
    runner,
  });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'CLI_MISSING');
  assert.equal(runner.calls.filter(isGitWrite).length, 0, 'zero Git writes');
});

// ---------------------------------------------------------------------------------------------
// complete-branch: pure rules

test('complete-branch: the branch must be the plan branch of the prefix and of the issue', async () => {
  for (const [overrides, code] of [
    [{ branch: 'effective-flow/plan/issue-abc' }, 'BRANCH_INVALID'],
    [{ branch: 'effective-flow/plan/issue-01' }, 'BRANCH_INVALID'],
    [{ branch: 'other/plan/issue-12' }, 'BRANCH_INVALID'],
    [{ branch: 'plan/issue-12' }, 'BRANCH_INVALID'],
    [{ branch: 'effective-flow/plan/issue-13' }, 'ISSUE_MISMATCH'],
  ]) {
    const runner = recordingRunner();
    const envelope = await executeOperation('complete-branch', completeBranchInput(overrides), {
      apply: true,
      runner,
    });
    assert.equal(envelope.error.code, code, JSON.stringify(overrides));
    assert.equal(runner.calls.length, 0);
  }
});

// ---------------------------------------------------------------------------------------------
// CLI

function cli(args, input, { cwd } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  return { ...result, lines, envelope: lines.length === 1 ? JSON.parse(lines[0]) : null };
}

test('the CLI writes one success envelope for a valid scan', (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'plan.md', '# Plan\n');
  const result = cli(
    ['scan'],
    JSON.stringify({ cwd, runState: 'interactive', planFile: 'plan.md' }),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.lines.length, 1);
  assert.equal(result.envelope.ok, true);
  assert.deepEqual(result.envelope.data.findings, []);
  assert.equal(result.stderr, '');
});

test('the CLI exits nonzero with ok:false on an unreadable plan file', (t) => {
  const cwd = tempDirectory(t);
  const missing = cli(
    ['scan'],
    JSON.stringify({ cwd, runState: 'interactive', planFile: 'missing.md' }),
  );
  assert.equal(missing.status, 1);
  assert.equal(missing.envelope.ok, false);
  assert.equal(missing.envelope.error.code, 'NOT_FOUND');
  assert.match(missing.stderr, /NOT_FOUND/);

  const directory = cli(
    ['scan'],
    JSON.stringify({ cwd, runState: 'interactive', planFile: 'docs.md' }),
  );
  assert.notEqual(directory.status, 0);

  if (process.getuid?.() !== 0) {
    const file = write(cwd, 'locked.md', '# Plan\n');
    chmodSync(file, 0o000);
    t.after(() => {
      try {
        chmodSync(file, 0o644);
      } catch {
        // The temporary directory is already gone.
      }
    });
    const locked = cli(
      ['scan'],
      JSON.stringify({ cwd, runState: 'interactive', planFile: 'locked.md' }),
    );
    assert.notEqual(locked.status, 0, 'an unreadable file fails the run');
    assert.equal(locked.envelope.ok, false);
  }

  const binary = write(cwd, 'binary.md', '');
  writeFileSync(binary, Buffer.from([0xff, 0xfe, 0x00]));
  const invalid = cli(
    ['scan'],
    JSON.stringify({ cwd, runState: 'interactive', planFile: 'binary.md' }),
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.envelope.error.code, 'INVALID_CONTENT');
});

test('the CLI exits nonzero with ok:false on malformed stdin', (t) => {
  const cwd = tempDirectory(t);
  for (const input of ['{not json', '', '[]', '"text"', '7', 'null']) {
    const result = cli(['scan'], input, { cwd });
    assert.equal(result.status, 2, JSON.stringify(input));
    assert.equal(result.envelope.ok, false, JSON.stringify(input));
    assert.equal(result.envelope.error.code, 'INVALID_INPUT');
    assert.equal(result.lines.length, 1);
  }
  for (const operation of ['publish', 'complete-branch', 'assert-changeset', 'branch-name']) {
    const result = cli([operation, '--apply'], '{broken', { cwd });
    assert.equal(result.status, 2, operation);
    assert.equal(result.envelope.ok, false);
  }
});

test('the CLI refuses an unknown operation, a missing operation and extra flags', () => {
  for (const args of [
    [],
    ['frobnicate'],
    ['scan', '--force'],
    ['scan', '--apply', '--apply'],
    ['--help'],
  ]) {
    const result = cli(args, '{}');
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.envelope.ok, false);
    assert.equal(result.envelope.error.code, 'INVALID_INPUT');
  }
});

test('the CLI reports publish as a dry run unless --apply is passed, also when it refuses', (t) => {
  const cwd = tempDirectory(t);
  const result = cli(
    ['publish'],
    JSON.stringify({ ...publishInput({ cwd }), runState: 'interactive' }),
  );
  assert.equal(result.status, 2);
  assert.equal(result.envelope.error.code, 'INVALID_INPUT');
  assert.equal(result.envelope.dryRun, true, 'publish without --apply is a dry run');
});

// ---------------------------------------------------------------------------------------------
// Input limits and linear scanning

// Every case below finished in seconds or minutes before its pattern was made linear; within the
// size limits each one now has to stay far below this budget.
const LINEAR_BUDGET_MS = 1000;

function assertFast(label, action) {
  const started = performance.now();
  const value = action();
  const elapsed = performance.now() - started;
  assert.ok(elapsed < LINEAR_BUDGET_MS, `${label} took ${Math.round(elapsed)} ms`);
  return value;
}

test('size limits: title, body and commit message are INPUT_TOO_LARGE before any scan or runner call', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'plan.md', '# Plan\n');
  const base = { cwd, runState: 'interactive', planFile: 'plan.md' };
  const oversized = {
    title: `docs: ${'a'.repeat(MAX_TITLE_CHARS)}`,
    body: 'b'.repeat(MAX_BODY_CHARS + 1),
    // Fewer characters than the limit, but more bytes: the commit message is measured in bytes.
    commitMessage: `docs: x\n\n${'ä'.repeat(MAX_COMMIT_MESSAGE_BYTES / 2)}`,
  };
  for (const [field, value] of Object.entries(oversized)) {
    const scanned = await run('scan', { ...base, [field]: value });
    assert.equal(scanned.error.code, 'INPUT_TOO_LARGE', field);
    assert.equal(scanned.error.details.field, field);
    const runner = recordingRunner();
    const published = await executeOperation('publish', publishInput({ [field]: value }), {
      apply: true,
      runner,
    });
    assert.equal(published.error.code, 'INPUT_TOO_LARGE', field);
    assert.equal(runner.calls.length, 0, `${field}: zero runner calls`);
  }
  const atLimit = await run('scan', {
    ...base,
    title: 'a'.repeat(MAX_TITLE_CHARS),
    body: 'b'.repeat(MAX_BODY_CHARS),
    commitMessage: 'c'.repeat(MAX_COMMIT_MESSAGE_BYTES),
  });
  assert.equal(atLimit.ok, true, JSON.stringify(atLimit.error));
});

// GitHub's limit applies to the body the forge receives: the caller's prose plus the marker line and
// `Refs #<N>`. A body that fits only without that tail is refused before any Git call, not after the
// push.
test('size limits: the final pull-request body with marker and Refs #<N> is bounded, at the exact boundary', async () => {
  const tailLength = buildPullRequestBody('x', PLAN_PATH, 12).length - 1;
  const fitting = 'x'.repeat(MAX_BODY_CHARS - tailLength);
  assert.equal(buildPullRequestBody(fitting, PLAN_PATH, 12).length, MAX_BODY_CHARS);
  const over = `${fitting}x`;
  assert.ok(over.length < MAX_BODY_CHARS, 'the prose alone is within its own limit');
  assert.throws(
    () => buildPullRequestBody(over, PLAN_PATH, 12),
    (error) =>
      error.code === 'INPUT_TOO_LARGE' &&
      error.details.field === 'body' &&
      error.details.limit === MAX_BODY_CHARS &&
      error.details.length === MAX_BODY_CHARS + 1,
  );

  const refused = recordingRunner();
  const published = await executeOperation(
    'publish',
    publishInput({ planFile: PLAN_PATH, body: over }),
    { apply: true, runner: refused },
  );
  assert.equal(published.error.code, 'INPUT_TOO_LARGE');
  assert.equal(published.error.details.field, 'body');
  assert.equal(refused.calls.length, 0, 'zero runner calls');

  const accepted = recordingRunner();
  const atLimit = await executeOperation(
    'publish',
    publishInput({ planFile: PLAN_PATH, body: fitting }),
    { apply: true, runner: accepted },
  );
  assert.notEqual(atLimit.error.code, 'INPUT_TOO_LARGE', 'the boundary itself passes');
  assert.ok(accepted.calls.length > 0, 'the length check let the run go on');

  // complete-branch learns the plan path from the branch; a body that cannot fit with even the
  // shortest tail is refused before any Git call.
  const shortestTail = buildPullRequestBody('x', 'a.md', 12).length - 1 - '"a.md"'.length + 2;
  const hopeless = 'x'.repeat(MAX_BODY_CHARS - shortestTail + 1);
  const completing = recordingRunner();
  const completed = await executeOperation(
    'complete-branch',
    completeBranchInput({ body: hopeless }),
    {
      apply: true,
      runner: completing,
    },
  );
  assert.equal(completed.error.code, 'INPUT_TOO_LARGE');
  assert.equal(completed.error.details.field, 'body');
  assert.equal(completing.calls.length, 0, 'zero runner calls');
  const possible = recordingRunner();
  const notYet = await executeOperation(
    'complete-branch',
    completeBranchInput({ body: hopeless.slice(1) }),
    { apply: true, runner: possible },
  );
  assert.notEqual(notYet.error.code, 'INPUT_TOO_LARGE', 'the lower bound itself passes');
});

test('scan: the plan size is judged from fstat before reading, and the read itself stays bounded', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'big.md', 'a'.repeat(MAX_PLAN_BYTES + 1));
  write(cwd, 'limit.md', 'a'.repeat(MAX_PLAN_BYTES));
  const base = { cwd, runState: 'interactive' };
  const big = await run('scan', { ...base, planFile: 'big.md' });
  assert.equal(big.error.code, 'INVALID_CONTENT');
  assert.equal(big.error.details.reason, 'oversized');
  assert.equal((await run('scan', { ...base, planFile: 'limit.md' })).ok, true);

  // A file that grows after the size check is refused by the bounded read.
  const understated = {
    ...nodeFs,
    fstatSync(descriptor) {
      const stats = nodeFs.fstatSync(descriptor);
      return Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { size: 1 });
    },
  };
  const grown = await run('scan', { ...base, planFile: 'big.md' }, { fs: understated });
  assert.equal(grown.error.code, 'INVALID_CONTENT');
  assert.equal(grown.error.details.reason, 'oversized');
});

test('scan and keyword checks stay linear on pathological inputs within the size limits', () => {
  const line = MAX_BODY_CHARS;
  assertFast('a closing keyword before each of many dotted words', () =>
    assert.equal(hasClosingKeyword('fix.'.repeat(line / 4)), false),
  );
  assertFast('a closing keyword before a long whitespace run', () =>
    assert.equal(hasClosingKeyword(`fixes${' '.repeat(line - 6)}x`), false),
  );
  assertFast('a closing keyword before a long colon-and-space run', () =>
    assert.equal(hasClosingKeyword(`closes:${' '.repeat(line - 8)}x`), false),
  );
  assertFast('a closing keyword before a long URL segment', () =>
    assert.equal(hasClosingKeyword(`fixes https://${'h'.repeat(line - 20)}`), false),
  );
  // The run leaves room for the marker line and `Refs #12` within the final-body limit.
  assertFast('a body with an inner whitespace run', () =>
    assert.ok(buildPullRequestBody(`a${' '.repeat(line - 200)}b`, PLAN_PATH, 12).endsWith('#12')),
  );
  assertFast('many exempt credential assignments on one line', () =>
    assert.deepEqual(classesOf('token: never store it '.repeat(line / 22)), []),
  );
  assertFast('a quote run after an Authorization header', () =>
    classesOf(`Authorization: Bearer ${'"'.repeat(line - 40)}x`),
  );
  assertFast('a quote run in a URL password', () =>
    classesOf(`https://user:${'"'.repeat(line - 40)}x@example.test/`),
  );
  assertFast('a whole oversized-looking body through scanText', () =>
    scanText(`fix.${' '.repeat(line / 2)}token: never ${'a '.repeat(line / 8)}`, 'body'),
  );
});

test('credential-assignment: the bounded value window keeps detection and the prose exemption', () => {
  const exempt = 'token: never store it '.repeat(2000);
  assert.deepEqual(classesOf(exempt), []);
  assert.deepEqual(classesOf(`${exempt}password: ${chars(24)}`), ['credential-assignment']);
  assert.deepEqual(classesOf(`api_key: "${chars(1200)}"`), ['credential-assignment']);
  assert.deepEqual(classesOf('token: <token>'), []);
  assert.deepEqual(classesOf('Token: never store it in the plan.'), []);
});

// ---------------------------------------------------------------------------------------------
// File-system failures

function fsError(code, target) {
  return Object.assign(new Error(`${code}: operation failed, '${target}'`), { code });
}

test('scan: raw file-system errors map to NOT_FOUND or UNSAFE_PATH without an absolute path', async (t) => {
  const cwd = tempDirectory(t);
  write(cwd, 'docs/plan.md', '# Plan\n');
  const base = { cwd, runState: 'interactive', planFile: 'docs/plan.md' };
  const cases = [
    [
      'open ELOOP',
      {
        openSync: (target) => {
          throw fsError('ELOOP', target);
        },
      },
      'UNSAFE_PATH',
      'eloop',
    ],
    [
      'open EACCES',
      {
        openSync: (target) => {
          throw fsError('EACCES', target);
        },
      },
      'UNSAFE_PATH',
      'eacces',
    ],
    [
      'open ENOENT after the check',
      {
        openSync: (target) => {
          throw fsError('ENOENT', target);
        },
      },
      'NOT_FOUND',
      undefined,
    ],
    [
      'a parent that vanished',
      {
        realpathSync: (target) => {
          if (String(target).endsWith('/docs')) throw fsError('ENOENT', target);
          return nodeFs.realpathSync(target);
        },
      },
      'NOT_FOUND',
      undefined,
    ],
  ];
  for (const [label, overrides, code, reason] of cases) {
    const envelope = await run('scan', base, { fs: { ...nodeFs, ...overrides } });
    assert.equal(envelope.ok, false, label);
    assert.equal(envelope.error.code, code, label);
    assert.equal(envelope.error.details.reason, reason, label);
    assert.ok(!JSON.stringify(envelope.error).includes(cwd), `${label}: no absolute path`);
  }
});

// ---------------------------------------------------------------------------------------------
// Process boundary

// Cited by name in the developer documentation: every core stays testable with a fake runner
// because only a CLI entry ever creates the real one.
test('no core imports the shared process runner', () => {
  const scripts = join(REPOSITORY_ROOT, 'src/scripts');
  const source = (file) => readFileSync(join(scripts, file), 'utf8');
  const importsRunner = (file) => /['"]\.\/process-runner\.mjs['"]/.test(source(file));
  const files = readdirSync(scripts).filter((file) => file.endsWith('.mjs'));
  assert.deepEqual(
    files.filter((file) => file.endsWith('-core.mjs')).filter(importsRunner),
    [],
    'no -core.mjs module imports process-runner.mjs',
  );
  const importers = files.filter(importsRunner);
  assert.ok(importers.includes('plan-publication.mjs'));
  assert.ok(importers.includes('remote-tracker.mjs'));
  for (const file of importers) {
    assert.match(source(file), /^#!\/usr\/bin\/env node\n/, `${file} is a CLI entry`);
  }
});

function fakeStdout() {
  const lines = [];
  return {
    lines,
    write(chunk, callback) {
      lines.push(chunk);
      callback?.();
      return true;
    },
  };
}

test('the CLI stops every in-flight process group on SIGINT, SIGTERM and exit', () => {
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const target = new EventEmitter();
    const exits = [];
    target.exit = (exitCode) => exits.push(exitCode);
    const terminated = [];
    const stdout = fakeStdout();
    const run = { operation: 'publish', dryRun: false, envelopeWritten: false };
    forwardTermination(target, (sent) => terminated.push(sent), { stdout, run });
    assert.deepEqual(terminated, [], 'nothing is signalled before a signal arrives');
    target.emit(signal);
    assert.deepEqual(terminated, ['SIGKILL'], signal);
    assert.deepEqual(exits, [code], signal);
    target.emit('exit');
    assert.deepEqual(terminated, ['SIGKILL', 'SIGKILL'], 'exit stops the groups again');
  }
});

// An interrupted run still answers with exactly one envelope line, so a caller parsing stdout never
// sees an empty answer; a run that already wrote its envelope writes no second one.
test('the CLI writes one INTERRUPTED envelope on SIGINT or SIGTERM unless one was written', () => {
  for (const [signal, code, operation, dryRun] of [
    ['SIGINT', 130, 'publish', false],
    ['SIGTERM', 143, 'complete-branch', true],
    ['SIGTERM', 143, null, false],
  ]) {
    const target = new EventEmitter();
    const exits = [];
    target.exit = (exitCode) => exits.push(exitCode);
    const stdout = fakeStdout();
    const run = { operation, dryRun, envelopeWritten: false };
    forwardTermination(target, () => {}, { stdout, run });
    target.emit(signal);
    assert.equal(stdout.lines.length, 1, signal);
    assert.ok(stdout.lines[0].endsWith('\n'));
    assert.deepEqual(JSON.parse(stdout.lines[0]), {
      ok: false,
      operation,
      dryRun,
      error: {
        code: 'INTERRUPTED',
        message: `stopped by ${signal}`,
        details: { state: 'unknown' },
      },
    });
    assert.equal(run.envelopeWritten, true);
    assert.deepEqual(exits, [code], 'the exit follows the flushed line');
  }

  const target = new EventEmitter();
  const exits = [];
  target.exit = (exitCode) => exits.push(exitCode);
  const stdout = fakeStdout();
  forwardTermination(target, () => {}, {
    stdout,
    run: { operation: 'publish', dryRun: false, envelopeWritten: true },
  });
  target.emit('SIGINT');
  assert.deepEqual(stdout.lines, [], 'no second envelope');
  assert.deepEqual(exits, [130]);
});

test('main writes no envelope of its own once a signal handler answered for the run', async (t) => {
  const cwd = tempDirectory(t);
  const run = { operation: null, dryRun: false, envelopeWritten: false };
  const stdout = fakeStdout();
  const stderr = fakeStdout();
  const envelope = await main(['branch-name'], {
    input: { cwd, branchPrefix: 'effective-flow', issue: 12 },
    run,
    stdout,
    stderr,
    setExitCode: () => {},
    // The signal arrives while the operation waits on its process.
    runner: async () => {
      assert.equal(run.operation, 'branch-name');
      run.envelopeWritten = true;
      return { status: 0, stdout: 'effective-flow/plan/issue-12\n', stderr: '' };
    },
  });
  assert.equal(envelope.ok, true);
  assert.deepEqual(stdout.lines, [], 'the interrupted run keeps its single envelope');
});

// The caller-body check and the tail-only round-trip rely on the opener being exactly the shipped
// parser's: any line containing it is not `absent`, and dropping its first or last character makes
// it `absent` again, so the parser's opener is neither longer nor a proper part of this one.
test('the marker opener is exactly the one the shipped marker parser judges', () => {
  assert.notEqual(inspectPlanPrMarker(`Prose ${PLAN_PR_MARKER_OPENER}`).status, 'absent');
  assert.notEqual(inspectPlanPrMarker(PLAN_PR_MARKER_OPENER).status, 'absent');
  assert.equal(inspectPlanPrMarker(PLAN_PR_MARKER_OPENER.slice(1)).status, 'absent');
  assert.equal(inspectPlanPrMarker(PLAN_PR_MARKER_OPENER.slice(0, -1)).status, 'absent');
  const body = buildPullRequestBody(`Prose.${' '.repeat(40)}inner\n\ntext  `, PLAN_PATH, 12);
  assert.deepEqual(inspectPlanPrMarker(body), { status: 'valid', plan: PLAN_PATH });
});

// plan-lint-core owns the unattended plan name and the ref-path rule; plan-publication-core
// re-exports the identical objects, so the two modules can never hold diverging copies.
test('plan-publication-core re-exports the plan-lint-core name and ref rules by identity', async () => {
  const lint = await import('../src/scripts/plan-lint-core.mjs');
  const publication = await import('../src/scripts/plan-publication-core.mjs');
  assert.equal(publication.UNATTENDED_PLAN_NAME, lint.UNATTENDED_PLAN_NAME);
  assert.equal(publication.refPathProblem, lint.refPathProblem);
});

// ---------------------------------------------------------------------------------------------
// assess-base-move: schema, cited-token extraction and the pure verdict

const ASSESS_INPUT = Object.freeze({
  cwd: '/nonexistent',
  issue: 12,
  planDir: 'docs/plan',
  planFile: 'docs/plan/2026-10-17-issue-12-demo.md',
  remote: 'origin',
  baseBranch: 'main',
  fromBaseOid: 'a'.repeat(40),
  expectedBlobOid: 'b'.repeat(40),
});

// Protects the closed-schema contract of the new operation: an unknown or missing key (the plan blob
// binding `expectedBlobOid` included) is refused as INVALID_INPUT before any process starts.
test('assess-base-move has a closed schema: unknown and missing keys are INVALID_INPUT before any process', async () => {
  const unknown = recordingRunner();
  const refusedUnknown = await run(
    'assess-base-move',
    { ...ASSESS_INPUT, surprise: true },
    { runner: unknown },
  );
  assert.equal(refusedUnknown.ok, false);
  assert.equal(refusedUnknown.error.code, 'INVALID_INPUT');
  assert.deepEqual(refusedUnknown.error.details.keys, ['surprise']);
  assert.equal(unknown.calls.length, 0);

  for (const key of Object.keys(ASSESS_INPUT)) {
    const { [key]: _omitted, ...rest } = ASSESS_INPUT;
    const runner = recordingRunner();
    const refused = await run('assess-base-move', rest, { runner });
    assert.equal(refused.ok, false, key);
    assert.equal(refused.error.code, 'INVALID_INPUT', key);
    assert.deepEqual(refused.error.details.keys, [key], key);
    assert.equal(runner.calls.length, 0, key);
  }
  const everything = await run('assess-base-move', {});
  assert.deepEqual(everything.error.details.keys, Object.keys(ASSESS_INPUT));
  assert.equal((await run('assess-base-move', null)).error.code, 'INVALID_INPUT');

  for (const [field, value] of [
    ['fromBaseOid', 'not-an-oid'],
    ['expectedBlobOid', 'ABCDEF'],
    ['issue', 0],
  ]) {
    const runner = recordingRunner();
    const refused = await run('assess-base-move', { ...ASSESS_INPUT, [field]: value }, { runner });
    assert.equal(refused.error.code, 'INVALID_INPUT', field);
    assert.equal(runner.calls.length, 0, field);
  }
});

// Protects the closed verdict and reason enum that every consumer (Issue Buddy, the pass report,
// autopilot) states once and reuses.
test('the base-move verdict enum and reason mapping are closed', () => {
  assert.deepEqual([...BASE_MOVE_VERDICTS], ['fits', 'overlap', 'undecidable']);
  assert.deepEqual(Object.keys(BASE_MOVE_REASONS), ['fits', 'overlap', 'undecidable']);
  assert.deepEqual([...BASE_MOVE_REASONS.fits], [null]);
  assert.deepEqual([...BASE_MOVE_REASONS.overlap], ['same-issue-plan', 'cited-path']);
  assert.deepEqual(
    [...BASE_MOVE_REASONS.undecidable],
    ['not-ancestor', 'gitlink', 'no-affected-files', 'unusable-entry', 'plan-identity'],
  );
  assert.equal(MAX_BASE_MOVE_PATHS, 20);
});

// Protects the one deterministic publish/stop split (issue #734 follow-up): only a rewritten base
// and a possible same-issue plan stop; every other assessed move, overlapping or undecidable
// included, re-publishes once. The assess envelope's `republish` is derived from this list.
test('only not-ancestor, same-issue-plan and plan-identity stop a base move from re-publishing', () => {
  assert.deepEqual(
    [...BASE_MOVE_STOPPING_REASONS],
    ['not-ancestor', 'same-issue-plan', 'plan-identity'],
  );
  assert.ok(Object.isFrozen(BASE_MOVE_STOPPING_REASONS));
  const republishing = [null, 'cited-path', 'gitlink', 'no-affected-files', 'unusable-entry'];
  for (const reason of republishing) assert.equal(baseMoveRepublishes(reason), true, reason);
  for (const reason of BASE_MOVE_STOPPING_REASONS) {
    assert.equal(baseMoveRepublishes(reason), false, reason);
  }
  const every = Object.values(BASE_MOVE_REASONS).flat();
  assert.deepEqual(
    [...republishing, ...BASE_MOVE_STOPPING_REASONS].sort(),
    [...every].sort(),
    'the split covers every reason exactly once',
  );
});

const FROM_OID = '1'.repeat(40);
const TO_OID = '2'.repeat(40);

function baseMoveInput(overrides = {}) {
  return {
    fromBaseOid: FROM_OID,
    toBaseOid: TO_OID,
    verdict: 'overlap',
    reason: 'cited-path',
    commitCount: 3,
    overlappingPaths: ['README.md', 'src/a.mjs'],
    ...overrides,
  };
}

// Protects the fixed English flag text reviewers and agents search for: short object IDs, the
// commit count with its plural, the reason, the overlapping paths only when there are any, and the
// truncation note only at the path bound.
test('buildBaseMoveFlag renders the fixed unresolved-base-move paragraph', () => {
  assert.equal(
    buildBaseMoveFlag(baseMoveInput()),
    '**Unresolved base move.** The base moved from `1111111` to `2222222` while this plan was written (3 commits). The plan was published on `2222222` without reconciling it. Reason: `cited-path`. Overlapping paths: `README.md`, `src/a.mjs`. Review must reconcile the plan with the new base before it is implemented.',
  );
  assert.equal(
    buildBaseMoveFlag(
      baseMoveInput({
        verdict: 'undecidable',
        reason: 'no-affected-files',
        commitCount: 1,
        overlappingPaths: [],
      }),
    ),
    '**Unresolved base move.** The base moved from `1111111` to `2222222` while this plan was written (1 commit). The plan was published on `2222222` without reconciling it. Reason: `no-affected-files`. Review must reconcile the plan with the new base before it is implemented.',
  );
  const bound = Array.from({ length: MAX_BASE_MOVE_PATHS }, (_, index) => `p${index}.md`);
  const truncated = buildBaseMoveFlag(baseMoveInput({ overlappingPaths: bound }));
  assert.ok(truncated.includes('`p18.md`, `p19.md` (list truncated). Review must'), truncated);
  const below = buildBaseMoveFlag(baseMoveInput({ overlappingPaths: bound.slice(1) }));
  assert.ok(!below.includes('(list truncated)'));
});

// Protects the `baseMove` input contract of `publish`: only an unresolved, publishable move onto
// exactly the bound base is flagged, and every refusal happens before any process starts.
test('publish refuses an invalid baseMove as INVALID_INPUT with zero runner calls', async () => {
  const refusals = [
    [
      'a fitting move',
      { baseMove: baseMoveInput({ verdict: 'fits', reason: null, overlappingPaths: [] }) },
    ],
    [
      'not-ancestor',
      { baseMove: baseMoveInput({ verdict: 'undecidable', reason: 'not-ancestor' }) },
    ],
    ['same-issue-plan', { baseMove: baseMoveInput({ reason: 'same-issue-plan' }) }],
    [
      'plan-identity',
      { baseMove: baseMoveInput({ verdict: 'undecidable', reason: 'plan-identity' }) },
    ],
    ['a reason of another verdict', { baseMove: baseMoveInput({ reason: 'gitlink' }) }],
    ['another base', { expectedBaseOid: '3'.repeat(40) }],
    ['no expected base', { expectedBaseOid: undefined }],
    ['the same base twice', { baseMove: baseMoveInput({ fromBaseOid: TO_OID }) }],
    ['a short object id', { baseMove: baseMoveInput({ fromBaseOid: '1234567' }) }],
    ['zero commits', { baseMove: baseMoveInput({ commitCount: 0 }) }],
    [
      '21 paths',
      {
        baseMove: baseMoveInput({
          overlappingPaths: Array.from({ length: MAX_BASE_MOVE_PATHS + 1 }, (_, i) => `p${i}`),
        }),
      },
    ],
    ['a path with a backtick', { baseMove: baseMoveInput({ overlappingPaths: ['a`b.md'] }) }],
    ['an empty path', { baseMove: baseMoveInput({ overlappingPaths: [''] }) }],
    ['paths that are no array', { baseMove: baseMoveInput({ overlappingPaths: 'README.md' }) }],
    ['a fractional commit count', { baseMove: baseMoveInput({ commitCount: 1.5 }) }],
    ['an unknown key', { baseMove: { ...baseMoveInput(), citedPaths: [] } }],
    ['a missing key', { baseMove: { ...baseMoveInput(), commitCount: undefined } }],
    ['an array', { baseMove: [] }],
  ];
  for (const [label, overrides] of refusals) {
    const runner = recordingRunner();
    const input = publishInput({
      expectedBaseOid: TO_OID,
      baseMove: baseMoveInput(),
      ...overrides,
    });
    if (overrides.expectedBaseOid === undefined && 'expectedBaseOid' in overrides) {
      delete input.expectedBaseOid;
    }
    const envelope = await run('publish', input, { runner, apply: true });
    assert.equal(envelope.ok, false, label);
    assert.equal(envelope.error.code, 'INVALID_INPUT', `${label}: ${envelope.error.message}`);
    assert.equal(runner.calls.length, 0, label);
  }
  const runner = recordingRunner();
  const refused = await run(
    'complete-branch',
    completeBranchInput({ expectedBaseOid: TO_OID, baseMove: baseMoveInput() }),
    { runner },
  );
  assert.equal(refused.error.code, 'INVALID_INPUT');
  assert.deepEqual(refused.error.details.keys, ['baseMove'], 'complete-branch takes no flag');
  assert.equal(runner.calls.length, 0);
});

// Protects the `allowNewerBase` input contract of `publish`: a boolean that needs the assessed
// `expectedBaseOid` to bind to, refused before any process starts.
test('allowNewerBase is a boolean that needs expectedBaseOid, refused with zero runner calls', async () => {
  const cases = [
    ['no expected base', { allowNewerBase: true }, true],
    ['a string', { expectedBaseOid: TO_OID, allowNewerBase: 'true' }, false],
    ['a number', { expectedBaseOid: TO_OID, allowNewerBase: 1 }, false],
    ['null', { expectedBaseOid: TO_OID, allowNewerBase: null }, false],
  ];
  for (const [label, overrides, dropBase] of cases) {
    const runner = recordingRunner();
    const input = publishInput(overrides);
    if (dropBase) delete input.expectedBaseOid;
    const envelope = await run('publish', input, { runner, apply: true });
    assert.equal(envelope.ok, false, label);
    assert.equal(envelope.error.code, 'INVALID_INPUT', label);
    assert.equal(envelope.error.details.field, 'allowNewerBase', label);
    assert.equal(runner.calls.length, 0, label);
  }
  const runner = recordingRunner();
  const refused = await run(
    'complete-branch',
    completeBranchInput({ expectedBaseOid: TO_OID, allowNewerBase: true }),
    { runner },
  );
  assert.equal(refused.error.code, 'INVALID_INPUT');
  assert.deepEqual(refused.error.details.keys, ['allowNewerBase'], 'complete-branch takes no flag');
  assert.equal(runner.calls.length, 0);
});

// Protects the flag text of a further move: one sentence appended to the assessed flag, and a
// standalone paragraph for a fitting assessment; no further move leaves the flag unchanged.
test('buildBaseMoveFlag appends the further-move sentence and buildFurtherBaseMoveFlag stands alone', () => {
  const further = { fromBaseOid: TO_OID, toBaseOid: '3'.repeat(40), commitCount: 2 };
  assert.equal(buildBaseMoveFlag(baseMoveInput(), null), buildBaseMoveFlag(baseMoveInput()));
  assert.equal(
    buildBaseMoveFlag(baseMoveInput(), further),
    `${buildBaseMoveFlag(baseMoveInput())} The base moved again to \`3333333\` (2 commits) after this assessment; that move was not assessed.`,
  );
  assert.equal(
    buildFurtherBaseMoveFlag(further),
    '**Unresolved base move.** The base moved again from `2222222` to `3333333` (2 commits) after the plan was assessed against it. The plan was published on `2222222` without assessing that move. Review must reconcile the plan with the new base before it is implemented.',
  );
});

// Protects the normalization order: suffix strip, then candidate detection, then reduction.
test('normalizeCitedToken strips a line or anchor suffix before it judges the token', () => {
  const literal = (path, directory = false) => ({ kind: 'literal', path, directory });
  assert.deepEqual(normalizeCitedToken('src/scripts/a.mjs:42'), literal('src/scripts/a.mjs'));
  assert.deepEqual(normalizeCitedToken('src/scripts/a.mjs:10-20'), literal('src/scripts/a.mjs'));
  assert.deepEqual(normalizeCitedToken('docs/x.md#some-anchor'), literal('docs/x.md'));
  assert.deepEqual(normalizeCitedToken('docs/x.md#a:3'), literal('docs/x.md'));
  assert.deepEqual(normalizeCitedToken('src/tools/*.md:7'), literal('src/tools', true));
  assert.deepEqual(normalizeCitedToken('README.md'), literal('README.md'));
});

test('normalizeCitedToken ignores tokens that are no path candidate', () => {
  for (const raw of [
    'contextBudget:',
    'RUNTIME_SCRIPT_FILES',
    'node build.mjs',
    'two words.md',
    '',
    'a:12',
    'pnpm',
    7,
    null,
  ]) {
    assert.deepEqual(normalizeCitedToken(raw), { kind: 'ignored' }, String(raw));
  }
});

// Protects the wildcard reduction: a wildcard or placeholder after the first segment never widens
// to the repository root but to the directory before it.
test('normalizeCitedToken reduces a wildcard or placeholder after the first segment to its directory', () => {
  assert.deepEqual(normalizeCitedToken('src/tools/*.md'), {
    kind: 'literal',
    path: 'src/tools',
    directory: true,
  });
  assert.deepEqual(normalizeCitedToken('src/tools/{plan,review}.md'), {
    kind: 'literal',
    path: 'src/tools',
    directory: true,
  });
  assert.deepEqual(normalizeCitedToken('evals/merge-gate/scenarios/<name>.md'), {
    kind: 'literal',
    path: 'evals/merge-gate/scenarios',
    directory: true,
  });
  assert.deepEqual(normalizeCitedToken('src/*/deep/file.md'), {
    kind: 'literal',
    path: 'src',
    directory: true,
  });
  assert.deepEqual(normalizeCitedToken('src/tools/'), {
    kind: 'literal',
    path: 'src/tools',
    directory: true,
  });
});

test('normalizeCitedToken turns a first-segment wildcard into a pattern, never the repository root', () => {
  assert.deepEqual(normalizeCitedToken('*.md'), {
    kind: 'pattern',
    path: '*.md',
    directory: false,
  });
  assert.deepEqual(normalizeCitedToken('remote-tracker-{shared,decomposition}-core.mjs'), {
    kind: 'pattern',
    path: 'remote-tracker-{shared,decomposition}-core.mjs',
    directory: false,
  });
  assert.deepEqual(normalizeCitedToken('<RUNTIME_STATE_ROOT>/x.json'), {
    kind: 'pattern',
    path: '<RUNTIME_STATE_ROOT>/x.json',
    directory: false,
  });
  // A pattern that cannot be built is unusable instead.
  assert.deepEqual(normalizeCitedToken('[ab].md'), { kind: 'unusable' });
  assert.deepEqual(normalizeCitedToken('{open.md'), { kind: 'unusable' });
});

test('normalizeCitedToken keeps dot-paths and marks unusable literals', () => {
  assert.deepEqual(normalizeCitedToken('.github/workflows/ci.yml'), {
    kind: 'literal',
    path: '.github/workflows/ci.yml',
    directory: false,
  });
  assert.deepEqual(normalizeCitedToken('.github/'), {
    kind: 'literal',
    path: '.github',
    directory: true,
  });
  for (const raw of ['../outside.md', 'docs/../x.md', '/abs/path.md', 'a\\b.md', 'a\u0001b.md']) {
    assert.deepEqual(normalizeCitedToken(raw), { kind: 'unusable' }, raw);
  }
});

const AFFECTED_PLAN = [
  '# Plan',
  '',
  '## Requirement',
  '',
  'Context only: `AGENTS.md` and the directory `docs/`.',
  '',
  '## Affected files',
  '',
  '| File | Description |',
  '|---|---|',
  '| `src/a.mjs` `src/b.mjs:12` | uses `docs/x.md` as input |',
  '| `*.md` | any markdown |',
  '| `docs/plan/2026-10-17-issue-12-demo.md` | the plan itself |',
  '',
  '## Implementation details',
  '',
  'Prose cites `src/c.mjs#anchor` and `contextBudget:`.',
  '',
  '```',
  '`fenced.md`',
  '```',
  '',
].join('\n');

test('extractCitedTokens splits table and prose tokens, counts every token in a cell and drops the plan itself', () => {
  const cited = extractCitedTokens(AFFECTED_PLAN, {
    planPath: 'docs/plan/2026-10-17-issue-12-demo.md',
  });
  assert.equal(cited.tableFound, true);
  assert.deepEqual(
    cited.table.map((entry) => entry.raw),
    ['src/a.mjs', 'src/b.mjs:12', '*.md'],
  );
  assert.deepEqual(
    cited.prose.map((entry) => entry.raw),
    ['AGENTS.md', 'docs/', 'docs/x.md', 'src/c.mjs#anchor'],
  );
  assert.equal(cited.table[1].path, 'src/b.mjs');
  assert.equal(cited.table[2].kind, 'pattern');
});

test('extractCitedTokens reads the German heading, a named File column and ignores tables elsewhere', () => {
  const german = extractCitedTokens(
    [
      '## Betroffene Dateien',
      '',
      '| Beschreibung | Datei |',
      '|---|---|',
      '| nutzt `docs/ignored.md` | `src/neu.mjs` |',
      '',
    ].join('\n'),
  );
  assert.equal(german.tableFound, true);
  assert.deepEqual(
    german.table.map((entry) => entry.raw),
    ['src/neu.mjs'],
  );
  assert.deepEqual(
    german.prose.map((entry) => entry.raw),
    ['docs/ignored.md'],
  );

  const elsewhere = extractCitedTokens(
    ['## Other', '', '| File | Note |', '|---|---|', '| `src/a.mjs` | x |', ''].join('\n'),
  );
  assert.equal(elsewhere.tableFound, false);
  assert.deepEqual(elsewhere.table, []);
  assert.deepEqual(
    elsewhere.prose.map((entry) => entry.raw),
    ['src/a.mjs'],
  );
});

// Protects the fail-closed File cell: a word outside the code spans that is itself a path candidate
// (or a leftover backtick) makes the cell unusable, so a file named without a code span is never
// silently dropped, while notes, arrows and separators that name no file keep the cell usable.
test('extractCitedTokens marks a File cell that names a file outside its code spans unusable', () => {
  const tableOf = (...cells) =>
    extractCitedTokens(
      [
        '## Affected files',
        '',
        '| File | Description |',
        '|---|---|',
        ...cells.map((cell) => `| ${cell} | x |`),
        '',
      ].join('\n'),
    ).table;
  for (const cell of [
    '`src/a.mjs` and src/b.mjs',
    'src/b.mjs, `src/a.mjs`',
    '`src/a.mjs` \\`src/b.mjs`',
    '`src/a.mjs` (and src/b.mjs)',
    '`src/a.mjs` README.md',
    '`src/a.mjs`, .gitignore',
    '`src/a.mjs` .env.',
    '`src/a.mjs` <README.md>',
    '`src/a.mjs` [README.md](#readme)',
    '`src/a.mjs` README.md!',
    '`src/a.mjs` README.md?',
    '`src/a.mjs` README.md…',
    '`src/a.mjs` README.md—',
    '`src/a.mjs` README.md➜',
  ]) {
    const table = tableOf(cell);
    assert.ok(
      table.some((entry) => entry.kind === 'unusable'),
      cell,
    );
    assert.equal(
      assessBaseMove({
        ancestor: true,
        cited: { tableFound: true, table, prose: [] },
        planDir: 'docs/plan',
      }).reason,
      'unusable-entry',
      cell,
    );
  }
  for (const cell of [
    '`src/a.mjs`, `src/b.mjs`',
    '`src/a.mjs` and `src/b.mjs`',
    '`src/a.mjs` und `src/b.mjs`',
    '`src/a.mjs` <br> `src/b.mjs`',
    '(`src/a.mjs` / `src/b.mjs`); `src/a.mjs` + `src/b.mjs` & `src/a.mjs`',
    '`src/a.mjs` → `src/b.mjs`',
    '`src/a.mjs` ➜ `src/b.mjs` – `src/a.mjs` — `src/b.mjs`',
    '`src/a.mjs` (new), `src/b.mjs` (neu)',
    '`src/a.mjs` (optional); 16 × `src/b.mjs`',
  ]) {
    const table = tableOf(cell);
    assert.ok(
      table.every((entry) => entry.kind === 'literal'),
      cell,
    );
    assert.deepEqual([...new Set(table.map((entry) => entry.path))], ['src/a.mjs', 'src/b.mjs']);
  }
  // An overlong word outside the spans fails closed without a backtracking trim.
  const long = assertFast('40k punctuation-run word', () =>
    tableOf(`\`src/a.mjs\` ${'.'.repeat(40_000)}a`),
  );
  assert.ok(long.some((entry) => entry.kind === 'unusable'));
});

test('extractCitedTokens reports a plan without an Affected files table', () => {
  const cited = extractCitedTokens('# Plan\n\nOnly `src/a.mjs` here.\n');
  assert.equal(cited.tableFound, false);
  assert.deepEqual(cited.table, []);
});

test('extractCitedTokens folds the plan path as Git folds paths', () => {
  const text = '# P\n\nSee `DOCS/Plan/P.md` and `src/a.mjs`.\n';
  const exact = extractCitedTokens(text, { planPath: 'docs/plan/p.md' });
  assert.deepEqual(
    exact.prose.map((entry) => entry.raw),
    ['DOCS/Plan/P.md', 'src/a.mjs'],
  );
  const folded = extractCitedTokens(text, {
    planPath: 'docs/plan/p.md',
    folding: { ignoreCase: true },
  });
  assert.deepEqual(
    folded.prose.map((entry) => entry.raw),
    ['src/a.mjs'],
  );
});

// Protects the same-issue rule: header and file name together decide, a conflict is not decidable.
test('planFileIdentity identifies a plan by header and file name as collection does', () => {
  const planPath = 'docs/plan/demo-plan.md';
  const identity = (text, filePath) =>
    planFileIdentity(Buffer.from(text), filePath, { issue: 12, planPath });
  assert.equal(identity('# X\n\n**Issue:** #12\n', 'docs/plan/2026-11-01-foo.md'), 'same-issue');
  assert.equal(identity('# X\n\n**Issue:** #9\n', 'docs/plan/2026-11-01-foo.md'), 'other');
  assert.equal(identity('# X\n', 'docs/plan/2026-11-01-issue-12-foo.md'), 'same-issue');
  assert.equal(identity('# X\n', 'docs/plan/archive/2026-11-01-issue-9-foo.md'), 'other');
  assert.equal(identity('# X\n', 'docs/plan/archive/demo-plan.md'), 'same-issue');
  assert.equal(identity('# X\n', 'docs/plan/unrelated.md'), 'other');
  assert.equal(
    identity('# X\n\n**Issue:** #12\n', 'docs/plan/2026-11-01-issue-9-foo.md'),
    'invalid',
  );
  assert.equal(
    identity('# X\n\n**Issue:** #9\n', 'docs/plan/2026-11-01-issue-12-foo.md'),
    'invalid',
  );
  assert.equal(
    identity('**Issue:** #12\n**Issue:** #13\n', 'docs/plan/2026-11-01-foo.md'),
    'invalid',
  );
  assert.equal(
    planFileIdentity(Buffer.from([0xff, 0xfe, 0x00]), 'docs/plan/a.md', { issue: 12 }),
    'invalid',
  );
});

function cite(table, prose = []) {
  const normalize = (raw) => ({ raw, ...normalizeCitedToken(raw) });
  return {
    tableFound: table.length > 0,
    table: table.map(normalize).filter((entry) => entry.kind !== 'ignored'),
    prose: prose.map(normalize).filter((entry) => entry.kind !== 'ignored'),
  };
}

function changed(...paths) {
  return paths.map((path) => ({ path, oldMode: '100644', newMode: '100644' }));
}

function assess(overrides) {
  return assessBaseMove({
    ancestor: true,
    changes: [],
    cited: cite(['src/a.mjs']),
    tracked: new Set(['src/a.mjs']),
    planFiles: [],
    planDir: 'docs/plan',
    folding: {},
    ...overrides,
  });
}

test('assessBaseMove: an empty range or unrelated paths fit with reason null', () => {
  const empty = assess({});
  assert.equal(empty.verdict, 'fits');
  assert.equal(empty.reason, null);
  assert.equal(empty.changedPathCount, 0);
  assert.deepEqual(empty.overlappingPaths, []);
  const unrelated = assess({ changes: changed('docs/guide.md', 'AGENTS.md') });
  assert.equal(unrelated.verdict, 'fits');
  assert.equal(unrelated.changedPathCount, 2);
  assert.equal(unrelated.citedPathCount, 1);
  assert.deepEqual(unrelated.citedPaths, ['src/a.mjs']);
});

// Protects the order of the checks: not-ancestor, then the stopping plan reasons (plan identity,
// same-issue plan), then the republishing undecidable reasons, then cited path. A stopping reason
// must win over every republishing one, or a range that adds a plan of the same issue would
// re-publish a duplicate.
test('assessBaseMove applies not-ancestor, stopping plan reasons, undecidable and cited-path in that order', () => {
  const same = [{ path: 'docs/plan/archive/x-issue-12-y.md', identity: 'same-issue' }];
  const invalid = [{ path: 'docs/plan/archive/x-issue-9-y.md', identity: 'invalid' }];
  const everything = {
    changes: changed('src/a.mjs'),
    planFiles: [...same, ...invalid],
  };
  assert.deepEqual(
    [
      assess({ ...everything, ancestor: false }).verdict,
      assess({ ...everything, ancestor: false }).reason,
    ],
    ['undecidable', 'not-ancestor'],
  );
  const gitlinkChange = [{ path: 'vendor/sub', oldMode: '000000', newMode: '160000' }];
  const identity = assess({ ...everything, cited: cite([]), changes: gitlinkChange });
  assert.deepEqual([identity.verdict, identity.reason], ['undecidable', 'plan-identity']);
  assert.deepEqual(identity.overlappingPaths, ['docs/plan/archive/x-issue-9-y.md']);
  // A same-issue plan stops beside every republishing reason.
  for (const overrides of [
    { cited: cite([]) },
    { cited: cite([]), changes: gitlinkChange },
    { cited: cite(['src/a.mjs', '../outside.md']) },
    {},
  ]) {
    const sameIssue = assess({ ...everything, ...overrides, planFiles: same });
    assert.deepEqual([sameIssue.verdict, sameIssue.reason], ['overlap', 'same-issue-plan']);
    assert.deepEqual(sameIssue.overlappingPaths, ['docs/plan/archive/x-issue-12-y.md']);
    assert.equal(baseMoveRepublishes(sameIssue.reason), false);
  }
  const plain = { changes: changed('src/a.mjs') };
  const gitlink = { ...plain, cited: cite([]), changes: gitlinkChange };
  assert.equal(assess(gitlink).reason, 'gitlink');
  assert.deepEqual(assess(gitlink).overlappingPaths, ['vendor/sub']);
  assert.equal(
    assess({ ...gitlink, changes: [{ path: 'vendor/sub', oldMode: '160000', newMode: '000000' }] })
      .reason,
    'gitlink',
  );
  assert.equal(assess({ ...plain, cited: cite([]) }).reason, 'no-affected-files');
  assert.equal(
    assess({ ...plain, cited: cite(['src/a.mjs', '../outside.md']) }).reason,
    'unusable-entry',
  );
  const sameIssue = assess({ ...plain, planFiles: same });
  const cited = assess(plain);
  assert.deepEqual([cited.verdict, cited.reason], ['overlap', 'cited-path']);
  assert.deepEqual(cited.overlappingPaths, ['src/a.mjs']);
  // Every returned verdict and reason pair belongs to the closed enum.
  for (const result of [empty(), identity, sameIssue, cited]) {
    assert.ok(BASE_MOVE_REASONS[result.verdict].includes(result.reason), result.reason);
  }
  function empty() {
    return assess({});
  }
});

test('assessBaseMove: an unrelated plan file of another issue neither overlaps nor blocks', () => {
  const result = assess({
    changes: changed('docs/plan/archive/2026-11-20-issue-731-x.md'),
    planFiles: [{ path: 'docs/plan/archive/2026-11-20-issue-731-x.md', identity: 'other' }],
  });
  assert.equal(result.verdict, 'fits');
});

// Protects the S-DEC decision: a table directory entry overlaps below it, a tracked file only
// exactly, and the plan directory is matched by exact files alone.
test('assessBaseMove: a changed path below a cited table directory overlaps', () => {
  const dir = assess({
    cited: cite(['src/shared/']),
    tracked: new Set(['src/shared']),
    changes: changed('src/shared/deep/x.md', 'src/other/y.md'),
  });
  assert.equal(dir.verdict, 'overlap');
  assert.deepEqual(dir.overlappingPaths, ['src/shared/deep/x.md']);
  const file = assess({
    cited: cite(['src/shared/x.md']),
    tracked: new Set(['src/shared/x.md']),
    changes: changed('src/shared/y.md'),
  });
  assert.equal(file.verdict, 'fits');
});

test('assessBaseMove: a glob entry overlaps its directory only', () => {
  for (const tracked of [new Set(), new Set(['src/tools'])]) {
    const base = { cited: cite(['src/tools/*.md']), tracked };
    const hit = assess({ ...base, changes: changed('src/tools/new.md') });
    assert.equal(hit.verdict, 'overlap');
    assert.deepEqual(hit.overlappingPaths, ['src/tools/new.md']);
    assert.equal(assess({ ...base, changes: changed('src/other/new.md') }).verdict, 'fits');
    assert.equal(assess({ ...base, changes: changed('src/toolsmith/new.md') }).verdict, 'fits');
  }
  const placeholder = cite(['evals/merge-gate/scenarios/<name>.md']);
  assert.equal(
    assess({ cited: placeholder, changes: changed('evals/merge-gate/scenarios/a.md') }).verdict,
    'overlap',
  );
  assert.equal(
    assess({ cited: placeholder, changes: changed('evals/other/a.md') }).verdict,
    'fits',
  );
});

test('assessBaseMove: first-segment patterns match the trailing segments of a changed path', () => {
  const markdown = cite(['*.md']);
  const hit = assess({
    cited: markdown,
    changes: changed('AGENTS.md', 'docs/x/y.md', 'src/a.mjs'),
  });
  assert.equal(hit.verdict, 'overlap');
  assert.deepEqual(hit.overlappingPaths, ['AGENTS.md', 'docs/x/y.md']);
  assert.equal(assess({ cited: markdown, changes: changed('src/a.mjs', 'md') }).verdict, 'fits');

  const alternation = cite(['remote-tracker-{shared,decomposition}-core.mjs']);
  assert.deepEqual(
    assess({
      cited: alternation,
      changes: changed(
        'src/scripts/remote-tracker-shared-core.mjs',
        'src/scripts/remote-tracker-decomposition-core.mjs',
        'src/scripts/remote-tracker-ledger-core.mjs',
        'remote-tracker-shared-core.mjs.bak',
      ),
    }).overlappingPaths,
    [
      'src/scripts/remote-tracker-decomposition-core.mjs',
      'src/scripts/remote-tracker-shared-core.mjs',
    ],
  );
});

test('assessBaseMove: a file shorthand matches an equal path, a path suffix and a basename', () => {
  const cited = cite(['remote-tracker-github-core.mjs'], []);
  const result = assess({
    cited,
    tracked: new Set(),
    changes: changed(
      'src/scripts/remote-tracker-github-core.mjs',
      'remote-tracker-github-core.mjs',
      'src/scripts/remote-tracker-github-core.mjs.bak',
      'src/scripts/remote-tracker-forgejo-core.mjs',
      'src/scripts/my-remote-tracker-github-core.mjs',
    ),
  });
  assert.equal(result.verdict, 'overlap');
  assert.deepEqual(result.overlappingPaths, [
    'remote-tracker-github-core.mjs',
    'src/scripts/remote-tracker-github-core.mjs',
    'src/scripts/remote-tracker-github-core.mjs.bak',
  ]);
  const withSlash = assess({
    cited: cite(['scripts/a.mjs']),
    tracked: new Set(),
    changes: changed('src/scripts/a.mjs', 'src/scripts/a.mjs.bak', 'src/xscripts/a.mjs'),
  });
  assert.deepEqual(withSlash.overlappingPaths, ['src/scripts/a.mjs']);
});

test('assessBaseMove: a directory shorthand matches as a segment infix or prefix', () => {
  const result = assess({
    cited: cite(['scripts/']),
    tracked: new Set(),
    changes: changed(
      'scripts/a.mjs',
      'src/scripts/b.mjs',
      'src/scriptsx/c.mjs',
      'src/xscripts/d.mjs',
    ),
  });
  assert.equal(result.verdict, 'overlap');
  assert.deepEqual(result.overlappingPaths, ['scripts/a.mjs', 'src/scripts/b.mjs']);
});

test('assessBaseMove: a dot-path is a valid tracked path matched normally', () => {
  const base = {
    cited: cite(['.github/workflows/ci.yml']),
    tracked: new Set(['.github/workflows/ci.yml']),
  };
  const hit = assess({ ...base, changes: changed('.github/workflows/ci.yml') });
  assert.deepEqual([hit.verdict, hit.overlappingPaths], ['overlap', ['.github/workflows/ci.yml']]);
  assert.equal(
    assess({ ...base, changes: changed('.github/workflows/release.yml') }).verdict,
    'fits',
  );
});

// Protects the S-DEC decision: prose citations count only as exact files.
test('assessBaseMove: prose citations count only as exact files', () => {
  const prose = cite(
    ['src/a.mjs'],
    ['AGENTS.md', 'docs/', 'docs/plan/', 'src/*.md', '*.md', '../outside.md', 'guide.md', 'x/y.md'],
  );
  const result = assess({
    cited: prose,
    changes: changed(
      'docs/developer-guide/build-system.md',
      'docs/plan/archive/2026-11-20-issue-731-x.md',
      'src/other.md',
      'docs/guide.md',
      'a/x/y.md',
      'README.md',
    ),
  });
  assert.equal(
    result.verdict,
    'fits',
    'directories, patterns, shorthand and unusable prose never match',
  );
  assert.deepEqual(result.citedPaths, ['src/a.mjs', 'AGENTS.md', 'guide.md', 'x/y.md']);
  const exact = assess({ cited: prose, changes: changed('AGENTS.md', 'x/y.md') });
  assert.deepEqual([exact.verdict, exact.reason], ['overlap', 'cited-path']);
  assert.deepEqual(exact.overlappingPaths, ['AGENTS.md', 'x/y.md']);
});

// Protects the plan-directory exclusion: archive commits for other issues keep fitting.
test('assessBaseMove: a changed plan-directory Markdown file is matched only by an exact-file citation', () => {
  const archived = changed(
    'docs/plan/2026-11-20-issue-731-x.md',
    'docs/plan/archive/2026-11-20-issue-731-y.md',
  );
  for (const table of [
    ['docs/plan/'],
    ['docs/*.md'],
    ['docs/'],
    ['*.md'],
    ['plan/'],
    ['2026-11-20-issue-731-x.md'],
  ]) {
    const result = assess({ cited: cite(table), tracked: new Set(), changes: archived });
    assert.equal(result.verdict, 'fits', table.join());
  }
  const exact = assess({
    cited: cite(['docs/plan/archive/2026-11-20-issue-731-y.md']),
    tracked: new Set(['docs/plan/archive/2026-11-20-issue-731-y.md']),
    changes: archived,
  });
  assert.deepEqual(exact.overlappingPaths, ['docs/plan/archive/2026-11-20-issue-731-y.md']);
  const prose = assess({
    cited: cite(['src/a.mjs'], ['docs/plan/2026-11-20-issue-731-x.md']),
    changes: archived,
  });
  assert.deepEqual(prose.overlappingPaths, ['docs/plan/2026-11-20-issue-731-x.md']);
  // Deeper below the plan directory is an ordinary path again.
  assert.equal(
    assess({
      cited: cite(['docs/plan/']),
      tracked: new Set(['docs/plan']),
      changes: changed('docs/plan/sub/x.md', 'docs/plan/archive/sub/x.md', 'docs/plan/x.txt'),
    }).overlappingPaths.length,
    3,
  );
});

test('assessBaseMove folds paths only as Git is configured to', () => {
  const base = {
    cited: cite(['README.md']),
    tracked: new Set(['README.md']),
    changes: changed('readme.md'),
  };
  assert.equal(assess(base).verdict, 'fits');
  assert.equal(assess({ ...base, folding: { ignoreCase: true } }).verdict, 'overlap');
  const proseBase = { cited: cite(['src/a.mjs'], ['AGENTS.md']), changes: changed('agents.md') };
  assert.equal(assess(proseBase).verdict, 'fits');
  assert.equal(assess({ ...proseBase, folding: { ignoreCase: true } }).verdict, 'overlap');
  const decomposed = 'café.md';
  const composed = 'café.md';
  const unicode = {
    cited: cite([composed]),
    tracked: new Set([composed]),
    changes: changed(decomposed),
  };
  assert.equal(assess(unicode).verdict, 'fits');
  assert.equal(assess({ ...unicode, folding: { precomposeUnicode: true } }).verdict, 'overlap');
});

// Protects the fail-closed fold: a table pattern that compiles unfolded but not folded (`<` and a
// combining U+0338 compose to `≮`, leaving a stray `>`) is an unusable entry, never an error.
test('assessBaseMove: a pattern the active fold makes uncompilable is an unusable entry', () => {
  const token = '≮name>.md';
  assert.equal(normalizeCitedToken(token).kind, 'pattern');
  const base = { cited: cite([token]), tracked: new Set(), changes: changed('docs/x.md') };
  const unfolded = assess(base);
  assert.deepEqual([unfolded.verdict, unfolded.reason], ['overlap', 'cited-path']);
  const folded = assess({ ...base, folding: { precomposeUnicode: true } });
  assert.deepEqual(
    [folded.verdict, folded.reason, folded.overlappingPaths],
    ['undecidable', 'unusable-entry', []],
  );
});

test('assessBaseMove bounds the returned lists and keeps the totals', () => {
  const names = Array.from(
    { length: 25 },
    (_, index) => `src/f${String(index).padStart(2, '0')}.md`,
  );
  const result = assess({
    cited: cite(names),
    tracked: new Set(names),
    changes: changed(...[...names].reverse(), 'docs/other.md'),
  });
  assert.equal(result.verdict, 'overlap');
  assert.equal(result.changedPathCount, 26);
  assert.equal(result.citedPathCount, 25);
  assert.equal(result.citedPaths.length, MAX_BASE_MOVE_PATHS);
  assert.equal(result.overlappingPaths.length, MAX_BASE_MOVE_PATHS);
  assert.equal(result.overlappingPaths[0], 'src/f00.md');
  const repeated = assess({ cited: cite(['src/a.mjs', 'src/a.mjs:3'], ['src/a.mjs']) });
  assert.equal(repeated.citedPathCount, 1);
});

// Protects the linear matcher: a first-segment token from untrusted plan text with many wildcards
// is matched within a bound instead of backtracking exponentially, and still matches what it names.
test('assessBaseMove matches a many-wildcard pattern against long segments within a time bound', () => {
  const token = `${'*a'.repeat(15)}*.md`;
  assert.equal(normalizeCitedToken(token).kind, 'pattern');
  const segment = 'a'.repeat(60);
  const missed = assertFast('a 15-wildcard pattern', () =>
    assess({
      cited: cite([token]),
      tracked: new Set(),
      changes: changed(`src/${segment}`, `${segment}/${segment}.mdx`, segment, `${segment}b`),
    }),
  );
  assert.equal(missed.verdict, 'fits');
  const hit = assess({
    cited: cite([token]),
    tracked: new Set(),
    changes: changed(`docs/${'a'.repeat(15)}.md`, `docs/${'a'.repeat(14)}.md`),
  });
  assert.deepEqual(hit.overlappingPaths, [`docs/${'a'.repeat(15)}.md`]);
});

// Protects the alternation bound: a segment whose `{a,b}` alternatives multiply past 64 is
// unusable, which makes the verdict undecidable instead of expanding without limit.
test('normalizeCitedToken bounds the alternatives a pattern segment expands to', () => {
  const pattern = (count) => `${'{a,b}'.repeat(count)}.md`;
  assert.equal(normalizeCitedToken(pattern(6)).kind, 'pattern');
  assert.deepEqual(normalizeCitedToken(pattern(7)), { kind: 'unusable' });
  const result = assess({ cited: cite(['src/a.mjs', pattern(7)]), tracked: new Set() });
  assert.deepEqual([result.verdict, result.reason], ['undecidable', 'unusable-entry']);
  assert.equal(
    assess({ cited: cite([pattern(6)]), tracked: new Set(), changes: changed('x/abbaba.md') })
      .verdict,
    'overlap',
  );
});

// Protects fail-closed globstar handling: a whole-segment `**` spans zero or more segments, so
// `**/*.md` also names a Markdown file at the repository root.
test('assessBaseMove: a whole-segment ** matches zero or more segments', () => {
  assert.equal(normalizeCitedToken('**/*.md').kind, 'pattern');
  const markdown = assess({
    cited: cite(['**/*.md']),
    tracked: new Set(),
    changes: changed('AGENTS.md', 'docs/a/b.md', 'src/a.mjs'),
  });
  assert.deepEqual(
    [markdown.verdict, markdown.reason, markdown.overlappingPaths],
    ['overlap', 'cited-path', ['AGENTS.md', 'docs/a/b.md']],
  );
  const fixtures = assess({
    cited: cite(['**/fixtures/**/']),
    tracked: new Set(),
    changes: changed(
      'fixtures/x.json',
      'test/fixtures/a/b.json',
      'test/fixtures',
      'test/fixturesx/a.json',
    ),
  });
  assert.deepEqual(fixtures.overlappingPaths, ['fixtures/x.json', 'test/fixtures/a/b.json']);
});

// Protects the shorthand widening: an untracked table token without a trailing `/` may name a
// directory, and a spelling that differs from the tracked one is shorthand compared folded, so
// neither turns an overlap into a fit; the plan-directory exclusion still applies.
test('assessBaseMove: an untracked shorthand without a trailing slash also matches as a directory', () => {
  const directory = assess({
    cited: cite(['scripts/lib']),
    tracked: new Set(),
    changes: changed(
      'src/scripts/lib/x.mjs',
      'scripts/lib/y.mjs',
      'src/scripts/library/z.mjs',
      'src/scripts/lib.mjs',
    ),
  });
  assert.deepEqual(directory.overlappingPaths, ['scripts/lib/y.mjs', 'src/scripts/lib/x.mjs']);
  // Tracked lookup is exact, so a differently cased citation is shorthand and folds as Git does.
  const cased = {
    cited: cite(['Src/Scripts/Lib']),
    tracked: new Set(),
    changes: changed('src/scripts/lib/x.mjs'),
  };
  assert.equal(assess(cased).verdict, 'fits');
  assert.equal(assess({ ...cased, folding: { ignoreCase: true } }).verdict, 'overlap');
  const planDirectory = { cited: cite(['docs/plan']), tracked: new Set() };
  assert.equal(
    assess({ ...planDirectory, changes: changed('docs/plan/2026-11-20-issue-731-x.md') }).verdict,
    'fits',
  );
  assert.equal(
    assess({ ...planDirectory, changes: changed('docs/plan/sub/x.md') }).verdict,
    'overlap',
  );
});

// Protects the File-column rule: a file named without a usable code span is never skipped
// silently, it is an unusable table entry and the verdict is undecidable.
test('extractCitedTokens marks a non-empty File cell without a usable code span unusable', () => {
  const cited = extractCitedTokens(
    [
      '## Affected files',
      '',
      '| File | Description |',
      '|---|---|',
      '| `src/a.mjs` | listed |',
      '| src/b.mjs | no code span |',
      '| `RUNTIME_SCRIPT_FILES` | no path candidate |',
      '| `docs/plan/self.md` | the plan itself |',
      '|  | empty file cell |',
      '',
    ].join('\n'),
    { planPath: 'docs/plan/self.md' },
  );
  assert.deepEqual(
    cited.table.map((entry) => [entry.raw, entry.kind]),
    [
      ['src/a.mjs', 'literal'],
      ['src/b.mjs', 'unusable'],
      ['`RUNTIME_SCRIPT_FILES`', 'unusable'],
    ],
  );
  const result = assess({ cited, tracked: new Set(['src/a.mjs']) });
  assert.deepEqual([result.verdict, result.reason], ['undecidable', 'unusable-entry']);
});
