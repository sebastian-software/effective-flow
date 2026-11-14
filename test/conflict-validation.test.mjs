import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  CONFLICT_VALIDATION_OPERATIONS,
  EVIDENCE_MISMATCHES,
  EVIDENCE_NOT_YET_REASONS,
  EVIDENCE_REASONS,
  INDEX_TREE,
  QUICK_MARKER_FAILURES,
  YamlSubsetError,
  evaluateWorkflow,
  executeOperation,
  hasQuickMarker,
  manifestTestCommands,
  matchEvidence,
  parseWorkflowYaml,
} from '../src/scripts/conflict-validation-core.mjs';
import { createProcessRunner } from '../src/scripts/config-resolve-core.mjs';
import { main } from '../src/scripts/conflict-validation.mjs';

const ROOT = new URL('../', import.meta.url);
const CLI = fileURLToPath(new URL('../src/scripts/conflict-validation.mjs', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const HEAD_SHA = 'a'.repeat(40);
const PNPM_MANIFEST = JSON.stringify({ scripts: { test: 'node --test' } });
const PNPM_COMMANDS = manifestTestCommands({ 'package.json': PNPM_MANIFEST });

// ---------------------------------------------------------------------------------------------
// Fixtures

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(root, relative, content) {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}

// A repository whose `main` commit holds `files` (and `links`, relative path → symlink target), with
// `origin/main` pointing at it as merge-gate's base fetch leaves it.
function baseRepository(t, files, links = {}) {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'effective-flow-conflict-validation-')),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'main');
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch=main');
  write(root, 'tracked.txt', 'tracked\n');
  for (const [relative, content] of Object.entries(files)) write(root, relative, content);
  for (const [relative, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    symlinkSync(target, join(root, relative));
  }
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'base');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

// Commits `files` on a new head branch and returns that commit's id; `origin/main` stays put.
function headCommit(root, files, branch = 'feature') {
  git(root, 'checkout', '--quiet', '-b', branch);
  for (const [relative, content] of Object.entries(files)) write(root, relative, content);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', 'head');
  return git(root, 'rev-parse', 'HEAD');
}

const deps = () => ({ runner: createProcessRunner(), env: process.env });

async function operation(name, input) {
  const envelope = await executeOperation(name, input, deps());
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.operation, name);
  return envelope.data;
}

// A minimal workflow with one test job; `parts` replaces whole sections by name.
function workflow(parts = {}) {
  const on = parts.on ?? 'on:\n  pull_request:\n';
  const job =
    parts.job ??
    [
      '  test:',
      '    name: Unit tests',
      '    runs-on: ubuntu-latest',
      ...(parts.jobExtra ?? []),
      '    steps:',
      '      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v7',
      ...(parts.steps ?? ['      - run: pnpm test']),
    ].join('\n');
  return `name: CI\n${parts.top ?? ''}${on}jobs:\n${job}\n`;
}

function evaluate(text, { commands = PNPM_COMMANDS, base = 'main' } = {}) {
  return evaluateWorkflow('.github/workflows/ci.yml', text, { commands, base });
}

function jobOf(result, jobId = 'test') {
  return result.jobs.find((job) => job.jobId === jobId);
}

function assertUndetected(text, reason, options) {
  const result = evaluate(text, options);
  assert.notEqual(result.status, 'detected', `expected ${reason}, got detected`);
  const reasons = [...result.reasons, ...result.jobs.flatMap((job) => job.reasons)];
  assert.ok(reasons.includes(reason), `expected ${reason} in ${JSON.stringify(reasons)}`);
  return result;
}

// ---------------------------------------------------------------------------------------------
// YAML subset

test('parse: the declared subset reads mappings, sequences, scalars, flow sequences and literal blocks', () => {
  const document = parseWorkflowYaml(
    [
      '---',
      '# leading comment',
      'name: "Quoted \\"name\\""',
      "single: 'it''s'",
      'plain: a b # trailing comment',
      'empty:',
      'flow: [main, "release", \'x\']',
      'list:',
      '- one',
      '- key: value',
      '  other: 2',
      'nested:',
      '  - - inner',
      'clip: |',
      '  line one',
      '',
      '  line two',
      'strip: |-',
      '  kept',
      'keep: |+',
      '  kept',
      '',
      'url: https://example.invalid/a:b',
    ].join('\n'),
  );
  assert.equal(document.get('name'), 'Quoted "name"');
  assert.equal(document.get('single'), "it's");
  assert.equal(document.get('plain'), 'a b');
  assert.equal(document.get('empty'), null);
  assert.deepEqual(document.get('flow'), ['main', 'release', 'x']);
  const list = document.get('list');
  assert.equal(list[0], 'one');
  assert.deepEqual(
    [...list[1].entries()],
    [
      ['key', 'value'],
      ['other', '2'],
    ],
  );
  assert.deepEqual(document.get('nested'), [['inner']]);
  assert.equal(document.get('clip'), 'line one\n\nline two\n');
  assert.equal(document.get('strip'), 'kept');
  assert.equal(document.get('keep'), 'kept\n\n');
  assert.equal(document.get('url'), 'https://example.invalid/a:b');
});

// Each construct outside the declared subset makes the file unparsable, which is never evidence.
const UNSUPPORTED = [
  ['anchor', 'on:\n  pull_request: &trigger\n    types: [synchronize]\n'],
  ['alias', 'on: *trigger\n'],
  ['tag', 'on: !!str pull_request\n'],
  ['flow-mapping', 'on: {pull_request: null}\n'],
  ['nested-flow-collection', 'on: [[pull_request]]\n'],
  ['flow-mapping', 'on: [pull_request: x]\n'],
  ['multiline-flow-sequence', 'on: [pull_request,\n  push]\n'],
  ['folded-block-scalar', 'note: >\n  folded\n'],
  ['block-indentation-indicator', 'note: |2\n    indented\n'],
  ['multiple-documents', 'on: pull_request\n---\non: push\n'],
  ['multiline-scalar', 'on: pull\n  _request\n'],
  ['multiline-quoted-scalar', 'name: "open\n  close"\n'],
  ['tab-indentation', 'on:\n\tpull_request:\n'],
  ['duplicate-key', 'on: push\non: pull_request\n'],
  ['merge-key', 'base:\n  a: b\nderived:\n  <<: x\n'],
  ['directive', '%YAML 1.2\non: pull_request\n'],
  ['complex-key', 'on:\n  ? pull_request\n'],
];

for (const [reason, text] of UNSUPPORTED) {
  test(`parse: ${reason} is outside the subset and makes the workflow unparsable`, () => {
    assert.throws(
      () => parseWorkflowYaml(text),
      (error) => {
        assert.ok(error instanceof YamlSubsetError);
        assert.equal(error.reason, reason);
        return true;
      },
    );
    const result = evaluate(text);
    assert.equal(result.status, 'unparsable');
    assert.deepEqual(result.reasons, ['unparsable']);
    assert.equal(result.unparsable.reason, reason);
  });
}

