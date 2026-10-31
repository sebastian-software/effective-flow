import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

import {
  CONFIG_RESOLVE_ERROR_CODES,
  DIAGNOSTIC_CODES,
  ROOT_CHECKS,
  UNSAFE_REASONS,
  createProcessRunner,
} from '../src/scripts/config-resolve-core.mjs';
import {
  RELEASE_LATEST_URL,
  RELEASE_REQUEST_HEADERS,
  REMEDIATIONS,
  REMEDIATION_COVERAGE,
  SETUP_FORMS,
  compareSemver,
  domainOwnersFrom,
  executeOperation,
  exposedToolsReaching,
  releaseSemver,
} from '../src/scripts/setup-status-core.mjs';
import { main } from '../src/scripts/setup-status.mjs';
import {
  deriveSetupStatusProjection,
  parseSkillOwnershipManifest,
  parseSpawnSiteTable,
  extractFrontmatter,
  resolveAgentTier,
} from '../build-lib.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/setup-status.mjs', import.meta.url));
// An empty HOME and XDG_CONFIG_HOME keep the developer's global Git configuration and excludes
// (`~/.gitconfig`, `~/.config/git/ignore`) out of every fixture command and every status run, so
// `check-ignore` decides from the fixture alone.
const ISOLATED_HOME = realpathSync(
  mkdtempSync(join(tmpdir(), 'effective-flow-setup-status-home-')),
);
after(() => rmSync(ISOLATED_HOME, { recursive: true, force: true }));
const GIT_ENV = {
  ...process.env,
  HOME: ISOLATED_HOME,
  XDG_CONFIG_HOME: ISOLATED_HOME,
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

function tempDir(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-setup-status-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function write(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function setupDocument(rows) {
  const table = Object.entries(rows)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n');
  return `# Effective Flow project setup\n\n## Status\n\nActive\n\n## Configuration\n\n| Key | Value |\n| --- | --- |\n${table}\n`;
}

// A committed repository; `files` are committed, `untracked` are written afterwards.
function repository(t, { files = {}, untracked = {} } = {}) {
  const base = tempDir(t);
  const root = join(base, 'main');
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch=main');
  write(root, 'tracked.txt', 'tracked\n');
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'fixture');
  for (const [path, content] of Object.entries(untracked)) write(root, path, content);
  return { base, root };
}

function commonDir(root) {
  return git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
}

function addExcludeEntry(root) {
  const exclude = join(commonDir(root), 'info', 'exclude');
  mkdirSync(dirname(exclude), { recursive: true });
  writeFileSync(exclude, `${readFileOr(exclude, '')}.effective-flow/\n`);
}

function readFileOr(path, fallback) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return fallback;
  }
}

const PROJECTION = {
  schemaVersion: 1,
  version: '1.68.0',
  exposedTools: [
    'apply',
    'build',
    'commit',
    'deliver',
    'docs',
    'fix',
    'issue-buddy',
    'iterate',
    'maintain',
    'merge-gate',
    'pr',
    'refactor',
    'setup',
  ],
  workflowEdges: [
    { from: 'merge-gate', to: 'iterate', mode: 'pr' },
    ...['apply-plan', 'apply-issues', 'apply-review', 'iterate'].flatMap((from) =>
      ['build', 'fix', 'refactor', 'docs'].map((to) => ({ from, to, mode: null })),
    ),
    { from: 'deliver', to: 'commit', mode: null },
    { from: 'deliver', to: 'pr', mode: null },
    { from: 'apply', to: 'apply-plan' },
    { from: 'apply', to: 'apply-review' },
    { from: 'apply', to: 'apply-issues' },
  ],
  owners: [
    {
      skill: 'effective-delivery',
      consumer: 'commit',
      consumerKind: 'tool',
      classification: 'delegate',
      tools: ['commit'],
      reach: [{ tool: 'commit', scope: 'tools.commit' }],
    },
    {
      skill: 'effective-delivery',
      consumer: 'docs-writer',
      consumerKind: 'agent',
      classification: 'delegate',
      tools: ['build', 'docs'],
      reach: [
        { tool: 'build', scope: 'agents.docs-writer' },
        { tool: 'docs', scope: 'agents.docs-writer' },
      ],
    },
    {
      skill: 'effective-writing',
      consumer: 'language-rules',
      consumerKind: 'shared',
      classification: 'delegate',
      tools: ['build', 'commit'],
      reach: [
        { tool: 'build', scope: 'agents.docs-writer' },
        { tool: 'commit', scope: 'tools.commit' },
      ],
    },
  ],
};

function projectionFile(t, projection = PROJECTION) {
  const file = join(tempDir(t), 'setup-status-owners.json');
  writeFileSync(file, typeof projection === 'string' ? projection : JSON.stringify(projection));
  return file;
}

function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, text: async () => text };
}

// Records every call; `respond` builds the response or throws.
function fakeFetch(respond = () => jsonResponse(200, { tag_name: 'effective-flow-v1.68.0' })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch, calls };
}

async function status(t, cwd, deps = {}) {
  const envelope = await executeOperation(
    'status',
    { cwd },
    {
      env: GIT_ENV,
      fetch: fakeFetch().fetch,
      projectionPath: projectionFile(t),
      ...deps,
    },
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.operation, 'status');
  return envelope.data;
}

// Every path below `root`, `.git/` included, with its type, mode, bytes digest and mtime.
function snapshot(root) {
  const entries = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      const record = [relative(root, path), stat.mode, stat.mtimeMs];
      if (stat.isSymbolicLink()) record.push('link', readlinkSync(path));
      else if (stat.isDirectory()) {
        record.push('dir');
        entries.push(record);
        visit(path);
        continue;
      } else {
        record.push('file', createHash('sha256').update(readFileSync(path)).digest('hex'));
      }
      entries.push(record);
    }
  };
  visit(root);
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Remediation map

test('the remediation map covers exactly the resolver codes and detail values it can meet', () => {
  // Invariant: every resolver outcome the status report can render has frozen remediation data, and
  // a code added to or removed from config-resolve-core.mjs fails here until the map follows.
  const keys = (map) => Object.keys(map).sort();
  assert.deepEqual(keys(REMEDIATIONS.diagnostics), [...DIAGNOSTIC_CODES].sort());
  assert.deepEqual(keys(REMEDIATIONS.errors), [...CONFIG_RESOLVE_ERROR_CODES].sort());
  assert.deepEqual(keys(REMEDIATIONS.rootChecks), [...ROOT_CHECKS].sort());
  assert.deepEqual(keys(REMEDIATIONS.unsafeReasons), [...UNSAFE_REASONS].sort());
  assert.equal(REMEDIATION_COVERAGE.diagnostics, DIAGNOSTIC_CODES);
  assert.ok(Object.isFrozen(REMEDIATIONS));
  assert.ok(Object.isFrozen(REMEDIATIONS.diagnostics['dead-marker']));
  // Each retired-row shape the resolver reports, each disabling cause and a missing owner have
  // their own frozen text.
  assert.deepEqual(keys(REMEDIATIONS.retired), ['invalid', 'migrate', 'reviewerResolved']);
  // Every `invalid-value` shape other than a value-domain one on a key Targeted accepts.
  assert.deepEqual(keys(REMEDIATIONS.invalidValue), [
    'cell-count',
    'fastProfile',
    'hiddenForced',
    'visibility',
  ]);
  assert.ok(Object.isFrozen(REMEDIATIONS.invalidValue));
  assert.deepEqual(keys(REMEDIATIONS.ownerDisabled), ['exclude', 'skills.enabled']);
  assert.equal(typeof REMEDIATIONS.ownerMissing.remediation, 'string');
  assert.ok(Object.isFrozen(REMEDIATIONS.retired.invalid));
});

