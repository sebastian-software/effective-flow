import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import {
  chmodSync,
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
  DIAGNOSTIC_CODES,
  HIDDEN_FORCED_VALUES,
  SUCCESSOR_SETS,
  SUCCESSOR_SET_TOOLS,
  TOOL_ALIASES,
  compareSetupCandidates,
  classifySetupStem,
  createProcessRunner,
  executeOperation,
  exitCodeFor,
  parseConfigurationDocument,
  parseSetupMarkers,
  toolAliasDivergence,
} from '../src/scripts/config-resolve-core.mjs';
import { main } from '../src/scripts/config-resolve.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/config-resolve.mjs', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Effective Flow Test',
  GIT_AUTHOR_EMAIL: 'effective-flow@example.invalid',
  GIT_COMMITTER_NAME: 'Effective Flow Test',
  GIT_COMMITTER_EMAIL: 'effective-flow@example.invalid',
};
const SETUP_ADR = join('docs', 'adr', 'effective-flow-project-setup.md');
const LOCAL_SETUP = join('.effective-flow', 'project-setup.md');

// ---------------------------------------------------------------------------------------------
// Fixtures

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { env: GIT_ENV, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function tempDir(t, prefix = 'effective-flow-config-resolve-') {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const restore = [];
  t.after(() => {
    for (const reset of restore.splice(0).reverse()) reset();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, restore };
}

function initRepository(root) {
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch=main');
  writeFileSync(join(root, 'tracked.txt'), 'tracked\n');
  git(root, 'add', 'tracked.txt');
  git(root, 'commit', '--quiet', '-m', 'fixture');
  return root;
}

function repository(t) {
  const { directory, restore } = tempDir(t);
  const root = initRepository(join(directory, 'main'));
  return { base: directory, root, restore };
}

function plainDirectory(t) {
  const { directory, restore } = tempDir(t);
  return { root: directory, restore };
}

function write(root, relative, content) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

// One configuration document with the canonical envelope of `language`.
function setupDocument(rows, { language = 'en', status = 'Active' } = {}) {
  const [heading, key, value] =
    language === 'de' ? ['Konfiguration', 'Schlüssel', 'Wert'] : ['Configuration', 'Key', 'Value'];
  const table = Object.entries(rows)
    .flatMap(([rowKey, rowValue]) =>
      (Array.isArray(rowValue) && rowValue.duplicate ? rowValue : [rowValue]).map(
        (cell) => `| ${rowKey} | ${cell} |`,
      ),
    )
    .join('\n');
  return `# Effective Flow project setup\n\n## Status\n\n${status}\n\n## ${heading}\n\n| ${key} | ${value} |\n| --- | --- |\n${table}\n`;
}

// Marks a list of cells as several rows of one key.
function rowsOf(...cells) {
  const list = [...cells];
  list.duplicate = true;
  return list;
}

async function resolve(input, deps) {
  return executeOperation('resolve', input, deps);
}

async function resolved(input, deps) {
  const envelope = await resolve(input, deps);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.operation, 'resolve');
  return envelope.data;
}

async function refused(input, deps) {
  const envelope = await resolve(input, deps);
  assert.equal(envelope.ok, false, 'the resolution must refuse');
  assert.equal(envelope.data, undefined, 'a refusal carries no data to fall through to');
  assert.equal(envelope.error.retryable, false);
  return envelope;
}

function codes(data) {
  return data.diagnostics.map((diagnostic) => diagnostic.code);
}

function diagnostic(data, code) {
  return data.diagnostics.find((entry) => entry.code === code);
}

// Wraps the real runner; `override` may answer a call instead of git.
function fakeRunner(override) {
  const real = createProcessRunner();
  return async (call) => (await override(call)) ?? real(call);
}

function gitResult(stdout, status = 0, stderr = '') {
  return { status, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) };
}

function isCall(call, ...needle) {
  return needle.every((part) => call.args.includes(part));
}

// Sets a path to mode 000 and reports whether this process is actually denied reading it; root,
// or a filesystem that ignores modes, still reads it.
function makeUnreadable(restore, target) {
  restore.push(() => chmodSync(target, 0o644));
  chmodSync(target, 0o000);
  try {
    readFileSync(target);
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Step 0: hidden mode

test('step 0: a main-checkout local file declaring visibility hidden is the whole configuration', async (t) => {
  const { root } = repository(t);
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden', 'review.profile': 'deep' }));
  write(root, SETUP_ADR, setupDocument({ 'review.profile': 'focused' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.visibility, 'hidden');
  assert.equal(data.runtimeStateRoot, root);
  assert.equal(data.source.step, 0);
  assert.equal(data.source.path, join(root, LOCAL_SETUP));
  assert.deepEqual(data.values['review.profile'], {
    state: 'set',
    value: 'deep',
    raw: 'deep',
    items: ['deep'],
    source: 'local-hidden',
  });
  assert.equal(data.values.visibility, undefined, 'visibility is never a value');
  // The tracked ADR that would resolve is named once as shadowed and never read.
  assert.deepEqual(diagnostic(data, 'shadowed-tracked-config'), {
    code: 'shadowed-tracked-config',
    path: join(root, SETUP_ADR),
  });
});

// Invariant: setup's hidden → standard switch resolves the tracked ADR it writes through steps 1
// to 4 only, so the step-0 file is a read-only seed and never shadows its write target; every other
// mode value for setup is refused rather than silently ignored.
test('step 0: setup in standard mode skips the hidden local file and resolves steps 1 to 4', async (t) => {
  const { root } = repository(t);
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden', 'review.profile': 'deep' }));
  write(root, SETUP_ADR, setupDocument({ 'review.profile': 'focused' }));
  const data = await resolved({ cwd: root, tool: 'setup', mode: 'standard' });
  assert.equal(data.visibility, 'standard');
  assert.equal(data.source.step, 2);
  assert.equal(data.values['review.profile'].value, 'focused');
  assert.equal(diagnostic(data, 'shadowed-tracked-config'), undefined);

  const hidden = await resolved({ cwd: root, tool: 'setup' });
  assert.equal(hidden.visibility, 'hidden');
  const refusedMode = await refused({ cwd: root, tool: 'setup', mode: 'hidden' });
  assert.equal(refusedMode.error.code, 'INVALID_INPUT');
  assert.equal(refusedMode.error.details.field, 'mode');
});

test('step 0: a local file without visibility hidden is reported and resolution falls through', async (t) => {
  const { root } = repository(t);
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'standard', 'review.profile': 'deep' }));
  write(root, SETUP_ADR, setupDocument({ 'review.profile': 'focused' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.visibility, 'standard');
  assert.equal(data.source.step, 2);
  assert.equal(data.values['review.profile'].value, 'focused');
  assert.deepEqual(diagnostic(data, 'local-file-not-hidden'), {
    code: 'local-file-not-hidden',
    path: join(root, LOCAL_SETUP),
  });
});

// Invariant: a hidden declaration in any envelope of a multi-envelope step-0 file stops
// resolution with exit 3; it never falls through to a tracked standard-mode configuration and
// never picks one envelope as the hidden configuration.
function twoEnvelopeDocument(first, second) {
  const text = setupDocument(first) + '\n' + setupDocument(second, { language: 'de' });
  assert.equal(parseConfigurationDocument(text).envelopeCount, 2, 'the fixture has two envelopes');
  return text;
}

async function refusedMultipleEnvelopes(t, first, second) {
  const { root } = repository(t);
  write(root, LOCAL_SETUP, twoEnvelopeDocument(first, second));
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'tracked' }));
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(envelope.error.details, {
    step: 0,
    path: join(root, LOCAL_SETUP),
    reason: 'hidden-file-multiple-envelopes',
  });
  assert.equal(exitCodeFor(envelope), 3);
}

test('step 0: a local file whose second envelope declares hidden stops with exit 3', async (t) => {
  await refusedMultipleEnvelopes(t, { 'review.profile': 'deep' }, { visibility: 'hidden' });
});

test('step 0: a local file whose first of two envelopes declares hidden stops with exit 3', async (t) => {
  await refusedMultipleEnvelopes(t, { visibility: 'hidden' }, { 'review.profile': 'deep' });
});

// Invariant: the multi-envelope stop leaves a single-envelope hidden file resolving at step 0.
test('step 0: a single-envelope hidden local file still resolves hidden mode', async (t) => {
  const { root } = repository(t);
  const text = setupDocument({ visibility: 'hidden' });
  assert.equal(parseConfigurationDocument(text).envelopeCount, 1);
  write(root, LOCAL_SETUP, text);
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'tracked' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.visibility, 'hidden');
  assert.equal(data.source.step, 0);
});