// ---------------------------------------------------------------------------------------------
// Manifest test commands

test('manifest: each manifest declares its bare test command with a normalized identity', () => {
  const pnpm = PNPM_COMMANDS.find((command) => command.normalized === 'pnpm test');
  assert.deepEqual(pnpm.forms, ['pnpm test', 'pnpm run test']);
  assert.deepEqual(
    PNPM_COMMANDS.map((command) => command.normalized),
    ['npm test', 'pnpm test', 'yarn test', 'bun run test'],
  );
  const others = manifestTestCommands({
    'Cargo.toml': '[package]\n',
    'go.mod': 'module x\n',
    'pyproject.toml': '[project]\n',
    Makefile: 'build:\n\tcc x.c\ntest: build\n\t./x\n',
  });
  assert.deepEqual(
    others.map((command) => command.normalized),
    ['cargo test', 'go test', 'pytest', 'make test'],
  );
  assert.deepEqual(manifestTestCommands({ Makefile: 'test := value\nbuild:\n' }), []);
  assert.deepEqual(manifestTestCommands({ 'package.json': '{"scripts":{"build":"x"}}' }), []);
  assert.deepEqual(manifestTestCommands({ 'package.json': 'not json' }), []);
});

test('detect: `pnpm run test` and `pnpm test` are one script; `bun test` is not the script', () => {
  const run = evaluate(workflow({ steps: ['      - run: pnpm run test'] }));
  assert.equal(run.status, 'detected');
  assert.equal(jobOf(run).step.normalizedCommand, 'pnpm test');
  assertUndetected(workflow({ steps: ['      - run: bun test'] }), 'no-test-step');
  for (const command of ['cargo test', 'go test', 'pytest', 'make test']) {
    const commands = manifestTestCommands({
      'Cargo.toml': '',
      'go.mod': '',
      'pytest.ini': '',
      Makefile: 'test:\n\ttrue\n',
    });
    const result = evaluate(workflow({ steps: [`      - run: ${command}`] }), { commands });
    assert.equal(result.status, 'detected', command);
    assert.equal(jobOf(result).step.normalizedCommand, command);
  }
});

test('detect: without a manifest test command nothing is detected', () => {
  assertUndetected(workflow(), 'no-test-step', { commands: [] });
});

// ---------------------------------------------------------------------------------------------
// Detection conditions

test("detect: this repository's own ci.yml shape is detected", () => {
  const text = readFileSync(new URL('.github/workflows/ci.yml', ROOT), 'utf8');
  const commands = manifestTestCommands({
    'package.json': readFileSync(new URL('package.json', ROOT), 'utf8'),
  });
  const result = evaluateWorkflow('.github/workflows/ci.yml', text, { commands, base: 'develop' });
  assert.equal(result.status, 'detected', JSON.stringify(result));
  const build = jobOf(result, 'build');
  assert.equal(build.status, 'detected');
  assert.equal(build.jobName, 'Format, test and build');
  assert.equal(build.step.name, 'Unit tests');
  assert.equal(build.step.normalizedCommand, 'pnpm test');
  assert.deepEqual(build.expectedInstances, ['Format, test and build']);
  assert.equal(jobOf(result, 'shellcheck').status, 'undetected');
});

test('detect: the minimal workflow is detected with its single expected instance', () => {
  const result = evaluate(workflow());
  assert.equal(result.status, 'detected');
  assert.deepEqual(result.trigger, {
    event: 'pull_request',
    base: 'main',
    triggers: true,
    reasons: [],
  });
  assert.deepEqual(jobOf(result).expectedInstances, ['Unit tests']);
  assert.equal(jobOf(result).step.index, 1);
});

test('detect: a job without a name is expected under its job id', () => {
  const job = ['  unit:', '    runs-on: ubuntu-latest', '    steps:', '      - run: pnpm test'];
  const result = evaluate(workflow({ job: job.join('\n') }));
  assert.deepEqual(jobOf(result, 'unit').expectedInstances, ['unit']);
});

test('detect: the trigger must be pull_request without paths filters', () => {
  assert.equal(evaluate(workflow({ on: 'on: pull_request\n' })).status, 'detected');
  assert.equal(evaluate(workflow({ on: 'on: [push, pull_request]\n' })).status, 'detected');
  assertUndetected(workflow({ on: 'on:\n  push:\n' }), 'no-pull-request-trigger');
  assertUndetected(workflow({ on: 'on: pull_request_target\n' }), 'no-pull-request-trigger');
  assertUndetected(workflow({ on: '' }), 'no-pull-request-trigger');
  assertUndetected(workflow({ on: 'on:\n  pull_request:\n    paths: [src/**]\n' }), 'paths-filter');
  assertUndetected(
    workflow({ on: 'on:\n  pull_request:\n    paths-ignore:\n      - docs/**\n' }),
    'paths-filter',
  );
});

test('detect: a branches filter must be an exact literal list that includes the base', () => {
  assert.equal(
    evaluate(workflow({ on: 'on:\n  pull_request:\n    branches: [main, develop]\n' })).status,
    'detected',
  );
  assertUndetected(
    workflow({ on: 'on:\n  pull_request:\n    branches: [develop]\n' }),
    'base-not-in-branches',
  );
  assertUndetected(
    workflow({ on: "on:\n  pull_request:\n    branches: ['ma*']\n" }),
    'branches-filter',
  );
  assertUndetected(
    workflow({ on: 'on:\n  pull_request:\n    branches-ignore: [main]\n' }),
    'base-in-branches-ignore',
  );
  assert.equal(
    evaluate(workflow({ on: 'on:\n  pull_request:\n    branches-ignore: [gh-pages]\n' })).status,
    'detected',
  );
  assertUndetected(
    workflow({ on: "on:\n  pull_request:\n    branches-ignore: ['release/**']\n" }),
    'branches-filter',
  );
});

test('detect: types must include synchronize when present', () => {
  assert.equal(
    evaluate(workflow({ on: 'on:\n  pull_request:\n    types: [opened, synchronize]\n' })).status,
    'detected',
  );
  assertUndetected(
    workflow({ on: 'on:\n  pull_request:\n    types: [opened]\n' }),
    'types-without-synchronize',
  );
});

test('detect: the test step must be exactly the bare invocation', () => {
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test --coverage'] }),
    'test-command-not-bare',
  );
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test | tee log'] }),
    'test-command-not-bare',
  );
  assertUndetected(
    workflow({ steps: ['      - run: pnpm install && pnpm test'] }),
    'test-command-not-bare',
  );
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test || true'] }),
    'test-command-not-bare',
  );
  assertUndetected(
    workflow({ steps: ['      - run: |', '          pnpm install', '          pnpm test'] }),
    'test-command-not-bare',
  );
  const literal = evaluate(workflow({ steps: ['      - run: |', '          pnpm test'] }));
  assert.equal(literal.status, 'detected');
});

