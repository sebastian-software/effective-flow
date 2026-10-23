import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  REQUIRED_NATIVE_CASES,
  VALIDATION_COMMANDS,
  VALIDATION_ENVIRONMENT,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import {
  ABSENT_POPULATIONS,
  PROVISIONAL_SCHEMA,
  validateAbsentArchive,
  validateAbsentVerdict,
  validateAuthorization,
  readAuthorization,
  verifyCandidate,
  verifyLiveRelease,
} from '../evals/build-context/_scaffold/provisional-release.mjs';
import suite from '../evals/build-context/suite.config.mjs';

const digest = (value) => validationDigest(value);
const oid = 'a'.repeat(40);
const ref = (name, value = name) => ({
  root: '/private/tmp/provisional-test',
  path: name,
  digest: digest(value),
});

const policy = {
  protocol: PROTECTED_VALIDATION_PROTOCOL,
  repository: 'sebastian-software/effective-flow',
  workflowPath: '.github/workflows/protected-macos-validation.yml',
  commands: [...VALIDATION_COMMANDS],
  nativeCases: [...REQUIRED_NATIVE_CASES],
  environment: VALIDATION_ENVIRONMENT,
  executionClosure: {
    workflowDigest: digest('workflow'),
    runnerDigest: digest('runner'),
    protocolDigest: digest('protocol'),
    coreDigest: digest('core'),
    operatorDigest: digest('operator'),
    projectionDigest: digest('projection'),
    backendDigest: digest('backend'),
    runnerHelperDigest: digest('runner helper'),
    watchdogDigest: digest('watchdog'),
    materializationAlgorithm: 'git-tree-v1',
    actions: { checkout: oid, pnpm: 'b'.repeat(40), node: 'c'.repeat(40) },
  },
};

const preparation = {
  protocol: PROTECTED_VALIDATION_PROTOCOL,
  requestRef: ref('request.json'),
  bootstrapRef: ref('bootstrap.json'),
  localSnapshot: {
    head: oid,
    index: digest('index'),
    workingTree: digest('tree'),
    untracked: digest('untracked'),
  },
  exportManifestRef: ref('export.json'),
  transportManifestRef: ref('transport.json'),
  materializationManifestRef: ref('materialization.json'),
  executionTree: oid,
  executionClosureDigest: digest(policy.executionClosure),
  repository: policy.repository,
  snapshotBranch: 'effective-flow/validation/provisional',
  snapshotCommit: oid,
  snapshotTree: oid,
};

function authorization(overrides = {}) {
  const authority =
    'The maintainer authorizes this bounded provisional release disposition after the independent policy review, with all absent populations explicitly retained as unproven and full strict semantics unchanged.';
  const report =
    'The independent policy review checked release scope, source and instrument binding, protected host proof, backend re-observation, materialization coverage, and strict failure behavior; material findings are closed.';
  return {
    schema: PROVISIONAL_SCHEMA,
    repository: policy.repository,
    featurePullRequest: 581,
    releasePullRequest: 999,
    releaseHeadRef: 'release-please--develop--effective-flow',
    releaseVersion: '1.2.3',
    sourceCommit: oid,
    sourceTree: oid,
    instrumentDigest: digest('instrument'),
    policyDigest: digest('policy'),
    issuedAt: '2026-10-22T10:00:00Z',
    expiresAt: '2026-10-28T10:00:00Z',
    absentPopulations: [...ABSENT_POPULATIONS],
    authority: {
      kind: 'trusted-user-bounded-provisional-release',
      decision: authority,
      decisionDigest: digest(authority),
    },
    review: {
      kind: 'independent-policy-review',
      reviewer: 'policy-reviewer',
      sourceCommit: oid,
      sourceTree: oid,
      instrumentDigest: digest('instrument'),
      policyDigest: digest('policy'),
      report,
      reportDigest: digest(report),
      materialFindings: [
        {
          id: 'F-1',
          severity: 'important',
          resolution: 'closed',
          evidence:
            'Strict acceptance remains unproven and the release disposition is explicitly provisional.',
        },
      ],
    },
    host: {
      request: { policyDigest: digest(policy) },
      preparation: structuredClone(preparation),
      policy: structuredClone(policy),
      runId: 42,
      runAttempt: 1,
    },
    ...overrides,
  };
}