// Invariant: a multi-envelope local file with no hidden row in any envelope is not hidden mode;
// it is reported and resolution falls through to the tracked configuration.
test('step 0: a multi-envelope local file without a hidden row is reported and falls through', async (t) => {
  const { root } = repository(t);
  write(
    root,
    LOCAL_SETUP,
    twoEnvelopeDocument({ visibility: 'standard' }, { 'review.profile': 'deep' }),
  );
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'tracked' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.visibility, 'standard');
  assert.equal(data.source.step, 2);
  assert.deepEqual(diagnostic(data, 'local-file-not-hidden'), {
    code: 'local-file-not-hidden',
    path: join(root, LOCAL_SETUP),
  });
});

test('step 0: a linked worktree honours the main checkout file and reports its own same-named files as ignored', async (t) => {
  const { base, root } = repository(t);
  const linked = join(base, 'linked');
  git(root, 'worktree', 'add', '--quiet', '-b', 'feature', linked);
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden', 'review.profile': 'main' }));
  write(linked, LOCAL_SETUP, setupDocument({ visibility: 'hidden', 'review.profile': 'linked' }));
  write(linked, join('.effective-flow', 'config.json'), '{"review":{"profile":"linked-json"}}');
  const data = await resolved({ cwd: linked, tool: 'build' });
  assert.equal(data.runtimeStateRoot, root);
  assert.equal(data.checkoutRoot, realpathSync(linked));
  assert.equal(data.visibility, 'hidden');
  assert.equal(data.values['review.profile'].value, 'main');
  const ignored = data.diagnostics
    .filter((entry) => entry.code === 'ignored-linked-root-file')
    .map((entry) => entry.path);
  assert.deepEqual(ignored, [
    join(realpathSync(linked), LOCAL_SETUP),
    join(realpathSync(linked), '.effective-flow', 'config.json'),
  ]);
});

test('step 0: hidden mode forces each value, reports a contradicting row once, and takes a missing row silently', async (t) => {
  const { root } = repository(t);
  write(
    root,
    LOCAL_SETUP,
    setupDocument({
      visibility: 'hidden',
      'plan.dir': 'docs/plan',
      'tracker.mode': 'remote',
      'delivery.prReview': 'always',
    }),
  );
  const data = await resolved({ cwd: root, tool: 'build' });
  for (const [key, forced] of Object.entries(HIDDEN_FORCED_VALUES)) {
    assert.equal(data.values[key].value, forced, `${key} is forced in hidden mode`);
    assert.equal(data.values[key].source, 'forced');
  }
  const overrides = data.diagnostics.filter((entry) => entry.code === 'forced-value-override');
  assert.deepEqual(overrides, [
    {
      code: 'forced-value-override',
      key: 'plan.dir',
      raw: 'docs/plan',
      forced: '.effective-flow/plan',
    },
    { code: 'forced-value-override', key: 'tracker.mode', raw: 'remote', forced: 'local' },
    { code: 'forced-value-override', key: 'delivery.prReview', raw: 'always', forced: 'off' },
  ]);
});

test('step 0: hidden mode keeps a neutral delivery.branchPrefix and rejects one naming effective-flow in any case', async (t) => {
  const { root } = repository(t);
  write(
    root,
    LOCAL_SETUP,
    setupDocument({ visibility: 'hidden', 'delivery.branchPrefix': 'work' }),
  );
  const kept = await resolved({ cwd: root, tool: 'build' });
  assert.equal(kept.values['delivery.branchPrefix'].value, 'work');
  assert.equal(kept.values['delivery.branchPrefix'].source, 'local-hidden');
  assert.ok(!codes(kept).includes('forced-value-override'));

  write(
    root,
    LOCAL_SETUP,
    setupDocument({ visibility: 'hidden', 'delivery.branchPrefix': 'Effective-Flow/x' }),
  );
  const rejected = await resolved({ cwd: root, tool: 'build' });
  assert.equal(rejected.values['delivery.branchPrefix'].value, '');
  assert.equal(rejected.values['delivery.branchPrefix'].source, 'forced');
  assert.deepEqual(diagnostic(rejected, 'forced-value-override'), {
    code: 'forced-value-override',
    key: 'delivery.branchPrefix',
    raw: 'Effective-Flow/x',
    forced: '',
  });
});

// ---------------------------------------------------------------------------------------------
// Steps 1 and 2: marker and scan

test('step 1/2: a tracked visibility hidden row is reported and ignored, and the run stays standard', async (t) => {
  const { root } = repository(t);
  write(root, SETUP_ADR, setupDocument({ visibility: 'hidden', 'plan.dir': 'docs/plan' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.visibility, 'standard');
  assert.equal(data.values['plan.dir'].value, 'docs/plan', 'no hidden forced value applies');
  assert.deepEqual(diagnostic(data, 'tracked-hidden-ignored'), {
    code: 'tracked-hidden-ignored',
    path: join(root, SETUP_ADR),
  });
});

test('step 1: the AGENTS.md marker resolves an ADR at any path', async (t) => {
  const { root } = plainDirectory(t);
  write(root, 'AGENTS.md', '# Agents\n\n**Effective Flow project setup:** `config/setup.md`\n');
  write(root, join('config', 'setup.md'), setupDocument({ 'plan.dir': 'plans' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 1);
  assert.equal(data.source.path, join(root, 'config', 'setup.md'));
  assert.equal(data.source.legacyMarker, false);
  assert.equal(data.values['plan.dir'].value, 'plans');
});

test('step 1: a dead marker is reported and resolution falls through to the scan', async (t) => {
  const { root } = plainDirectory(t);
  write(root, 'AGENTS.md', '**Effective Flow project setup:** docs/adr/gone.md\n');
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'scanned' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 2);
  assert.equal(data.values['plan.dir'].value, 'scanned');
  assert.deepEqual(diagnostic(data, 'dead-marker'), {
    code: 'dead-marker',
    markerFile: join(root, 'AGENTS.md'),
    path: join(root, 'docs', 'adr', 'gone.md'),
    reason: 'missing',
  });

  // A marker target without a canonical envelope is just as dead.
  write(root, join('docs', 'adr', 'gone.md'), '# Not a setup ADR\n');
  const noEnvelope = await resolved({ cwd: root, tool: 'build' });
  assert.equal(diagnostic(noEnvelope, 'dead-marker').reason, 'no-envelope');
});

test('step 1: the legacy Firmo marker spelling is recognized and reported', async (t) => {
  const { root } = plainDirectory(t);
  write(root, 'AGENTS.md', '**Firmo project setup:** [setup](docs/legacy.md)\n');
  write(root, join('docs', 'legacy.md'), setupDocument({ 'plan.dir': 'legacy' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 1);
  assert.equal(data.source.legacyMarker, true);
  assert.equal(data.values['plan.dir'].value, 'legacy');
  assert.deepEqual(diagnostic(data, 'legacy-marker'), {
    code: 'legacy-marker',
    markerFile: join(root, 'AGENTS.md'),
  });
});

test('step 1: AGENTS.md wins over CLAUDE.md and a diverging marker is reported', async (t) => {
  const { root } = plainDirectory(t);
  write(root, 'AGENTS.md', '**Effective Flow project setup:** docs/a.md\n');
  write(root, 'CLAUDE.md', '**Effective Flow project setup:** docs/b.md\n');
  write(root, join('docs', 'a.md'), setupDocument({ 'plan.dir': 'a' }));
  write(root, join('docs', 'b.md'), setupDocument({ 'plan.dir': 'b' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['plan.dir'].value, 'a');
  assert.deepEqual(diagnostic(data, 'marker-divergence'), {
    code: 'marker-divergence',
    paths: ['docs/a.md', 'docs/b.md'],
  });
});

test('step 2: the legacy slug matches and is reported', async (t) => {
  const { root } = plainDirectory(t);
  write(root, join('docs', 'adr', 'firmo-project-setup.md'), setupDocument({ 'plan.dir': 'old' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 2);
  assert.equal(data.source.legacySlug, true);
  assert.equal(data.values['plan.dir'].value, 'old');
  assert.deepEqual(diagnostic(data, 'legacy-slug'), {
    code: 'legacy-slug',
    path: join(root, 'docs', 'adr', 'firmo-project-setup.md'),
  });
});

test('step 2: a numeric 0002- prefix matches and is marked prefixed', async (t) => {
  const { root } = plainDirectory(t);
  const path = write(
    root,
    join('docs', 'decisions', '0002-effective-flow-project-setup.md'),
    setupDocument({ 'plan.dir': 'numbered' }),
  );
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 2);
  assert.equal(data.source.path, path);
  assert.equal(data.source.prefixed, true);
  assert.equal(data.source.legacySlug, false);
});

test('step 2: a stem match without a canonical envelope is no match', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, '# Effective Flow project setup\n\nNo table here.\n');
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 4);
});

test('step 2: a several-match tie lists every matching path with writerStop and falls through', async (t) => {
  const { root } = plainDirectory(t);
  const paths = [
    write(root, join('docs', 'adr', '0002-effective-flow-project-setup.md'), setupDocument({})),
    write(root, join('docs', 'adr', '0001-effective-flow-project-setup.md'), setupDocument({})),
    write(root, join('docs', 'adr', 'firmo-project-setup.md'), setupDocument({})),
  ];
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.equal(data.source.step, 4, 'the tie is never resolved by picking one');
  assert.deepEqual(diagnostic(data, 'several-match'), {
    code: 'several-match',
    paths: [...paths].sort(),
    writerStop: true,
  });
});

test('step 2: ranking prefers the current slug first, then an unprefixed stem within one slug', async (t) => {
  const { root } = plainDirectory(t);
  const adr = (name, plan) =>
    write(root, join('docs', 'adr', name), setupDocument({ 'plan.dir': plan }));
  // A prefixed current slug beats an unprefixed legacy slug: one ordered comparison, not two.
  adr('0001-effective-flow-project-setup.md', 'prefixed-current');
  adr('firmo-project-setup.md', 'legacy');
  let data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['plan.dir'].value, 'prefixed-current');
  assert.ok(!codes(data).includes('several-match'));

  adr('effective-flow-project-setup.md', 'current');
  data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['plan.dir'].value, 'current');
  assert.equal(data.source.prefixed, false);

  assert.deepEqual(classifySetupStem('0003_firmo-project-setup.md'), {
    legacySlug: true,
    prefixed: true,
  });
  assert.equal(classifySetupStem('effective-flow-project-setup.txt'), null);
  assert.equal(
    compareSetupCandidates(
      { legacySlug: false, prefixed: true },
      { legacySlug: true, prefixed: false },
    ),
    -1,
  );
});

// ---------------------------------------------------------------------------------------------
// Table encoding

test('encoding: the English and the German envelope both resolve and report their language', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'en' }));
  assert.equal((await resolved({ cwd: root, tool: 'build' })).source.language, 'en');
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'de' }, { language: 'de' }));
  const german = await resolved({ cwd: root, tool: 'build' });
  assert.equal(german.source.language, 'de');
  assert.equal(german.values['plan.dir'].value, 'de');
});

