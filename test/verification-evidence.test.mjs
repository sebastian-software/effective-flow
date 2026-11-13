import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import {
  LABELS,
  LIMITS,
  MAX_STDIN_BYTES,
  OUTCOMES,
  PRODUCERS,
  PROVENANCES,
  VERIFICATION_EVIDENCE_OPERATIONS,
  VERIFICATION_EVIDENCE_VERSION,
  canonicalJson,
  contentDigest,
  encodeRecord,
  executeOperation,
  exitCodeFor,
  parseEvidence,
} from '../src/scripts/verification-evidence-core.mjs';
import { main } from '../src/scripts/verification-evidence.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/verification-evidence.mjs', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture Author',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};
const PLAN_DIR = 'docs/plan';
const PLAN = 'docs/plan/2026-11-13-feature.md';
const ARCHIVED = 'docs/plan/archive/2026-11-13-feature.md';
// Sorted by code unit: `2` sorts before `a`.
const PLAN_PAIR = [PLAN, ARCHIVED];
const DIGEST = 'a'.repeat(64);
const BASE = 'b'.repeat(40);

const PASSED = Object.freeze({
  check: 'Unit tests',
  outcome: 'passed',
  provenance: 'executed',
  scope: 'whole test suite',
});

// ---------------------------------------------------------------------------------------------
// Fixtures

function gitRaw(root, args, env = GIT_ENV) {
  const result = spawnSync('git', ['-C', root, ...args], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function git(root, ...args) {
  return gitRaw(root, args).toString('utf8').trim();
}

function temporaryDirectory(t, prefix) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeFiles(root, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  }
}

function commitAll(root, message = 'fixture change') {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function repository(t) {
  const root = temporaryDirectory(t, 'verification-evidence-');
  git(root, 'init', '-q', '--initial-branch=main');
  writeFiles(root, {
    'README.md': 'readme\n',
    'src/app.txt': 'app\n',
    [PLAN]: '# Plan\n',
  });
  const head = commitAll(root, 'fixture');
  return { root, head };
}

function treeOf(root, revision = 'HEAD') {
  return git(root, 'rev-parse', `${revision}^{tree}`);
}

// Every file name below the repository's object store, so a written object shows up as a change.
function listObjects(root) {
  const directory = join(root, '.git', 'objects');
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(relative(directory, full));
    }
  };
  walk(directory);
  return found.sort();
}

const DEPS = Object.freeze({ runner: createProcessRunner(), env: GIT_ENV });

function call(operation, input) {
  return executeOperation(operation, input, DEPS);
}

async function build(root, overrides = {}) {
  return call('evidence-build', {
    cwd: root,
    tree: treeOf(root),
    planDir: PLAN_DIR,
    planPaths: [],
    visibility: 'standard',
    producer: 'build',
    checks: [PASSED],
    ...overrides,
  });
}

async function built(root, overrides) {
  const envelope = await build(root, overrides);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(envelope.data.status, 'built', JSON.stringify(envelope.data));
  return envelope.data;
}

async function render(root, record, overrides = {}) {
  const envelope = await call('evidence-render', {
    cwd: root,
    record,
    head: git(root, 'rev-parse', 'HEAD'),
    planDir: PLAN_DIR,
    visibility: 'standard',
    language: 'en',
    ...overrides,
  });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.data;
}

function recordValue(overrides = {}) {
  return {
    version: VERIFICATION_EVIDENCE_VERSION,
    producer: 'build',
    contentDigest: DIGEST,
    planPaths: [],
    checks: [{ ...PASSED }],
    ...overrides,
  };
}

function parse(value, overrides = {}) {
  return parseEvidence({
    record: typeof value === 'string' ? value : encodeRecord(value),
    planDir: PLAN_DIR,
    visibility: 'standard',
    ...overrides,
  });
}

function rejection(value, overrides) {
  const result = parse(value, overrides);
  assert.equal(result.status, 'rejected', JSON.stringify(result));
  return result.reason;
}

function withCheck(check, overrides) {
  return recordValue({ checks: [check], ...overrides });
}

function textCheck(field, text) {
  return { ...PASSED, [field]: text };
}

// ---------------------------------------------------------------------------------------------
// Constants

test('the exported constants match the binding API', () => {
  assert.deepEqual(VERIFICATION_EVIDENCE_OPERATIONS, [
    'evidence-build',
    'evidence-parse',
    'evidence-render',
  ]);
  assert.equal(VERIFICATION_EVIDENCE_VERSION, 1);
  assert.deepEqual(LIMITS, {
    checkChars: 80,
    scopeChars: 160,
    limitationChars: 160,
    maxChecks: 20,
    encodedBytes: 6144,
  });
  assert.deepEqual(PRODUCERS, ['build', 'fix', 'refactor', 'deliver']);
  assert.deepEqual(OUTCOMES, ['passed', 'failed', 'skipped', 'unavailable', 'baseline-failure']);
  assert.deepEqual(PROVENANCES, ['executed', 'baseline-compared', 'not-run']);
  assert.equal(LABELS.en.heading, 'Verification');
  assert.equal(LABELS.de.heading, 'Verifikation');
  assert.deepEqual(LABELS.de.columns, ['Prüfung', 'Ergebnis', 'Umfang', 'Einschränkung']);
  assert.equal(LABELS.de['baseline-failure'], 'Basisfehler');
  for (const value of [VERIFICATION_EVIDENCE_OPERATIONS, LIMITS, PRODUCERS, OUTCOMES, LABELS]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.ok(Object.isFrozen(LABELS.en.columns));
});

// ---------------------------------------------------------------------------------------------
// Binding: current and stale

test('a record built on the head tree renders as current with the English section', async (t) => {
  const { root, head } = repository(t);
  const data = await built(root);
  assert.equal(data.checkCount, 1);
  assert.match(data.contentDigest, /^[0-9a-f]{64}$/);
  assert.match(data.record, /^[A-Za-z0-9_-]+$/);
  const parsed = parse(data.record);
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.record.contentDigest, data.contentDigest);
  const rendered = await render(root, data.record);
  assert.deepEqual(rendered, {
    status: 'current',
    shortHead: head.slice(0, 7),
    markdown: [
      '## Verification',
      '',
      `Verified on \`${head.slice(0, 7)}\`.`,
      '',
      '| Check | Outcome | Scope | Limitation |',
      '| --- | --- | --- | --- |',
      '| Unit tests | passed | whole test suite | — |',
    ].join('\n'),
  });
});

test('the German section uses the fixed label table and passes free text through', async (t) => {
  const { root, head } = repository(t);
  const data = await built(root, {
    checks: [{ ...PASSED, outcome: 'failed', scope: 'Gesamte Suite' }],
  });
  const rendered = await render(root, data.record, { language: 'de' });
  assert.equal(rendered.status, 'current');
  assert.equal(
    rendered.markdown,
    [
      '## Verifikation',
      '',
      `Verifiziert auf \`${head.slice(0, 7)}\`.`,
      '',
      '| Prüfung | Ergebnis | Umfang | Einschränkung |',
      '| --- | --- | --- | --- |',
      '| Unit tests | fehlgeschlagen | Gesamte Suite | — |',
    ].join('\n'),
  );
});

test('a plan-only delta (plan moved to the archive) keeps the record current', async (t) => {
  const { root } = repository(t);
  const verified = treeOf(root);
  const data = await built(root, { tree: verified, planPaths: PLAN_PAIR });
  // The handback archives the plan after validation: the plan file moves and its status changes.
  mkdirSync(join(root, PLAN_DIR, 'archive'), { recursive: true });
  renameSync(join(root, PLAN), join(root, ARCHIVED));
  writeFileSync(join(root, ARCHIVED), '# Plan\n\nStatus: implemented\n');
  const head = commitAll(root, 'archive the plan');
  assert.notEqual(treeOf(root), verified);
  const rendered = await render(root, data.record);
  assert.equal(rendered.status, 'current');
  assert.equal(rendered.shortHead, head.slice(0, 7));
});

