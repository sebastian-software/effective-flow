// Separate, release-specific admission. This never changes the full strict verifier.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertExact,
  canonicalJSON,
  validationDigest,
  validateDigest,
  validateOid,
  validatePolicy,
  validatePreparation,
  validateMaterializationManifest,
} from '../../../src/scripts/protected-validation-protocol.mjs';
import { observeBackend, CLOSURE_PATHS } from '../../../scripts/protected-validation-backend.mjs';
import { MATERIALIZATION_PATH } from '../../../scripts/protected-validation-projection.mjs';
import { instrumentIdentity } from '../../_scaffold/build-identity.mjs';
import { CASES, CELL_NAMES } from './protocol.mjs';

export const PROVISIONAL_SCHEMA = 'effective-flow.build-context-provisional-pr581/1';
export const AUTHORIZATION_BLOB_VARIABLE = 'BUILD_CONTEXT_PR581_AUTHORIZATION_BLOB';
export const AUTHORIZATION_DIGEST_VARIABLE = 'BUILD_CONTEXT_PR581_AUTHORIZATION_SHA256';
export const POLICY_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  'evals/build-context/provisional-release.mjs',
  'evals/build-context/_scaffold/provisional-release.mjs',
  'evals/build-context/suite.config.mjs',
]);
export const ABSENT_POPULATIONS = Object.freeze([
  ...Object.entries(CASES).flatMap(([scenario, cases]) =>
    cases.map((variant) => `behavioural:${scenario}:${variant}:5`),
  ),
  ...CELL_NAMES.map((cell) => `paired:${cell}:5`),
  'native:codex:1',
  'native:claude:1',
]);
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const git = (root, ...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
const gitText = (root, ...args) =>
  git(root, ...args)
    .toString('utf8')
    .trim();

// The admission record lives outside this tree, eliminating authorization self-hashing.
export function candidateBinding(root, suite) {
  const sourceCommit = gitText(root, 'rev-parse', 'HEAD');
  const sourceTree = gitText(root, 'rev-parse', 'HEAD^{tree}');
  ensure(gitText(root, 'diff', '--name-only', 'HEAD') === '', 'tracked source is dirty');
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z')
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  ensure(untracked.length === 0, 'untracked input is not an immutable candidate');
  // Inspection never moves or ignores foreign plans; qualify a separate clean committed source.
  for (const path of [...POLICY_PATHS, ...suite.instrumentFiles])
    git(root, 'ls-files', '--error-unmatch', '--', path);

  return {
    sourceCommit,
    sourceTree,
    instrumentDigest: instrumentIdentity(suite).digest,
    policyDigest: validationDigest(
      POLICY_PATHS.map((path) => [path, validationDigest(readFileSync(resolve(root, path)))]),
    ),
    releaseVersion: JSON.parse(
      readFileSync(resolve(root, '.release-please-manifest.json'), 'utf8'),
    )['.'],
  };
}

export function validateAuthorization(value, { now = Date.now() } = {}) {
  assertExact(value, [
    'schema',
    'repository',
    'featurePullRequest',
    'releasePullRequest',
    'releaseHeadRef',
    'releaseVersion',
    'sourceCommit',
    'sourceTree',
    'instrumentDigest',
    'policyDigest',
    'issuedAt',
    'expiresAt',
    'absentPopulations',
    'authority',
    'review',
    'host',
  ]);
  ensure(
    value.schema === PROVISIONAL_SCHEMA && value.featurePullRequest === 581,
    'unknown provisional release scope',
  );
  ensure(value.repository === 'sebastian-software/effective-flow', 'foreign repository');
  ensure(
    Number.isSafeInteger(value.releasePullRequest) &&
      value.releasePullRequest > 0 &&
      value.releasePullRequest !== 581,
    'exact release pull request required',
  );
  ensure(
    /^release-please--[A-Za-z0-9_-]+$/.test(value.releaseHeadRef),
    'release head ref required',
  );
  ensure(/^\d+\.\d+\.\d+$/.test(value.releaseVersion), 'exact stable release version required');
  ['sourceCommit', 'sourceTree'].forEach((key) => validateOid(value[key]));
  ['instrumentDigest', 'policyDigest'].forEach((key) => validateDigest(value[key]));
  const issued = Date.parse(value.issuedAt),
    expires = Date.parse(value.expiresAt);
  ensure(
    Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      issued <= now &&
      expires > now &&
      expires > issued &&
      expires - issued <= 7 * 86400000,
    'authorization is expired, future-dated or exceeds seven days',
  );
  ensure(same(value.absentPopulations, ABSENT_POPULATIONS), 'unknown or unlisted exception');
  assertExact(value.authority, ['kind', 'decision', 'decisionDigest']);
  ensure(
    value.authority.kind === 'trusted-user-bounded-provisional-release',
    'missing user authority',
  );
  ensure(
    typeof value.authority.decision === 'string' &&
      value.authority.decision.length >= 100 &&
      value.authority.decision.length <= 16384 &&
      value.authority.decisionDigest === validationDigest(value.authority.decision),
    'missing actual authority decision or changed decision bytes',
  );
  assertExact(value.review, [
    'kind',
    'reviewer',
    'sourceCommit',
    'sourceTree',
    'instrumentDigest',
    'policyDigest',
    'report',
    'reportDigest',
    'materialFindings',
  ]);
  const review = value.review;
  ensure(
    review.kind === 'independent-policy-review' &&
      typeof review.reviewer === 'string' &&
      review.reviewer.trim().length > 0,
    'independent reviewer required',
  );
  for (const key of ['sourceCommit', 'sourceTree', 'instrumentDigest', 'policyDigest'])
    ensure(review[key] === value[key], 'review binding differs: ' + key);
  ensure(
    typeof review.report === 'string' &&
      review.report.length >= 100 &&
      review.report.length <= 32768 &&
      review.reportDigest === validationDigest(review.report),
    'actual digest-bound independent report required',
  );
  ensure(Array.isArray(review.materialFindings), 'material findings must be explicit');
  for (const finding of review.materialFindings) {
    assertExact(finding, ['id', 'severity', 'resolution', 'evidence']);
    ensure(
      typeof finding.id === 'string' &&
        finding.id.length > 0 &&
        ['important', 'critical'].includes(finding.severity) &&
        finding.resolution === 'closed' &&
        typeof finding.evidence === 'string' &&
        finding.evidence.trim().length > 0,
      'unresolved material policy finding',
    );
  }
  assertExact(value.host, ['request', 'preparation', 'policy', 'runId', 'runAttempt']);
  validatePolicy(value.host.policy);
  validatePreparation(value.host.preparation);
  ensure(
    value.host.policy.repository === value.repository &&
      value.host.runAttempt === 1 &&
      Number.isSafeInteger(value.host.runId) &&
      value.host.runId > 0,
    'original protected host run required',
  );
  ensure(
    value.host.preparation.localSnapshot.head === value.sourceCommit &&
      value.host.preparation.executionTree === value.sourceTree,
    'protected host source differs from exact candidate',
  );
  ensure(
    value.host.request?.policyDigest === validationDigest(value.host.policy),
    'protected host request policy differs',
  );
  return value;
}

// Only completely absent populations are admissible. A partial, stale, invalid, synthetic or
// failed observation must use the ordinary full route after repair; it cannot become an absence.
export function validateAbsentArchive(resultsDir) {
  ensure(
    !existsSync(resultsDir) || readdirSync(resultsDir).length === 0,
    'provisional absence cannot contain partial, failed or synthetic archived evidence',
  );
}
export function validateAbsentVerdict(verdict, scenarios) {
  ensure(
    verdict?.failsStrict === true && verdict.requiredRuns === 5,
    'a truthful failed full strict verdict is required',
  );
  const expected = [...scenarios, 'behavioural-archive-integrity', 'paired-matrix-and-native'];
  ensure(
    Array.isArray(verdict.scenarios) &&
      verdict.scenarios.length === expected.length &&
      new Set(verdict.scenarios.map((row) => row.scenario)).size === expected.length &&
      verdict.scenarios.every((row) => expected.includes(row.scenario)),
    'unknown, removed or partially populated suite',
  );
  for (const row of verdict.scenarios)
    ensure(
      row.state === (row.scenario === 'behavioural-archive-integrity' ? 'current' : 'absent') &&
        Array.isArray(row.runs) &&
        row.runs.length === 0 &&
        (row.drift ?? []).length === 0,
      'only explicitly absent full populations are authorized: ' + row.scenario,
    );
}

export function readBackendJSON(read, endpoint) {
  const bytes = read(endpoint);
  ensure(
    Buffer.isBuffer(bytes) && bytes.length <= 4 * 1024 * 1024,
    'bounded backend JSON required',
  );
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function readBackendBlob(read, repository, oid) {
  validateOid(oid);
  const blob = readBackendJSON(read, `repos/${repository}/git/blobs/${oid}`);
  ensure(
    blob.sha === oid &&
      blob.encoding === 'base64' &&
      Number.isSafeInteger(blob.size) &&
      blob.size > 0 &&
      blob.size <= 1024 * 1024 &&
      typeof blob.content === 'string',
    'invalid pinned Git blob',
  );
  const bytes = Buffer.from(blob.content, 'base64');
  ensure(bytes.length === blob.size, 'Git blob size differs');
  return bytes;
}
export function readAuthorization({ read, repository, blob, digest }) {
  ensure(repository === 'sebastian-software/effective-flow', 'foreign authorization repository');
  validateDigest(digest);
  const bytes = readBackendBlob(read, repository, blob);
  ensure(
    validationDigest(bytes) === digest,
    'authorization bytes differ from trusted repository pin',
  );
  return validateAuthorization(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

export function verifyCandidate(value, actual, { root, context }) {
  for (const key of ['sourceTree', 'instrumentDigest', 'policyDigest', 'releaseVersion'])
    ensure(actual[key] === value[key], 'candidate drift: ' + key);
  ensure(
    context.event === 'pull_request' &&
      context.repository === value.repository &&
      context.pullRequest === value.releasePullRequest &&
      context.headRef === value.releaseHeadRef,
    'authorization replay or foreign release event',
  );
  ensure(
    gitText(root, 'rev-parse', value.sourceCommit + '^{tree}') === value.sourceTree,
    'authorized commit tree differs',
  );
  git(root, 'merge-base', '--is-ancestor', value.sourceCommit, 'HEAD');
}

// The live PR check prevents replay through an old open-event payload after release/closure.
export function verifyLiveRelease(value, { read }) {
  const pr = readBackendJSON(read, `repos/${value.repository}/pulls/${value.releasePullRequest}`);
  ensure(
    pr.number === value.releasePullRequest &&
      pr.state === 'open' &&
      pr.merged === false &&
      pr.base?.ref === 'develop' &&
      pr.base?.repo?.full_name === value.repository &&
      pr.head?.repo?.full_name === value.repository &&
      pr.head?.ref === value.releaseHeadRef &&
      pr.head?.sha === value.sourceCommit,
    'release PR changed, closed, merged or belongs to a foreign source',
  );
}

// Fetch original authenticated backend responses, never a record's claimed pass boolean.
export function verifyHostedCandidate(value, { root, read }) {
  const { host } = value;
  for (const [key, path] of Object.entries(CLOSURE_PATHS))
    ensure(
      host.policy.executionClosure[key] === validationDigest(readFileSync(resolve(root, path))),
      'protected execution closure differs: ' + path,
    );
  const observed = observeBackend({ ...host, read });
  ensure(observed.state === 'verified', 'original protected macOS qualification did not pass');
  const endpoint = `repos/${value.repository}/git/trees/${host.preparation.snapshotCommit}?recursive=1`;
  const tree = readBackendJSON(read, endpoint);
  ensure(
    tree.truncated === false && Array.isArray(tree.tree),
    'incomplete protected snapshot tree',
  );
  const member = tree.tree.find((entry) => entry.path === MATERIALIZATION_PATH);
  ensure(member?.type === 'blob' && member.mode === '100644', 'original materialization missing');
  const bytes = readBackendBlob(read, value.repository, member.sha);
  ensure(
    validationDigest(bytes) === host.preparation.materializationManifestRef.digest,
    'original materialization bytes differ',
  );
  const manifest = validateMaterializationManifest(JSON.parse(bytes.toString('utf8')));
  const files = git(root, 'ls-tree', '-rz', '--full-tree', value.sourceCommit)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
      ensure(match, 'unsupported candidate Git member');
      return {
        path: match[3],
        mode: match[1],
        digest: validationDigest(git(root, 'cat-file', 'blob', match[2])),
      };
    });
  const byPath = (a, b) => a.path.localeCompare(b.path, 'en');
  ensure(
    manifest.executionTree === value.sourceTree &&
      same([...manifest.executionFiles].sort(byPath), files.sort(byPath)),
    'protected materialization does not cover the complete exact candidate tree',
  );
  return {
    state: 'verified',
    runId: host.runId,
    runAttempt: host.runAttempt,
    sourceTree: value.sourceTree,
  };
}