test('detect: a shell other than bash on the step, job or workflow defaults is excluded', () => {
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test', '        shell: sh'] }),
    'shell-override',
  );
  assert.equal(
    evaluate(workflow({ steps: ['      - run: pnpm test', '        shell: bash'] })).status,
    'detected',
  );
  assertUndetected(
    workflow({ jobExtra: ['    defaults:', '      run:', '        shell: pwsh'] }),
    'shell-override',
  );
  assertUndetected(workflow({ top: 'defaults:\n  run:\n    shell: sh\n' }), 'shell-override');
});

test('detect: a condition or continue-on-error on the step or its job is excluded', () => {
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test', "        if: github.actor != 'bot'"] }),
    'step-condition',
  );
  assertUndetected(workflow({ jobExtra: ['    if: always()'] }), 'job-condition');
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test', '        continue-on-error: true'] }),
    'continue-on-error',
  );
  assertUndetected(workflow({ jobExtra: ['    continue-on-error: true'] }), 'continue-on-error');
});

test("detect: the working directory must be the manifest's directory", () => {
  assertUndetected(
    workflow({ steps: ['      - run: pnpm test', '        working-directory: packages/app'] }),
    'working-directory-mismatch',
  );
  assert.equal(
    evaluate(workflow({ steps: ['      - run: pnpm test', '        working-directory: ./'] }))
      .status,
    'detected',
  );
  assertUndetected(
    workflow({ jobExtra: ['    defaults:', '      run:', '        working-directory: app'] }),
    'working-directory-mismatch',
  );
  assertUndetected(
    workflow({ top: 'defaults:\n  run:\n    working-directory: app\n' }),
    'working-directory-mismatch',
  );
});

test('detect: a literal matrix yields its complete static instance set', () => {
  const result = evaluate(
    workflow({
      jobExtra: [
        '    strategy:',
        '      matrix:',
        '        node: [22, 24]',
        '        os:',
        '          - ubuntu-latest',
        '          - macos-latest',
      ],
    }),
  );
  assert.equal(result.status, 'detected');
  assert.deepEqual(jobOf(result).expectedInstances, [
    'Unit tests (22, ubuntu-latest)',
    'Unit tests (22, macos-latest)',
    'Unit tests (24, ubuntu-latest)',
    'Unit tests (24, macos-latest)',
  ]);
});

// Invariant: a trigger or matrix the static reading cannot bound is never detected, so an
// unrecognized filter, a path exclusion, contradictory branch filters and an oversized matrix
// cannot yield an expected instance set that CI evidence would later be matched against.
test('detect: path exclusions, unknown trigger filters, mixed branch filters and oversized matrices are excluded', () => {
  assertUndetected(
    workflow({ on: 'on:\n  pull_request:\n    paths-ignore: [docs/**]\n' }),
    'paths-filter',
  );
  assertUndetected(
    workflow({ on: 'on:\n  pull_request:\n    labels: [ready]\n' }),
    'unknown-trigger-filter',
  );
  assertUndetected(
    workflow({
      on: 'on:\n  pull_request:\n    branches: [main]\n    branches-ignore: [gh-pages]\n',
    }),
    'branches-filter',
  );
  const axis = (name, count) =>
    `        ${name}: [${Array.from({ length: count }, (_, index) => `v${index}`).join(', ')}]`;
  assertUndetected(
    workflow({
      jobExtra: ['    strategy:', '      matrix:', axis('a', 17), axis('b', 17)],
    }),
    'matrix-too-large',
  );
});

test('detect: a matrix that is not statically enumerable is excluded', () => {
  const matrix = (lines) => workflow({ jobExtra: ['    strategy:', '      matrix:', ...lines] });
  assertUndetected(
    matrix(['        node: [22]', '        include:', '          - node: 24']),
    'matrix-include-exclude',
  );
  assertUndetected(
    matrix(['        node: [22, 24]', '        exclude:', '          - node: 22']),
    'matrix-include-exclude',
  );
  assertUndetected(
    workflow({
      jobExtra: ['    strategy:', '      matrix: ${{ fromJSON(needs.plan.outputs.m) }}'],
    }),
    'dynamic-matrix',
  );
  assertUndetected(matrix(['        node: ${{ fromJSON(vars.NODES) }}']), 'dynamic-matrix');
  assertUndetected(matrix(['        node: []']), 'empty-matrix');
});

test('detect: a templated job name is excluded', () => {
  const job = [
    '  test:',
    '    name: Unit tests ${{ matrix.node }}',
    '    runs-on: ubuntu-latest',
    '    strategy:',
    '      matrix:',
    '        node: [22]',
    '    steps:',
    '      - run: pnpm test',
  ];
  assertUndetected(workflow({ job: job.join('\n') }), 'templated-name');
});

test('detect: a test only inside a reusable workflow or composite action is excluded', () => {
  assertUndetected(
    workflow({ job: '  test:\n    uses: ./.github/workflows/test.yml' }),
    'reusable-workflow',
  );
  assertUndetected(
    workflow({ steps: ['      - uses: ./.github/actions/test'] }),
    'test-in-local-action',
  );
});

// ---------------------------------------------------------------------------------------------
// ci-detect through Git

test('ci-detect: reads the base commit and detects the repository ci.yml shape', async (t) => {
  const root = baseRepository(t, {
    'package.json': readFileSync(new URL('package.json', ROOT), 'utf8'),
    '.github/workflows/ci.yml': readFileSync(new URL('.github/workflows/ci.yml', ROOT), 'utf8'),
    '.github/workflows/other.yml':
      'on: push\njobs:\n  x:\n    runs-on: a\n    steps:\n      - run: pnpm test\n',
  });
  // An uncommitted working-tree edit is never read.
  write(root, '.github/workflows/ci.yml', 'not: [valid\n');
  const data = await operation('ci-detect', { cwd: root, baseRef: 'main', base: 'develop' });
  assert.equal(data.status, 'detected');
  assert.equal(data.baseCommit, git(root, 'rev-parse', 'refs/remotes/origin/main'));
  assert.equal(data.base, 'develop');
  assert.deepEqual(data.testCommands, ['pnpm test']);
  assert.deepEqual(data.detectedJobs, [
    {
      workflowPath: '.github/workflows/ci.yml',
      jobId: 'build',
      jobName: 'Format, test and build',
      normalizedCommand: 'pnpm test',
      expectedInstances: ['Format, test and build'],
    },
  ]);
  assert.deepEqual(
    data.workflows.map((entry) => [entry.path, entry.status]),
    [
      ['.github/workflows/ci.yml', 'detected'],
      ['.github/workflows/other.yml', 'undetected'],
    ],
  );
});