test('encoding: a mixed heading/header pair is no envelope', () => {
  const mixed = '## Configuration\n\n| Schlüssel | Wert |\n| --- | --- |\n| plan.dir | x |\n';
  assert.equal(parseConfigurationDocument(mixed).envelope, null);
});

test('encoding: fenced rows are ignored, CRLF and a BOM are tolerated, and \\| is a literal pipe', () => {
  const text =
    '﻿# Setup\r\n\r\n```markdown\r\n## Configuration\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| fenced | yes |\r\n```\r\n\r\n## Configuration\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| a.b | x \\| y |\r\n';
  const { envelope, envelopeCount } = parseConfigurationDocument(text);
  assert.equal(envelopeCount, 1);
  assert.deepEqual(envelope.rows, [{ key: 'a.b', raw: 'x | y', cellCount: 2 }]);
  assert.deepEqual(
    parseSetupMarkers('```\n**Effective Flow project setup:** fenced.md\n```\n'),
    [],
  );
});

// Invariant: a UTF-8 BOM is stripped before line classification, so a configuration heading on the
// very first line of the file still opens the envelope (a BOM-prefixed line is no ATX heading).
test('encoding: a BOM directly before a first-line ## Configuration heading still opens the envelope', () => {
  const text = '\uFEFF## Configuration\n\n| Key | Value |\n| --- | --- |\n| plan.dir | bom |\n';
  const { envelope, envelopeCount } = parseConfigurationDocument(text);
  assert.equal(envelopeCount, 1);
  assert.equal(envelope.language, 'en');
  assert.deepEqual(envelope.rows, [{ key: 'plan.dir', raw: 'bom', cellCount: 2 }]);
});

test('encoding: a second envelope is reported and only the first is read', async (t) => {
  const { root } = plainDirectory(t);
  write(
    root,
    SETUP_ADR,
    `${setupDocument({ 'plan.dir': 'first' })}\n## Configuration\n\n| Key | Value |\n| --- | --- |\n| plan.dir | second |\n`,
  );
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['plan.dir'].value, 'first');
  assert.deepEqual(diagnostic(data, 'duplicate-envelope'), {
    code: 'duplicate-envelope',
    path: join(root, SETUP_ADR),
  });
});

test('encoding: a superseded status is reported and matching is unchanged', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'x' }, { status: 'Superseded' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 2);
  assert.ok(codes(data).includes('adr-superseded'));
});

test('encoding: the legacy (leer) token reads as an empty list and is reported', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'skills.exclude': '(leer)' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(data.values['skills.exclude'], {
    state: 'set',
    value: [],
    raw: '(leer)',
    items: [],
    source: 'adr',
  });
  assert.deepEqual(diagnostic(data, 'legacy-empty-token'), {
    code: 'legacy-empty-token',
    key: 'skills.exclude',
  });
});

test('encoding: (empty) reads as an empty list and a filled list carries its items', async (t) => {
  const { root } = plainDirectory(t);
  write(
    root,
    SETUP_ADR,
    setupDocument({ 'skills.exclude': '(empty)', 'skills.include': 'humanizer, distill' }),
  );
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(data.values['skills.exclude'].value, []);
  assert.deepEqual(data.values['skills.include'].items, ['humanizer', 'distill']);
  assert.equal(data.values['skills.include'].value, 'humanizer, distill');
  assert.ok(!codes(data).includes('legacy-empty-token'));
});

test('encoding: an explicit null row and a missing row are never conflated', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'applyReview.defaultCommitStrategy': 'null' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(data.values['applyReview.defaultCommitStrategy'], {
    state: 'set',
    value: null,
    raw: 'null',
    items: [],
    source: 'adr',
  });
  // A missing key is absent: the core carries no default.
  assert.equal(Object.hasOwn(data.values, 'delivery.completion'), false);
});

test('encoding: duplicate rows of one key are invalid and no row is chosen', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'review.profile': rowsOf('deep', 'focused') }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(data.values['review.profile'], {
    state: 'invalid',
    value: null,
    raw: null,
    items: [],
    source: 'adr',
  });
  assert.deepEqual(diagnostic(data, 'ambiguous-key'), {
    code: 'ambiguous-key',
    key: 'review.profile',
    count: 2,
  });
});

test('encoding: unknown and legacy keys stay in values so the setup rewrite loses nothing', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'plan.markerLanguage': 'de', 'custom.key': 'x' }));
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.equal(data.values['plan.markerLanguage'].value, 'de');
  assert.equal(data.values['custom.key'].value, 'x');
});

// Invariant: every configuration key, including one named like an Object.prototype member
// (`__proto__`, `constructor`, `prototype`), is an own enumerable entry of `values`, so the setup
// rewrite loses no row; such a key never replaces the prototype of `values` or touches
// Object.prototype.
test('encoding: a __proto__, constructor or prototype key is an own values entry and replaces no prototype', async (t) => {
  const { root } = plainDirectory(t);
  // Computed keys: a literal `__proto__: 'x'` would set the literal's prototype and write no row.
  write(
    root,
    SETUP_ADR,
    setupDocument({ ['__proto__']: 'x', ['constructor']: 'c', ['prototype']: 'p' }),
  );
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.equal(Object.getPrototypeOf(data.values), Object.prototype);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal(Object.hasOwn(Object.prototype, 'state'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'value'), false);
  assert.equal({}.state, undefined);
  assert.ok(Object.hasOwn(data.values, '__proto__'), 'the __proto__ row is an own entry');
  assert.ok(Object.keys(data.values).includes('__proto__'), 'the __proto__ row is enumerable');
  assert.deepEqual(Object.getOwnPropertyDescriptor(data.values, '__proto__')?.value, {
    state: 'set',
    value: 'x',
    raw: 'x',
    items: ['x'],
    source: 'adr',
  });
  for (const [key, cell] of [
    ['constructor', 'c'],
    ['prototype', 'p'],
  ]) {
    assert.ok(Object.hasOwn(data.values, key), `the ${key} row is an own entry`);
    assert.deepEqual(data.values[key], {
      state: 'set',
      value: cell,
      raw: cell,
      items: [cell],
      source: 'adr',
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Owned keys

test('owned key: the fast flag is enabled only by the literal true', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'executionProfiles.fast.enabled': 'true' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['executionProfiles.fast.enabled'].profile, 'enabled');
  assert.equal(data.values['executionProfiles.fast.enabled'].value, true);
});

test('owned key: the fast flag is disabled by literal false and by a missing row', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'executionProfiles.fast.enabled': 'false' }));
  const off = await resolved({ cwd: root, tool: 'build' });
  assert.equal(off.values['executionProfiles.fast.enabled'].profile, 'disabled');
  assert.equal(off.values['executionProfiles.fast.enabled'].state, 'set');
  write(root, SETUP_ADR, setupDocument({}));
  const missing = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(missing.values['executionProfiles.fast.enabled'], {
    state: 'unset',
    profile: 'disabled',
  });
});