test('a later tree-changing commit makes the record stale with one notice line', async (t) => {
  const { root } = repository(t);
  const data = await built(root, { planPaths: PLAN_PAIR });
  writeFiles(root, { 'src/app.txt': 'app, formatted\n' });
  const head = commitAll(root, 'formatter output');
  const short = head.slice(0, 7);
  assert.deepEqual(await render(root, data.record), {
    status: 'stale',
    shortHead: short,
    markdown: `**Verification:** the recorded results do not match the content of \`${short}\` and are not reported.`,
  });
  const german = await render(root, data.record, { language: 'de' });
  assert.equal(
    german.markdown,
    `**Verifikation:** Die erfassten Ergebnisse passen nicht zum Inhalt von \`${short}\` und werden nicht berichtet.`,
  );
  assert.ok(!german.markdown.includes('\n'));
});

test('a changed selection makes the record stale', async (t) => {
  await t.test('a plan move that the record does not exclude', async (t) => {
    const { root } = repository(t);
    const data = await built(root, { planPaths: [] });
    mkdirSync(join(root, PLAN_DIR, 'archive'), { recursive: true });
    renameSync(join(root, PLAN), join(root, ARCHIVED));
    commitAll(root);
    assert.equal((await render(root, data.record)).status, 'stale');
  });
  await t.test('a plan pair naming another plan file', async (t) => {
    const { root } = repository(t);
    const data = await built(root, {
      planPaths: ['docs/plan/archive/other.md', 'docs/plan/other.md'],
    });
    mkdirSync(join(root, PLAN_DIR, 'archive'), { recursive: true });
    renameSync(join(root, PLAN), join(root, ARCHIVED));
    commitAll(root);
    assert.equal((await render(root, data.record)).status, 'stale');
  });
  await t.test('an added file', async (t) => {
    const { root } = repository(t);
    const data = await built(root);
    writeFiles(root, { 'src/extra.txt': '' });
    commitAll(root);
    assert.equal((await render(root, data.record)).status, 'stale');
  });
  await t.test('a removed file', async (t) => {
    const { root } = repository(t);
    const data = await built(root);
    rmSync(join(root, 'README.md'));
    commitAll(root);
    assert.equal((await render(root, data.record)).status, 'stale');
  });
  await t.test('a pure rename outside the plan paths', async (t) => {
    const { root } = repository(t);
    const data = await built(root, { planPaths: PLAN_PAIR });
    renameSync(join(root, 'src/app.txt'), join(root, 'src/renamed.txt'));
    commitAll(root);
    assert.equal((await render(root, data.record)).status, 'stale');
  });
  await t.test('a mode change', async (t) => {
    const { root } = repository(t);
    const data = await built(root);
    git(root, 'update-index', '--chmod=+x', 'src/app.txt');
    git(root, 'commit', '-q', '-m', 'mode');
    assert.equal((await render(root, data.record)).status, 'stale');
  });
});

test('an amend with identical content stays current and names the new head', async (t) => {
  const { root, head } = repository(t);
  const data = await built(root);
  git(root, 'commit', '-q', '--amend', '-m', 'reworded');
  const amended = git(root, 'rev-parse', 'HEAD');
  assert.notEqual(amended, head);
  const rendered = await render(root, data.record);
  assert.equal(rendered.status, 'current');
  assert.equal(rendered.shortHead, amended.slice(0, 7));
  assert.match(rendered.markdown, new RegExp(`Verified on \`${amended.slice(0, 7)}\`\\.`));
});

test('skipped, unavailable and baseline-failure checks render as such, never as passed', async (t) => {
  const { root } = repository(t);
  const base = treeOf(root);
  const data = await built(root, {
    producer: 'refactor',
    checks: [
      {
        check: 'Browser tests',
        outcome: 'skipped',
        provenance: 'not-run',
        scope: 'end-to-end suite',
        limitation: 'skipped explicitly by the plan',
      },
      { check: 'Type check', outcome: 'unavailable', provenance: 'not-run', scope: 'project' },
      {
        check: 'Lint',
        outcome: 'baseline-failure',
        provenance: 'baseline-compared',
        scope: 'src',
        comparison: { base, unchanged: true },
      },
      {
        check: 'Integration tests',
        outcome: 'baseline-failure',
        provenance: 'baseline-compared',
        scope: 'api',
        limitation: 'one flaky case',
        comparison: { base, unchanged: true },
      },
    ],
  });
  assert.equal(data.checkCount, 4);
  const short = base.slice(0, 7);
  const rendered = await render(root, data.record);
  assert.equal(rendered.status, 'current');
  assert.deepEqual(rendered.markdown.split('\n').slice(6), [
    '| Browser tests | skipped | end-to-end suite | skipped explicitly by the plan |',
    '| Type check | unavailable | project | — |',
    `| Lint | baseline failure | src | unchanged against base ${short} |`,
    `| Integration tests | baseline failure | api | unchanged against base ${short}; one flaky case |`,
  ]);
  assert.doesNotMatch(rendered.markdown, /\| passed \|/);
  const german = await render(root, data.record, { language: 'de' });
  assert.deepEqual(german.markdown.split('\n').slice(6), [
    '| Browser tests | übersprungen | end-to-end suite | skipped explicitly by the plan |',
    '| Type check | nicht verfügbar | project | — |',
    `| Lint | Basisfehler | src | unverändert gegenüber Basis ${short} |`,
    `| Integration tests | Basisfehler | api | unverändert gegenüber Basis ${short}; one flaky case |`,
  ]);
});

// ---------------------------------------------------------------------------------------------
// Schema

test('every outcome/provenance mismatch is rejected and every valid pair is accepted', () => {
  const required = {
    passed: 'executed',
    failed: 'executed',
    skipped: 'not-run',
    unavailable: 'not-run',
    'baseline-failure': 'baseline-compared',
  };
  for (const outcome of OUTCOMES) {
    for (const provenance of PROVENANCES) {
      const check = { ...PASSED, outcome, provenance };
      if (outcome === 'baseline-failure') check.comparison = { base: BASE, unchanged: true };
      const result = parse(withCheck(check));
      if (required[outcome] === provenance) {
        assert.equal(result.status, 'valid', `${outcome}/${provenance}`);
      } else {
        assert.deepEqual(
          result.reason,
          { code: 'outcome-provenance-mismatch', check: 0, field: 'provenance' },
          `${outcome}/${provenance}`,
        );
      }
    }
  }
});

test('a comparison is required exactly for a baseline failure and must state unchanged: true', () => {
  const failure = {
    ...PASSED,
    outcome: 'baseline-failure',
    provenance: 'baseline-compared',
  };
  const at = (code) => ({ code, check: 0, field: 'comparison' });
  assert.deepEqual(rejection(withCheck(failure)), at('missing-field'));
  assert.deepEqual(
    rejection(withCheck({ ...PASSED, comparison: { base: BASE, unchanged: true } })),
    at('invalid-field'),
  );
  const cases = [
    [{ base: BASE, unchanged: false }, 'invalid-field'],
    [{ base: BASE, unchanged: 'true' }, 'invalid-field'],
    [{ base: 'B'.repeat(40), unchanged: true }, 'invalid-field'],
    [{ base: 'b'.repeat(41), unchanged: true }, 'invalid-field'],
    [{ base: BASE }, 'missing-field'],
    [{ base: BASE, unchanged: true, extra: 1 }, 'unknown-field'],
    [[BASE, true], 'invalid-field'],
  ];
  for (const [comparison, code] of cases) {
    assert.deepEqual(rejection(withCheck({ ...failure, comparison })), at(code));
  }
  const sha256 = { ...failure, comparison: { base: 'c'.repeat(64), unchanged: true } };
  assert.equal(parse(withCheck(sha256)).status, 'valid');
});