test('ci-detect: a workflow that exists only on the head is ignored', async (t) => {
  const root = baseRepository(t, { 'package.json': PNPM_MANIFEST });
  headCommit(root, { '.github/workflows/ci.yml': workflow() });
  const data = await operation('ci-detect', { cwd: root, baseRef: 'main' });
  assert.equal(data.status, 'undetected');
  assert.deepEqual(data.workflows, []);
  assert.deepEqual(data.detectedJobs, []);
});

test('ci-detect: an unparsable base workflow without a detected job reports unparsable', async (t) => {
  const root = baseRepository(t, {
    'package.json': PNPM_MANIFEST,
    '.github/workflows/ci.yml': 'on: &x pull_request\n',
  });
  const data = await operation('ci-detect', { cwd: root, baseRef: 'main' });
  assert.equal(data.status, 'unparsable');
  assert.equal(data.workflows[0].unparsable.reason, 'anchor');
});

test('ci-detect: a symlinked workflow file is not read', async (t) => {
  const root = baseRepository(
    t,
    { 'package.json': PNPM_MANIFEST, 'ci-source.yml': workflow() },
    { '.github/workflows/ci.yml': '../../ci-source.yml' },
  );
  const data = await operation('ci-detect', { cwd: root, baseRef: 'main' });
  assert.equal(data.status, 'unparsable');
  assert.deepEqual(data.workflows[0].reasons, ['not-a-regular-file']);
});

test('ci-detect: a missing base ref is undetected, and unsafe input is rejected', async (t) => {
  const root = baseRepository(t, { 'package.json': PNPM_MANIFEST });
  const data = await operation('ci-detect', { cwd: root, baseRef: 'release' });
  assert.equal(data.status, 'undetected');
  assert.deepEqual(data.reasons, ['base-ref-missing']);
  for (const input of [
    { cwd: root, baseRef: '--output=x' },
    { cwd: root, baseRef: 'main', base: 'a..b' },
    { cwd: 'relative', baseRef: 'main' },
    { cwd: root, baseRef: 'main', extra: true },
  ]) {
    const envelope = await executeOperation('ci-detect', input, deps());
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
});

// ---------------------------------------------------------------------------------------------
// ci-integrity

const COMPOSITE = [
  'name: Setup',
  'runs:',
  '  using: composite',
  '  steps:',
  '    - uses: ./.github/actions/inner',
  '    - run: echo setup',
  '      shell: bash',
].join('\n');

function integrityRepository(t, extra = {}) {
  return baseRepository(t, {
    'package.json': PNPM_MANIFEST,
    '.github/workflows/ci.yml': workflow({
      steps: ['      - uses: ./.github/actions/setup', '      - run: pnpm test'],
    }),
    '.github/actions/setup/action.yml': `${COMPOSITE}\n`,
    '.github/actions/inner/action.yaml': 'runs:\n  using: composite\n  steps: []\n',
    'src/index.js': 'export {};\n',
    ...extra,
  });
}

test('ci-integrity: an unchanged CI between base and head commit is ok', async (t) => {
  const root = integrityRepository(t);
  const head = headCommit(root, { 'src/index.js': 'export const x = 1;\n' });
  const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: head });
  assert.equal(data.status, 'ok', JSON.stringify(data));
  assert.equal(data.reason, 'identical');
  assert.ok(data.compared.includes('.github/actions/setup/action.yml'));
  assert.ok(data.compared.includes('.github/actions/inner/action.yaml'));
  const treeOid = git(root, 'rev-parse', `${head}^{tree}`);
  const byTree = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: treeOid });
  assert.equal(byTree.status, 'ok');
});

test('ci-integrity: a changed workflow fails integrity', async (t) => {
  const root = integrityRepository(t);
  const head = headCommit(root, { '.github/workflows/ci.yml': workflow({ on: 'on: push\n' }) });
  const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: head });
  assert.equal(data.status, 'changed');
  assert.deepEqual(
    data.differences.map((difference) => difference.path),
    ['.github/workflows/ci.yml'],
  );
});

test('ci-integrity: a changed or added Forgejo or Gitea workflow fails integrity', async (t) => {
  const root = integrityRepository(t);
  const head = headCommit(root, { '.gitea/workflows/test.yml': 'on: push\n' });
  const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: head });
  assert.equal(data.status, 'changed');
  assert.equal(data.differences[0].base, null);
});

test('ci-integrity: a changed referenced composite action fails integrity, nested ones included', async (t) => {
  const root = integrityRepository(t);
  const head = headCommit(root, {
    '.github/actions/inner/action.yaml':
      'runs:\n  using: composite\n  steps:\n    - run: exit 0\n      shell: bash\n',
  });
  const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: head });
  assert.equal(data.status, 'changed');
  assert.deepEqual(
    data.differences.map((difference) => difference.path),
    ['.github/actions/inner/action.yaml'],
  );
  // An added `action.yml` beside the `action.yaml` changes which file the runner picks.
  git(root, 'checkout', '--quiet', 'main');
  const added = headCommit(
    root,
    { '.github/actions/inner/action.yml': 'runs:\n  using: composite\n  steps: []\n' },
    'added',
  );
  const addedData = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: added });
  assert.equal(addedData.status, 'changed');
});

test('ci-integrity: a changed referenced local reusable workflow fails integrity', async (t) => {
  const root = baseRepository(t, {
    '.github/workflows/ci.yml': 'on: pull_request\njobs:\n  call:\n    uses: ./ci/reusable.yml\n',
    'ci/reusable.yml':
      'on: workflow_call\njobs:\n  t:\n    runs-on: a\n    steps:\n      - run: pnpm test\n',
  });
  const head = headCommit(root, { 'ci/reusable.yml': 'on: workflow_call\njobs: {}\n' });
  const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: head });
  assert.equal(data.status, 'changed');
  assert.deepEqual(
    data.differences.map((difference) => difference.path),
    ['ci/reusable.yml'],
  );
});

test('ci-integrity: the staged index is compared without write-tree', async (t) => {
  const root = integrityRepository(t);
  write(root, 'src/index.js', 'export const staged = true;\n');
  git(root, 'add', 'src/index.js');
  const unrelated = await operation('ci-integrity', {
    cwd: root,
    baseRef: 'main',
    tree: INDEX_TREE,
  });
  assert.equal(unrelated.status, 'ok', JSON.stringify(unrelated));
  // An unstaged workflow edit is not part of the staged tree.
  write(root, '.github/workflows/ci.yml', 'on: push\n');
  const unstaged = await operation('ci-integrity', {
    cwd: root,
    baseRef: 'main',
    tree: INDEX_TREE,
  });
  assert.equal(unstaged.status, 'ok');
  git(root, 'add', '.github/workflows/ci.yml');
  const staged = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: INDEX_TREE });
  assert.equal(staged.status, 'changed');
  assert.equal(staged.differences[0].path, '.github/workflows/ci.yml');
});