test('owned key: a malformed or ambiguous fast flag is invalid and fails closed', async (t) => {
  const { root } = plainDirectory(t);
  for (const raw of ['True', '"true"', 'yes']) {
    write(root, SETUP_ADR, setupDocument({ 'executionProfiles.fast.enabled': raw }));
    const data = await resolved({ cwd: root, tool: 'build' });
    const entry = data.values['executionProfiles.fast.enabled'];
    assert.equal(entry.state, 'invalid', raw);
    assert.equal(entry.profile, 'invalid', raw);
    assert.deepEqual(diagnostic(data, 'invalid-value'), {
      code: 'invalid-value',
      key: 'executionProfiles.fast.enabled',
      raw,
    });
  }
  write(
    root,
    SETUP_ADR,
    setupDocument({ 'executionProfiles.fast.enabled': rowsOf('true', 'true') }),
  );
  const duplicate = await resolved({ cwd: root, tool: 'build' });
  assert.equal(duplicate.values['executionProfiles.fast.enabled'].profile, 'invalid');
  assert.ok(codes(duplicate).includes('ambiguous-key'));
});

test('owned key: delivery.prReview is invalid outside ask|always|off and unset when missing', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'delivery.prReview': 'sometimes' }));
  const invalid = await resolved({ cwd: root, tool: 'build' });
  assert.equal(invalid.values['delivery.prReview'].state, 'invalid');
  assert.deepEqual(diagnostic(invalid, 'invalid-value'), {
    code: 'invalid-value',
    key: 'delivery.prReview',
    raw: 'sometimes',
  });
  write(root, SETUP_ADR, setupDocument({ 'delivery.prReview': 'always' }));
  assert.equal(
    (await resolved({ cwd: root, tool: 'build' })).values['delivery.prReview'].value,
    'always',
  );
  write(root, SETUP_ADR, setupDocument({}));
  const unset = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(unset.values['delivery.prReview'], { state: 'unset' });
});

test('owned key: tracker.externalStartedState and externalDoneState are returned unvalidated', async (t) => {
  const { root } = plainDirectory(t);
  write(
    root,
    SETUP_ADR,
    setupDocument({
      'tracker.externalStartedState': 'state-123 ?!',
      'tracker.externalDoneState': 'null',
    }),
  );
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['tracker.externalStartedState'].value, 'state-123 ?!');
  assert.equal(data.values['tracker.externalDoneState'].value, null);
  assert.deepEqual(
    data.diagnostics.filter((entry) => entry.code === 'invalid-value'),
    [],
  );
});

// ---------------------------------------------------------------------------------------------
// Retired rows

// The test oracle for the successor sets, written out independently of the core's table: which
// retired rows of the sample each tool (mode) must stop on when the successor is absent.
const RETIRED_SAMPLE = Object.freeze({
  'worktree.baseBranch': 'delivery.baseBranch',
  'worktree.branchPrefix': 'delivery.branchPrefix',
  'worktree.completion': 'delivery.completion',
  'prReview.bots': 'mergeGate.bots',
  'prReview.botWaitMinutes': 'mergeGate.botWaitMinutes',
  'prReview.maxRounds': 'mergeGate.maxRounds',
});
const DELIVERY_ALL = ['worktree.baseBranch', 'worktree.branchPrefix', 'worktree.completion'];
const DELIVERY_BASE_PREFIX = ['worktree.baseBranch', 'worktree.branchPrefix'];
const RETIRED_CASES = [
  { tool: 'build', stops: DELIVERY_ALL },
  { tool: 'fix', stops: DELIVERY_ALL },
  { tool: 'docs', stops: DELIVERY_ALL },
  { tool: 'refactor', stops: DELIVERY_ALL },
  { tool: 'maintain', stops: DELIVERY_ALL },
  { tool: 'deliver', stops: DELIVERY_BASE_PREFIX, reports: ['worktree.completion'] },
  { tool: 'apply-issues', stops: DELIVERY_BASE_PREFIX },
  { tool: 'apply-review', mode: 'remote', stops: DELIVERY_BASE_PREFIX },
  { tool: 'apply-review', mode: 'local', stops: [] },
  { tool: 'pr', stops: ['worktree.baseBranch'] },
  { tool: 'iterate', mode: 'local', stops: ['worktree.baseBranch'] },
  { tool: 'iterate', mode: 'pr', stops: ['prReview.bots', 'prReview.botWaitMinutes'] },
  {
    tool: 'merge-gate',
    stops: ['prReview.bots', 'prReview.botWaitMinutes', 'prReview.maxRounds'],
  },
  { tool: 'plan', stops: [], unknown: true },
];

test('retired rows: the oracle covers every tool and mode the core names', () => {
  const covered = new Set(RETIRED_CASES.map((entry) => `${entry.tool}:${entry.mode ?? ''}`));
  for (const entry of SUCCESSOR_SETS) {
    assert.ok(covered.has(`${entry.tool}:${entry.mode ?? ''}`), `${entry.tool} ${entry.mode}`);
  }
  assert.ok(SUCCESSOR_SET_TOOLS.includes('setup'));
});

for (const { tool, mode, stops, reports = [], unknown = false } of RETIRED_CASES) {
  const label = mode ? `${tool} (${mode})` : tool;
  test(`retired rows for ${label}: a set successor absent stops, present reports, and others stay inert`, async (t) => {
    const { root } = plainDirectory(t);
    const input = mode ? { cwd: root, tool, mode } : { cwd: root, tool };
    const retiredRows = Object.fromEntries(Object.keys(RETIRED_SAMPLE).map((key) => [key, 'old']));
    for (const present of [false, true]) {
      const successorRows = present
        ? Object.fromEntries(Object.values(RETIRED_SAMPLE).map((key) => [key, 'new']))
        : {};
      write(root, SETUP_ADR, setupDocument({ ...retiredRows, ...successorRows }));
      const data = await resolved(input);
      assert.deepEqual(
        data.retired.map((entry) => entry.key),
        Object.keys(RETIRED_SAMPLE),
      );
      for (const entry of data.retired) {
        const expected = reports.includes(entry.key)
          ? 'report'
          : stops.includes(entry.key)
            ? present
              ? 'report'
              : 'stop'
            : 'none';
        assert.equal(entry.action, expected, `${label} ${entry.key} present=${present}`);
        assert.equal(entry.successor, RETIRED_SAMPLE[entry.key]);
        assert.equal(entry.successorPresent, present);
        assert.equal(Object.hasOwn(entry, 'raw'), false, 'only setup receives a retired raw value');
        assert.equal(
          Object.hasOwn(data.values, entry.key),
          false,
          'a retired row is never a value',
        );
      }
      assert.equal(codes(data).includes('unknown-tool'), unknown);
    }
  });
}

test('retired rows: deliver reports worktree.completion and never stops on it', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'worktree.completion': 'merge' }));
  const data = await resolved({ cwd: root, tool: 'deliver' });
  assert.deepEqual(data.retired, [
    {
      key: 'worktree.completion',
      successor: 'delivery.completion',
      successorPresent: false,
      action: 'report',
    },
  ]);
});

test('retired rows: setup is exempt and receives each raw value to carry over', async (t) => {
  const { root } = plainDirectory(t);
  write(
    root,
    SETUP_ADR,
    setupDocument({ 'worktree.baseBranch': 'origin/main', 'prReview.maxRounds': '3' }),
  );
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.deepEqual(data.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: false,
      action: 'none',
      raw: 'origin/main',
    },
    {
      key: 'prReview.maxRounds',
      successor: 'mergeGate.maxRounds',
      successorPresent: false,
      action: 'none',
      raw: '3',
    },
  ]);
  assert.ok(!codes(data).includes('unknown-tool'));
});

test('retired rows: iterate resolves delivery.baseBranch only in local mode and the bot keys only in PR mode', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'worktree.baseBranch': 'main', 'prReview.bots': 'bot' }));
  const local = await resolved({ cwd: root, tool: 'iterate', mode: 'local' });
  assert.deepEqual(
    local.retired.map((entry) => entry.action),
    ['stop', 'none'],
  );
  const pr = await resolved({ cwd: root, tool: 'iterate', mode: 'pr' });
  assert.deepEqual(
    pr.retired.map((entry) => entry.action),
    ['none', 'stop'],
  );
});