test('missing, empty, wrongly typed and unknown fields are rejected without their value', () => {
  assert.deepEqual(rejection(recordValue({ producer: undefined })), {
    code: 'missing-field',
    field: 'producer',
  });
  assert.deepEqual(rejection(recordValue({ producer: 'docs' })), {
    code: 'invalid-field',
    field: 'producer',
  });
  assert.deepEqual(rejection(recordValue({ contentDigest: 'A'.repeat(64) })), {
    code: 'invalid-field',
    field: 'contentDigest',
  });
  assert.deepEqual(rejection(recordValue({ planPaths: undefined })), {
    code: 'missing-field',
    field: 'planPaths',
  });
  assert.deepEqual(rejection(recordValue({ checks: {} })), {
    code: 'invalid-field',
    field: 'checks',
  });
  assert.deepEqual(rejection(recordValue({ surprise: 'secret-ish value' })), {
    code: 'unknown-field',
  });
  const missing = { ...PASSED };
  delete missing.scope;
  assert.deepEqual(rejection(withCheck(missing)), {
    code: 'missing-field',
    check: 0,
    field: 'scope',
  });
  assert.deepEqual(rejection(withCheck(textCheck('check', ''))), {
    code: 'missing-field',
    check: 0,
    field: 'check',
  });
  assert.deepEqual(rejection(withCheck(textCheck('limitation', ''))), {
    code: 'missing-field',
    check: 0,
    field: 'limitation',
  });
  assert.deepEqual(rejection(withCheck(textCheck('scope', 7))), {
    code: 'invalid-field',
    check: 0,
    field: 'scope',
  });
  assert.deepEqual(rejection(withCheck(textCheck('limitation', null))), {
    code: 'invalid-field',
    check: 0,
    field: 'limitation',
  });
  assert.deepEqual(rejection(withCheck({ ...PASSED, outcome: 'green' })), {
    code: 'invalid-field',
    check: 0,
    field: 'outcome',
  });
  assert.deepEqual(rejection(withCheck({ ...PASSED, provenance: 'ci' })), {
    code: 'invalid-field',
    check: 0,
    field: 'provenance',
  });
  assert.deepEqual(rejection(withCheck({ ...PASSED, note: 'x' })), {
    code: 'unknown-field',
    check: 0,
  });
  assert.deepEqual(rejection(recordValue({ checks: ['Unit tests'] })), {
    code: 'invalid-field',
    check: 0,
    field: 'checks',
  });
  // A lone surrogate is not a well-formed text value.
  assert.deepEqual(rejection(withCheck(textCheck('scope', 'ok \ud800'))), {
    code: 'invalid-field',
    check: 0,
    field: 'scope',
  });
});

test('the first failure wins in the documented order', () => {
  const tooLong = textCheck('check', 'x'.repeat(81));
  const missingScope = { ...PASSED, scope: '' };
  // Structure before counts and checks.
  assert.equal(rejection(recordValue({ producer: 'docs', checks: [] })).code, 'invalid-field');
  // Counts before any check.
  assert.equal(
    rejection(recordValue({ checks: Array(21).fill(missingScope) })).code,
    'too-many-checks',
  );
  // Checks in order: check 0's text rule wins over check 1's missing field.
  assert.deepEqual(rejection(recordValue({ checks: [tooLong, missingScope] })), {
    code: 'field-too-long',
    check: 0,
    field: 'check',
  });
  // Within a check: required fields before pairing before text rules.
  assert.equal(
    rejection(withCheck({ ...tooLong, provenance: 'not-run', scope: '' })).code,
    'missing-field',
  );
  assert.equal(
    rejection(withCheck({ ...tooLong, provenance: 'not-run' })).code,
    'outcome-provenance-mismatch',
  );
  // Text fields in order check, scope, limitation; length before multi-line before tokens.
  assert.deepEqual(
    rejection(withCheck({ ...PASSED, scope: 'a | b', limitation: 'x'.repeat(161) })),
    { code: 'forbidden-token', rule: 'table-breaker', check: 0, field: 'scope' },
  );
  assert.equal(
    rejection(withCheck(textCheck('scope', `${'|'.repeat(161)}`))).code,
    'field-too-long',
  );
  assert.equal(rejection(withCheck(textCheck('scope', 'a |\nb'))).code, 'multi-line');
  // Rules in the listed order: an absolute path wins over a later backtick.
  assert.equal(rejection(withCheck(textCheck('scope', '`x` /etc'))).rule, 'absolute-path');
  // An invisible character is checked right after multi-line and before every other token rule.
  assert.equal(rejection(withCheck(textCheck('scope', 'a\n\u200B'))).code, 'multi-line');
  assert.equal(rejection(withCheck(textCheck('scope', '/etc \u200B'))).rule, 'invisible-char');
  assert.equal(
    rejection(withCheck(textCheck('scope', 'effective\u200Bflow')), { visibility: 'hidden' }).rule,
    'invisible-char',
  );
});

// ---------------------------------------------------------------------------------------------
// planPaths

test('planPaths must be a sorted subset of one plan file and its archive path', () => {
  for (const planPaths of [[], [PLAN], [ARCHIVED], PLAN_PAIR]) {
    assert.equal(parse(recordValue({ planPaths })).status, 'valid', JSON.stringify(planPaths));
  }
  const invalid = [
    [ARCHIVED, PLAN],
    [PLAN, PLAN],
    [PLAN, 'docs/plan/archive/other.md'],
    ['docs/other/2026-11-13-feature.md'],
    ['docs/plan/nested/2026-11-13-feature.md'],
    ['docs/plan/archive/archive/2026-11-13-feature.md'],
    ['docs/planx/2026-11-13-feature.md'],
    ['docs/plan/2026-11-13-feature.txt'],
    ['docs/plan/.md'],
    ['docs/plan/'],
    ['/docs/plan/2026-11-13-feature.md'],
    ['docs/plan/back\\slash.md'],
    [ARCHIVED, PLAN, 'docs/plan/z.md'],
    [7],
    'docs/plan/2026-11-13-feature.md',
    null,
  ];
  for (const planPaths of invalid) {
    assert.deepEqual(
      rejection(recordValue({ planPaths })),
      { code: 'invalid-plan-paths', field: 'planPaths' },
      JSON.stringify(planPaths),
    );
  }
  // The pair is bound to the planDir the caller passes, not to the one the record was built for.
  assert.deepEqual(rejection(recordValue({ planPaths: [PLAN] }), { planDir: 'plans' }), {
    code: 'invalid-plan-paths',
    field: 'planPaths',
  });
  assert.equal(
    parse(recordValue({ planPaths: ['plans/a.md'] }), { planDir: 'plans' }).status,
    'valid',
  );
});

test('hidden mode requires empty planPaths', () => {
  for (const planPaths of [[PLAN], [ARCHIVED], PLAN_PAIR]) {
    assert.deepEqual(rejection(recordValue({ planPaths }), { visibility: 'hidden' }), {
      code: 'hidden-plan-paths',
      field: 'planPaths',
    });
  }
  assert.equal(parse(recordValue(), { visibility: 'hidden' }).status, 'valid');
});

// ---------------------------------------------------------------------------------------------
// Fail-closed limits

test('text fields are limited in code points at their named limits', () => {
  for (const [field, limit] of [
    ['check', 80],
    ['scope', 160],
    ['limitation', 160],
  ]) {
    assert.equal(parse(withCheck(textCheck(field, 'x'.repeat(limit)))).status, 'valid', field);
    assert.deepEqual(rejection(withCheck(textCheck(field, 'x'.repeat(limit + 1)))), {
      code: 'field-too-long',
      check: 0,
      field,
    });
    // An astral character is one code point but two UTF-16 code units.
    assert.equal(parse(withCheck(textCheck(field, '𝔸'.repeat(limit)))).status, 'valid', field);
    assert.equal(
      rejection(withCheck(textCheck(field, '𝔸'.repeat(limit + 1)))).code,
      'field-too-long',
    );
  }
});