test('every setup-fixable remediation names exactly the setup form it records', () => {
  // Invariant: a status report can recommend the single setup form that fixes everything setup can
  // fix, so `setupForm` is set exactly for setup-fixable entries and matches the remediation text.
  const all = [];
  const collect = (value) => {
    if (value && typeof value.remediation === 'string') all.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(REMEDIATIONS);
  const named = {
    setup: /`effective-flow setup`/,
    'setup guided': /`effective-flow setup guided`/,
    'setup hidden': /`effective-flow setup hidden`/,
    targeted: /\(a Targeted request\)/,
    allowlist: /`effective-flow setup allowlist`/,
  };
  assert.deepEqual(Object.keys(named), [...SETUP_FORMS]);
  for (const { remediation, setupFixable, setupForm } of all) {
    if (!setupFixable) {
      assert.equal(setupForm, null, remediation);
      continue;
    }
    assert.ok(SETUP_FORMS.includes(setupForm), remediation);
    assert.match(remediation, named[setupForm], remediation);
  }
  assert.equal(REMEDIATIONS.diagnostics['tracked-hidden-ignored'].setupForm, 'setup hidden');
  assert.equal(REMEDIATIONS.diagnostics['invalid-value'].setupForm, 'targeted');
  assert.equal(REMEDIATIONS.invalidValue.fastProfile.setupForm, 'setup guided');
  assert.equal(REMEDIATIONS.invalidValue.hiddenForced.setupForm, 'setup hidden');
});

test('no remediation sends an invalid source or a refused key to a Targeted request', () => {
  // Invariant: the Targeted precondition stops without a write on every diagnostic setup Step 2
  // item 5 treats as an invalid source, and Targeted refuses `visibility` and
  // `executionProfiles.fast.enabled`; so none of those findings names `targeted`, and an invalid
  // source is a manual repair rather than setup's recreate-from-scratch decision.
  for (const entry of [
    REMEDIATIONS.diagnostics['ambiguous-key'],
    REMEDIATIONS.diagnostics['unrepresentable-row'],
    REMEDIATIONS.diagnostics['duplicate-envelope'],
    REMEDIATIONS.invalidValue['cell-count'],
    REMEDIATIONS.retired.invalid,
  ]) {
    assert.equal(entry.setupFixable, false, entry.remediation);
    assert.match(entry.remediation, /^Manual step: /, entry.remediation);
    assert.match(entry.remediation, /invalid source/, entry.remediation);
  }
  for (const entry of [
    REMEDIATIONS.invalidValue.visibility,
    REMEDIATIONS.invalidValue.fastProfile,
    REMEDIATIONS.invalidValue.hiddenForced,
    REMEDIATIONS.diagnostics['tracked-hidden-ignored'],
  ]) {
    assert.notEqual(entry.setupForm, 'targeted', entry.remediation);
    assert.doesNotMatch(entry.remediation, /\(a Targeted request\)/, entry.remediation);
  }
  assert.doesNotMatch(
    REMEDIATIONS.diagnostics['tracked-hidden-ignored'].remediation,
    /setup remove/,
  );
});

test('every remediation names a setup form or a manual step and no repository-only link', () => {
  // Invariant: the status mode offers no inline fix; a fix is a setup invocation form or a step the
  // user takes, and shipped text links to no source-repository document.
  const all = [];
  const collect = (value) => {
    if (value && typeof value.remediation === 'string') all.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(REMEDIATIONS);
  assert.ok(all.length > 40);
  for (const { remediation, setupFixable } of all) {
    assert.match(
      remediation,
      /`effective-flow setup(?: [^`]+)?`|^(?:Optional manual step|Manual step|Nothing to fix|If this is unintended)/,
      remediation,
    );
    if (setupFixable) assert.match(remediation, /^Run `effective-flow setup/, remediation);
    assert.doesNotMatch(remediation, /\]\(|docs\/developer-guide|src\/|test\//, remediation);
  }
});

// ---------------------------------------------------------------------------------------------
// Configuration

test('a checkout without a project setup ADR is not set up and recommends setup', async (t) => {
  const { root } = repository(t, { files: { '.gitignore': '.effective-flow/\n' } });
  const data = await status(t, root);
  assert.equal(data.configuration.state, 'not-set-up');
  assert.equal(data.configuration.source.step, 4);
  assert.match(data.configuration.remediation, /`effective-flow setup`/);
  assert.equal(data.configuration.setupFixable, true);
  assert.equal(data.configuration.setupForm, 'setup');
  assert.equal(data.configuration.chatLanguage, null);
  assert.equal(data.setupFixable, true);
  assert.deepEqual(data.setupForms, ['setup']);
  assert.equal(data.ignore.state, 'ok');
});

test('the resolved chat language comes from the setup resolve call, null unless de or en', async (t) => {
  // Invariant: the status fragment renders in `language.chat` without a second resolver call, so
  // the envelope carries the value, and only a supported one.
  for (const [value, expected] of [
    ['de', 'de'],
    ['en', 'en'],
    ['fr', null],
  ]) {
    const { root } = repository(t, {
      files: {
        '.gitignore': '.effective-flow/\n',
        [SETUP_ADR]: setupDocument({ 'language.chat': value }),
      },
    });
    assert.equal((await status(t, root)).configuration.chatLanguage, expected, value);
  }
  // `language.project` comes from the same call: the chat-language fallback after the
  // conversation language.
  for (const [value, expected] of [
    ['de', 'de'],
    ['en', 'en'],
    ['fr', null],
  ]) {
    const { root } = repository(t, {
      files: {
        '.gitignore': '.effective-flow/\n',
        [SETUP_ADR]: setupDocument({ 'language.project': value }),
      },
    });
    const configuration = (await status(t, root)).configuration;
    assert.equal(configuration.projectLanguage, expected, value);
    assert.equal(configuration.chatLanguage, null, value);
  }
  const { root } = repository(t, {
    files: { '.gitignore': '.effective-flow/\n', [SETUP_ADR]: setupDocument({}) },
  });
  const data = await status(t, root);
  assert.equal(data.configuration.chatLanguage, null);
  assert.equal(data.configuration.projectLanguage, null);
  assert.equal(data.setupFixable, false);
  assert.deepEqual(data.setupForms, []);
});

test('a configured checkout reports its source and each diagnostic with its remediation', async (t) => {
  const { root } = repository(t, {
    files: {
      '.gitignore': '.effective-flow/\n',
      'docs/adr/firmo-project-setup.md': setupDocument({ 'plan.dir': 'docs/plan' }),
    },
  });
  const data = await status(t, root);
  assert.equal(data.configuration.state, 'configured');
  assert.deepEqual(data.configuration.source, {
    step: 2,
    path: join(root, 'docs', 'adr', 'firmo-project-setup.md'),
    language: 'en',
    visibility: 'standard',
  });
  const legacy = data.configuration.diagnostics.find((entry) => entry.code === 'legacy-slug');
  assert.equal(legacy.path, join(root, 'docs', 'adr', 'firmo-project-setup.md'));
  assert.match(legacy.remediation, /^Run `effective-flow setup` to move the configuration/);
  assert.match(legacy.remediation, /firmo-project-setup\.md/);
  assert.equal(legacy.setupFixable, true);
  assert.equal(data.setupFixable, true);
});

test('an unverifiable runtime root is a finding and the other sections still render', async (t) => {
  const { root } = repository(t, { files: { '.gitignore': '.effective-flow/\n' } });
  const real = createProcessRunner();
  const runner = (request) =>
    request.args.includes('worktree')
      ? Promise.resolve({ status: 128, stdout: '', stderr: 'fatal: broken\n' })
      : real(request);
  const data = await status(t, root, { runner });
  assert.equal(data.configuration.state, 'error');
  assert.equal(data.configuration.error.code, 'RUNTIME_ROOT_UNVERIFIED');
  assert.equal(data.configuration.error.detail, 'porcelain-failed');
  assert.equal(
    data.configuration.error.remediation,
    REMEDIATIONS.rootChecks['porcelain-failed'].remediation,
  );
  assert.equal(data.configuration.error.setupFixable, false);
  assert.equal(data.configuration.error.setupForm, null);
  assert.equal(data.configuration.chatLanguage, null);
  assert.equal(data.configuration.projectLanguage, null);
  assert.equal(data.ignore.state, 'could-not-check');
  assert.equal(data.domainOwners.state, 'ok');
  assert.equal(data.domainOwners.configurationApplied, false);
  assert.equal(data.version.state, 'current');
});

test('an unsafe hidden local file reports its reason with the manual remediation', async (t) => {
  const { root, base } = repository(t);
  write(base, 'elsewhere.md', setupDocument({ visibility: 'hidden' }));
  mkdirSync(join(root, '.effective-flow'), { recursive: true });
  symlinkSync(join(base, 'elsewhere.md'), join(root, LOCAL_SETUP));
  const data = await status(t, root);
  assert.equal(data.configuration.error.code, 'RUNTIME_STATE_UNSAFE');
  assert.equal(data.configuration.error.detail, 'symlink');
  assert.match(data.configuration.error.remediation, /^Manual step: replace the symlinked/);
  assert.equal(data.version.state, 'current');
});

// ---------------------------------------------------------------------------------------------
// Retired rows

function retiredRow(data, key) {
  const row = data.retired.find((entry) => entry.key === key);
  assert.ok(row, `retired row ${key} is reported`);
  return row;
}

test('a worktree row names every exposed tool that stops, and deliver only reports completion', async (t) => {
  // Invariant: `apply` (through its sub-workflows) and `iterate` (per actionable item) run build,
  // fix, refactor and docs, so each stops on every row they stop on; `merge-gate` runs `iterate` in
  // mode `pr`, and that mode constrains only evaluations of `iterate` itself, so merge-gate also
  // stops through the tools `iterate` runs.
  const { root } = repository(t, {
    files: {
      '.gitignore': '.effective-flow/\n',
      [SETUP_ADR]: setupDocument({
        'worktree.completion': 'merge',
        'worktree.baseBranch': 'origin/develop',
      }),
    },
  });
  const data = await status(t, root);
  const completion = retiredRow(data, 'worktree.completion');
  assert.equal(completion.successor, 'delivery.completion');
  assert.deepEqual(completion.stop, [
    'apply',
    'build',
    'docs',
    'fix',
    'iterate',
    'maintain',
    'merge-gate',
    'refactor',
  ]);
  assert.deepEqual(completion.report, ['deliver']);
  assert.deepEqual(completion.unmappedTools, []);
  assert.deepEqual(
    completion.evaluations.find((entry) => entry.tool === 'deliver'),
    { tool: 'deliver', mode: null, action: 'report' },
  );
  assert.equal(completion.toolMapping, 'exposed');
  assert.match(completion.remediation, /`worktree\.completion` to `delivery\.completion`/);
  assert.equal(
    completion.remediation,
    REMEDIATIONS.retired.migrate.remediation
      .replace('{key}', 'worktree.completion')
      .replace('{successor}', 'delivery.completion'),
  );
  assert.equal(completion.setupFixable, true);
  assert.equal(completion.setupForm, 'setup');

  // Internal resolver tools map onto exposed tools through the declared edges: apply-issues and
  // apply-review (remote) onto apply, iterate (local) onto iterate alone.
  const base = retiredRow(data, 'worktree.baseBranch');
  assert.deepEqual(
    base.evaluations.find((entry) => entry.tool === 'iterate' && entry.mode === 'local'),
    { tool: 'iterate', mode: 'local', action: 'stop' },
  );
  assert.deepEqual(base.stop, [
    'apply',
    'build',
    'deliver',
    'docs',
    'fix',
    'issue-buddy',
    'iterate',
    'maintain',
    'merge-gate',
    'pr',
    'refactor',
  ]);
  assert.deepEqual(base.report, []);
  assert.equal(data.setupFixable, true);
  assert.deepEqual(data.setupForms, ['setup']);
});

test('an invalid retired row is a manual repair naming its diagnostic, not a setup form', async (t) => {
  // Invariant: setup takes its invalid-source path for an invalid retired row and migrates nothing,
  // and a Targeted request stops on the same diagnostic, so the row's remediation is the manual
  // repair its accompanying diagnostic names and nothing about it is setup-fixable.
  const document = setupDocument({ 'plan.dir': 'docs/plan' }).replace(
    '| plan.dir | docs/plan |',
    '| plan.dir | docs/plan |\n| worktree.baseBranch | origin/develop |\n| worktree.baseBranch | origin/main |',
  );
  const { root } = repository(t, {
    files: { '.gitignore': '.effective-flow/\n', [SETUP_ADR]: document },
  });
  const data = await status(t, root);
  const row = retiredRow(data, 'worktree.baseBranch');
  assert.equal(row.state, 'invalid');
  assert.equal(row.setupFixable, false);
  assert.equal(row.setupForm, null);
  assert.match(row.remediation, /^Manual step: repair the retired row `worktree\.baseBranch` in `/);
  assert.ok(row.remediation.includes(join(root, SETUP_ADR)), row.remediation);
  assert.match(row.remediation, /as its `ambiguous-key` diagnostic says/);
  assert.match(
    row.remediation,
    /does not migrate `worktree\.baseBranch` to `delivery\.baseBranch`/,
  );
  const ambiguous = data.configuration.diagnostics.find((entry) => entry.code === 'ambiguous-key');
  assert.equal(ambiguous.setupFixable, false);
  assert.equal(ambiguous.setupForm, null);
  assert.match(
    ambiguous.remediation,
    /^Manual step: remove the duplicate `worktree\.baseBranch` rows/,
  );
  assert.ok(ambiguous.remediation.includes(join(root, SETUP_ADR)), ambiguous.remediation);
  assert.equal(data.setupFixable, false);
  assert.deepEqual(data.setupForms, []);
});

test('an invalid-value diagnostic names the form its reason and key allow', async (t) => {
  // Invariant: a cell-count `invalid-value` is an invalid source (manual), Targeted refuses
  // `visibility` and the Fast flag, and in hidden mode a forced key is fixed by `setup hidden`; only
  // a value-domain invalid value on an accepted key names a Targeted request.
  const invalidValue = (data, key) =>
    data.configuration.diagnostics.find(
      (entry) => entry.code === 'invalid-value' && entry.key === key,
    );
  const standard = (rows, replace) => {
    let document = setupDocument(rows);
    if (replace) document = document.replace(replace[0], replace[1]);
    return repository(t, {
      files: { '.gitignore': '.effective-flow/\n', [SETUP_ADR]: document },
    }).root;
  };

  let root = standard({ 'plan.dir': 'docs/plan' }, [
    '| plan.dir | docs/plan |',
    '| plan.dir | a | b |',
  ]);
  let data = await status(t, root);
  let diagnostic = invalidValue(data, 'plan.dir');
  assert.equal(diagnostic.reason, 'cell-count');
  assert.equal(diagnostic.setupFixable, false);
  assert.equal(diagnostic.setupForm, null);
  assert.match(diagnostic.remediation, /^Manual step: fix the `plan\.dir` row in `/);
  assert.ok(diagnostic.remediation.includes(join(root, SETUP_ADR)), diagnostic.remediation);
  assert.deepEqual(data.setupForms, []);

  root = standard({ visibility: 'bogus' });
  diagnostic = invalidValue(await status(t, root), 'visibility');
  assert.equal(diagnostic.setupFixable, false);
  assert.match(diagnostic.remediation, /^Manual step: remove the `visibility` row/);

  root = standard({ 'executionProfiles.fast.enabled': 'yes' });
  data = await status(t, root);
  diagnostic = invalidValue(data, 'executionProfiles.fast.enabled');
  assert.equal(diagnostic.setupForm, 'setup guided');
  assert.match(diagnostic.remediation, /^Run `effective-flow setup guided`/);
  assert.deepEqual(data.setupForms, ['setup guided']);

  root = standard({ 'delivery.prReview': 'bogus' });
  data = await status(t, root);
  diagnostic = invalidValue(data, 'delivery.prReview');
  assert.equal(diagnostic.setupForm, 'targeted');
  assert.equal(
    diagnostic.remediation,
    REMEDIATIONS.diagnostics['invalid-value'].remediation.replaceAll('{key}', 'delivery.prReview'),
  );
  assert.deepEqual(data.setupForms, ['targeted']);

  const hidden = repository(t, {
    untracked: {
      [LOCAL_SETUP]: setupDocument({ visibility: 'hidden', 'delivery.prReview': 'bogus' }),
    },
  });
  addExcludeEntry(hidden.root);
  data = await status(t, hidden.root);
  diagnostic = invalidValue(data, 'delivery.prReview');
  assert.equal(diagnostic.setupForm, 'setup hidden');
  assert.match(diagnostic.remediation, /^Run `effective-flow setup hidden`/);
  assert.deepEqual(data.setupForms, ['setup hidden']);
});

test('a reviewer-keyed prReview row carries the reviewer-resolved conditional', async (t) => {
  const { root } = repository(t, {
    files: {
      '.gitignore': '.effective-flow/\n',
      [SETUP_ADR]: setupDocument({
        'prReview.bots.coderabbitai[bot].trigger': '@coderabbitai review',
        'prReview.botWaitMinutes': '10',
        'mergeGate.botWaitMinutes': '15',
      }),
    },
  });
  const data = await status(t, root);
  const bot = retiredRow(data, 'prReview.bots.coderabbitai[bot].trigger');
  assert.equal(bot.successor, 'mergeGate.bots.coderabbitai[bot].trigger');
  assert.equal(bot.conditional, 'reviewer-resolved');
  assert.equal(bot.login, 'coderabbitai[bot]');
  assert.equal(bot.normalizedLogin, 'coderabbitai');
  assert.deepEqual(bot.stop, ['iterate', 'merge-gate']);
  assert.equal(bot.setupForm, 'setup');
  assert.match(bot.remediation, /only while `coderabbitai\[bot\]` matches a reviewer/);
  assert.notEqual(bot.remediation, retiredRow(data, 'prReview.botWaitMinutes').remediation);
  // A present successor turns the stop into a report.
  const wait = retiredRow(data, 'prReview.botWaitMinutes');
  assert.equal(wait.successorPresent, true);
  assert.deepEqual(wait.stop, []);
  assert.deepEqual(wait.report, ['iterate', 'merge-gate']);
});

test('without the projection the retired rows keep the resolver tool names', async (t) => {
  const { root } = repository(t, {
    files: { [SETUP_ADR]: setupDocument({ 'worktree.branchPrefix': 'ef/' }) },
  });
  const data = await status(t, root, { projectionPath: join(tempDir(t), 'absent.json') });
  const row = retiredRow(data, 'worktree.branchPrefix');
  assert.equal(row.toolMapping, 'resolver-names');
  assert.ok(row.stop.includes('apply-issues'));
  assert.ok(row.stop.includes('apply-review'));
  assert.deepEqual(row.unmappedTools, []);
});

test('a resolver tool no exposed tool reaches keeps its own name and is marked', async (t) => {
  // Invariant: a missing workflow edge never makes a stopping tool vanish from the report.
  const { root } = repository(t, {
    files: { [SETUP_ADR]: setupDocument({ 'worktree.branchPrefix': 'ef/' }) },
  });
  const projectionPath = projectionFile(t, { ...PROJECTION, workflowEdges: [] });
  const row = retiredRow(await status(t, root, { projectionPath }), 'worktree.branchPrefix');
  assert.equal(row.toolMapping, 'exposed');
  assert.deepEqual(row.unmappedTools, ['apply-issues', 'apply-review']);
  assert.deepEqual(row.stop, [
    'apply-issues',
    'apply-review',
    'build',
    'deliver',
    'docs',
    'fix',
    'issue-buddy',
    'maintain',
    'refactor',
  ]);
});

test('internal tools map to the exposed tools that reach them through declared edges', () => {
  // Invariant: a mode on an edge restricts only that mode of its target; a mode-less evaluation
  // and a mode-less edge match every mode.
  assert.deepEqual(exposedToolsReaching('iterate', PROJECTION), ['iterate', 'merge-gate']);
  assert.deepEqual(exposedToolsReaching('iterate', PROJECTION, 'pr'), ['iterate', 'merge-gate']);
  assert.deepEqual(exposedToolsReaching('iterate', PROJECTION, 'local'), ['iterate']);
  assert.deepEqual(exposedToolsReaching('apply-review', PROJECTION, 'local'), ['apply']);
  assert.deepEqual(exposedToolsReaching('build', PROJECTION), [
    'apply',
    'build',
    'iterate',
    'merge-gate',
  ]);
  assert.deepEqual(exposedToolsReaching('pr', PROJECTION), ['deliver', 'pr']);
  assert.deepEqual(exposedToolsReaching('unknown', PROJECTION), []);
});

// ---------------------------------------------------------------------------------------------
// Domain owners

function owner(data, skill) {
  return data.domainOwners.owners.find((entry) => entry.skill === skill);
}

async function ownersFor(t, rows) {
  const { root } = repository(t, {
    files: { '.gitignore': '.effective-flow/\n', [SETUP_ADR]: setupDocument(rows) },
  });
  return status(t, root);
}

test('skills.enabled false disables every delegate owner for every consuming tool', async (t) => {
  const data = await ownersFor(t, { 'skills.enabled': 'false' });
  assert.equal(data.domainOwners.state, 'ok');
  assert.equal(data.domainOwners.configurationApplied, true);
  const delivery = owner(data, 'effective-delivery');
  assert.deepEqual(delivery.tools, ['build', 'commit', 'docs']);
  assert.deepEqual(
    delivery.disabled.map((entry) => [entry.tool, entry.causes]),
    [
      ['build', ['skills.enabled']],
      ['commit', ['skills.enabled']],
      ['docs', ['skills.enabled']],
    ],
  );
  assert.equal(delivery.disabled[0].consequence, '`build` runs its minimal fallback');
  // The global switch has its own text; no exclude scope is involved.
  assert.equal(
    delivery.remediation,
    REMEDIATIONS.ownerDisabled['skills.enabled'].remediation.replace(
      '{skill}',
      'effective-delivery',
    ),
  );
  assert.match(delivery.remediation, /`effective-flow setup set skills\.enabled to true`/);
  assert.equal(delivery.setupFixable, false);
  assert.equal(delivery.setupForm, null);
  assert.match(
    delivery.missingRemediation,
    /^Manual step: install `effective-delivery` through the skill manager/,
  );
  assert.deepEqual(
    owner(data, 'effective-writing').disabled.map((entry) => entry.tool),
    ['build', 'commit'],
  );
});

test('a tool-scoped exclude disables the owner only for that tool', async (t) => {
  const data = await ownersFor(t, { 'skills.tools.commit.exclude': 'effective-delivery' });
  const delivery = owner(data, 'effective-delivery');
  assert.deepEqual(delivery.disabled, [
    {
      tool: 'commit',
      causes: ['skills.tools.commit.exclude'],
      consequence: '`commit` runs its minimal fallback',
    },
  ]);
  assert.equal(
    delivery.remediation,
    REMEDIATIONS.ownerDisabled.exclude.remediation.replace('{skill}', 'effective-delivery'),
  );
  const writing = owner(data, 'effective-writing');
  assert.deepEqual(writing.disabled, []);
  assert.equal(writing.remediation, null);
  assert.match(writing.missingRemediation, /install `effective-writing`/);
});

test('shared delivery and plan publication handoffs propagate commit exclusions and retired stops', async (t) => {
  // Invariant: the shipped graph includes actual shared delivery handoffs, not merely their
  // direct tool references; plan publication also inherits pr's retired base-branch stop.
  const buildSource = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  const declaration = buildSource.match(/const WORKFLOW_EDGES = (\[[\s\S]*?\n\]);/);
  assert.ok(declaration, 'build declares its execution edges');
  const workflowEdges = Function(`return (${declaration[1]});`)();
  const sources = (directory) => {
    const url = new URL(`../src/${directory}/`, import.meta.url);
    return new Map(
      readdirSync(url)
        .filter((name) => name.endsWith('.md'))
        .map((name) => [name.slice(0, -3), readFileSync(new URL(name, url), 'utf8')]),
    );
  };
  const agentSources = sources('agents');
  const sharedSources = sources('shared');
  const spawnSites = parseSpawnSiteTable(sharedSources.get('model-tiers'), {
    agentTiers: new Map(
      [...agentSources].map(([name, source]) => [
        name,
        resolveAgentTier(extractFrontmatter(source), { agentName: name }),
      ]),
    ),
  });
  const projection = deriveSetupStatusProjection({
    manifest: parseSkillOwnershipManifest(
      readFileSync(
        new URL('../docs/developer-guide/skill-ownership.json', import.meta.url),
        'utf8',
      ),
    ),
    toolSources: sources('tools'),
    agentSources,
    sharedSources,
    spawnSites,
    exposedTools: [
      ...PROJECTION.exposedTools,
      'plan',
      'plan-issue',
      'concept',
      'review',
      'investigate',
      'retro',
    ],
    workflowEdges,
    version: PROJECTION.version,
  });
  const engineering = domainOwnersFrom(projection, {}).find(
    ({ skill }) => skill === 'effective-engineering',
  );
  for (const tool of ['commit', 'deliver', 'pr', 'setup']) {
    assert.ok(!engineering.tools.includes(tool), `${tool} does not execute an engineering worker`);
  }
  const validatorExcluded = domainOwnersFrom(projection, {
    'skills.agents.code-validator.exclude': { state: 'set', items: ['effective-delivery'] },
  }).find(({ skill }) => skill === 'effective-delivery').disabled;
  for (const tool of ['commit', 'deliver', 'pr', 'setup']) {
    assert.ok(
      !validatorExcluded.some((entry) => entry.tool === tool),
      `${tool}'s validator prohibition creates no disabled owner`,
    );
  }
  assert.ok(
    validatorExcluded.some(({ tool }) => tool === 'build'),
    'actual validation remains visible',
  );
  const disabled = domainOwnersFrom(projection, {
    'skills.tools.commit.exclude': { state: 'set', items: ['effective-delivery'] },
  }).find(({ skill }) => skill === 'effective-delivery').disabled;
  const expected = [
    'apply',
    'build',
    'commit',
    'deliver',
    'docs',
    'fix',
    'issue-buddy',
    'iterate',
    'maintain',
    'merge-gate',
    'plan',
    'refactor',
  ];
  assert.deepEqual(
    disabled.map(({ tool }) => tool),
    expected,
  );
  for (const entry of disabled) assert.deepEqual(entry.causes, ['skills.tools.commit.exclude']);
  const { root } = repository(t, {
    files: {
      '.gitignore': '.effective-flow/\n',
      [SETUP_ADR]: setupDocument({ 'worktree.baseBranch': 'origin/develop' }),
    },
  });
  const base = retiredRow(
    await status(t, root, { projectionPath: projectionFile(t, projection) }),
    'worktree.baseBranch',
  );
  assert.ok(base.stop.includes('plan'), 'plan publication runs pr and stops on the retired base');
  assert.ok(
    workflowEdges.some(({ from, to }) => from === 'plan' && to === 'plan-issue'),
    'explicit issue references execute plan-issue',
  );
});

test('an owner disabled by the switch and an exclude carries both remediation texts', () => {
  const owners = domainOwnersFrom(PROJECTION, {
    'skills.enabled': { state: 'set', value: false },
    'skills.tools.commit.exclude': { state: 'set', items: ['effective-delivery'] },
  });
  const delivery = owners.find((entry) => entry.skill === 'effective-delivery');
  assert.deepEqual(delivery.disabled.find((entry) => entry.tool === 'commit').causes, [
    'skills.enabled',
    'skills.tools.commit.exclude',
  ]);
  assert.match(
    delivery.remediation,
    /set skills\.enabled to true.*stop excluding effective-delivery/s,
  );
});

test('an agent-scoped exclude disables the owner for every tool spawning that agent', async (t) => {
  const data = await ownersFor(t, { 'skills.agents.docs-writer.exclude': 'effective-delivery' });
  assert.deepEqual(
    owner(data, 'effective-delivery').disabled.map((entry) => [entry.tool, entry.causes]),
    [
      ['build', ['skills.agents.docs-writer.exclude']],
      ['docs', ['skills.agents.docs-writer.exclude']],
    ],
  );
});

test('an agent-hosted shared consumer inherits the agent scope', async (t) => {
  // language-rules reaches build only through the docs-writer agent and commit through the tool.
  const data = await ownersFor(t, {
    'skills.agents.docs-writer.exclude': 'effective-writing',
    'skills.exclude': 'humanizer',
  });
  assert.deepEqual(owner(data, 'effective-writing').disabled, [
    {
      tool: 'build',
      causes: ['skills.agents.docs-writer.exclude'],
      consequence: '`build` runs its minimal fallback',
    },
  ]);
  assert.equal(data.setupFixable, false);
});

test('one owner reached through several consumers of the same tool is reported once per tool', async (t) => {
  // Invariant: the Domain owners section lists a tool once per owner, however many consumers
  // (tool, agent, shared fragment) of that tool the owner has; their causes are merged, not repeated.
  const data = await ownersFor(t, {
    'skills.tools.commit.exclude': 'effective-delivery',
    'skills.agents.docs-writer.exclude': 'effective-delivery',
  });
  const projection = {
    ...PROJECTION,
    owners: [
      ...PROJECTION.owners,
      {
        skill: 'effective-delivery',
        consumer: 'commit-message-rules',
        consumerKind: 'shared',
        classification: 'delegate',
        tools: ['commit', 'build'],
        reach: [
          { tool: 'commit', scope: 'tools.commit' },
          { tool: 'build', scope: 'agents.docs-writer' },
        ],
      },
    ],
  };
  const excluded = { state: 'set', items: ['effective-delivery'] };
  const delivery = domainOwnersFrom(projection, {
    'skills.tools.commit.exclude': excluded,
    'skills.agents.docs-writer.exclude': excluded,
  }).find((entry) => entry.skill === 'effective-delivery');
  assert.deepEqual(
    delivery.disabled.map((entry) => entry.tool),
    ['build', 'commit', 'docs'],
  );
  assert.equal(
    new Set(delivery.disabled.map((entry) => entry.tool)).size,
    delivery.disabled.length,
  );
  assert.deepEqual(delivery.disabled.find((entry) => entry.tool === 'build').causes, [
    'skills.agents.docs-writer.exclude',
  ]);
  assert.deepEqual(delivery.tools, ['build', 'commit', 'docs']);
  assert.equal(owner(data, 'effective-delivery').disabled.length, 3);
});

test('a missing or malformed projection makes owners and version could-not-check', async (t) => {
  const dir = tempDir(t);
  for (const [projectionPath, reason] of [
    [join(dir, 'absent.json'), /missing/],
    [projectionFile(t, '{not json'), /not valid JSON/],
    [projectionFile(t, { ...PROJECTION, schemaVersion: 2 }), /schemaVersion/],
  ]) {
    const { fetch, calls } = fakeFetch();
    const data = await status(t, dir, { projectionPath, fetch });
    assert.equal(data.domainOwners.state, 'could-not-check');
    assert.match(data.domainOwners.reason, reason);
    assert.equal(data.version.state, 'could-not-check');
    assert.equal(data.version.installed, null);
    assert.equal(data.version.request, null);
    assert.equal(calls.length, 0, 'no lookup without an installed version');
  }
});

// ---------------------------------------------------------------------------------------------
// Version

test('the version comparison handles every lookup outcome without failing the run', async (t) => {
  const dir = tempDir(t);
  const hang = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  const cases = [
    ['current', () => jsonResponse(200, { tag_name: 'effective-flow-v1.68.0' }), 'current'],
    ['outdated', () => jsonResponse(200, { tag_name: 'effective-flow-v1.69.0' }), 'outdated'],
    ['ahead', () => jsonResponse(200, { tag_name: 'effective-flow-v1.67.9' }), 'ahead'],
    ['http error', () => jsonResponse(500, 'oops'), 'could-not-check', /HTTP 500/],
    ['rate limit 403', () => jsonResponse(403, {}), 'could-not-check', /rate limited.*403/],
    ['rate limit 429', () => jsonResponse(429, {}), 'could-not-check', /rate limited.*429/],
    ['timeout', hang, 'could-not-check', /timed out after 25 ms/],
    [
      'network',
      () => Promise.reject(new TypeError('fetch failed')),
      'could-not-check',
      /request failed/,
    ],
    [
      'non-SemVer',
      () => jsonResponse(200, { tag_name: 'effective-flow-v1.69.0-rc.1' }),
      'could-not-check',
      /not a plain SemVer/,
    ],
    [
      'foreign tag',
      () => jsonResponse(200, { tag_name: 'v1.69.0' }),
      'could-not-check',
      /not a plain SemVer/,
    ],
    ['malformed JSON', () => jsonResponse(200, '{'), 'could-not-check', /malformed JSON/],
    ['oversized', () => jsonResponse(200, 'x'.repeat(70 * 1024)), 'could-not-check', /exceeds/],
  ];
  for (const [label, respond, expected, reason] of cases) {
    const { fetch, calls } = fakeFetch(respond);
    const data = await status(t, dir, { fetch, releaseTimeoutMs: 25 });
    assert.equal(data.version.state, expected, label);
    assert.equal(data.version.installed, '1.68.0', label);
    assert.deepEqual(data.version.request, { method: 'GET', url: RELEASE_LATEST_URL }, label);
    if (reason) assert.match(data.version.reason, reason, label);
    assert.equal(data.version.latest === null, expected === 'could-not-check', label);
    assert.equal(calls.length, 1, label);
    if (expected === 'outdated') assert.match(data.version.remediation, /skill manager/);
    assert.equal(data.version.setupFixable, false, label);
    assert.equal(data.version.setupForm, null, label);
  }
});

test('the release lookup is a plain GET to the fixed URL carrying no repository data', async (t) => {
  // Invariant: the only network request names nothing about the user's repository; it is an
  // anonymous GET with a fixed User-Agent, no body and no credentials.
  const { root } = repository(t, {
    files: {
      [SETUP_ADR]: setupDocument({ 'delivery.baseBranch': 'origin/secret-branch' }),
    },
  });
  git(root, 'remote', 'add', 'origin', 'https://example.invalid/private/repo.git');
  const { fetch, calls } = fakeFetch();
  await status(t, root, { fetch });
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(
    url,
    'https://api.github.com/repos/sebastian-software/effective-flow/releases/latest',
  );
  assert.deepEqual(Object.keys(init).sort(), ['headers', 'method', 'signal']);
  assert.equal(init.method, 'GET');
  assert.deepEqual(init.headers, {
    'User-Agent': 'effective-flow-setup-status',
    Accept: 'application/vnd.github+json',
  });
  assert.deepEqual(init.headers, { ...RELEASE_REQUEST_HEADERS });
  const serialized = JSON.stringify({ url, headers: init.headers });
  for (const leak of [root, 'secret-branch', 'example.invalid', 'private/repo']) {
    assert.ok(!serialized.includes(leak), `request carries ${leak}`);
  }
});

test('release tags and SemVer comparison accept only plain X.Y.Z', () => {
  assert.equal(releaseSemver('effective-flow-v2.10.3'), '2.10.3');
  assert.equal(releaseSemver('2.10.3'), '2.10.3');
  for (const tag of ['effective-flow-v2.10', 'v2.10.3', 'effective-flow-v01.2.3', null, 3]) {
    assert.equal(releaseSemver(tag), null, String(tag));
  }
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.9.9', '1.10.0'), -1);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
});

// ---------------------------------------------------------------------------------------------
// Ignore state

test('standard ignore problems name setup or the manual untrack step', async (t) => {
  const missing = repository(t, { files: { [SETUP_ADR]: setupDocument({}) } });
  let data = await status(t, missing.root);
  assert.equal(data.ignore.state, 'problem');
  assert.equal(data.ignore.reason, 'not-ignored');
  assert.equal(data.ignore.setupFixable, true);
  assert.equal(data.ignore.setupForm, 'setup');
  assert.match(data.ignore.remediation, /`effective-flow setup`.*`\.gitignore`/);
  assert.deepEqual(data.ignore.notes, []);

  // Tracked runtime content under an ignore entry: the predicate holds, so the untrack step is
  // the reason and nothing is setup-fixable.
  const tracked = repository(t, {
    files: { [SETUP_ADR]: setupDocument({}), '.effective-flow/memory.json': '{}\n' },
    untracked: { '.gitignore': '.effective-flow/\n' },
  });
  data = await status(t, tracked.root);
  assert.equal(data.ignore.reason, 'tracked-runtime-content');
  assert.deepEqual(data.ignore.paths, ['.effective-flow/memory.json']);
  assert.equal(data.ignore.setupFixable, false);
  assert.equal(data.ignore.setupForm, null);
  assert.equal(data.setupFixable, false);
});

test('standard mode reports a failed predicate and tracked content together', async (t) => {
  // Invariant: setup Step 1 checks the predicate and tracked content independently, so a tracked
  // path never hides the setup-fixable missing entry; it becomes an additional note.
  const { root } = repository(t, {
    files: { [SETUP_ADR]: setupDocument({}), '.effective-flow/memory.json': '{}\n' },
  });
  const data = await status(t, root);
  assert.equal(data.ignore.reason, 'not-ignored');
  assert.equal(data.ignore.setupFixable, true);
  assert.deepEqual(data.ignore.paths, ['.effective-flow/memory.json']);
  assert.deepEqual(data.ignore.notes, [
    {
      code: 'tracked-runtime-content',
      path: null,
      paths: ['.effective-flow/memory.json'],
      detail: null,
      remediation: REMEDIATIONS.ignore['tracked-runtime-content'].remediation,
      setupFixable: false,
      setupForm: null,
    },
  ]);
  assert.equal(data.setupFixable, true);
  assert.deepEqual(data.setupForms, ['setup']);
});

test('a remaining .effective-flow negation line fails the standard target state', async (t) => {
  // Invariant: setup Step 1 requires no `!.effective-flow/…` line in `.gitignore` even while the
  // directory entry makes the predicate hold; setup removes only the config.json negation.
  const config = repository(t, {
    files: {
      [SETUP_ADR]: setupDocument({}),
      '.gitignore': '.effective-flow/\n!.effective-flow/config.json\n',
    },
  });
  let data = await status(t, config.root);
  assert.equal(data.ignore.state, 'problem');
  assert.equal(data.ignore.reason, 'negated-entry');
  assert.equal(
    data.ignore.detail,
    `${join(config.root, '.gitignore')}:2:!.effective-flow/config.json`,
  );
  assert.equal(data.ignore.setupFixable, true);
  assert.equal(data.ignore.setupForm, 'setup');

  const other = repository(t, {
    files: {
      [SETUP_ADR]: setupDocument({}),
      '.gitignore': '.effective-flow/\n!.effective-flow/config.json\n!/.effective-flow/review/\n',
    },
  });
  data = await status(t, other.root);
  assert.equal(data.ignore.reason, 'other-negated-entry');
  assert.match(
    data.ignore.detail,
    /:2:!\.effective-flow\/config\.json; .*:3:!\/\.effective-flow\/review\//,
  );
  assert.equal(data.ignore.setupFixable, false);
  assert.match(data.ignore.remediation, /^Manual step: remove the `!\.effective-flow\/…` negation/);

  // A failed predicate is the reason; a negation line setup does not migrate is already named as a
  // note, so the first report lists every manual step, and the config.json one is left to setup.
  const unignored = repository(t, {
    files: {
      [SETUP_ADR]: setupDocument({}),
      '.gitignore': '.effective-flow/*\n!.effective-flow/config.json\n!.effective-flow/review/\n',
    },
  });
  data = await status(t, unignored.root);
  assert.equal(data.ignore.reason, 'not-ignored');
  assert.equal(data.ignore.setupFixable, true);
  assert.deepEqual(data.ignore.notes, [
    {
      code: 'other-negated-entry',
      path: join(unignored.root, '.gitignore'),
      paths: [],
      detail: `${join(unignored.root, '.gitignore')}:3:!.effective-flow/review/`,
      remediation: REMEDIATIONS.ignore['other-negated-entry'].remediation,
      setupFixable: false,
      setupForm: null,
    },
  ]);
  assert.deepEqual(data.setupForms, ['setup']);
});

test('hidden ignore states mirror the hidden setup arm without repairing anything', async (t) => {
  const hiddenFile = setupDocument({ visibility: 'hidden' });

  const missing = repository(t, { untracked: { [LOCAL_SETUP]: hiddenFile } });
  let data = await status(t, missing.root);
  assert.equal(data.configuration.visibility, 'hidden');
  assert.equal(data.ignore.reason, 'exclude-entry-missing');
  assert.match(data.ignore.remediation, /`effective-flow setup hidden`/);
  assert.equal(data.ignore.setupFixable, true);
  assert.equal(data.ignore.setupForm, 'setup hidden');

  const outranked = repository(t, {
    files: { '.gitignore': '!.effective-flow/\n' },
    untracked: { [LOCAL_SETUP]: hiddenFile },
  });
  addExcludeEntry(outranked.root);
  data = await status(t, outranked.root);
  assert.equal(data.ignore.reason, 'outranked-by-gitignore');
  assert.match(data.ignore.detail, /\.gitignore:1:!\.effective-flow\//);
  assert.equal(data.ignore.setupFixable, false);

  const leftover = repository(t, {
    files: { '.gitignore': '.effective-flow/\n' },
    untracked: { [LOCAL_SETUP]: hiddenFile },
  });
  addExcludeEntry(leftover.root);
  data = await status(t, leftover.root);
  assert.equal(data.ignore.state, 'ok');
  assert.deepEqual(
    data.ignore.notes.map((note) => [note.code, note.setupFixable]),
    [['gitignore-leftover', false]],
  );
});

// ---------------------------------------------------------------------------------------------
// No write

test('status writes nothing in standard, hidden, unset, non-Git and linked-worktree checkouts', async (t) => {
  // Invariant: the status mode is read-only. The whole directory, `.git/` (index, common-dir
  // `info/exclude`, `config`) and `.effective-flow/` included, is byte- and mtime-identical after
  // a run, retired-row evaluation and every ignore predicate included.
  const fixtures = [];

  const standard = repository(t, {
    files: {
      '.gitignore': '.effective-flow/\n',
      [SETUP_ADR]: setupDocument({ 'worktree.completion': 'merge', 'skills.enabled': 'false' }),
      'AGENTS.md': '**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md\n',
    },
    untracked: { '.effective-flow/memory.json': '{}\n' },
  });
  fixtures.push({ label: 'standard', cwd: standard.root, root: standard.base });

  const hidden = repository(t, {
    untracked: { [LOCAL_SETUP]: setupDocument({ visibility: 'hidden', 'prReview.bots': 'x' }) },
  });
  addExcludeEntry(hidden.root);
  fixtures.push({ label: 'hidden', cwd: hidden.root, root: hidden.base });

  const unset = repository(t);
  fixtures.push({ label: 'no ADR', cwd: unset.root, root: unset.base });

  const plain = tempDir(t);
  write(plain, SETUP_ADR, setupDocument({ 'plan.dir': 'docs/plan' }));
  fixtures.push({ label: 'not a Git repository', cwd: plain, root: plain });

  // Hidden mode from a linked worktree: the local file lives in the main checkout and the exclude
  // entry in the common directory, so every hidden ignore predicate runs across the link.
  const linked = repository(t, { files: { [SETUP_ADR]: setupDocument({}) } });
  const linkedRoot = join(linked.base, 'linked');
  git(linked.root, 'worktree', 'add', '--quiet', '-b', 'feature', linkedRoot);
  write(linked.root, LOCAL_SETUP, setupDocument({ visibility: 'hidden', 'plan.dir': 'x' }));
  addExcludeEntry(linked.root);
  fixtures.push({ label: 'linked worktree', cwd: linkedRoot, root: linked.base });

  for (const { label, cwd, root } of fixtures) {
    const before = snapshot(root);
    assert.ok(before.length > 0, label);
    const data = await status(t, cwd);
    assert.deepEqual(snapshot(root), before, `${label} must stay byte-identical`);
    if (label === 'hidden') assert.equal(data.configuration.visibility, 'hidden');
    if (label === 'no ADR') assert.equal(data.configuration.state, 'not-set-up');
    if (label === 'not a Git repository') assert.equal(data.ignore.state, 'not-applicable');
    if (label === 'linked worktree') {
      assert.equal(data.configuration.runtimeStateRoot, linked.root);
      assert.equal(data.configuration.checkoutRoot, linkedRoot);
      assert.equal(data.configuration.visibility, 'hidden');
      assert.equal(data.ignore.visibility, 'hidden');
      assert.equal(data.ignore.state, 'ok', JSON.stringify(data.ignore));
    }
  }
});

// ---------------------------------------------------------------------------------------------
// CLI

test('the CLI rejects bad usage and invalid input with an INVALID_INPUT envelope', async (t) => {
  const dir = tempDir(t);
  for (const [argv, input] of [
    [['nope'], { cwd: dir }],
    [['status', 'extra'], { cwd: dir }],
    [['status'], { cwd: 'relative/path' }],
    [['status'], { cwd: dir, tool: 'setup' }],
    [['status'], { cwd: join(dir, 'missing') }],
    [['status'], []],
  ]) {
    let stdout = '';
    let exitCode = 0;
    const envelope = await main(argv, {
      input,
      stdout: { write: (text) => (stdout += text) },
      stderr: { write: () => {} },
      setExitCode: (code) => (exitCode = code),
      deps: { fetch: fakeFetch().fetch },
    });
    assert.equal(envelope.ok, false, JSON.stringify(argv));
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.equal(envelope.error.retryable, false);
    assert.equal(exitCode, 2);
    assert.deepEqual(JSON.parse(stdout), envelope);
  }
});

test('the spawned CLI reads stdin and emits one envelope line', (t) => {
  const dir = tempDir(t);
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'data:text/javascript,globalThis.fetch=async()=>{throw new TypeError("offline")}',
      CLI,
      'status',
    ],
    { input: JSON.stringify({ cwd: dir }), encoding: 'utf8', env: GIT_ENV },
  );
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.ignore.state, 'not-applicable');
  // The source tree carries no generated projection, so the owners cannot be checked here.
  assert.equal(envelope.data.domainOwners.state, 'could-not-check');
});