test('ci-integrity: an unparsable workflow leaves its references unprovable', async (t) => {
  const root = integrityRepository(t, { '.github/workflows/odd.yml': 'on: &x push\n' });
  const head = headCommit(root, {});
  const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree: head });
  assert.equal(data.status, 'unprovable');
  assert.deepEqual(data.problems, [
    { path: '.github/workflows/odd.yml', reason: 'unparsable-source', detail: 'anchor' },
  ]);
});

// Invariant: a symlink (or any non-tree entry) on the way to a referenced composite action or
// reusable workflow, or a referenced source that is no regular file, is never `ok`: identical on
// both sides, it still leaves unprovable what the runner reads. Both the commit tree and the staged
// index are checked.
const SYMLINKED_REFERENCES = [
  [
    'a symlinked action directory',
    {
      '.github/workflows/ci.yml': workflow({
        steps: ['      - uses: ./.github/actions/setup', '      - run: pnpm test'],
      }),
      'shared/setup/action.yml': 'runs:\n  using: composite\n  steps: []\n',
    },
    { '.github/actions/setup': '../../shared/setup' },
    '.github/actions/setup',
  ],
  [
    'a symlinked parent directory',
    {
      '.github/workflows/ci.yml': workflow({
        steps: ['      - uses: ./.github/actions/setup', '      - run: pnpm test'],
      }),
      'shared/setup/action.yml': 'runs:\n  using: composite\n  steps: []\n',
    },
    { '.github/actions': '../shared' },
    '.github/actions',
  ],
  [
    'a symlinked action file',
    {
      '.github/workflows/ci.yml': workflow({
        steps: ['      - uses: ./.github/actions/setup', '      - run: pnpm test'],
      }),
      'shared/action.yml': 'runs:\n  using: composite\n  steps: []\n',
    },
    { '.github/actions/setup/action.yml': '../../../shared/action.yml' },
    '.github/actions/setup/action.yml',
  ],
  [
    'a symlinked reusable workflow',
    {
      '.github/workflows/ci.yml': 'on: pull_request\njobs:\n  call:\n    uses: ./ci/reusable.yml\n',
      'shared/reusable.yml': 'on: workflow_call\njobs: {}\n',
    },
    { 'ci/reusable.yml': '../shared/reusable.yml' },
    'ci/reusable.yml',
  ],
  [
    'a symlinked workflow directory',
    { 'shared/workflows/ci.yml': workflow() },
    { '.github/workflows': '../shared/workflows' },
    '.github/workflows',
  ],
];

for (const [label, files, links, unsafePath] of SYMLINKED_REFERENCES) {
  test(`ci-integrity: ${label} is unprovable for a commit tree and the index`, async (t) => {
    const root = baseRepository(t, { 'package.json': PNPM_MANIFEST, ...files }, links);
    const head = headCommit(root, { 'src/index.js': 'export {};\n' });
    for (const tree of [head, INDEX_TREE]) {
      const data = await operation('ci-integrity', { cwd: root, baseRef: 'main', tree });
      assert.equal(data.status, 'unprovable', `${tree}: ${JSON.stringify(data)}`);
      assert.equal(data.reason, 'unsafe-reference', tree);
      assert.deepEqual(data.differences, [], tree);
      assert.ok(
        data.problems.some(
          (problem) => problem.path === unsafePath && problem.reason === 'unsafe-reference',
        ),
        `${tree}: ${JSON.stringify(data.problems)}`,
      );
    }
  });
}

// Invariant: a blob's size is read before its content, so an oversized workflow, referenced source
// or manifest is reported or skipped without ever being loaded.
test('ci-detect and ci-integrity never load an oversized blob', async (t) => {
  const big = `# ${'x'.repeat(600 * 1024)}\n`;
  const root = baseRepository(t, {
    'package.json': PNPM_MANIFEST,
    'pyproject.toml': big,
    '.github/workflows/ci.yml': workflow(),
    '.github/workflows/big.yml': big,
  });
  const bigOid = git(root, 'rev-parse', 'HEAD:.github/workflows/big.yml');
  const real = createProcessRunner();
  const reads = [];
  const runner = (request) => {
    if (request.args.includes('cat-file')) reads.push(request.args.slice(-2).join(' '));
    return real(request);
  };
  const detect = await executeOperation(
    'ci-detect',
    { cwd: root, baseRef: 'main' },
    { runner, env: process.env },
  );
  assert.equal(detect.ok, true, JSON.stringify(detect.error));
  assert.equal(detect.data.status, 'detected');
  assert.deepEqual(
    detect.data.workflows.find((entry) => entry.path === '.github/workflows/big.yml').reasons,
    ['too-large'],
  );
  const head = headCommit(root, {});
  const integrity = await executeOperation(
    'ci-integrity',
    { cwd: root, baseRef: 'main', tree: head },
    { runner, env: process.env },
  );
  assert.equal(integrity.data.status, 'unprovable');
  assert.deepEqual(integrity.data.problems, [
    { path: '.github/workflows/big.yml', reason: 'unparsable-source', detail: 'too-large' },
  ]);
  assert.ok(reads.includes(`-s ${bigOid}`), JSON.stringify(reads));
  assert.ok(!reads.includes(`blob ${bigOid}`), 'the oversized blob is never read');
  const pyprojectOid = git(root, 'rev-parse', 'HEAD:pyproject.toml');
  assert.ok(!reads.includes(`blob ${pyprojectOid}`), 'the oversized manifest is never read');
});

test('ci-integrity: a missing base ref or tree object is missing, and a bad tree is invalid', async (t) => {
  const root = integrityRepository(t);
  const head = git(root, 'rev-parse', 'HEAD');
  const noBase = await operation('ci-integrity', { cwd: root, baseRef: 'release', tree: head });
  assert.equal(noBase.status, 'missing');
  assert.equal(noBase.reason, 'base-ref-missing');
  const noTree = await operation('ci-integrity', {
    cwd: root,
    baseRef: 'main',
    tree: 'b'.repeat(40),
  });
  assert.equal(noTree.status, 'missing');
  assert.equal(noTree.reason, 'tree-missing');
  for (const tree of ['HEAD', 'main', `${head}^`, '--output=x']) {
    const envelope = await executeOperation(
      'ci-integrity',
      { cwd: root, baseRef: 'main', tree },
      deps(),
    );
    assert.equal(envelope.error.code, 'INVALID_INPUT', tree);
  }
});

// ---------------------------------------------------------------------------------------------
// ci-evidence-match

const DETECTION = Object.freeze({
  status: 'detected',
  detectedJobs: [
    {
      workflowPath: '.github/workflows/ci.yml',
      jobId: 'test',
      jobName: 'Unit tests',
      normalizedCommand: 'pnpm test',
      expectedInstances: ['Unit tests (22)', 'Unit tests (24)'],
    },
  ],
});

function check(name, overrides = {}) {
  return {
    typename: 'CheckRun',
    appSlug: 'github-actions',
    event: 'pull_request',
    workflowPath: '.github/workflows/ci.yml',
    headSha: HEAD_SHA,
    name,
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
    ...overrides,
  };
}