test('retired rows: a login-keyed prReview.bots subkey matches its successor across one trailing [bot]', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'prReview.bots.reviewer[bot].trigger': '/review' }));
  const absent = await resolved({ cwd: root, tool: 'iterate', mode: 'pr' });
  assert.deepEqual(absent.retired, [
    {
      key: 'prReview.bots.reviewer[bot].trigger',
      successor: 'mergeGate.bots.reviewer[bot].trigger',
      successorPresent: false,
      action: 'stop',
      conditional: 'reviewer-resolved',
      login: 'reviewer[bot]',
      normalizedLogin: 'reviewer',
    },
  ]);
  write(
    root,
    SETUP_ADR,
    setupDocument({
      'prReview.bots.reviewer[bot].trigger': '/review',
      'mergeGate.bots.reviewer.trigger': '/review',
    }),
  );
  const present = await resolved({ cwd: root, tool: 'merge-gate' });
  assert.equal(present.retired[0].successorPresent, true);
  assert.equal(present.retired[0].action, 'report');
  // A different subkey of the same reviewer is not the successor.
  write(
    root,
    SETUP_ADR,
    setupDocument({
      'prReview.bots.reviewer.check': 'ci',
      'mergeGate.bots.reviewer.trigger': '/review',
    }),
  );
  const otherSub = await resolved({ cwd: root, tool: 'merge-gate' });
  assert.equal(otherSub.retired[0].action, 'stop');
});

// Invariant: a retired row passes the same structural validation as every other row except
// `visibility` (a wrong cell count is `invalid-value`/`cell-count`, two or more rows of one key
// are `ambiguous-key`), and `retired` holds exactly one entry per retired key. An invalid retired
// row keeps the action a well-formed one gets, so invalidity never downgrades a stop to none, and
// setup receives state 'invalid' with no raw value, so it asks its invalid-source question instead
// of migrating the row.

test('retired rows: setup gets a malformed retired row as invalid with no raw value, beside a well-formed one that keeps its raw', async (t) => {
  const { root } = plainDirectory(t);
  write(
    root,
    SETUP_ADR,
    setupDocument({ 'worktree.baseBranch': 'main | extra', 'prReview.maxRounds': '3' }),
  );
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.deepEqual(diagnostic(data, 'invalid-value'), {
    code: 'invalid-value',
    key: 'worktree.baseBranch',
    raw: null,
    reason: 'cell-count',
  });
  assert.deepEqual(data.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: false,
      action: 'none',
      state: 'invalid',
      raw: null,
    },
    {
      key: 'prReview.maxRounds',
      successor: 'mergeGate.maxRounds',
      successorPresent: false,
      action: 'none',
      raw: '3',
    },
  ]);
  assert.equal(Object.hasOwn(data.values, 'worktree.baseBranch'), false);
  assert.equal(Object.hasOwn(data.values, 'prReview.maxRounds'), false);
});

test('retired rows: a malformed retired row for a non-setup tool keeps the successor-based action (fail closed: stop when the successor is absent)', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'worktree.baseBranch': 'main | extra' }));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(diagnostic(data, 'invalid-value'), {
    code: 'invalid-value',
    key: 'worktree.baseBranch',
    raw: null,
    reason: 'cell-count',
  });
  assert.deepEqual(data.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: false,
      action: 'stop',
      state: 'invalid',
    },
  ]);
  assert.equal(Object.hasOwn(data.values, 'worktree.baseBranch'), false);
});

test('retired rows: setup collapses duplicate rows of one retired key into one invalid entry with no raw value', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'worktree.baseBranch': rowsOf('main', 'develop') }));
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.deepEqual(diagnostic(data, 'ambiguous-key'), {
    code: 'ambiguous-key',
    key: 'worktree.baseBranch',
    count: 2,
  });
  assert.deepEqual(data.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: false,
      action: 'none',
      state: 'invalid',
      raw: null,
    },
  ]);
  assert.equal(Object.hasOwn(data.values, 'worktree.baseBranch'), false);
});

test('retired rows: duplicate rows of one retired key for a non-setup tool keep the successor-based action (fail closed: stop when the successor is absent, report when present)', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'worktree.baseBranch': rowsOf('main', 'develop') }));
  const absent = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(diagnostic(absent, 'ambiguous-key'), {
    code: 'ambiguous-key',
    key: 'worktree.baseBranch',
    count: 2,
  });
  assert.deepEqual(absent.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: false,
      action: 'stop',
      state: 'invalid',
    },
  ]);
  assert.equal(Object.hasOwn(absent.values, 'worktree.baseBranch'), false);
  write(
    root,
    SETUP_ADR,
    setupDocument({
      'worktree.baseBranch': rowsOf('main', 'develop'),
      'delivery.baseBranch': 'main',
    }),
  );
  const present = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(diagnostic(present, 'ambiguous-key'), {
    code: 'ambiguous-key',
    key: 'worktree.baseBranch',
    count: 2,
  });
  assert.deepEqual(present.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: true,
      action: 'report',
      state: 'invalid',
    },
  ]);
});

test('retired rows: duplicate prReview.maxRounds rows are one invalid entry for setup, merge-gate, and build, which keeps action none', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'prReview.maxRounds': rowsOf('3', '5') }));
  const expectedDiagnostic = { code: 'ambiguous-key', key: 'prReview.maxRounds', count: 2 };
  const base = {
    key: 'prReview.maxRounds',
    successor: 'mergeGate.maxRounds',
    successorPresent: false,
  };

  const setup = await resolved({ cwd: root, tool: 'setup' });
  assert.deepEqual(diagnostic(setup, 'ambiguous-key'), expectedDiagnostic);
  assert.deepEqual(setup.retired, [{ ...base, action: 'none', state: 'invalid', raw: null }]);

  const mergeGate = await resolved({ cwd: root, tool: 'merge-gate' });
  assert.deepEqual(diagnostic(mergeGate, 'ambiguous-key'), expectedDiagnostic);
  assert.deepEqual(mergeGate.retired, [{ ...base, action: 'stop', state: 'invalid' }]);

  // build does not resolve mergeGate.maxRounds: the diagnostic is still reported, the action is none.
  const build = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(diagnostic(build, 'ambiguous-key'), expectedDiagnostic);
  assert.deepEqual(build.retired, [{ ...base, action: 'none', state: 'invalid' }]);
  for (const data of [setup, mergeGate, build]) {
    assert.equal(Object.hasOwn(data.values, 'prReview.maxRounds'), false);
  }
});

// ---------------------------------------------------------------------------------------------
// Step 3: transitional JSON

test('step 3: the transitional .effective-flow/config.json is flattened, reported, and its retired rows classified', async (t) => {
  const { root } = repository(t);
  const path = write(
    root,
    join('.effective-flow', 'config.json'),
    JSON.stringify({
      review: { profile: 'deep', autoConfirmScope: false },
      skills: { exclude: [], include: ['a', 'b'] },
      applyReview: { defaultCommitStrategy: null },
      mergeGate: { maxRounds: 3 },
      worktree: { baseBranch: 'origin/main' },
      empty: {},
    }),
  );
  write(root, join('.firmo', 'config.json'), '{"review":{"profile":"firmo"}}');
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 3);
  assert.equal(data.source.path, path);
  assert.equal(data.source.language, null);
  assert.deepEqual(diagnostic(data, 'transitional-fallback'), {
    code: 'transitional-fallback',
    path,
  });
  assert.equal(data.values['review.profile'].value, 'deep');
  assert.equal(data.values['review.profile'].source, 'transitional-json');
  assert.equal(data.values['review.autoConfirmScope'].value, false);
  assert.deepEqual(data.values['skills.exclude'], {
    state: 'set',
    value: [],
    raw: '(empty)',
    items: [],
    source: 'transitional-json',
  });
  assert.equal(data.values['skills.include'].raw, 'a, b');
  assert.deepEqual(data.values['skills.include'].value, ['a', 'b']);
  assert.equal(data.values['applyReview.defaultCommitStrategy'].value, null);
  assert.equal(data.values['mergeGate.maxRounds'].value, '3');
  assert.deepEqual(data.retired, [
    {
      key: 'worktree.baseBranch',
      successor: 'delivery.baseBranch',
      successorPresent: false,
      action: 'stop',
    },
  ]);
});

test('step 3: the .firmo/config.json fallback is read when .effective-flow/config.json is absent', async (t) => {
  const { root } = repository(t);
  const path = write(
    root,
    join('.firmo', 'config.json'),
    '{"review":{"profile":"firmo"},"prReview":{"maxRounds":2},"mergeGate":{"maxRounds":4}}',
  );
  const data = await resolved({ cwd: root, tool: 'merge-gate' });
  assert.equal(data.source.step, 3);
  assert.equal(data.source.path, path);
  assert.equal(data.values['review.profile'].value, 'firmo');
  assert.deepEqual(data.retired, [
    {
      key: 'prReview.maxRounds',
      successor: 'mergeGate.maxRounds',
      successorPresent: true,
      action: 'report',
    },
  ]);
});