// ---------------------------------------------------------------------------------------------
// Allow-rule probe

const { CLAUDECODE: _ignoredClaudeCode, ...ENV_OUTSIDE_CLAUDE } = GIT_ENV;
const ENV_IN_CLAUDE = { ...ENV_OUTSIDE_CLAUDE, CLAUDECODE: '1' };
const ALLOWLISTED = [
  'lock acquire',
  'lock release',
  'lock inspect',
  'memory reserve',
  'memory set-marker',
  'memory migrate-directory',
];

function allowRule(skillRoot, operation) {
  return `Bash(node ${skillRoot}/scripts/effective-flow-state.mjs ${operation} *)`;
}

// A skill install outside the repository, reached through a symlinked `skills/effective-flow`.
function skillInstall(t) {
  const base = tempDir(t);
  write(base, 'real/effective-flow/scripts/effective-flow-state.mjs', '// helper\n');
  mkdirSync(join(base, 'skills'));
  symlinkSync(join(base, 'real', 'effective-flow'), join(base, 'skills', 'effective-flow'));
  return { base, skillRoot: join(base, 'skills', 'effective-flow') };
}

async function allowlistStatus(t, cwd, input, env = ENV_IN_CLAUDE) {
  const envelope = await executeOperation(
    'status',
    { cwd, ...input },
    { env, fetch: fakeFetch().fetch, projectionPath: projectionFile(t) },
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  return envelope.data;
}

function writeAllowRules(root, rules) {
  write(
    root,
    '.claude/settings.local.json',
    `${JSON.stringify({ permissions: { allow: rules } })}\n`,
  );
}

// Invariant: the closed status input gains exactly one optional key, `skillRoot`, an absolute path.
test('allowlist: skillRoot is the one optional input key and must be absolute', async (t) => {
  const { root } = repository(t);
  for (const skillRoot of ['relative/path', 7, '']) {
    const envelope = await executeOperation('status', { cwd: root, skillRoot }, { env: GIT_ENV });
    assert.equal(envelope.error?.code, 'INVALID_INPUT');
    assert.equal(envelope.error.details.field, 'skillRoot');
  }
  const unknown = await executeOperation('status', { cwd: root, harness: 'claude' }, {});
  assert.equal(unknown.error?.code, 'INVALID_INPUT');
});

// Invariant: without `skillRoot`, or outside Claude Code, the probe is not-applicable and fixes
// nothing.
test('allowlist: not-applicable without skillRoot or outside Claude Code', async (t) => {
  const { root } = repository(t);
  const { skillRoot } = skillInstall(t);
  const none = await allowlistStatus(t, root, {});
  assert.equal(none.allowlist.state, 'not-applicable');
  assert.equal(none.allowlist.reason, 'no-skill-root');
  assert.equal(none.allowlist.setupFixable, false);
  const outside = await allowlistStatus(t, root, { skillRoot }, ENV_OUTSIDE_CLAUDE);
  assert.equal(outside.allowlist.state, 'not-applicable');
  assert.equal(outside.allowlist.reason, 'not-claude-code');
  assert.ok(!outside.setupForms.includes('allowlist'));
});

// Invariant: a missing settings file or a missing rule is `absent`, fixed by `setup allowlist`.
test('allowlist: absent without the settings file or with a rule missing', async (t) => {
  const { root } = repository(t);
  const { skillRoot } = skillInstall(t);
  const empty = await allowlistStatus(t, root, { skillRoot });
  assert.equal(empty.allowlist.state, 'absent');
  assert.equal(empty.allowlist.target, join(root, '.claude', 'settings.local.json'));
  assert.equal(empty.allowlist.missing.length, 6);
  assert.equal(empty.allowlist.setupFixable, true);
  assert.equal(empty.allowlist.setupForm, 'allowlist');
  assert.match(empty.allowlist.remediation, /`effective-flow setup allowlist`/);
  assert.equal(empty.setupFixable, true);
  assert.ok(empty.setupForms.includes('allowlist'));

  writeAllowRules(
    root,
    ALLOWLISTED.slice(1).map((operation) => allowRule(skillRoot, operation)),
  );
  const partial = await allowlistStatus(t, root, { skillRoot });
  assert.equal(partial.allowlist.state, 'absent');
  assert.deepEqual(partial.allowlist.missing, [allowRule(skillRoot, 'lock acquire')]);
});

// Invariant: Claude Code matches the literal command path, so a rule counts as this install's only
// when it names this `skillRoot` literally; all six rules naming the given root are `current`.
test('allowlist: current when all six rules name this install', async (t) => {
  const { root } = repository(t);
  const { skillRoot } = skillInstall(t);
  writeAllowRules(root, [
    'Bash(git status:*)',
    ...ALLOWLISTED.map((operation) => allowRule(skillRoot, operation)),
  ]);
  const data = await allowlistStatus(t, root, { skillRoot });
  assert.equal(data.allowlist.state, 'current');
  assert.equal(data.allowlist.present.length, 6);
  assert.deepEqual(data.allowlist.missing, []);
  assert.deepEqual(data.allowlist.aliases, []);
  assert.equal(data.allowlist.setupFixable, false);
  assert.equal(data.allowlist.setupForm, null);
});

// Invariant: rules under another path to the same helper never fire for this install: they are
// listed in `aliases`, count as neither present nor stale, and leave all six rules `missing`.
test('allowlist: an alias of the same helper is absent and reported in aliases', async (t) => {
  const { root } = repository(t);
  const { base, skillRoot } = skillInstall(t);
  const alias = join(base, 'alias');
  symlinkSync(join(base, 'real', 'effective-flow'), alias);
  const aliasRules = ALLOWLISTED.map((operation) => allowRule(alias, operation));
  writeAllowRules(root, ['Bash(git status:*)', ...aliasRules]);
  const data = await allowlistStatus(t, root, { skillRoot });
  assert.equal(data.allowlist.state, 'absent');
  assert.deepEqual(data.allowlist.present, []);
  assert.deepEqual(
    data.allowlist.missing,
    ALLOWLISTED.map((operation) => allowRule(skillRoot, operation)),
  );
  assert.deepEqual(data.allowlist.aliases, aliasRules);
  assert.deepEqual(data.allowlist.stale, []);
  assert.equal(data.allowlist.setupForm, 'allowlist');
});

// Invariant: a helper-shape rule whose helper no longer resolves is `stale` and fixed by
// `setup allowlist`, even when this install's rules are all present.
test('allowlist: stale when a rule names a helper that no longer resolves', async (t) => {
  const { root } = repository(t);
  const { skillRoot } = skillInstall(t);
  const dead = allowRule('/nonexistent/moved/effective-flow', 'memory reserve');
  writeAllowRules(root, [...ALLOWLISTED.map((operation) => allowRule(skillRoot, operation)), dead]);
  const data = await allowlistStatus(t, root, { skillRoot });
  assert.equal(data.allowlist.state, 'stale');
  assert.deepEqual(data.allowlist.stale, [dead]);
  assert.equal(data.allowlist.setupForm, 'allowlist');
  assert.match(data.allowlist.remediation, /`effective-flow setup allowlist`/);
});

// Invariant: what the probe cannot decide is `could-not-check` with its reason, never a guess.
test('allowlist: could-not-check for an unresolved root, helper or settings file', async (t) => {
  const { skillRoot } = skillInstall(t);
  const outsideGit = tempDir(t);
  const noRoot = await allowlistStatus(t, outsideGit, { skillRoot });
  assert.equal(noRoot.allowlist.state, 'could-not-check');
  assert.equal(noRoot.allowlist.reason, 'runtime-root-unresolved');

  const { root } = repository(t);
  const noHelper = await allowlistStatus(t, root, { skillRoot: join(outsideGit, 'missing') });
  assert.equal(noHelper.allowlist.reason, 'helper-unresolved');

  write(root, '.claude/settings.local.json', '{"permissions":{"allow":"Bash"}}');
  const invalid = await allowlistStatus(t, root, { skillRoot });
  assert.equal(invalid.allowlist.state, 'could-not-check');
  assert.equal(invalid.allowlist.reason, 'settings-invalid');
  assert.equal(invalid.allowlist.setupFixable, false);
});