function evidence(checks, detection = DETECTION) {
  return matchEvidence({ detection, checks, headSha: HEAD_SHA });
}

test('evidence: the complete green instance set on the verified head is evidence', () => {
  const result = evidence([
    check('Unit tests (22)'),
    check('Unit tests (24)'),
    check('Lint', { conclusion: 'FAILURE' }),
  ]);
  assert.equal(result.evidence, true);
  assert.equal(result.reason, 'complete');
  assert.equal(result.jobs[0].satisfied, true);
});

const NO_EVIDENCE = [
  [
    'SKIPPED',
    'not-success',
    [check('Unit tests (22)'), check('Unit tests (24)', { conclusion: 'SKIPPED' })],
  ],
  [
    'NEUTRAL',
    'not-success',
    [check('Unit tests (22)'), check('Unit tests (24)', { conclusion: 'NEUTRAL' })],
  ],
  [
    'a pending instance',
    'pending',
    [
      check('Unit tests (22)'),
      check('Unit tests (24)', { status: 'PENDING', conclusion: undefined }),
    ],
  ],
  ['an incomplete matrix', 'missing', [check('Unit tests (22)')], null],
  ['only a green non-test job', 'missing', [check('Lint')], null],
  [
    'a same-named status context',
    'missing',
    [check('Unit tests (22)', { typename: 'StatusContext' }), check('Unit tests (24)')],
    'not-check-run',
  ],
  [
    'two entries with the full identity under one name',
    'ambiguous',
    [check('Unit tests (22)'), check('Unit tests (22)'), check('Unit tests (24)')],
  ],
  [
    'a third-party app',
    'missing',
    [check('Unit tests (22)', { appSlug: 'ci-bot' }), check('Unit tests (24)')],
    'wrong-app',
  ],
  [
    'a push run',
    'missing',
    [check('Unit tests (22)', { event: 'push' }), check('Unit tests (24)')],
    'wrong-event',
  ],
  [
    'a push run beside a pull_request run of another head',
    'missing',
    [
      check('Unit tests (22)', { event: 'push' }),
      check('Unit tests (22)', { headSha: 'b'.repeat(40) }),
      check('Unit tests (24)'),
    ],
    'wrong-head',
  ],
  [
    'a failure beside a not yet reported instance',
    'not-success',
    [check('Unit tests (24)', { conclusion: 'FAILURE' })],
  ],
  [
    'a pull_request_target run',
    'missing',
    [check('Unit tests (22)', { event: 'pull_request_target' }), check('Unit tests (24)')],
    'wrong-event',
  ],
  [
    'another workflow file',
    'missing',
    [
      check('Unit tests (22)', { workflowPath: '.github/workflows/other.yml' }),
      check('Unit tests (24)'),
    ],
    'wrong-workflow',
  ],
  [
    'another head',
    'missing',
    [check('Unit tests (22)', { headSha: 'b'.repeat(40) }), check('Unit tests (24)')],
    'wrong-head',
  ],
  [
    'missing identity fields',
    'missing',
    [
      { name: 'Unit tests (22)', status: 'COMPLETED', conclusion: 'SUCCESS' },
      check('Unit tests (24)'),
    ],
    'not-check-run',
  ],
];

for (const [label, reason, checks, closestMismatch = null] of NO_EVIDENCE) {
  test(`evidence: ${label} is no evidence (${reason})`, () => {
    const result = evidence(checks);
    assert.equal(result.evidence, false);
    assert.equal(result.reason, reason);
    assert.equal(result.closestMismatch, closestMismatch);
  });
}

// Invariant: a same-named entry without the job's full identity is another check, never a final
// failure. While no entry carries the job's identity, the instance is `missing` – the job's own
// `pull_request` run may still appear – and the closest entry's first failing identity field is
// detail only, on the instance and repeated as `data.closestMismatch`.
test('evidence: only same-named non-matching entries leave the instance missing with the closest mismatch as detail', () => {
  assert.deepEqual(
    [...EVIDENCE_MISMATCHES],
    ['not-check-run', 'wrong-app', 'wrong-event', 'wrong-workflow', 'wrong-head'],
  );
  for (const mismatch of EVIDENCE_MISMATCHES) assert.ok(!EVIDENCE_REASONS.includes(mismatch));
  const pushOnly = evidence([
    check('Unit tests (22)', { event: 'push' }),
    check('Unit tests (24)', { typename: 'StatusContext' }),
  ]);
  assert.equal(pushOnly.evidence, false);
  assert.equal(pushOnly.reason, 'missing');
  assert.ok(EVIDENCE_NOT_YET_REASONS.includes(pushOnly.reason));
  assert.equal(pushOnly.closestMismatch, 'wrong-event');
  assert.deepEqual(pushOnly.jobs[0].instances, [
    { name: 'Unit tests (22)', outcome: 'missing', closestMismatch: 'wrong-event' },
    { name: 'Unit tests (24)', outcome: 'missing', closestMismatch: 'not-check-run' },
  ]);
  // An instance no entry names carries a null mismatch, and so does the result when the first
  // missing instance with a mismatch is not there.
  const unnamed = evidence([check('Unit tests (22)')]);
  assert.deepEqual(unnamed.jobs[0].instances[1], {
    name: 'Unit tests (24)',
    outcome: 'missing',
    closestMismatch: null,
  });
  assert.equal(unnamed.closestMismatch, null);
  // A full-identity entry that is not SUCCESS stays final, whatever non-matching entries say, and
  // the result then carries no mismatch detail.
  const failed = evidence([
    check('Unit tests (22)', { event: 'push' }),
    check('Unit tests (24)', { conclusion: 'FAILURE' }),
  ]);
  assert.equal(failed.reason, 'not-success');
  assert.equal(failed.closestMismatch, null);
  assert.equal(failed.jobs[0].instances[0].closestMismatch, 'wrong-event');
});

// Invariant: same-named entries without the job's full identity (a push run of an
// `on: [push, pull_request]` workflow, a status context) are other checks; they never make the
// matching pull_request check run ambiguous.
test('evidence: a same-named push run or status context beside the pull_request run is still evidence', () => {
  const result = evidence([
    check('Unit tests (22)', { event: 'push' }),
    check('Unit tests (22)'),
    check('Unit tests (24)'),
    check('Unit tests (24)', { typename: 'StatusContext' }),
    check('Unit tests (24)', { event: 'push', conclusion: 'FAILURE' }),
  ]);
  assert.equal(result.evidence, true, JSON.stringify(result));
  assert.equal(result.reason, 'complete');
});