// Invariant: a transitional JSON key `__proto__` (an own property after JSON.parse) flattens to a
// row that stays an own entry of `values` beside the ordinary keys, and replaces no prototype.
test('step 3: a transitional JSON __proto__ key stays an own values entry', async (t) => {
  const { root } = repository(t);
  // Raw text on purpose: JSON.stringify of an object literal would drop the __proto__ key.
  write(root, join('.effective-flow', 'config.json'), '{"__proto__":"x","plan":{"dir":"json"}}');
  const data = await resolved({ cwd: root, tool: 'setup' });
  assert.equal(data.source.step, 3);
  assert.equal(Object.getPrototypeOf(data.values), Object.prototype);
  assert.ok(Object.hasOwn(data.values, '__proto__'), 'the __proto__ row is an own entry');
  const entry = Object.getOwnPropertyDescriptor(data.values, '__proto__')?.value;
  assert.equal(entry?.value, 'x');
  assert.equal(entry?.raw, 'x');
  assert.equal(entry?.source, 'transitional-json');
  assert.equal(data.values['plan.dir'].value, 'json');
});

test('step 3: unparseable JSON is reported as an invalid source and resolution falls to step 4', async (t) => {
  const { root } = repository(t);
  write(root, join('.effective-flow', 'config.json'), '{ not json');
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 4);
  assert.equal(diagnostic(data, 'invalid-source').step, 3);
  write(root, join('.effective-flow', 'config.json'), '[1]');
  const array = await resolved({ cwd: root, tool: 'build' });
  assert.equal(array.source.step, 4);
  assert.ok(codes(array).includes('invalid-source'));
});

// Invariant: the strict Boolean fast flag fails closed on a transitional JSON source. Only a JSON
// Boolean counts; a JSON string "true" or a one-item list [true] flattens to the raw cell `true`
// but must never resolve to `enabled`.
test('step 3: the fast flag is enabled only by a JSON boolean true and is invalid as the string "true"', async (t) => {
  const { root } = repository(t);
  const configPath = join('.effective-flow', 'config.json');
  const fastFlag = async (value) => {
    write(root, configPath, JSON.stringify({ executionProfiles: { fast: { enabled: value } } }));
    const data = await resolved({ cwd: root, tool: 'build' });
    assert.equal(data.source.step, 3);
    return data;
  };

  const enabled = await fastFlag(true);
  assert.equal(enabled.values['executionProfiles.fast.enabled'].profile, 'enabled');
  assert.equal(enabled.values['executionProfiles.fast.enabled'].value, true);

  const disabled = await fastFlag(false);
  assert.equal(disabled.values['executionProfiles.fast.enabled'].profile, 'disabled');
  assert.equal(disabled.values['executionProfiles.fast.enabled'].state, 'set');

  for (const value of ['true', 'false', ['true'], [true], 1, null]) {
    const data = await fastFlag(value);
    const entry = data.values['executionProfiles.fast.enabled'];
    assert.equal(entry.state, 'invalid', JSON.stringify(value));
    assert.equal(entry.profile, 'invalid', JSON.stringify(value));
    assert.equal(diagnostic(data, 'invalid-value')?.key, 'executionProfiles.fast.enabled');
  }

  write(root, configPath, JSON.stringify({ review: { profile: 'deep' } }));
  const missing = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(missing.values['executionProfiles.fast.enabled'], {
    state: 'unset',
    profile: 'disabled',
  });
});

// ---------------------------------------------------------------------------------------------
// Roots

test('roots: a non-Git directory runs steps 1, 2 and 4 only', async (t) => {
  const { root } = plainDirectory(t);
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden' }));
  write(root, join('.effective-flow', 'config.json'), '{"plan":{"dir":"json"}}');
  const withoutAdr = await resolved({ cwd: root, tool: 'build' });
  assert.equal(withoutAdr.runtimeStateRoot, null);
  assert.equal(withoutAdr.checkoutRoot, root);
  assert.equal(withoutAdr.visibility, 'standard');
  assert.equal(withoutAdr.source.step, 4, 'steps 0 and 3 are skipped outside Git');
  assert.deepEqual(withoutAdr.diagnostics, []);
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'adr' }));
  const withAdr = await resolved({ cwd: root, tool: 'build' });
  assert.equal(withAdr.source.step, 2);
});

test('roots: step 4 reports no source and only the always-present owned keys', async (t) => {
  const { root } = repository(t);
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.deepEqual(data.source, {
    step: 4,
    path: null,
    language: null,
    legacyMarker: false,
    legacySlug: false,
    prefixed: false,
  });
  assert.deepEqual(Object.keys(data.values).sort(), [
    'delivery.prReview',
    'executionProfiles.fast.enabled',
  ]);
  assert.deepEqual(data.retired, []);
  assert.deepEqual(data.diagnostics, []);
});

test('roots: a bare main record stops with exit 3 and never falls through', async (t) => {
  const { base, root } = repository(t);
  const bare = join(base, 'bare.git');
  git(base, 'clone', '--quiet', '--bare', root, bare);
  const linked = join(base, 'from-bare');
  git(bare, 'worktree', 'add', '--quiet', linked, 'main');
  write(linked, SETUP_ADR, setupDocument({ 'plan.dir': 'x' }));
  const envelope = await refused({ cwd: linked, tool: 'build' });
  assert.equal(envelope.error.code, 'RUNTIME_ROOT_UNVERIFIED');
  assert.equal(envelope.error.details.check, 'bare');
  assert.equal(exitCodeFor(envelope), 3);
});

for (const [check, porcelain] of [
  ['missing-path', 'HEAD 0000000000000000000000000000000000000000\0branch refs/heads/main\0\0'],
  ['missing-path', 'worktree \0HEAD 0000000000000000000000000000000000000000\0\0'],
  ['missing-path', 'worktree /a\0worktree /b\0\0'],
  ['moved', 'worktree /nonexistent/effective-flow-moved-checkout\0HEAD 00\0\0'],
]) {
  test(`roots: a ${check} main record (${JSON.stringify(porcelain.split('\0')[0])}) stops with exit 3`, async (t) => {
    const { root } = repository(t);
    write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'x' }));
    const runner = fakeRunner((call) =>
      isCall(call, 'worktree', 'list') ? gitResult(porcelain) : undefined,
    );
    const envelope = await refused({ cwd: root, tool: 'build' }, { runner });
    assert.equal(envelope.error.code, 'RUNTIME_ROOT_UNVERIFIED');
    assert.equal(envelope.error.details.check, check);
    assert.equal(exitCodeFor(envelope), 3);
  });
}

test('roots: a failed worktree listing stops with exit 3', async (t) => {
  const { root } = repository(t);
  const runner = fakeRunner((call) =>
    isCall(call, 'worktree', 'list') ? gitResult('', 128, 'fatal: broken\n') : undefined,
  );
  const envelope = await refused({ cwd: root, tool: 'build' }, { runner });
  assert.equal(envelope.error.details.check, 'porcelain-failed');
});

test('roots: a main record that is not its own toplevel stops with exit 3', async (t) => {
  const { base, root } = repository(t);
  const linked = join(base, 'linked');
  git(root, 'worktree', 'add', '--quiet', '-b', 'feature', linked);
  const runner = fakeRunner((call) =>
    call.cwd === root && isCall(call, '--show-toplevel') ? gitResult(`${linked}\n`) : undefined,
  );
  const envelope = await refused({ cwd: linked, tool: 'build' }, { runner });
  assert.equal(envelope.error.details.check, 'toplevel-mismatch');
});

test('roots: a main record of another repository stops with exit 3 (common-dir mismatch)', async (t) => {
  const { base, root } = repository(t);
  const linked = join(base, 'linked');
  git(root, 'worktree', 'add', '--quiet', '-b', 'feature', linked);
  const foreign = initRepository(join(base, 'foreign'));
  const runner = fakeRunner((call) =>
    call.cwd === root && isCall(call, '--git-common-dir')
      ? gitResult(`${join(foreign, '.git')}\n`)
      : undefined,
  );
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden' }));
  const envelope = await refused({ cwd: linked, tool: 'build' }, { runner });
  assert.equal(envelope.error.code, 'RUNTIME_ROOT_UNVERIFIED');
  assert.equal(envelope.error.details.check, 'common-dir-mismatch');
  assert.equal(exitCodeFor(envelope), 3);
});

test('roots: git that cannot run is GIT_FAILED with exit 1', async (t) => {
  const { root } = plainDirectory(t);
  const runner = async () => ({
    status: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    error: new Error('spawn git ENOENT'),
  });
  const envelope = await refused({ cwd: root, tool: 'build' }, { runner });
  assert.equal(envelope.error.code, 'GIT_FAILED');
  assert.equal(exitCodeFor(envelope), 1);
});