test('a record holds 1 to 20 checks', () => {
  assert.equal(parse(recordValue({ checks: Array(20).fill(PASSED) })).status, 'valid');
  assert.deepEqual(rejection(recordValue({ checks: Array(21).fill(PASSED) })), {
    code: 'too-many-checks',
    field: 'checks',
  });
  assert.deepEqual(rejection(recordValue({ checks: [] })), {
    code: 'no-checks',
    field: 'checks',
  });
});

test('every text field is a single line', () => {
  for (const separator of [
    '\n',
    '\r',
    '\t',
    '\u0000',
    '\u001F',
    '\u007F',
    '\u0085',
    '\u2028',
    '\u2029',
  ]) {
    for (const field of ['check', 'scope', 'limitation']) {
      assert.deepEqual(
        rejection(withCheck(textCheck(field, `first${separator}second`))),
        { code: 'multi-line', check: 0, field },
        JSON.stringify(separator),
      );
    }
  }
});

// Each rule: samples it must reject, and near misses it must accept.
const FORBIDDEN_TOKENS = [
  [
    'invisible-char',
    [
      'zero\u200Bwidth',
      'text \u202Edesrever',
      'word\u2060joiner',
      '\uFEFFbom first',
      'soft\u00ADhyphen',
      'private \uE000 use',
      'combining\u034Fjoiner',
      'hangul \u3164 filler',
      'choseong \u115F filler',
      'halfwidth \uFFA0 filler',
      'mongolian \u180B selector',
      'variation \uFE00 selector',
    ],
    ['naïve café', 'Größe 5 µm', 'emoji 😀 alone', 'done \u2714\uFE0F', 'text \u2714\uFE0E'],
  ],
  [
    'absolute-path',
    [
      'reads /etc/hosts',
      '/root',
      '(/tmp)',
      'path:/srv/x',
      'out,/var',
      'C:\\Users\\x',
      'see D:/data',
      'unter „/home/t3/projects/x“',
      '„/home/t3/x“',
      '*/etc/passwd*',
      'x;/etc/passwd',
      '(/etc/x)',
      '_/home/t3/x_',
      '-/etc/x',
      'a </x>',
      'see /.ssh',
    ],
    [
      'src/scripts and docs',
      'see https://example.com/docs',
      'and/or',
      'unit/integration',
      'src/scripts',
      'a-b/c',
      'größe/maß',
      '1.5/2',
      'C++/Rust tests',
      'tolerance +/-5%',
      '(unit)/(e2e)',
      'C#/F# build',
      'a lone / slash',
    ],
  ],
  [
    'home-path',
    ['~/notes', 'in ~alice/work', '“~/secret/”', '(~/x)', 'a;~bob/y'],
    ['about ~5 files', 'x~/y', 'ä~/y'],
  ],
  ['file-url', ['FILE:thing', 'see file:x'], ['profile settings']],
  [
    'credential-url',
    ['https://user:pw@example.com', 'git+ssh://token@host'],
    ['https://example.com/a'],
  ],
  ['mention', ['@octocat review', 'ping (@team)', 'cc:@a'], ['mail dev@example.com', 'a @ b']],
  ['release-as', ['Release-As: 2.0.0', 'release-as:1'], ['release notes']],
  [
    'issue-keyword',
    [
      'Fixes #12',
      'closes: owner/repo#3',
      'resolved https://github.com/o/r/issues/4',
      'fixes https://forge.example/o/r/pull/9',
      'CLOSE #1',
    ],
    ['fixes flaky test 12', 'prefix #12', 'fixtures #3'],
  ],
  ['breaking-change', ['BREAKING CHANGE: x', 'breaking-change : y'], ['breaking changes listed']],
  // `a </x>` is an absolute path: `<` starts a path token and `x` starts a segment.
  ['html', ['<!-- x', '<b>bold', 'a <x/>', '<?xml', '<!doctype'], ['a < b and 3<4']],
  ['table-breaker', ['a | b', '||'], ['a or b']],
  ['backtick', ['run `x`'], ["run 'x'"]],
  ['heading', ['# title', '  ## x'], ['issue #3 noted']],
  [
    'attribution',
    [
      'co-authored-by someone',
      'Generated with tool',
      'generated  by x',
      'see claude.ai/code',
      'chatgpt.com/share',
      'noreply@anthropic.com',
      '🤖 bot',
    ],
    ['generated fixtures', 'claude ai'],
  ],
  ['finding-id', ['R-0000001', 'see R-1234567.'], ['R-000001', 'R-12345678']],
  [
    'secret',
    [
      'ghp_abc123',
      'github_pat_11AB',
      'glpat-xyz',
      'sk-live1',
      'xoxb-1',
      'AKIAABCDEFGHIJKLMNOP',
      'ASIA0123456789ABCDEF',
      '-----BEGIN RSA',
      'eyJhbGci',
      'AIzaSy0',
    ],
    ['task-runner', 'risk-based', 'AKIA short'],
  ],
  ['assignment', ['NODE_ENV=production', 'x=1', '--flag=value'], ['x = 1', 'a == b']],
  [
    'timestamp',
    ['2026-11-13T10:00', '2026-11-13 10:00', 'took 10:11:12'],
    ['2026-11-13 only', '10:11'],
  ],
  [
    'stack-frame',
    [
      'at foo (src/a.js:1:2)',
      'ratio 1:2:3',
      'at com.x.Y.z(Y.java:42)',
      'at bar (Native Method)',
      'at main.go:12',
      'File "x.py", line 3',
      'thread panicked at x',
    ],
    ['at least three runs', 'at most (5 files)', 'File x line 3'],
  ],
];

test('every forbidden-token rule rejects its samples and accepts near misses', () => {
  for (const [rule, rejected, accepted] of FORBIDDEN_TOKENS) {
    for (const text of rejected) {
      const reason = rejection(withCheck(textCheck('scope', text)));
      assert.deepEqual(reason, { code: 'forbidden-token', rule, check: 0, field: 'scope' }, text);
      // The reason never carries the offending value.
      assert.ok(!JSON.stringify(reason).includes(text), text);
    }
    for (const text of accepted) {
      assert.equal(parse(withCheck(textCheck('scope', text))).status, 'valid', `${rule}: ${text}`);
    }
  }
});

test('the forbidden-token rules apply to every text field', () => {
  for (const field of ['check', 'scope', 'limitation']) {
    assert.deepEqual(rejection(withCheck(textCheck(field, 'Fixes #12'))), {
      code: 'forbidden-token',
      rule: 'issue-keyword',
      check: 0,
      field,
    });
  }
  const second = recordValue({ checks: [PASSED, textCheck('limitation', 'R-0000001')] });
  assert.deepEqual(rejection(second), {
    code: 'forbidden-token',
    rule: 'finding-id',
    check: 1,
    field: 'limitation',
  });
});