// Invariant: `missing` and `pending` are the only not-yet reasons, so a gate can wait on them right
// after the push; a final failure anywhere wins over them, so it is never waited on.
test('evidence: missing and pending are stable not-yet reasons distinct from final failures', () => {
  assert.deepEqual([...EVIDENCE_NOT_YET_REASONS], ['missing', 'pending']);
  for (const reason of EVIDENCE_NOT_YET_REASONS) assert.ok(EVIDENCE_REASONS.includes(reason));
  assert.equal(evidence([]).reason, 'missing');
  const pending = evidence([
    check('Unit tests (22)', { status: 'IN_PROGRESS', conclusion: null }),
    check('Unit tests (24)', { status: 'QUEUED', conclusion: null }),
  ]);
  assert.equal(pending.evidence, false);
  assert.equal(pending.reason, 'pending');
  assert.deepEqual(
    pending.jobs[0].instances.map((instance) => instance.outcome),
    ['pending', 'pending'],
  );
  // The first not-yet outcome is reported while nothing failed finally.
  assert.equal(
    evidence([check('Unit tests (22)', { status: 'IN_PROGRESS', conclusion: null })]).reason,
    'pending',
  );
  // A final failure wins over a not-yet outcome, whatever their order.
  assert.equal(
    evidence([
      check('Unit tests (22)', { status: 'IN_PROGRESS', conclusion: null }),
      check('Unit tests (24)', { conclusion: 'CANCELLED' }),
    ]).reason,
    'not-success',
  );
  assert.equal(
    evidence([
      check('Unit tests (22)', { conclusion: 'TIMED_OUT' }),
      check('Unit tests (24)', { status: 'QUEUED', conclusion: null }),
    ]).reason,
    'not-success',
  );
  // A same-named entry of another event beside a pending run stays not yet.
  assert.equal(
    evidence([
      check('Unit tests (22)', { status: 'IN_PROGRESS', conclusion: null }),
      check('Unit tests (24)', { event: 'pull_request_target' }),
    ]).reason,
    'pending',
  );
});

test('evidence: an undetected or empty detection is never evidence', () => {
  assert.equal(
    evidence([check('Unit tests (22)')], { status: 'undetected', detectedJobs: [] }).reason,
    'not-detected',
  );
  const empty = evidence([], {
    status: 'detected',
    detectedJobs: [{ workflowPath: '.github/workflows/ci.yml', jobId: 'x', expectedInstances: [] }],
  });
  assert.equal(empty.evidence, false);
  assert.equal(empty.reason, 'no-instances');
});

test('evidence: every detected job must be satisfied', () => {
  const detection = {
    status: 'detected',
    detectedJobs: [
      DETECTION.detectedJobs[0],
      { workflowPath: '.github/workflows/rust.yml', jobId: 'cargo', expectedInstances: ['cargo'] },
    ],
  };
  const result = evidence([check('Unit tests (22)'), check('Unit tests (24)')], detection);
  assert.equal(result.evidence, false);
  assert.deepEqual(
    result.jobs.map((job) => job.satisfied),
    [true, false],
  );
});

test('evidence: malformed input is rejected', async () => {
  for (const input of [
    { detection: DETECTION, checks: [], headSha: 'HEAD' },
    { detection: DETECTION, checks: {}, headSha: HEAD_SHA },
    { detection: DETECTION, checks: [null], headSha: HEAD_SHA },
    { detection: { status: 'maybe', detectedJobs: [] }, checks: [], headSha: HEAD_SHA },
    { detection: DETECTION, checks: [], headSha: HEAD_SHA, extra: 1 },
  ]) {
    const envelope = await executeOperation('ci-evidence-match', input);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
  }
});

// ---------------------------------------------------------------------------------------------
// quick-marker-scan

const MARKER = 'Effective-Flow-Conflict-Validation: quick';

// Invariant: only the exact trailer line in the message's trailer block marks a commit; the same
// text in the subject, in the body, with another key spelling or value, or in a last paragraph that
// is no trailer block does not.
test('quick marker: only the exact trailer in the last paragraph counts', () => {
  for (const message of [
    `Merge branch 'main'\n\nResolve the lockfile conflict.\n\n${MARKER}\n`,
    `Merge branch 'main'\n\nSigned-off-by: A <a@example.invalid>\n${MARKER}  \n`,
    `Merge branch 'main'\r\n\r\n${MARKER}\r\n`,
    `Merge\n\nRefs: #1\n  continued\n${MARKER}\n\n\n`,
  ]) {
    assert.equal(hasQuickMarker(message), true, JSON.stringify(message));
  }
  for (const message of [
    `${MARKER}\n`,
    `Merge\n${MARKER}\n`,
    `Merge\n\n${MARKER}\n\nResolved by hand.\n`,
    `Merge\n\nSee ${MARKER}\n`,
    `Merge\n\nNot a trailer line\n${MARKER}\n`,
    'Merge\n\neffective-flow-conflict-validation: quick\n',
    'Merge\n\nEffective-Flow-Conflict-Validation: full\n',
    'Merge\n\nEffective-Flow-Conflict-Validation: quick, really\n',
    'Merge\n\nEffective-Flow-Conflict-Validation:quick\n',
    `Merge\n\n ${MARKER}\n`,
    '',
    null,
  ]) {
    assert.equal(hasQuickMarker(message), false, JSON.stringify(message));
  }
});

// A base repository with a feature branch: a plain commit, a quick-marked merge of `main`, and a
// commit that only mentions the marker in its body.
function markerRepository(t) {
  const root = baseRepository(t, { 'package.json': PNPM_MANIFEST });
  const mainFirst = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '--quiet', '-b', 'feature');
  write(root, 'src/feature.js', 'export {};\n');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'feat: add feature');
  git(root, 'checkout', '--quiet', 'main');
  write(root, 'src/main.js', 'export {};\n');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'chore: main moves on');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'checkout', '--quiet', 'feature');
  git(root, 'merge', '--quiet', '--no-ff', '-m', `Merge branch 'main'\n\n${MARKER}`, 'main');
  const merge = git(root, 'rev-parse', 'HEAD');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', `docs: note\n\n${MARKER}\n\nmore text`);
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, merge, head, mainFirst };
}

test('quick-marker-scan: lists the marked commits between the merge base and the head', async (t) => {
  const { root, merge, head } = markerRepository(t);
  const data = await operation('quick-marker-scan', { cwd: root, baseRef: 'main', headSha: head });
  assert.equal(data.found, true, JSON.stringify(data));
  assert.deepEqual(data.commits, [merge]);
  assert.equal(data.headSha, head);
  assert.equal(data.baseCommit, git(root, 'rev-parse', 'refs/remotes/origin/main'));
  assert.equal(data.mergeBase, git(root, 'merge-base', 'refs/remotes/origin/main', head));
  assert.equal(data.scanned, 3);
});

test('quick-marker-scan: an unmarked range is found false', async (t) => {
  const root = baseRepository(t, { 'package.json': PNPM_MANIFEST });
  const head = headCommit(root, { 'src/x.js': 'export {};\n' });
  const data = await operation('quick-marker-scan', { cwd: root, baseRef: 'main', headSha: head });
  assert.equal(data.found, false);
  assert.deepEqual(data.commits, []);
  assert.equal(data.scanned, 1);
  // A head equal to the base scans nothing.
  const base = git(root, 'rev-parse', 'refs/remotes/origin/main');
  const empty = await operation('quick-marker-scan', { cwd: root, baseRef: 'main', headSha: base });
  assert.deepEqual([empty.found, empty.scanned], [false, 0]);
});