test('a complete authorization binding is accepted and preserves explicit unproven populations', () => {
  const value = authorization();
  assert.equal(validateAuthorization(value, { now: Date.parse('2026-10-23T10:00:00Z') }), value);
  assert.equal(value.absentPopulations.length, ABSENT_POPULATIONS.length);
});

for (const [label, mutate] of [
  [
    'missing authority',
    (value) => {
      value.authority.decision = '';
    },
  ],
  [
    'changed authority bytes',
    (value) => {
      value.authority.decision += ' changed';
    },
  ],
  [
    'changed report bytes',
    (value) => {
      value.review.report += ' changed';
    },
  ],
  [
    'unresolved material finding',
    (value) => {
      value.review.materialFindings[0].resolution = 'open';
    },
  ],
  [
    'unlisted population',
    (value) => {
      value.absentPopulations.push('synthetic:extra');
    },
  ],
  [
    'future dated authorization',
    (value) => {
      value.issuedAt = '2026-10-24T10:00:00Z';
    },
  ],
  [
    'overlong authorization window',
    (value) => {
      value.expiresAt = '2026-11-01T10:00:00Z';
    },
  ],
  [
    'wrong release pull request',
    (value) => {
      value.releasePullRequest = 581;
    },
  ],
  [
    'wrong release ref',
    (value) => {
      value.releaseHeadRef = 'feature/not-release';
    },
  ],
  [
    'candidate source drift',
    (value) => {
      value.host.preparation.executionTree = 'b'.repeat(40);
    },
  ],
]) {
  test(`authorization refuses ${label}`, () => {
    const value = authorization();
    mutate(value);
    assert.throws(
      () => validateAuthorization(value, { now: Date.parse('2026-10-23T10:00:00Z') }),
      /authorization|finding|population|release|source|decision|report|scope|exception/i,
    );
  });
}

test('an absent verdict must be a complete failed strict population with no archived evidence', () => {
  const scenarios = suite.scenarios;
  const verdict = {
    failsStrict: true,
    requiredRuns: 5,
    scenarios: [
      ...scenarios.map((scenario) => ({ scenario, state: 'absent', runs: [], drift: [] })),
      { scenario: 'behavioural-archive-integrity', state: 'current', runs: [], drift: [] },
      { scenario: 'paired-matrix-and-native', state: 'absent', runs: [], drift: [] },
    ],
  };
  assert.doesNotThrow(() => validateAbsentVerdict(verdict, scenarios));
  assert.doesNotThrow(() => validateAbsentArchive('/nonexistent-provisional-test-root/results'));
  assert.throws(
    () => validateAbsentVerdict({ ...verdict, failsStrict: false }, scenarios),
    /failed full strict/,
  );
});