test('hidden mode also rejects runtime paths, plan paths and workflow names', () => {
  const cases = [
    [
      'hidden-runtime-path',
      ['kept in .effective-flow state', 'see .EFFECTIVE-FLOW', 'see .ｅｆｆｅｃｔｉｖｅ-flow'],
    ],
    [
      'hidden-plan-path',
      [
        'docs/plan/feature.md updated',
        'under docs/plan/archive',
        'Docs/Plan/x.md',
        'see docs/plan',
        'docs/plan.',
        'in (docs/plan)',
      ],
    ],
    [
      'hidden-name',
      [
        'Effective Flow run',
        'effective-flow',
        'effective_flow',
        'EFFECTIVE.FLOW',
        'effectiveflow',
        'effective  flow',
        'effective\u00A0flow',
        'effective\u2011flow',
        'effective\u2014flow',
        'effective - flow',
        'ｅｆｆｅｃｔｉｖｅ flow',
        'effective/flow',
        'effective·flow',
        'effective:flow',
        'effective+flow',
      ],
    ],
  ];
  for (const [rule, samples] of cases) {
    for (const text of samples) {
      assert.deepEqual(
        rejection(withCheck(textCheck('limitation', text)), { visibility: 'hidden' }),
        { code: 'forbidden-token', rule, check: 0, field: 'limitation' },
        text,
      );
      assert.equal(parse(withCheck(textCheck('limitation', text))).status, 'valid', text);
    }
  }
  const hiddenValid = [
    'effective workflow',
    'docs/other',
    'flow effective',
    'docs plan',
    'docs/planning',
    'docs/plan-b',
    'mydocs/plan',
    'effective, robust flow',
  ];
  for (const text of hiddenValid) {
    assert.equal(
      parse(withCheck(textCheck('limitation', text)), { visibility: 'hidden' }).status,
      'valid',
      text,
    );
  }
  // The plan directory matches only as a whole path token.
  const plansAt = { visibility: 'hidden', planDir: 'plan' };
  for (const text of ['explanation of the skip', 'planned refactor', 'airplan/x']) {
    assert.equal(parse(withCheck(textCheck('limitation', text)), plansAt).status, 'valid', text);
  }
  for (const text of ['plan/x.md', 'the plan', 'Plan.']) {
    assert.deepEqual(
      rejection(withCheck(textCheck('limitation', text)), plansAt),
      { code: 'forbidden-token', rule: 'hidden-plan-path', check: 0, field: 'limitation' },
      text,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// Encoding

// Twenty ASCII checks whose canonical record JSON is exactly `bytes` long, so its base64url form
// has a known length.
function sizedChecks(bytes) {
  const checks = Array.from({ length: 20 }, () => ({
    check: 'c',
    outcome: 'passed',
    provenance: 'executed',
    scope: 's',
    limitation: 'l',
  }));
  const size = () => canonicalJson(recordValue({ checks })).length;
  let need = bytes - size();
  assert.ok(need >= 0);
  for (const entry of checks) {
    for (const [field, limit] of [
      ['check', 80],
      ['scope', 160],
      ['limitation', 160],
    ]) {
      const add = Math.min(need, limit - entry[field].length);
      entry[field] += 'x'.repeat(add);
      need -= add;
    }
  }
  assert.equal(need, 0);
  assert.equal(size(), bytes);
  return checks;
}

test('the encoded record is limited to 6144 bytes', async (t) => {
  const { root } = repository(t);
  // 4608 bytes of JSON encode to exactly 6144 base64url characters; one more byte gives 6146.
  const fits = await built(root, { checks: sizedChecks(4608) });
  assert.equal(fits.record.length, 6144);
  assert.equal(parse(fits.record).status, 'valid');
  assert.deepEqual((await build(root, { checks: sizedChecks(4609) })).data, {
    status: 'rejected',
    reason: { code: 'oversized' },
  });
  const over = encodeRecord(recordValue({ checks: sizedChecks(4609) }));
  assert.equal(over.length, 6146);
  assert.deepEqual(rejection(over), { code: 'oversized' });
  // The size bound applies before decoding.
  assert.deepEqual(rejection('A'.repeat(6145)), { code: 'oversized' });
});

test('a record must be strict, canonical base64url JSON of a known version', () => {
  const canonical = encodeRecord(recordValue());
  assert.equal(parse(canonical).status, 'valid');
  const json = canonicalJson(recordValue());
  const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url');
  const malformed = [
    '',
    `${canonical}=`,
    `${canonical.slice(0, -1)}+`,
    `${canonical.slice(0, -1)}/`,
    'A',
    `${canonical.slice(0, 4)}.${canonical.slice(5)}`,
    Buffer.from([0xff, 0xfe, 0x7b, 0x7d]).toString('base64url'),
    b64('not json'),
    b64('[1]'),
    b64('null'),
    b64('"text"'),
  ];
  for (const value of malformed) {
    assert.deepEqual(rejection(value), { code: 'malformed-encoding' }, value);
  }
  const nonCanonical = [
    b64(JSON.stringify(recordValue(), null, 1)),
    b64(JSON.stringify({ checks: recordValue().checks, ...recordValue() })),
    b64(json.replace('"version":1', '"version":1.0')),
    b64(json.replace('{', '{"producer":"fix",')),
    b64(json.replace('Unit tests', 'Unit tes\\u0074s')),
  ];
  for (const value of nonCanonical) {
    assert.deepEqual(
      rejection(value),
      { code: 'non-canonical' },
      Buffer.from(value, 'base64url').toString(),
    );
  }
  // Nonzero padding bits decode to the same bytes but are not the canonical spelling.
  const last = canonical.at(-1);
  if (canonical.length % 4 !== 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const twisted = canonical.slice(0, -1) + alphabet[(alphabet.indexOf(last) + 1) % 64];
    if (Buffer.from(twisted, 'base64url').equals(Buffer.from(canonical, 'base64url'))) {
      assert.deepEqual(rejection(twisted), { code: 'non-canonical' });
    }
  }
  for (const version of [2, 0, '1', null, undefined]) {
    assert.deepEqual(
      rejection(recordValue({ version })),
      { code: 'unknown-version' },
      String(version),
    );
  }
  // The version gate runs before the closed key set, so a future version is reported as such.
  assert.deepEqual(rejection(recordValue({ version: 2, extension: true })), {
    code: 'unknown-version',
  });
});

// ---------------------------------------------------------------------------------------------
// Content digest

test('the content digest sorts by raw path bytes and excludes only exact plan paths', () => {
  const entry = (path, oid = '1'.repeat(40)) => ({
    mode: '100644',
    type: 'blob',
    oid,
    path: Buffer.from(path, 'utf8'),
  });
  const entries = [entry('b.txt'), entry('a.txt'), entry('ä.txt'), entry(PLAN, '2'.repeat(40))];
  const reversed = [...entries].reverse();
  assert.equal(contentDigest(entries, [PLAN]), contentDigest(reversed, [PLAN]));
  assert.equal(contentDigest(entries, [PLAN]), contentDigest(entries.slice(0, 3)));
  assert.notEqual(contentDigest(entries, ['docs/plan']), contentDigest(entries.slice(0, 3)));
  assert.notEqual(contentDigest(entries), contentDigest(entries.slice(0, 3)));
  assert.match(contentDigest([]), /^[0-9a-f]{64}$/);
});

test('the content digest orders paths by UTF-8 bytes, not by UTF-16 code units', () => {
  // U+FF61 is EF BD A1 in UTF-8 and FF61 in UTF-16; U+1F600 is F0 9F 98 80 and D83D DE00.
  const halfwidth = '｡.txt';
  const emoji = '\u{1F600}.txt';
  assert.ok(emoji < halfwidth, 'UTF-16 order puts the emoji first');
  assert.ok(Buffer.compare(Buffer.from(halfwidth), Buffer.from(emoji)) < 0, 'byte order does not');
  const entry = (name, oid) => ({ mode: '100644', type: 'blob', oid, path: Buffer.from(name) });
  const first = entry(halfwidth, '1'.repeat(40));
  const second = entry(emoji, '2'.repeat(40));
  const digestOf = (ordered) => {
    const hash = createHash('sha256');
    for (const item of ordered) {
      hash.update(`${item.mode} ${item.type} ${item.oid}\t`);
      hash.update(item.path);
      hash.update('\0');
    }
    return hash.digest('hex');
  };
  assert.equal(contentDigest([second, first]), digestOf([first, second]));
  assert.equal(contentDigest([first, second]), digestOf([first, second]));
  assert.notEqual(contentDigest([second, first]), digestOf([second, first]));
});

// ---------------------------------------------------------------------------------------------
// Build and render call contract

test('build rejects record content before reading git and fails on an unreadable tree', async (t) => {
  const { root } = repository(t);
  const absent = 'f'.repeat(40);
  assert.deepEqual((await build(root, { tree: absent, checks: [] })).data, {
    status: 'rejected',
    reason: { code: 'no-checks', field: 'checks' },
  });
  assert.equal(
    (await build(root, { tree: absent, producer: 'docs' })).data.reason.code,
    'invalid-field',
  );
  assert.equal(
    (await build(root, { tree: absent, checks: [textCheck('scope', 'NODE_ENV=prod')] })).data.reason
      .rule,
    'assignment',
  );
  assert.equal(
    (await build(root, { visibility: 'hidden', planPaths: [PLAN] })).data.reason.code,
    'hidden-plan-paths',
  );
  const missing = await build(root, { tree: absent });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'MISSING_OBJECT');
  const commit = await build(root, { tree: git(root, 'rev-parse', 'HEAD') });
  assert.equal(commit.error.code, 'MISSING_OBJECT');
});

test('build copies only the schema fields into the canonical record', async (t) => {
  const { root } = repository(t);
  const data = await built(root, {
    producer: 'deliver',
    planPaths: [PLAN],
    checks: [
      {
        scope: 'all',
        limitation: 'none known',
        provenance: 'executed',
        outcome: 'passed',
        check: 'Tests',
      },
    ],
  });
  const decoded = parse(data.record).record;
  assert.deepEqual(decoded, {
    checks: [
      {
        check: 'Tests',
        limitation: 'none known',
        outcome: 'passed',
        provenance: 'executed',
        scope: 'all',
      },
    ],
    contentDigest: data.contentDigest,
    planPaths: [PLAN],
    producer: 'deliver',
    version: 1,
  });
  assert.equal(data.record, encodeRecord(decoded));
});

test('build sorts planPaths given in any order; parse and render still require sorted ones', async (t) => {
  const { root } = repository(t);
  const unsorted = [ARCHIVED, PLAN];
  const data = await built(root, { planPaths: unsorted });
  assert.deepEqual(unsorted, [ARCHIVED, PLAN], 'the input array is not reordered in place');
  const decoded = parse(data.record).record;
  assert.deepEqual(decoded.planPaths, PLAN_PAIR);
  assert.equal(data.record, (await built(root, { planPaths: PLAN_PAIR })).record);
  // Duplicates stay duplicates after sorting.
  for (const planPaths of [
    [PLAN, PLAN],
    [ARCHIVED, PLAN, PLAN],
  ]) {
    assert.deepEqual((await build(root, { planPaths })).data, {
      status: 'rejected',
      reason: { code: 'invalid-plan-paths', field: 'planPaths' },
    });
  }
  const reordered = encodeRecord({ ...decoded, planPaths: unsorted });
  assert.deepEqual(rejection(reordered), { code: 'invalid-plan-paths', field: 'planPaths' });
  assert.deepEqual((await render(root, reordered)).reason, {
    code: 'invalid-plan-paths',
    field: 'planPaths',
  });
});

test('build fails outside a repository and reports only a missing object as MISSING_OBJECT', async (t) => {
  const { root } = repository(t);
  const input = {
    cwd: root,
    tree: treeOf(root),
    planDir: PLAN_DIR,
    planPaths: [],
    visibility: 'standard',
    producer: 'build',
    checks: [PASSED],
  };
  const outside = temporaryDirectory(t, 'verification-evidence-outside-');
  const notRepository = await call('evidence-build', { ...input, cwd: outside });
  assert.equal(notRepository.error.code, 'GIT_FAILED');
  // An id of the other object format cannot name an object in this repository.
  assert.equal(
    (await call('evidence-build', { ...input, tree: 'f'.repeat(64) })).error.code,
    'MISSING_OBJECT',
  );
  // `cat-file -e` status 1 is an absent object; any other failure is a git failure.
  const real = createProcessRunner();
  const existsStatus = (status) => (request) =>
    request.args.includes('-e')
      ? { status, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: object store broken\n') }
      : real(request);
  for (const [status, code] of [
    [1, 'MISSING_OBJECT'],
    [128, 'GIT_FAILED'],
  ]) {
    const envelope = await executeOperation('evidence-build', input, {
      runner: existsStatus(status),
      env: GIT_ENV,
    });
    assert.equal(envelope.error.code, code, String(status));
  }
});

test('malformed call parameters are INVALID_INPUT envelopes that never echo record text', async (t) => {
  const { root } = repository(t);
  const base = {
    cwd: root,
    tree: treeOf(root),
    planDir: PLAN_DIR,
    planPaths: [],
    visibility: 'standard',
    producer: 'build',
    checks: [PASSED],
  };
  const invalid = [
    null,
    [],
    { ...base, cwd: 'relative/path' },
    { ...base, cwd: join(root, 'missing') },
    { ...base, tree: 'HEAD' },
    { ...base, tree: 'A'.repeat(40) },
    { ...base, objectDirectory: 'objects' },
    { ...base, planDir: '' },
    { ...base, planDir: '/docs/plan' },
    { ...base, planDir: 'docs/plan/' },
    { ...base, planDir: 'docs/../plan' },
    { ...base, planDir: 'docs/./plan' },
    { ...base, planDir: 'docs\\plan' },
    { ...base, planDir: 7 },
    { ...base, visibility: 'visible' },
    { ...base, ghp_secretTokenValue: 1 },
  ];
  for (const name of Object.keys(base)) {
    const input = { ...base };
    delete input[name];
    invalid.push(input);
  }
  for (const input of invalid) {
    const envelope = await call('evidence-build', input);
    assert.equal(envelope.ok, false, JSON.stringify(input));
    assert.equal(envelope.operation, 'evidence-build');
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
    assert.equal(exitCodeFor(envelope), 2);
    assert.doesNotMatch(envelope.error.message, /ghp_secretTokenValue/);
  }
  const parseCalls = [
    { record: 7, planDir: PLAN_DIR, visibility: 'standard' },
    { record: 'x', planDir: PLAN_DIR },
    { record: 'x', planDir: PLAN_DIR, visibility: 'standard', language: 'en' },
  ];
  for (const input of parseCalls) {
    assert.equal((await call('evidence-parse', input)).error.code, 'INVALID_INPUT');
  }
  const unknown = await call('evidence-sign', {});
  assert.deepEqual(unknown.operation, null);
  assert.equal(unknown.error.code, 'INVALID_INPUT');
});

test('render never accepts a caller tree and resolves the head commit itself', async (t) => {
  const { root, head } = repository(t);
  const { record } = await built(root);
  const base = {
    cwd: root,
    record,
    head,
    planDir: PLAN_DIR,
    visibility: 'standard',
    language: 'en',
  };
  const withTree = await call('evidence-render', { ...base, tree: treeOf(root) });
  assert.equal(withTree.ok, false);
  assert.equal(withTree.error.code, 'INVALID_INPUT');
  for (const input of [
    { ...base, language: 'fr' },
    { ...base, head: 'HEAD' },
    { ...base, head: head.toUpperCase() },
    { ...base, record: { encoded: record } },
    { ...base, visibility: undefined },
  ]) {
    assert.equal((await call('evidence-render', input)).error.code, 'INVALID_INPUT');
  }
  // A tree id cannot stand in for the head commit, and an absent commit is a missing object.
  for (const value of [treeOf(root), 'f'.repeat(40)]) {
    const envelope = await call('evidence-render', { ...base, head: value });
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'MISSING_OBJECT');
    assert.equal(exitCodeFor(envelope), 1);
  }
  const outside = temporaryDirectory(t, 'verification-evidence-outside-');
  const notRepository = await call('evidence-render', { ...base, cwd: outside });
  assert.equal(notRepository.error.code, 'GIT_FAILED');
});

test('render fully re-validates the record and renders nothing for a rejection', async (t) => {
  const { root } = repository(t);
  const { record } = await built(root, { planPaths: [PLAN] });
  assert.deepEqual(await render(root, record, { visibility: 'hidden' }), {
    status: 'rejected',
    reason: { code: 'hidden-plan-paths', field: 'planPaths' },
    markdown: null,
  });
  assert.deepEqual(await render(root, record, { planDir: 'plans' }), {
    status: 'rejected',
    reason: { code: 'invalid-plan-paths', field: 'planPaths' },
    markdown: null,
  });
  const decoded = parse(record).record;
  const tampered = encodeRecord({ ...decoded, checks: [textCheck('scope', '@octocat')] });
  assert.deepEqual(await render(root, tampered), {
    status: 'rejected',
    reason: { code: 'forbidden-token', rule: 'mention', check: 0, field: 'scope' },
    markdown: null,
  });
  assert.deepEqual(await render(root, `${record} `), {
    status: 'rejected',
    reason: { code: 'malformed-encoding' },
    markdown: null,
  });
  // A rejection needs no git: an unreadable head still yields the rejection, not an error.
  assert.equal((await render(root, '', { head: 'f'.repeat(40) })).status, 'rejected');
});

test('a hidden-mode record renders when its text carries no hidden-mode token', async (t) => {
  const { root } = repository(t);
  const { record } = await built(root, { visibility: 'hidden' });
  const rendered = await render(root, record, { visibility: 'hidden' });
  assert.equal(rendered.status, 'current');
  assert.doesNotMatch(rendered.markdown, /effective|docs\/plan/i);
});

// ---------------------------------------------------------------------------------------------
// Private object store

test('build reads a tree that exists only in a private object store without writing objects', async (t) => {
  const { root } = repository(t);
  const scratch = temporaryDirectory(t, 'verification-evidence-store-');
  const privateObjects = join(scratch, 'objects');
  mkdirSync(privateObjects);
  const realObjects = realpathSync(join(root, '.git', 'objects'));
  const privateEnv = {
    ...GIT_ENV,
    GIT_INDEX_FILE: join(scratch, 'index'),
    GIT_OBJECT_DIRECTORY: privateObjects,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: realObjects,
  };
  // Snapshot the worktree with one extra file into the private store only, as diff-baseline does.
  writeFiles(root, { 'src/new.txt': 'new\n' });
  gitRaw(root, ['read-tree', 'HEAD'], privateEnv);
  gitRaw(root, ['add', '-A'], privateEnv);
  const tree = gitRaw(root, ['write-tree'], privateEnv).toString().trim();
  assert.notEqual(
    spawnSync('git', ['-C', root, 'cat-file', '-e', tree], { env: GIT_ENV }).status,
    0,
  );

  const before = listObjects(root);
  const data = await built(root, { tree, objectDirectory: privateObjects, planPaths: PLAN_PAIR });
  assert.deepEqual(listObjects(root), before, 'no object is written to the repository store');
  assert.equal(
    spawnSync('git', ['-C', root, 'cat-file', '-e', tree], { env: GIT_ENV }).status !== 0,
    true,
  );

  // Without the private store the tree is not readable.
  assert.equal((await build(root, { tree })).error.code, 'MISSING_OBJECT');
  const gone = await build(root, { tree, objectDirectory: join(scratch, 'discarded') });
  assert.equal(gone.error.code, 'MISSING_OBJECT');
  // The real store stays readable through the alternate.
  const headTree = treeOf(root);
  assert.equal(
    (await built(root, { tree: headTree, objectDirectory: privateObjects })).contentDigest,
    (await built(root, { tree: headTree })).contentDigest,
  );

  // Publishing the same content in the repository renders the record as current.
  commitAll(root, 'publish the verified content');
  assert.equal(treeOf(root), tree);
  const beforeRender = listObjects(root);
  assert.equal((await render(root, data.record)).status, 'current');
  assert.deepEqual(listObjects(root), beforeRender, 'render writes no object either');
  assert.ok(existsSync(privateObjects));
});

test('every git call runs without replace objects and without lazy fetch', async (t) => {
  const { root } = repository(t);
  const scratch = temporaryDirectory(t, 'verification-evidence-store-');
  const privateObjects = join(scratch, 'objects');
  mkdirSync(privateObjects);
  const calls = [];
  const real = createProcessRunner();
  const deps = {
    runner: (request) => {
      calls.push(request);
      return real(request);
    },
    // An inherited setting that would re-enable replacement is overridden.
    env: { ...GIT_ENV, GIT_NO_REPLACE_OBJECTS: '0' },
  };
  const buildEnvelope = await executeOperation(
    'evidence-build',
    {
      cwd: root,
      tree: treeOf(root),
      objectDirectory: privateObjects,
      planDir: PLAN_DIR,
      planPaths: [],
      visibility: 'standard',
      producer: 'build',
      checks: [PASSED],
    },
    deps,
  );
  assert.equal(buildEnvelope.data.status, 'built');
  const rendered = await executeOperation(
    'evidence-render',
    {
      cwd: root,
      record: buildEnvelope.data.record,
      head: git(root, 'rev-parse', 'HEAD'),
      planDir: PLAN_DIR,
      visibility: 'standard',
      language: 'en',
    },
    deps,
  );
  assert.equal(rendered.data.status, 'current');
  const subcommands = new Set(calls.map((request) => request.args[3]));
  assert.deepEqual([...subcommands].sort(), ['cat-file', 'ls-tree', 'rev-parse']);
  assert.ok(calls.some((request) => request.args.includes('--git-path')));
  for (const request of calls) {
    assert.deepEqual(request.args.slice(0, 3), ['-C', root, '--no-replace-objects']);
    assert.equal(request.env.GIT_NO_REPLACE_OBJECTS, '1');
    assert.equal(request.env.GIT_NO_LAZY_FETCH, '1');
    assert.equal(request.env.GIT_OPTIONAL_LOCKS, '0');
  }
});

test('a replace ref cannot make changed content render as current', async (t) => {
  await t.test('a replaced tree', async (t) => {
    const { root } = repository(t);
    const verified = treeOf(root);
    const data = await built(root);
    writeFiles(root, { 'src/app.txt': 'changed\n' });
    commitAll(root);
    const changed = treeOf(root);
    git(root, 'replace', changed, verified);
    // Plain git now reads the verified listing under the changed tree id.
    assert.equal(
      git(root, 'ls-tree', '-r', '--full-tree', changed),
      git(root, 'ls-tree', '-r', '--full-tree', verified),
    );
    assert.equal((await render(root, data.record)).status, 'stale');
    assert.notEqual((await built(root, { tree: changed })).contentDigest, data.contentDigest);
  });
  await t.test('a replaced commit', async (t) => {
    const { root, head: verifiedHead } = repository(t);
    const verified = treeOf(root);
    const data = await built(root);
    writeFiles(root, { 'src/app.txt': 'changed\n' });
    const head = commitAll(root);
    git(root, 'replace', head, verifiedHead);
    // Plain git now peels the new head to the verified tree.
    assert.equal(git(root, 'rev-parse', `${head}^{tree}`), verified);
    assert.equal((await render(root, data.record, { head })).status, 'stale');
  });
});

// Writes `{ mode, type, oid, path }` entries, `path` as raw bytes, into the index `env` selects.
function addIndexEntries(root, entries, env = GIT_ENV) {
  const input = Buffer.concat(
    entries.map(({ mode, type, oid, path }) =>
      Buffer.concat([Buffer.from(`${mode} ${type} ${oid}\t`), path, Buffer.from([0])]),
    ),
  );
  const result = spawnSync('git', ['-C', root, 'update-index', '-z', '--index-info'], {
    env,
    input,
  });
  assert.equal(result.status, 0, result.stderr.toString());
}

function hashBlob(root, content, env = GIT_ENV) {
  const result = spawnSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], {
    env,
    input: content,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout.toString().trim();
}

test('a non-UTF-8 name, a symlink and a gitlink digest the same in build and render', async (t) => {
  const { root, head } = repository(t);
  const scratch = temporaryDirectory(t, 'verification-evidence-store-');
  const privateObjects = join(scratch, 'objects');
  mkdirSync(privateObjects);
  const privateEnv = {
    ...GIT_ENV,
    GIT_INDEX_FILE: join(scratch, 'index'),
    GIT_OBJECT_DIRECTORY: privateObjects,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: realpathSync(join(root, '.git', 'objects')),
  };
  const rawName = Buffer.from([0x66, 0xff]);
  const specialEntries = (env) => [
    { mode: '100644', type: 'blob', oid: hashBlob(root, 'raw name\n', env), path: rawName },
    {
      mode: '120000',
      type: 'blob',
      oid: hashBlob(root, 'src/app.txt', env),
      path: Buffer.from('link'),
    },
    { mode: '160000', type: 'commit', oid: head, path: Buffer.from('sub') },
  ];
  // The verified tree exists only in the private store.
  gitRaw(root, ['read-tree', 'HEAD'], privateEnv);
  addIndexEntries(root, specialEntries(privateEnv), privateEnv);
  const tree = gitRaw(root, ['write-tree'], privateEnv).toString().trim();
  assert.notEqual(
    spawnSync('git', ['-C', root, 'cat-file', '-e', tree], { env: GIT_ENV }).status,
    0,
  );
  const listing = gitRaw(root, ['ls-tree', '-r', '-z', '--full-tree', tree], privateEnv);
  assert.ok(listing.includes(Buffer.concat([Buffer.from('\t'), rawName, Buffer.from([0])])));
  assert.ok(listing.includes(Buffer.from('120000 blob ')));
  assert.ok(listing.includes(Buffer.from(`160000 commit ${head}\tsub`)));
  const data = await built(root, { tree, objectDirectory: privateObjects, planPaths: PLAN_PAIR });

  // The same entries committed in the repository give the same tree and the same digest.
  addIndexEntries(root, specialEntries(GIT_ENV));
  git(root, 'commit', '-q', '-m', 'special entries');
  assert.equal(treeOf(root), tree);
  assert.equal((await built(root, { planPaths: PLAN_PAIR })).contentDigest, data.contentDigest);
  assert.equal((await render(root, data.record)).status, 'current');
});

test('a sha256 repository builds and renders with 64-character ids', async (t) => {
  const root = temporaryDirectory(t, 'verification-evidence-sha256-');
  const init = spawnSync(
    'git',
    ['-C', root, 'init', '-q', '--object-format=sha256', '--initial-branch=main'],
    { env: GIT_ENV },
  );
  if (init.status !== 0) {
    t.skip('git cannot create a sha256 repository');
    return;
  }
  writeFiles(root, { 'README.md': 'readme\n', [PLAN]: '# Plan\n' });
  const head = commitAll(root, 'fixture');
  assert.match(head, /^[0-9a-f]{64}$/);
  const data = await built(root, { planPaths: [PLAN] });
  const rendered = await render(root, data.record);
  assert.equal(rendered.status, 'current');
  assert.equal(rendered.shortHead, head.slice(0, 7));
  // A 40-character id cannot name an object in a sha256 repository.
  assert.equal((await build(root, { tree: 'f'.repeat(40) })).error.code, 'MISSING_OBJECT');
  assert.equal(
    (
      await call('evidence-render', {
        cwd: root,
        record: data.record,
        head: 'f'.repeat(40),
        planDir: PLAN_DIR,
        visibility: 'standard',
        language: 'en',
      })
    ).error.code,
    'MISSING_OBJECT',
  );
});

// ---------------------------------------------------------------------------------------------
// CLI

function runCli(args, input) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
    input: typeof input === 'string' ? input : JSON.stringify(input),
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `expected exactly one stdout line, got: ${result.stdout}`);
  assert.ok(result.stdout.endsWith('\n'));
  return { status: result.status, envelope: JSON.parse(lines[0]), stderr: result.stderr };
}

test('the CLI writes one envelope line and exits nonzero only when ok is false', async (t) => {
  const { root, head } = repository(t);
  const buildCall = runCli(['evidence-build'], {
    cwd: root,
    tree: treeOf(root),
    planDir: PLAN_DIR,
    planPaths: [],
    visibility: 'standard',
    producer: 'fix',
    checks: [PASSED],
  });
  assert.equal(buildCall.status, 0);
  assert.equal(buildCall.envelope.ok, true);
  assert.equal(buildCall.envelope.operation, 'evidence-build');
  const { record } = buildCall.envelope.data;

  const renderCall = runCli(['evidence-render'], {
    cwd: root,
    record,
    head,
    planDir: PLAN_DIR,
    visibility: 'standard',
    language: 'en',
  });
  assert.equal(renderCall.status, 0);
  assert.equal(renderCall.envelope.data.status, 'current');

  const parsed = runCli(['evidence-parse'], { record, planDir: PLAN_DIR, visibility: 'standard' });
  assert.equal(parsed.status, 0);
  assert.equal(parsed.envelope.data.record.producer, 'fix');

  // A rejected record is a successful call.
  const rejected = runCli(['evidence-parse'], {
    record: 'A',
    planDir: PLAN_DIR,
    visibility: 'standard',
  });
  assert.equal(rejected.status, 0);
  assert.deepEqual(rejected.envelope, {
    ok: true,
    operation: 'evidence-parse',
    data: { status: 'rejected', reason: { code: 'malformed-encoding' } },
  });

  const missing = runCli(['evidence-render'], {
    cwd: root,
    record,
    head: 'f'.repeat(40),
    planDir: PLAN_DIR,
    visibility: 'standard',
    language: 'en',
  });
  assert.equal(missing.status, 1);
  assert.equal(missing.envelope.error.code, 'MISSING_OBJECT');
  assert.match(missing.stderr, /^MISSING_OBJECT: /);

  for (const [args, input] of [
    [['evidence-parse'], 'not json'],
    [['evidence-parse'], '[]'],
    [['evidence-parse', 'extra'], {}],
    [[], {}],
    [['evidence-sign'], {}],
  ]) {
    const failed = runCli(args, input);
    assert.equal(failed.status, 2, JSON.stringify(args));
    assert.equal(failed.envelope.ok, false);
    assert.equal(failed.envelope.error.code, 'INVALID_INPUT');
  }
});

test('main() rejects an unknown operation without waiting on stdin', async () => {
  // Invariant: `verification-evidence.mjs --help` from a terminal answers at once instead of
  // blocking on an open stdin, because the operation is validated before any input is read.
  const neverEnding = new PassThrough();
  const stdout = [];
  let exitCode;
  const envelope = await main(['--help'], {
    stdin: neverEnding,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write: () => {} },
    setExitCode: (code) => {
      exitCode = code;
    },
  });
  neverEnding.destroy();
  assert.equal(exitCode, 2);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.operation, null);
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assert.equal(stdout.length, 1);
});