// Invariant: when the range cannot be read the scan fails closed with a reason, never `found: false`.
test('quick-marker-scan: a missing base ref, head or merge base is ok false with a reason', async (t) => {
  const { root, head } = markerRepository(t);
  const failures = [
    [{ baseRef: 'release', headSha: head }, 'base-ref-missing'],
    [{ baseRef: 'main', headSha: 'c'.repeat(40) }, 'head-missing'],
    [{ baseRef: 'main', headSha: git(root, 'rev-parse', 'HEAD^{tree}') }, 'head-missing'],
  ];
  git(root, 'checkout', '--quiet', '--orphan', 'unrelated');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', `orphan\n\n${MARKER}`);
  failures.push([{ baseRef: 'main', headSha: git(root, 'rev-parse', 'HEAD') }, 'no-merge-base']);
  for (const [input, reason] of failures) {
    const envelope = await executeOperation('quick-marker-scan', { cwd: root, ...input }, deps());
    assert.equal(envelope.ok, false, reason);
    assert.equal(envelope.error.code, 'GIT_FAILED', reason);
    assert.equal(envelope.error.details.reason, reason);
  }
  for (const input of [
    { cwd: root, baseRef: 'main', headSha: 'HEAD' },
    { cwd: root, baseRef: '--output=x', headSha: head },
    { cwd: 'relative', baseRef: 'main', headSha: head },
    { cwd: root, baseRef: 'main', headSha: head, extra: true },
  ]) {
    const envelope = await executeOperation('quick-marker-scan', input, deps());
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
  }
});

// Invariant: a shallow clone fails closed before anything else is read: its cut-off history can
// hide the merge base or a marked commit while every Git call still succeeds, so the scan never
// answers `found: false` from it.
test('quick-marker-scan: a shallow repository is ok false with the shallow-repository reason', async (t) => {
  assert.ok(QUICK_MARKER_FAILURES.includes('shallow-repository'));
  const { root, head } = markerRepository(t);
  const shallow = join(dirname(root), 'shallow');
  spawnSync(
    'git',
    ['clone', '--quiet', '--depth=1', '--branch=feature', `file://${root}`, shallow],
    {
      env: GIT_ENV,
      encoding: 'utf8',
    },
  );
  assert.equal(git(shallow, 'rev-parse', '--is-shallow-repository'), 'true');
  git(shallow, 'update-ref', 'refs/remotes/origin/main', git(shallow, 'rev-parse', 'HEAD'));
  const envelope = await executeOperation(
    'quick-marker-scan',
    { cwd: shallow, baseRef: 'main', headSha: head },
    deps(),
  );
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.error.code, 'GIT_FAILED');
  assert.equal(envelope.error.details.reason, 'shallow-repository');
  // An answer that is neither true nor false (a Git too old to know the flag echoes it) is no
  // proof of a full history either.
  const real = createProcessRunner();
  const echoing = (request) =>
    request.args.includes('--is-shallow-repository')
      ? { status: 0, stdout: '--is-shallow-repository\n', stderr: '' }
      : real(request);
  const unknown = await executeOperation(
    'quick-marker-scan',
    { cwd: root, baseRef: 'main', headSha: head },
    { runner: echoing, env: process.env },
  );
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.details.reason, 'shallow-repository');
  // The full repository it was cloned from still scans.
  const full = await operation('quick-marker-scan', { cwd: root, baseRef: 'main', headSha: head });
  assert.equal(full.found, true);
});

// Invariant: the scan only reads: every Git call is one of the read-only vectors, carries
// `--no-replace-objects`, and runs without inherited `GIT_*` variables.
test('quick-marker-scan: reads Git through the stripped environment only', async (t) => {
  const { root, head } = markerRepository(t);
  const real = createProcessRunner();
  const calls = [];
  const runner = (request) => {
    calls.push(request);
    return real(request);
  };
  const envelope = await executeOperation(
    'quick-marker-scan',
    { cwd: root, baseRef: 'main', headSha: head },
    { runner, env: { ...process.env, GIT_DIR: '/nonexistent', GIT_INDEX_FILE: '/x' } },
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  for (const { args, env } of calls) {
    assert.deepEqual(args.slice(0, 3), ['-C', root, '--no-replace-objects']);
    assert.ok(['show-ref', 'rev-parse', 'merge-base', 'log'].includes(args[3]), args.join(' '));
    assert.equal(env.GIT_DIR, undefined);
    assert.equal(env.GIT_INDEX_FILE, undefined);
  }
});

// ---------------------------------------------------------------------------------------------
// CLI

function runCli(args, stdin) {
  const result = spawnSync(process.execPath, [CLI, ...args], { input: stdin, encoding: 'utf8' });
  return {
    status: result.status,
    stderr: result.stderr,
    envelope: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test('cli: each operation prints one envelope line, and bad usage exits 2', (t) => {
  assert.deepEqual(CONFLICT_VALIDATION_OPERATIONS, [
    'ci-detect',
    'ci-integrity',
    'ci-evidence-match',
    'quick-marker-scan',
  ]);
  const root = baseRepository(t, {
    'package.json': PNPM_MANIFEST,
    '.github/workflows/ci.yml': workflow(),
  });
  const detect = runCli(['ci-detect'], JSON.stringify({ cwd: root, baseRef: 'main' }));
  assert.equal(detect.status, 0, detect.stderr);
  assert.equal(detect.envelope.data.status, 'detected');
  const match = runCli(
    ['ci-evidence-match'],
    JSON.stringify({ detection: detect.envelope.data, checks: [], headSha: HEAD_SHA }),
  );
  assert.equal(match.status, 0, match.stderr);
  assert.equal(match.envelope.data.evidence, false);
  const usage = runCli(['ci-detect', 'extra'], '{}');
  assert.equal(usage.status, 2);
  assert.equal(usage.envelope.error.code, 'INVALID_INPUT');
  assert.match(usage.stderr, /^INVALID_INPUT: usage/);
  const unsafe = runCli(
    ['ci-integrity'],
    JSON.stringify({ cwd: root, baseRef: 'main', tree: 'HEAD' }),
  );
  assert.equal(unsafe.status, 2);
});

test('cli: main accepts injected io and reports the exit code through setExitCode', async () => {
  let out = '';
  let exitCode = 0;
  const envelope = await main(['ci-evidence-match'], {
    input: { detection: DETECTION, checks: [], headSha: 'nope' },
    stdout: { write: (text) => (out += text) },
    stderr: { write: () => {} },
    setExitCode: (code) => (exitCode = code),
  });
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(out).ok, false);
});