test('repository pins authenticate actual detached authorization bytes before admission', () => {
  const value = authorization({
    issuedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  const bytes = Buffer.from(JSON.stringify(value));
  const blob = {
    sha: oid,
    encoding: 'base64',
    size: bytes.length,
    content: bytes.toString('base64'),
  };
  const options = { repository: value.repository, blob: oid, digest: digest(bytes) };
  const read = (endpoint) => {
    assert.equal(endpoint, `repos/${value.repository}/git/blobs/${oid}`);
    return Buffer.from(JSON.stringify(blob));
  };
  assert.deepEqual(readAuthorization({ ...options, read }), value);
  assert.throws(
    () => readAuthorization({ ...options, digest: digest('other bytes'), read }),
    /trusted repository pin/,
  );
  for (const changed of [
    { ...blob, sha: 'b'.repeat(40) },
    { ...blob, encoding: 'utf8' },
    { ...blob, size: bytes.length + 1 },
    {
      ...blob,
      content: Buffer.from(JSON.stringify({ ...value, releaseVersion: '9.9.9' })).toString(
        'base64',
      ),
    },
  ]) {
    assert.throws(
      () => readAuthorization({ ...options, read: () => Buffer.from(JSON.stringify(changed)) }),
      /Git blob|trusted repository pin/,
    );
  }
  for (const missing of [
    { ...options, blob: undefined },
    { ...options, digest: undefined },
  ]) {
    assert.throws(() =>
      readAuthorization({ ...missing, read: () => assert.fail('invalid pin reached backend') }),
    );
  }
});

test('candidate admission refuses release-event replay and every bound identity drift before Git access', () => {
  const value = authorization();
  const actual = {
    sourceTree: value.sourceTree,
    instrumentDigest: value.instrumentDigest,
    policyDigest: value.policyDigest,
    releaseVersion: value.releaseVersion,
  };
  const context = {
    event: 'pull_request',
    repository: value.repository,
    pullRequest: value.releasePullRequest,
    headRef: value.releaseHeadRef,
  };
  for (const key of Object.keys(actual))
    assert.throws(
      () =>
        verifyCandidate(
          value,
          { ...actual, [key]: 'changed' },
          { root: '/nonexistent-test-root', context },
        ),
      /candidate drift/,
    );
  for (const [key, changed] of [
    ['event', 'push'],
    ['repository', 'foreign/repository'],
    ['pullRequest', value.releasePullRequest + 1],
    ['headRef', 'another-release'],
  ])
    assert.throws(
      () =>
        verifyCandidate(value, actual, {
          root: '/nonexistent-test-root',
          context: { ...context, [key]: changed },
        }),
      /replay or foreign release event/,
    );
});

test('live release admission rejects closed, merged, retargeted and moved release pull requests', () => {
  const value = authorization();
  const pr = {
    number: value.releasePullRequest,
    state: 'open',
    merged: false,
    base: { ref: 'develop', repo: { full_name: value.repository } },
    head: {
      ref: value.releaseHeadRef,
      sha: value.sourceCommit,
      repo: { full_name: value.repository },
    },
  };
  const read = (actual) => (endpoint) => {
    assert.equal(endpoint, `repos/${value.repository}/pulls/${value.releasePullRequest}`);
    return Buffer.from(JSON.stringify(actual));
  };
  assert.doesNotThrow(() => verifyLiveRelease(value, { read: read(pr) }));
  for (const mutate of [
    (p) => {
      p.number++;
    },
    (p) => {
      p.state = 'closed';
    },
    (p) => {
      p.merged = true;
    },
    (p) => {
      p.base.ref = 'main';
    },
    (p) => {
      p.base.repo.full_name = 'foreign/repo';
    },
    (p) => {
      p.head.repo.full_name = 'foreign/repo';
    },
    (p) => {
      p.head.ref = 'another-release';
    },
    (p) => {
      p.head.sha = 'b'.repeat(40);
    },
  ]) {
    const changed = structuredClone(pr);
    mutate(changed);
    assert.throws(
      () => verifyLiveRelease(value, { read: read(changed) }),
      /changed, closed, merged or.*foreign/,
    );
  }
});

test('candidate admission binds the real source Git tree and rejects a same-tree commit outside its ancestry', (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'provisional-source-ancestry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Provisional ancestry test');
  git('config', 'user.email', 'provisional-ancestry@invalid.local');
  writeFileSync(resolve(root, 'source.txt'), 'bound candidate bytes');
  git('add', '.');
  git('commit', '--quiet', '-m', 'bound source fixture');
  const value = {
    sourceCommit: git('rev-parse', 'HEAD'),
    sourceTree: git('rev-parse', 'HEAD^{tree}'),
    repository: policy.repository,
    instrumentDigest: digest('instrument'),
    policyDigest: digest('policy'),
    releaseVersion: '1.70.0',
    releasePullRequest: 584,
    releaseHeadRef: 'release-please--branches--develop--components--effective-flow',
  };
  const actual = {
    sourceTree: value.sourceTree,
    instrumentDigest: value.instrumentDigest,
    policyDigest: value.policyDigest,
    releaseVersion: value.releaseVersion,
  };
  const options = {
    root,
    context: {
      event: 'pull_request',
      repository: value.repository,
      pullRequest: value.releasePullRequest,
      headRef: value.releaseHeadRef,
    },
  };
  assert.doesNotThrow(() => verifyCandidate(value, actual, options));
  const unrelated = git(
    'commit-tree',
    value.sourceTree,
    '-m',
    'same tree without admitted ancestry',
  );
  assert.notEqual(unrelated, value.sourceCommit);
  assert.throws(
    () => verifyCandidate({ ...value, sourceCommit: unrelated }, actual, options),
    /merge-base --is-ancestor/,
  );
  assert.throws(
    () =>
      verifyCandidate(
        { ...value, sourceTree: 'e'.repeat(40) },
        { ...actual, sourceTree: 'e'.repeat(40) },
        options,
      ),
    /authorized commit tree differs/,
  );
});