test('main() rejects stdin above MAX_STDIN_BYTES as INVALID_INPUT', async () => {
  const run = async (chunks) => {
    const stdout = [];
    let exitCode;
    const envelope = await main(['evidence-parse'], {
      stdin: Readable.from(chunks),
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: () => {} },
      setExitCode: (code) => {
        exitCode = code;
      },
    });
    assert.equal(stdout.length, 1);
    return { envelope, exitCode };
  };
  const over = await run([Buffer.alloc(MAX_STDIN_BYTES, 0x20), Buffer.from(' ')]);
  assert.equal(over.exitCode, 2);
  assert.equal(over.envelope.ok, false);
  assert.equal(over.envelope.operation, 'evidence-parse');
  assert.equal(over.envelope.error.code, 'INVALID_INPUT');
  assert.match(over.envelope.error.message, /exceeds/);
  // Input of exactly the bound is still read and parsed.
  const json = Buffer.from(
    JSON.stringify({ record: 'A', planDir: PLAN_DIR, visibility: 'standard' }),
  );
  const at = await run([json, Buffer.alloc(MAX_STDIN_BYTES - json.length, 0x20)]);
  assert.equal(at.exitCode, undefined);
  assert.deepEqual(at.envelope.data, {
    status: 'rejected',
    reason: { code: 'malformed-encoding' },
  });
});
