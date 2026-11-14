// Invariant: while the T3 observed gate rows are enabled, the four focus sources and the three
// built portable focus files stay byte-identical to the digests of the candidate the operator
// recorded; any difference fails until a passing record, both rows disabled, or (built files only)
// a documented nonbehavioral difference updates the tracked digest file (ADR-strict).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  FOCUS_BUILT_PATHS,
  FOCUS_DIGEST_FILE,
  FOCUS_DIGEST_PATHS,
  FOCUS_SOURCE_PATHS,
  decideFocusDigestGuard,
  formatDigests,
  gateRowStates,
  parseDigests,
  sha256,
} from './support/focus-digest-guard.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const GIT_HASH_MARKER = 'focus-digest-guard-marker';

const ENABLED = { reportOnly: 'enabled', followUp: 'enabled' };
const DIGESTS = Object.fromEntries(
  FOCUS_DIGEST_PATHS.map((path, index) => [path, String(index).repeat(64)]),
);

function withChange(path) {
  return { ...DIGESTS, [path]: 'f'.repeat(64) };
}

function gateContract(reportOnlyCell, followUpCell, reportOnlyName = 'T3 observed, report-only') {
  return [
    '## Current qualification gate',
    '',
    '| Actual host/path | Current availability |',
    '| --- | --- |',
    `| ${reportOnlyName} | ${reportOnlyCell} |`,
    '| T3 delegated correction | Disabled: race. |',
    `| T3 observed follow-up (schedule_task, T3/Codex) | ${followUpCell} |`,
    '',
    '## Reader admission and bounded evidence',
    '',
    '| T3 observed, report-only | Disabled outside the gate section. |',
    '',
  ].join('\n');
}

test('gate row states use the exact first cell and the explicit Disabled form', () => {
  assert.deepEqual(gateRowStates(gateContract('Matches only …', 'Matches only …')), ENABLED);
  assert.deepEqual(gateRowStates(gateContract('Disabled pending x.', 'Disabled until y.')), {
    reportOnly: 'disabled',
    followUp: 'disabled',
  });
  // A reworded enabled row that merely mentions "disabled" must not switch the guard off.
  assert.deepEqual(gateRowStates(gateContract('Enabled; disabled when unmatched.', 'Disabled.')), {
    reportOnly: 'enabled',
    followUp: 'disabled',
  });
  assert.equal(
    gateRowStates(gateContract('Disabled.', 'Disabled.', 'T3 observed report-only')).reportOnly,
    'missing',
  );
});

test('both rows disabled make the guard inert', () => {
  const verdict = decideFocusDigestGuard({
    rows: { reportOnly: 'disabled', followUp: 'disabled' },
    actual: withChange(FOCUS_SOURCE_PATHS[0]),
    expectedText: null,
  });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.verdict, 'inert');
});

test('exactly one disabled row fails with its own message', () => {
  for (const rows of [
    { reportOnly: 'disabled', followUp: 'enabled' },
    { reportOnly: 'enabled', followUp: 'disabled' },
  ]) {
    const verdict = decideFocusDigestGuard({
      rows,
      actual: DIGESTS,
      expectedText: formatDigests(DIGESTS),
    });
    assert.equal(verdict.pass, false);
    assert.equal(verdict.verdict, 'one-disabled');
    assert.match(verdict.message, /only ".+" is disabled/);
  }
});

test('a missing or renamed row fails closed', () => {
  const verdict = decideFocusDigestGuard({
    rows: { reportOnly: 'missing', followUp: 'disabled' },
    actual: DIGESTS,
    expectedText: formatDigests(DIGESTS),
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.verdict, 'missing-row');
  assert.match(verdict.message, /missing or renamed: "T3 observed, report-only"/);
});

test('a missing or malformed digest file fails closed and prints the actual digests', () => {
  const missing = decideFocusDigestGuard({ rows: ENABLED, actual: DIGESTS, expectedText: null });
  assert.equal(missing.pass, false);
  assert.equal(missing.verdict, 'missing-digest-file');
  assert.ok(missing.message.endsWith(formatDigests(DIGESTS)));
  const malformed = decideFocusDigestGuard({
    rows: ENABLED,
    actual: DIGESTS,
    expectedText: formatDigests(DIGESTS).split('\n').slice(1).join('\n'),
  });
  assert.equal(malformed.pass, false);
  assert.equal(malformed.verdict, 'invalid-digest-file');
});

test('a focus-source mismatch names only the two ADR-strict paths', () => {
  const verdict = decideFocusDigestGuard({
    rows: ENABLED,
    actual: withChange(FOCUS_SOURCE_PATHS[1]),
    expectedText: formatDigests(DIGESTS),
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.verdict, 'source-mismatch');
  assert.match(verdict.message, /src\/shared\/focus-session-contract\.md/);
  assert.match(verdict.message, /\(1\) bring a passing record/);
  assert.match(verdict.message, /\(2\) return both T3 observed gate rows to `Disabled`/);
  assert.doesNotMatch(verdict.message, /demonstrably nonbehavioral/);
  assert.ok(verdict.message.endsWith(formatDigests(withChange(FOCUS_SOURCE_PATHS[1]))));
});

test('a built-only mismatch adds the documented-nonbehavioral path', () => {
  const actual = withChange(FOCUS_BUILT_PATHS[2]);
  const verdict = decideFocusDigestGuard({
    rows: ENABLED,
    actual,
    expectedText: formatDigests(DIGESTS),
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.verdict, 'built-mismatch');
  assert.match(verdict.message, /\(1\) bring a passing record/);
  assert.match(verdict.message, /\(2\) return both T3 observed gate rows/);
  assert.match(verdict.message, /\(3\) document the difference as demonstrably nonbehavioral/);
  assert.ok(verdict.message.endsWith(formatDigests(actual)));
});

test('matching digests pass, and the printed format parses back byte-identically', () => {
  const text = formatDigests(DIGESTS);
  assert.deepEqual(parseDigests(text), DIGESTS);
  const verdict = decideFocusDigestGuard({ rows: ENABLED, actual: DIGESTS, expectedText: text });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.verdict, 'match');
});

test('the real portable build matches the tracked focus digests', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-focus-digest-'));
  try {
    const result = spawnSync(process.execPath, ['build.mjs'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        EFFECTIVE_FLOW_BUILD_GIT_HASH: GIT_HASH_MARKER,
        EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: sandbox,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const version = JSON.parse(
      readFileSync(join(ROOT_DIR, '.release-please-manifest.json'), 'utf8'),
    )['.'];
    const actual = {};
    for (const path of FOCUS_SOURCE_PATHS)
      actual[path] = sha256(readFileSync(join(ROOT_DIR, path)));
    for (const path of FOCUS_BUILT_PATHS) {
      // Only the portable target is read, from the temporary output root, never the checkout's dist/.
      const bytes = readFileSync(join(sandbox, path));
      const text = bytes.toString('utf8');
      // A version or hash stamp would make every release or commit fail the guard.
      assert.equal(text.includes(version), false, `${path} contains the package version`);
      assert.equal(text.includes(GIT_HASH_MARKER), false, `${path} contains the git-hash marker`);
      actual[path] = sha256(bytes);
    }
    const digestFile = join(ROOT_DIR, FOCUS_DIGEST_FILE);
    const verdict = decideFocusDigestGuard({
      rows: gateRowStates(readFileSync(join(ROOT_DIR, FOCUS_SOURCE_PATHS[1]), 'utf8')),
      actual,
      expectedText: existsSync(digestFile) ? readFileSync(digestFile, 'utf8') : null,
    });
    assert.equal(verdict.pass, true, verdict.message);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