// Resolves from the main checkout and from a linked worktree of a real repository whose main
// checkout directory is named `mainName`, and asserts that the main checkout is the verified
// runtime-state root that carries the step-0 hidden configuration in both runs.
async function assertMainCheckoutRoot(t, mainName) {
  const { directory } = tempDir(t);
  try {
    mkdirSync(join(directory, mainName));
  } catch (error) {
    t.skip(`this filesystem cannot create ${JSON.stringify(mainName)}: ${error.code}`);
    return;
  }
  const root = realpathSync(initRepository(join(directory, mainName)));
  const linked = join(directory, 'über linked');
  git(root, 'worktree', 'add', '--quiet', '-b', 'feature', linked);
  write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden' }));
  for (const [cwd, checkoutRoot] of [
    [root, root],
    [linked, realpathSync(linked)],
  ]) {
    const data = await resolved({ cwd, tool: 'build' });
    assert.equal(data.runtimeStateRoot, root);
    assert.equal(data.checkoutRoot, checkoutRoot);
    assert.equal(data.visibility, 'hidden');
    assert.equal(data.source.step, 0);
    assert.equal(data.source.path, join(root, LOCAL_SETUP));
  }
}

// Guard: git leaves non-ASCII and spaces unquoted in porcelain output, so this already resolves.
test('roots: a main checkout path with non-ASCII and a space is the runtime-state root', async (t) => {
  await assertMainCheckoutRoot(t, 'über main checkout');
});

test('roots: a main checkout path containing a newline is the runtime-state root', async (t) => {
  await assertMainCheckoutRoot(t, 'über main\ncheckout');
});

// Invariant: Git path output is taken literally except for its one line terminator, so trailing
// whitespace that belongs to the checkout path survives.
test('roots: a main checkout path ending in whitespace is the runtime-state root', async (t) => {
  await t.test('trailing space', (t) => assertMainCheckoutRoot(t, 'über main checkout '));
  await t.test('trailing tab', (t) => assertMainCheckoutRoot(t, 'über main checkout\t'));
});

test('roots: a NUL-delimited worktree listing yields the first record as the runtime-state root', async (t) => {
  const { root } = repository(t);
  const sha = git(root, 'rev-parse', 'HEAD');
  const porcelain =
    `worktree ${root}\0HEAD ${sha}\0branch refs/heads/main\0\0` +
    `worktree ${join(root, '..', 'other')}\0HEAD ${sha}\0detached\0\0`;
  const runner = fakeRunner((call) =>
    isCall(call, 'worktree', 'list') ? gitResult(porcelain) : undefined,
  );
  const data = await resolved({ cwd: root, tool: 'build' }, { runner });
  assert.equal(data.runtimeStateRoot, root);
  assert.equal(data.checkoutRoot, root);
});

// ---------------------------------------------------------------------------------------------
// Containment

test('containment: a symlinked step-0 file stops with exit 3 and never falls back to the ADR', async (t) => {
  const { base, root } = repository(t);
  const outside = write(base, 'outside.md', setupDocument({ visibility: 'hidden' }));
  mkdirSync(join(root, '.effective-flow'), { recursive: true });
  symlinkSync(outside, join(root, LOCAL_SETUP));
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'tracked' }));
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(envelope.error.details, {
    step: 0,
    path: join(root, LOCAL_SETUP),
    reason: 'symlink',
  });
  assert.equal(exitCodeFor(envelope), 3);
});

test('containment: a step-0 file reached through a symlinked .effective-flow directory escapes the root', async (t) => {
  const { base, root } = repository(t);
  write(base, join('elsewhere', 'project-setup.md'), setupDocument({ visibility: 'hidden' }));
  symlinkSync(join(base, 'elsewhere'), join(root, '.effective-flow'));
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.details.reason, 'escapes-root');
  assert.equal(envelope.error.details.step, 0);
});

test('containment: a step-0 path that is not a regular file stops with exit 3', async (t) => {
  const { root } = repository(t);
  mkdirSync(join(root, LOCAL_SETUP), { recursive: true });
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.details.reason, 'not-regular-file');
});

test('containment: an unreadable step-0 file stops with exit 3', async (t) => {
  const { root, restore } = repository(t);
  const target = write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden' }));
  if (!makeUnreadable(restore, target)) {
    t.skip('this process can read a mode-000 file');
    return;
  }
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.equal(envelope.error.details.reason, 'unreadable');
  assert.equal(exitCodeFor(envelope), 3);
});

test('containment: a symlinked step-3 JSON stops with exit 3', async (t) => {
  const { base, root } = repository(t);
  const outside = write(base, 'config.json', '{"plan":{"dir":"outside"}}');
  mkdirSync(join(root, '.effective-flow'), { recursive: true });
  symlinkSync(outside, join(root, '.effective-flow', 'config.json'));
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(envelope.error.details, {
    step: 3,
    path: join(root, '.effective-flow', 'config.json'),
    reason: 'symlink',
  });
});

test('containment: an unreadable step-3 JSON stops with exit 3', async (t) => {
  const { root, restore } = repository(t);
  const target = write(root, join('.firmo', 'config.json'), '{}');
  if (!makeUnreadable(restore, target)) {
    t.skip('this process can read a mode-000 file');
    return;
  }
  const envelope = await refused({ cwd: root, tool: 'build' });
  assert.equal(envelope.error.details.reason, 'unreadable');
  assert.equal(envelope.error.details.step, 3);
});

// Swaps the step-0 file right after the resolver canonicalized it, so the read sees the replacement.
function swapAfterRealpath(target, swap) {
  let swapped = false;
  return {
    ...fsPromises,
    realpath: async (value) => {
      const canonical = await fsPromises.realpath(value);
      if (!swapped && value === target) {
        swapped = true;
        swap();
      }
      return canonical;
    },
  };
}

// Invariant: a runtime-state file is read from its verified canonical path through a no-follow open,
// and the opened handle must be a regular file; a swap after the checks never reads past them.
test('containment: a step-0 file swapped for a symlink after verification stops as a symlink', async (t) => {
  const { base, root } = repository(t);
  const outside = write(base, 'outside.md', setupDocument({ visibility: 'hidden' }));
  const target = write(root, LOCAL_SETUP, '# not hidden\n');
  const fs = swapAfterRealpath(target, () => {
    rmSync(target);
    symlinkSync(outside, target);
  });
  const envelope = await refused({ cwd: root, tool: 'build' }, { fs });
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(envelope.error.details, { step: 0, path: target, reason: 'symlink' });
  assert.equal(exitCodeFor(envelope), 3);
});

test('containment: a step-0 file swapped for a directory after verification is not a regular file', async (t) => {
  const { root } = repository(t);
  const target = write(root, LOCAL_SETUP, setupDocument({ visibility: 'hidden' }));
  const fs = swapAfterRealpath(target, () => {
    rmSync(target);
    mkdirSync(target);
  });
  const envelope = await refused({ cwd: root, tool: 'build' }, { fs });
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.deepEqual(envelope.error.details, { step: 0, path: target, reason: 'not-regular-file' });
});

test('containment: a marker target symlinked outside the checkout root is a dead marker', async (t) => {
  const { base, root } = repository(t);
  const outside = write(base, 'outside-setup.md', setupDocument({ 'plan.dir': 'outside' }));
  symlinkSync(outside, join(root, 'setup.md'));
  write(root, 'AGENTS.md', '**Effective Flow project setup:** setup.md\n');
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 4);
  assert.deepEqual(diagnostic(data, 'dead-marker'), {
    code: 'dead-marker',
    markerFile: join(root, 'AGENTS.md'),
    path: join(root, 'setup.md'),
    reason: 'outside-root',
  });
});

test('containment: an ADR candidate symlinked outside the checkout root is no match', async (t) => {
  const { base, root } = repository(t);
  const outside = write(base, 'outside-setup.md', setupDocument({ 'plan.dir': 'outside' }));
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  symlinkSync(outside, join(root, SETUP_ADR));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.source.step, 4);
  assert.deepEqual(diagnostic(data, 'candidate-outside-root'), {
    code: 'candidate-outside-root',
    path: join(root, SETUP_ADR),
  });
});

test('containment: a symlink that stays inside the checkout root is followed', async (t) => {
  const { root } = repository(t);
  write(root, join('config', 'real.md'), setupDocument({ 'plan.dir': 'inside' }));
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  symlinkSync(join(root, 'config', 'real.md'), join(root, SETUP_ADR));
  const data = await resolved({ cwd: root, tool: 'build' });
  assert.equal(data.values['plan.dir'].value, 'inside');
});

// ---------------------------------------------------------------------------------------------
// Input

test('input: a missing or empty tool is invalid input with exit 2', async (t) => {
  const { root } = plainDirectory(t);
  for (const input of [{ cwd: root }, { cwd: root, tool: '' }, { cwd: root, tool: 3 }]) {
    const envelope = await refused(input);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.equal(envelope.error.details.field, 'tool');
    assert.equal(exitCodeFor(envelope), 2);
  }
});

test('input: iterate and apply-review require a valid mode', async (t) => {
  const { root } = plainDirectory(t);
  for (const input of [
    { cwd: root, tool: 'iterate' },
    { cwd: root, tool: 'iterate', mode: 'remote' },
    { cwd: root, tool: 'apply-review' },
    { cwd: root, tool: 'apply-review', mode: 'pr' },
  ]) {
    const envelope = await refused(input);
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
    assert.equal(envelope.error.details.field, 'mode');
  }
});

test('input: a mode supplied for another tool is ignored', async (t) => {
  const { root } = plainDirectory(t);
  const data = await resolved({ cwd: root, tool: 'build', mode: 'anything' });
  assert.equal(data.source.step, 4);
});

test('input: an unknown tool resolves with action none and the unknown-tool diagnostic', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'worktree.baseBranch': 'main' }));
  const data = await resolved({ cwd: root, tool: 'no-such-tool' });
  assert.deepEqual(diagnostic(data, 'unknown-tool'), {
    code: 'unknown-tool',
    tool: 'no-such-tool',
  });
  assert.equal(data.retired[0].action, 'none');
});

// Invariant: the deprecated pr-review alias forwards to merge-gate, so it resolves merge-gate's
// successor set and keeps its retired-row stops instead of becoming an unknown tool.
test('input: the deprecated pr-review alias resolves exactly as merge-gate', async (t) => {
  const { root } = plainDirectory(t);
  write(root, SETUP_ADR, setupDocument({ 'prReview.maxRounds': '3', 'worktree.baseBranch': 'x' }));
  const alias = await resolved({ cwd: root, tool: 'pr-review' });
  const target = await resolved({ cwd: root, tool: 'merge-gate' });
  assert.deepEqual(alias, target);
  assert.ok(!codes(alias).includes('unknown-tool'));
  assert.deepEqual(
    alias.retired.map((entry) => [entry.key, entry.action]),
    [
      ['prReview.maxRounds', 'stop'],
      ['worktree.baseBranch', 'none'],
    ],
  );
  assert.deepEqual({ ...TOOL_ALIASES }, { 'pr-review': 'merge-gate' });
  for (const alias of Object.keys(TOOL_ALIASES)) {
    assert.ok(!SUCCESSOR_SET_TOOLS.includes(alias), `${alias} carries no successor set of its own`);
  }
});

// Invariant: the build guard that pins the resolver's alias map to DEPRECATED_TOOL_ALIASES reports
// a divergence in either direction and stays silent only on an exact match.
test('input: toolAliasDivergence reports a missing, an extra, and a retargeted alias', () => {
  assert.deepEqual(toolAliasDivergence([{ alias: 'pr-review', replacement: 'merge-gate' }]), []);
  assert.equal(toolAliasDivergence([]).length, 1, 'a resolver alias the build no longer declares');
  assert.equal(
    toolAliasDivergence([
      { alias: 'pr-review', replacement: 'merge-gate' },
      { alias: 'old-name', replacement: 'build' },
    ]).length,
    1,
    'a declared alias the resolver does not know',
  );
  assert.equal(
    toolAliasDivergence([{ alias: 'pr-review', replacement: 'iterate' }]).length,
    1,
    'an alias forwarding to a different tool',
  );
});

test('input: unknown fields, a relative cwd and a missing cwd are invalid input', async (t) => {
  const { root } = plainDirectory(t);
  for (const input of [
    { cwd: root, tool: 'build', extra: true },
    { cwd: 'relative/path', tool: 'build' },
    { cwd: join(root, 'missing'), tool: 'build' },
    { tool: 'build' },
  ]) {
    const envelope = await refused(input);
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
  }
  const unknownOperation = await executeOperation('write', { cwd: root, tool: 'build' });
  assert.equal(unknownOperation.error.code, 'INVALID_INPUT');
});

test('diagnostics: every emitted code belongs to the closed set', async (t) => {
  const { root } = repository(t);
  write(root, 'AGENTS.md', '**Firmo project setup:** missing.md\n');
  write(root, join('docs', 'adr', 'firmo-project-setup.md'), setupDocument({ 'x.y': '(leer)' }));
  const data = await resolved({ cwd: root, tool: 'no-such-tool' });
  assert.ok(data.diagnostics.length >= 4);
  for (const code of codes(data)) assert.ok(DIAGNOSTIC_CODES.includes(code), code);
});

// ---------------------------------------------------------------------------------------------
// CLI

function runCli(args, input, env = process.env) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    input,
    env,
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `exactly one envelope line on stdout: ${result.stdout}`);
  return { status: result.status, envelope: JSON.parse(lines[0]), stderr: result.stderr };
}

test('cli: a successful resolve prints one envelope line and exits 0', (t) => {
  const { root } = repository(t);
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'docs/plan' }));
  const { status, envelope, stderr } = runCli(
    ['resolve'],
    JSON.stringify({ cwd: root, tool: 'build' }),
  );
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.values['plan.dir'].value, 'docs/plan');
});

// Invariant: the CLI envelope carries a `__proto__` configuration row as a serialized key, so the
// setup rewrite that consumes the envelope does not lose it.
test('cli: a __proto__ configuration row survives into the printed envelope', (t) => {
  const { root } = repository(t);
  write(root, SETUP_ADR, setupDocument({ ['__proto__']: 'x', 'plan.dir': 'docs/plan' }));
  const input = JSON.stringify({ cwd: root, tool: 'setup' });
  const raw = spawnSync(process.execPath, [CLI, 'resolve'], { encoding: 'utf8', input });
  assert.ok(raw.stdout.includes('"__proto__":'), 'stdout serializes the __proto__ key');
  const { status, envelope } = runCli(['resolve'], input);
  assert.equal(status, 0);
  assert.ok(Object.hasOwn(envelope.data.values, '__proto__'), 'the __proto__ row is an own entry');
  assert.equal(envelope.data.values['__proto__'].raw, 'x');
  assert.equal(envelope.data.values['plan.dir'].value, 'docs/plan');
});

test('cli: invalid input exits 2 with CODE: message on stderr', () => {
  for (const [args, input] of [
    [['resolve'], '{ not json'],
    [['resolve'], '[]'],
    [['resolve'], JSON.stringify({ cwd: '/', tool: 'iterate' })],
    [['lint'], '{}'],
    [[], '{}'],
  ]) {
    const { status, envelope, stderr } = runCli(args, input);
    assert.equal(status, 2, `${args} ${input}`);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.match(stderr, /^INVALID_INPUT: /);
  }
});

test('cli: an unsafe runtime-state file exits 3', (t) => {
  const { base, root } = repository(t);
  const outside = write(base, 'outside.md', setupDocument({ visibility: 'hidden' }));
  mkdirSync(join(root, '.effective-flow'), { recursive: true });
  symlinkSync(outside, join(root, LOCAL_SETUP));
  const { status, envelope, stderr } = runCli(
    ['resolve'],
    JSON.stringify({ cwd: root, tool: 'build' }),
  );
  assert.equal(status, 3);
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.match(stderr, /^RUNTIME_STATE_UNSAFE: /);
});

// Invariant: the CLI maps a hidden declaration in a multi-envelope step-0 file to exit 3.
test('cli: a hidden local file with several envelopes exits 3', (t) => {
  const { root } = repository(t);
  write(
    root,
    LOCAL_SETUP,
    setupDocument({ 'review.profile': 'deep' }) +
      '\n' +
      setupDocument({ visibility: 'hidden' }, { language: 'de' }),
  );
  write(root, SETUP_ADR, setupDocument({ 'plan.dir': 'tracked' }));
  const { status, envelope, stderr } = runCli(
    ['resolve'],
    JSON.stringify({ cwd: root, tool: 'build' }),
  );
  assert.equal(status, 3);
  assert.equal(envelope.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.equal(envelope.error.details.reason, 'hidden-file-multiple-envelopes');
  assert.match(stderr, /^RUNTIME_STATE_UNSAFE: /);
});

test('cli: git that cannot be found exits 1', (t) => {
  const { root } = plainDirectory(t);
  const { status, envelope } = runCli(['resolve'], JSON.stringify({ cwd: root, tool: 'build' }), {
    PATH: '',
  });
  assert.equal(status, 1);
  assert.equal(envelope.error.code, 'GIT_FAILED');
});

test('cli: main accepts injected io and reports the exit code through setExitCode', async (t) => {
  const { root } = plainDirectory(t);
  let out = '';
  let err = '';
  let exitCode = 0;
  const io = {
    input: { cwd: root, tool: 'iterate' },
    stdout: { write: (text) => (out += text) },
    stderr: { write: (text) => (err += text) },
    setExitCode: (code) => (exitCode = code),
  };
  const envelope = await main(['resolve'], io);
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(out).ok, false);
  assert.match(err, /^INVALID_INPUT: /);
});
