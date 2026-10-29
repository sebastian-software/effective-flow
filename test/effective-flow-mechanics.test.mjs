// Fixture suite for the mechanics computation helper (fake runner, temp directories).
//
// Every expectation names its source: the prose fragment the rule comes from today, or the pinned
// decision of `docs/plan/2026-10-29-mechanics-computation-helper.md` ("plan: <section>").

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import nodeFs, {
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
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  BRANCH_SKILLS,
  MAX_STDIN_BYTES,
  MECHANICS_OPERATIONS,
  MechanicsError,
  NAME_FAMILIES,
  REPORT_WORKFLOWS,
  errorEnvelope,
  executeOperation,
  exitCodeFor,
  localDate,
  recodeError,
  slugify,
} from '../src/scripts/effective-flow-mechanics-core.mjs';
import { main } from '../src/scripts/effective-flow-mechanics.mjs';
import { PlanLintError, UNATTENDED_PLAN_NAME } from '../src/scripts/plan-lint-core.mjs';
import {
  DeliverySelectionError,
  UPSTREAM_FETCH_TIMEOUT_MS,
} from '../src/scripts/delivery-selection-core.mjs';
import {
  RemoteTrackerError,
  assertUndisclosed,
} from '../src/scripts/remote-tracker-shared-core.mjs';

const ROOT = new URL('../', import.meta.url);
const CORE_PATH = fileURLToPath(new URL('src/scripts/effective-flow-mechanics-core.mjs', ROOT));

// A fixed clock and zone so every dated name is deterministic (plan: "Local date").
const CLOCK = { now: () => new Date('2026-10-29T12:00:00Z'), timeZone: 'UTC' };
const DATE = '2026-10-29';

function tempRoot(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-mechanics-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, relative, content = '') {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

async function run(operation, input, deps = {}) {
  return await executeOperation(operation, input, { ...CLOCK, ...deps });
}

async function data(operation, input, deps) {
  const envelope = await run(operation, input, deps);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(envelope.operation, operation);
  assert.equal(typeof envelope.data.outcome, 'string', 'every success carries an outcome');
  return envelope.data;
}

async function failure(operation, input, code, deps) {
  const envelope = await run(operation, input, deps);
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.error.code, code, JSON.stringify(envelope));
  return envelope;
}

const OID_A = 'a'.repeat(40);
const OID_B = 'b'.repeat(40);

// A scripted Git: answers `remote`, `for-each-ref`, `rev-parse`, `symbolic-ref`, `config` and
// `fetch` from fixture data, and asks the real `git check-ref-format` so ref validation is Git's.
function fakeGit({
  remotes = [],
  refs = {},
  symbolic = {},
  config = {},
  fetch = () => ({ status: 0, stdout: '', stderr: '' }),
} = {}) {
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    assert.equal(call.executable, 'git');
    assert.equal(call.args[0], '-C', 'every Git call names its repository with -C');
    const args = call.args.slice(2);
    const command = args.find((arg) => !['-c', 'core.hooksPath=/dev/null'].includes(arg));
    if (command === 'remote') {
      return { status: 0, stdout: remotes.map((name) => `${name}\n`).join(''), stderr: '' };
    }
    if (command === 'check-ref-format') {
      const real = spawnSync('git', args, { encoding: 'utf8' });
      return { status: real.status, stdout: real.stdout, stderr: real.stderr };
    }
    if (command === 'config') {
      const key = args[args.length - 1];
      return key in config
        ? { status: 0, stdout: `${config[key]}\n`, stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
    }
    if (command === 'for-each-ref') {
      return {
        status: 0,
        stdout: Object.keys(refs)
          .filter((name) => name.startsWith('refs/heads/') || name.startsWith('refs/remotes/'))
          .map((name) => `${name}\n`)
          .join(''),
        stderr: '',
      };
    }
    if (command === 'rev-parse') {
      const target = args[args.length - 1].replace(/\^\{commit\}$/, '');
      const candidates = [target, `refs/heads/${target}`, `refs/remotes/${target}`];
      const hit = candidates.find((name) => name in refs);
      return hit
        ? { status: 0, stdout: `${refs[hit]}\n`, stderr: '' }
        : { status: 128, stdout: '', stderr: 'fatal: Needed a single revision\n' };
    }
    if (command === 'symbolic-ref') {
      const target = args[args.length - 1];
      return target in symbolic
        ? { status: 0, stdout: `${symbolic[target]}\n`, stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
    }
    if (command === 'fetch') return fetch(call);
    throw new Error(`unexpected git call: ${call.args.join(' ')}`);
  };
  return { runner, calls };
}

const fetchCalls = (calls) => calls.filter((call) => call.args.includes('fetch'));

// ---------------------------------------------------------------------------------------------
// Slugify (plan: "Slug transliteration (user decision)")

test('slugify transliterates German digraphs after NFC, so NFD input maps identically', () => {
  assert.equal(slugify('Größenänderung'), 'groessenaenderung');
  assert.equal(slugify('Größenänderung'.normalize('NFD')), 'groessenaenderung');
  assert.equal(slugify('ÄÖÜ Straße'), 'aeoeue-strasse');
});

test('slugify strips combining marks, maps punctuation runs to one hyphen, trims edges', () => {
  assert.equal(slugify('Élan vital'), 'elan-vital');
  assert.equal(slugify('Fix: the (big) bug!! / now'), 'fix-the-big-bug-now');
  assert.equal(slugify('***Leading and trailing***'), 'leading-and-trailing');
  assert.equal(slugify('Release 2.0 notes 42'), 'release-2-0-notes-42');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
});

test('slugify caps at 80 characters at the last hyphen, else cuts hard', () => {
  const words = Array.from({ length: 40 }, (_, index) => `word${index}`);
  const title = words.join(' ');
  const raw = words.join('-');
  assert.ok(title.length >= 200);
  const capped = slugify(title);
  assert.ok(capped.length <= 80);
  assert.ok(raw.startsWith(capped));
  assert.equal(raw[capped.length], '-', 'the cut lands on a hyphen boundary');
  assert.ok(raw.lastIndexOf('-', 80) === capped.length, 'the last hyphen at or before the cap');
  assert.equal(slugify('a'.repeat(120)), 'a'.repeat(80));
  // A hyphen exactly at the cap keeps the full 80-character head.
  assert.equal(slugify(`${'a'.repeat(80)} b`), 'a'.repeat(80));
});

// ---------------------------------------------------------------------------------------------
// Local date (plan: "Local date"; today's prose: `date +%F`, plan-numbering.md)

test('the local date follows the injected time zone and day boundary', () => {
  const instant = new Date('2026-10-29T11:00:00Z');
  assert.equal(localDate(instant, 'Pacific/Kiritimati'), '2026-10-30');
  assert.equal(localDate(instant, 'Etc/GMT+12'), '2026-10-28');
  assert.equal(localDate(new Date('2026-10-29T22:59:59Z'), 'Europe/Berlin'), '2026-10-29');
  assert.equal(localDate(new Date('2026-10-29T23:00:00Z'), 'Europe/Berlin'), '2026-10-30');
});

// ---------------------------------------------------------------------------------------------
// Name allocation (plan: "Name allocation: collision suffix per family")

const FAMILY_CASES = [
  // plan-numbering.md "Name collision on the same day": -2, -3.
  {
    family: 'plan',
    dir: 'docs/plan',
    extra: { text: 'My Plan' },
    names: [`${DATE}-my-plan.md`, `${DATE}-my-plan-2.md`, `${DATE}-my-plan-3.md`],
  },
  // concept-contract.md "Name collision on the same day": -2, -3.
  {
    family: 'concept',
    dir: 'docs/concept',
    extra: { text: 'My Concept' },
    names: [`${DATE}-my-concept.md`, `${DATE}-my-concept-2.md`, `${DATE}-my-concept-3.md`],
  },
  // unattended-planning.md: `<plan.dir>/YYYY-MM-DD-issue-<N>-<slug>.md`, same-day -2, -3.
  {
    family: 'unattended-plan',
    dir: 'docs/plan',
    extra: { text: 'Fix login', issue: 12 },
    names: [
      `${DATE}-issue-12-fix-login.md`,
      `${DATE}-issue-12-fix-login-2.md`,
      `${DATE}-issue-12-fix-login-3.md`,
    ],
  },
  // unresolved-review-report.md step 2: plan basis, -1, -2.
  {
    family: 'review-report-plan',
    dir: '.effective-flow/review',
    extra: { planSlug: 'my-plan' },
    names: [
      `review-report-${DATE}-plan-my-plan.md`,
      `review-report-${DATE}-plan-my-plan-1.md`,
      `review-report-${DATE}-plan-my-plan-2.md`,
    ],
  },
  // unresolved-review-report.md step 3: WORKFLOW, -1, -2.
  {
    family: 'review-report-workflow',
    dir: '.effective-flow/review',
    extra: { workflow: 'build' },
    names: [
      `review-report-${DATE}-build.md`,
      `review-report-${DATE}-build-1.md`,
      `review-report-${DATE}-build-2.md`,
    ],
  },
  // security-disclosure-gate.md `review-report-YYYY-MM-DD-security[-N].md` (user decision: -1).
  {
    family: 'review-report-security',
    dir: '.effective-flow/review',
    extra: {},
    names: [
      `review-report-${DATE}-security.md`,
      `review-report-${DATE}-security-1.md`,
      `review-report-${DATE}-security-2.md`,
    ],
  },
  // review.md `review-report-YYYY-MM-DD[-N].md` (user decision: -1).
  {
    family: 'review-report-local',
    dir: '.effective-flow/review',
    extra: {},
    names: [`review-report-${DATE}.md`, `review-report-${DATE}-1.md`, `review-report-${DATE}-2.md`],
  },
  // investigate.md `investigation-YYYY-MM-DD-<slug>.md` (user decision, no rule today: -1).
  {
    family: 'investigation',
    dir: '.effective-flow/investigation',
    extra: { text: 'Slow start' },
    names: [
      `investigation-${DATE}-slow-start.md`,
      `investigation-${DATE}-slow-start-1.md`,
      `investigation-${DATE}-slow-start-2.md`,
    ],
  },
];

test('the family table lists exactly the pinned families', () => {
  assert.deepEqual([...NAME_FAMILIES].sort(), FAMILY_CASES.map((entry) => entry.family).sort());
});

for (const { family, dir, extra, names } of FAMILY_CASES) {
  test(`name-allocate ${family}: zero, one and two collisions`, async (t) => {
    const cwd = tempRoot(t);
    for (const expected of names) {
      const result = await data('name-allocate', { cwd, family, dir, ...extra });
      assert.equal(result.outcome, 'allocated');
      assert.equal(result.name, expected);
      assert.equal(result.path, `${dir}/${expected}`);
      if (family === 'unattended-plan') assert.match(result.name, UNATTENDED_PLAN_NAME);
      // No reservation: allocation creates nothing (plan: "No reservation").
      assert.equal(nodeFs.existsSync(join(cwd, dir, expected)), false);
      write(cwd, `${dir}/${expected}`, '# x\n');
    }
  });
}

test('name-allocate counts a plan name present only in the archive as taken', async (t) => {
  // plan: "Taken names" — the plan-file convention bans same-name duplicates across the archive.
  const cwd = tempRoot(t);
  write(cwd, `docs/plan/archive/${DATE}-my-plan.md`, '# x\n');
  const result = await data('name-allocate', {
    cwd,
    family: 'plan',
    dir: 'docs/plan',
    text: 'My Plan',
  });
  assert.equal(result.name, `${DATE}-my-plan-2.md`);
  assert.equal(result.archiveIgnored, false);
});

test('name-allocate counts a directory, a symlink and a dangling symlink as taken', async (t) => {
  // plan: "Taken names" — any directory entry at the name, tested with lstat.
  const cwd = tempRoot(t);
  const dir = '.effective-flow/investigation';
  mkdirSync(join(cwd, dir, `investigation-${DATE}-x.md`), { recursive: true });
  write(cwd, 'target.md', 'x');
  symlinkSync(join(cwd, 'target.md'), join(cwd, dir, `investigation-${DATE}-x-1.md`));
  symlinkSync(join(cwd, 'missing.md'), join(cwd, dir, `investigation-${DATE}-x-2.md`));
  const result = await data('name-allocate', { cwd, family: 'investigation', dir, text: 'x' });
  assert.equal(result.name, `investigation-${DATE}-x-3.md`);
});

test('name-allocate treats a truly absent directory as empty', async (t) => {
  // plan: "Input schemas" — a truly absent target directory counts as empty.
  const cwd = tempRoot(t);
  const plan = await data('name-allocate', { cwd, family: 'plan', dir: 'docs/plan', text: 'A' });
  assert.equal(plan.name, `${DATE}-a.md`);
  const report = await data('name-allocate', {
    cwd,
    family: 'review-report-local',
    dir: '.effective-flow/review',
  });
  assert.equal(report.name, `review-report-${DATE}.md`);
});

test('name-allocate rejects unsafe or unknown name components', async (t) => {
  // plan: "Input schemas" — closed enums, slug alphabet, positive integer issue.
  const cwd = tempRoot(t);
  const dir = '.effective-flow/review';
  for (const input of [
    { family: 'review-report-workflow', dir, workflow: 'x/../../y' },
    { family: 'review-report-workflow', dir, workflow: 'nope' },
    { family: 'review-report-plan', dir, planSlug: 'Bad Slug' },
    { family: 'review-report-plan', dir, planSlug: '../x' },
    { family: 'unattended-plan', dir: 'docs/plan', text: 'x', issue: 0 },
    { family: 'unattended-plan', dir: 'docs/plan', text: 'x', issue: '7' },
    { family: 'plan', dir: 'docs/plan', text: '!!!' },
    { family: 'plan', dir: 'docs/plan' },
    { family: 'plan', dir: 'docs/plan', text: 'x', issue: 3 },
    { family: 'nope', dir },
    { family: 'review-report-local', dir, surprise: true },
  ]) {
    await failure('name-allocate', { cwd, ...input }, 'INVALID_INPUT');
  }
});

test('name-allocate refuses an escaping, absolute or parent-segment directory', async (t) => {
  // plan: "Containment until WP2" and "Error mapping" (UNSAFE_PATH exits 3).
  const cwd = tempRoot(t);
  const outside = tempRoot(t);
  symlinkSync(outside, join(cwd, 'escape'));
  await failure(
    'name-allocate',
    { cwd, family: 'review-report-local', dir: 'escape' },
    'UNSAFE_PATH',
  );
  await failure(
    'name-allocate',
    { cwd, family: 'review-report-local', dir: 'escape/review' },
    'UNSAFE_PATH',
  );
  await failure('name-allocate', { cwd, family: 'plan', dir: 'escape', text: 'x' }, 'UNSAFE_PATH');
  await failure(
    'name-allocate',
    { cwd, family: 'review-report-local', dir: '../x' },
    'UNSAFE_PATH',
  );
  await failure(
    'name-allocate',
    { cwd, family: 'review-report-local', dir: outside },
    'UNSAFE_PATH',
  );
  symlinkSync(join(cwd, 'nowhere'), join(cwd, 'dangling'));
  await failure(
    'name-allocate',
    { cwd, family: 'review-report-local', dir: 'dangling' },
    'UNSAFE_PATH',
  );
});

test('name-allocate re-codes a dangling planDir to UNSAFE_PATH', async (t) => {
  // plan: "Error mapping" — PlanLintError NOT_FOUND from root resolution is UNSAFE_PATH.
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'docs'));
  symlinkSync(join(cwd, 'missing'), join(cwd, 'docs', 'plan'));
  await failure(
    'name-allocate',
    { cwd, family: 'plan', dir: 'docs/plan', text: 'x' },
    'UNSAFE_PATH',
  );
});

test('name-allocate stops with archive-unusable on a dangling archive symlink', async (t) => {
  // plan: "Import, never copy" — archiveIgnored and archive-unusable.
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'docs', 'plan'), { recursive: true });
  symlinkSync(join(cwd, 'missing'), join(cwd, 'docs', 'plan', 'archive'));
  for (const extra of [{ family: 'plan' }, { family: 'unattended-plan', issue: 4 }]) {
    const result = await data('name-allocate', { cwd, dir: 'docs/plan', text: 'x', ...extra });
    assert.equal(result.outcome, 'archive-unusable');
    assert.equal(result.archiveIgnored, true);
    assert.equal(result.name, undefined);
  }
});

// ---------------------------------------------------------------------------------------------
// Delivery branch naming (worktree-integration.md step 4; plan: "Delivery branch naming")

async function branch(input, git = fakeGit({ remotes: ['origin'] })) {
  return await data(
    'delivery-branch-name',
    {
      cwd: tmpdir(),
      branchPrefix: '',
      skill: 'build',
      visibility: 'visible',
      ...input,
    },
    { runner: git.runner },
  );
}

test('hidden mode strips every disclosure form with attached letters or digits', async () => {
  // worktree-integration.md step 4: remove matches with attached letters or digits up to the
  // nearest hyphen, collapse hyphens, repeat, fall back to `change`.
  const cases = [
    ['effectiveflow login', 'login'],
    ['Effective-Flow login', 'login'],
    ['effective_flow login', 'login'],
    ['effective.flow login', 'login'],
    ['myeffectiveflow2-login', 'login'],
    ['fix effective-effective-flow-flow now', 'fix-now'],
    ['effective-effective-flow-flow', 'change'],
    ['effectiveflow', 'change'],
  ];
  for (const [text, slug] of cases) {
    const result = await branch({ text, visibility: 'hidden' });
    assert.equal(result.outcome, 'named');
    assert.equal(result.slug, slug, text);
    assert.equal(result.branch, `build/${slug}`);
    assert.equal(result.originalSlug, slugify(text));
    assert.equal(result.sanitized, true);
    // plan: "Case-sensitivity reconciliation" — every stripped branch passes assertUndisclosed.
    assert.doesNotThrow(() => assertUndisclosed(result.branch, 'branch'));
  }
});

test('visible mode keeps the product name and an empty slug becomes change', async () => {
  const visible = await branch({ text: 'Effective Flow login' });
  assert.equal(visible.branch, 'build/effective-flow-login');
  assert.equal(visible.sanitized, false);
  const empty = await branch({ text: '!!!' });
  assert.equal(empty.branch, 'build/change');
});

test('a disclosing prefix in hidden mode returns prefix-discloses and no name', async () => {
  // plan: "Delivery branch naming" — the full name must pass assertUndisclosed.
  const result = await branch({
    text: 'login',
    visibility: 'hidden',
    branchPrefix: 'Effective-Flow',
  });
  assert.equal(result.outcome, 'prefix-discloses');
  assert.equal(result.branch, undefined);
});

test('an empty prefix gives <skill>/<slug>, a prefix gives <prefix>/<skill>/<slug>', async () => {
  // worktree-integration.md step 4.
  assert.equal((await branch({ text: 'User login' })).branch, 'build/user-login');
  assert.equal(
    (await branch({ text: 'User login', branchPrefix: 'team/x', skill: 'fix' })).branch,
    'team/x/fix/user-login',
  );
});

test('excludeNames feeds caller-found names back into the -2 suffix rule', async () => {
  // plan: "Caller-side checks (user decision)".
  const base = { text: 'foo', branchPrefix: 'x' };
  assert.equal((await branch({ ...base, excludeNames: ['x/build/foo'] })).branch, 'x/build/foo-2');
  assert.equal(
    (await branch({ ...base, excludeNames: ['x/build/foo', 'x/build/foo-2'] })).branch,
    'x/build/foo-3',
  );
  for (const bad of ['bad..name', '-x', 'a b', '']) {
    await failure(
      'delivery-branch-name',
      { cwd: tmpdir(), skill: 'build', visibility: 'visible', ...base, excludeNames: [bad] },
      'INVALID_INPUT',
      { runner: fakeGit({ remotes: ['origin'] }).runner },
    );
  }
});

test('a local branch or a remote-tracking ref of any remote counts as taken', async () => {
  // plan: "Delivery branch naming" — local branch or same-named remote-tracking ref.
  const local = fakeGit({ remotes: ['origin'], refs: { 'refs/heads/build/foo': OID_A } });
  assert.equal((await branch({ text: 'foo' }, local)).branch, 'build/foo-2');
  const tracking = fakeGit({
    remotes: ['origin', 'upstream'],
    refs: {
      'refs/remotes/upstream/build/foo': OID_A,
      'refs/remotes/origin/build/foo-2': OID_B,
    },
  });
  assert.equal((await branch({ text: 'foo' }, tracking)).branch, 'build/foo-3');
});

test('delivery-branch-name rejects unknown skills, visibilities and unsafe prefixes', async () => {
  const runner = fakeGit({ remotes: ['origin'] }).runner;
  for (const input of [
    { skill: 'nope' },
    { skill: 'x/../y' },
    { visibility: 'standard' },
    { branchPrefix: 'a..b' },
    { branchPrefix: '-x' },
    { surprise: 1 },
  ]) {
    await failure(
      'delivery-branch-name',
      {
        cwd: tmpdir(),
        branchPrefix: '',
        skill: 'build',
        visibility: 'visible',
        text: 'x',
        ...input,
      },
      'INVALID_INPUT',
      { runner },
    );
  }
});

// ---------------------------------------------------------------------------------------------
// Closed enums against build.mjs (plan: "Input schemas")

test('skill and workflow enums match the tools that produce branches and reports', () => {
  const buildSource = readFileSync(new URL('build.mjs', ROOT), 'utf8');
  const tools = readdirSync(new URL('src/tools/', ROOT))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3));
  const includes = (tool, fragment) =>
    new RegExp(`\`\`\`(?:lazy-)?include\\n${fragment}\\n`).test(
      readFileSync(new URL(`src/tools/${tool}.md`, ROOT), 'utf8'),
    );
  // An eager or lazy include counts. A branch producer embeds worktree-integration (step 4 names branches) or is `deliver`, which
  // names `<prefix>/deliver/<slug>` itself (deliver.md step 3.2).
  const branchProducers = tools.filter((tool) => includes(tool, 'worktree-integration'));
  assert.deepEqual([...BRANCH_SKILLS].sort(), [...branchProducers, 'deliver'].sort());
  // A workflow report producer embeds unresolved-review-report (step 3 names `WORKFLOW`).
  const reportProducers = tools.filter((tool) => includes(tool, 'unresolved-review-report'));
  assert.deepEqual([...REPORT_WORKFLOWS].sort(), reportProducers.sort());
  // Every entry is a routed tool name in build.mjs.
  for (const tool of new Set([...BRANCH_SKILLS, ...REPORT_WORKFLOWS])) {
    assert.match(buildSource, new RegExp(`'${tool}'`), `${tool} is a build.mjs tool name`);
  }
});

// ---------------------------------------------------------------------------------------------
// Imports (plan: "Acceptance criteria" — the core imports exactly three leaf cores)

test('the core imports only node built-ins and the three owning leaf cores', () => {
  const source = readFileSync(CORE_PATH, 'utf8');
  // Both `import … from '<spec>'` and a side-effect `import '<spec>'` widen the load graph.
  const specifiers = [
    ...source.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/gm),
    ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
  ].map((match) => match[1]);
  const relative = specifiers.filter((specifier) => specifier.startsWith('.'));
  assert.deepEqual([...new Set(relative)].sort(), [
    './delivery-selection-core.mjs',
    './plan-lint-core.mjs',
    './remote-tracker-shared-core.mjs',
  ]);
  for (const specifier of specifiers.filter((value) => !value.startsWith('.'))) {
    assert.match(specifier, /^node:/);
  }
  for (const absent of ['process-runner', 'plan-publication-core', 'setup-status-core']) {
    assert.ok(!specifiers.some((specifier) => specifier.includes(absent)), absent);
  }
  assert.ok(!specifiers.includes('node:child_process'), 'the core spawns nothing');
  assert.doesNotMatch(source, /\bimport\s*\(/, 'no dynamic import widens the load graph');
});

// ---------------------------------------------------------------------------------------------
// ADR numbering (project-adr-convention.md; plan: "ADR numbering")

test('adr-observe applies the evidence exclusions and classifies the set', async (t) => {
  // project-adr-convention.md "Observed evidence".
  const cwd = tempRoot(t);
  const observe = async (files) => {
    rmSync(join(cwd, 'adr'), { recursive: true, force: true });
    mkdirSync(join(cwd, 'adr'));
    for (const file of files) write(cwd, `adr/${file}`, '# x\n');
    return await data('adr-observe', { cwd, adrDir: 'adr' });
  };
  const excluded = [
    'README.md',
    'index.md',
    '0001-effective-flow-project-setup.md',
    'firmo-project-setup.md',
    '7_effective-flow-project-setup.md',
  ];
  const numbered = await observe([...excluded, '001-a.md', '002-b.md']);
  assert.equal(numbered.outcome, 'numbered');
  assert.equal(numbered.width, 3);
  assert.deepEqual(numbered.files, ['001-a.md', '002-b.md']);
  assert.equal((await observe(['a.md', 'b.md', ...excluded])).outcome, 'numberless');
  assert.equal((await observe(['0001-a.md', 'b.md'])).outcome, 'inconclusive');
  assert.equal((await observe(['01-a.md', '001-b.md'])).outcome, 'inconclusive');
  assert.equal((await observe(['0001_a.md'])).outcome, 'inconclusive');
  assert.equal((await observe(excluded)).outcome, 'none');
  assert.equal((await observe([])).outcome, 'none');
  rmSync(join(cwd, 'adr'), { recursive: true });
  assert.equal((await data('adr-observe', { cwd, adrDir: 'adr' })).outcome, 'none');
});

async function allocateAdr(cwd, input, deps) {
  return await data(
    'adr-allocate',
    {
      cwd,
      adrDir: 'adr',
      convention: 'numbered',
      declaredWidth: null,
      text: 'Use JSON',
      previousTarget: null,
      ...input,
    },
    deps,
  );
}

test('adr-allocate starts at 0001 and resolves width declared, observed, then four', async (t) => {
  // project-adr-convention.md "Allocation and collision": declared width, observed, then four.
  const cwd = tempRoot(t);
  const first = await allocateAdr(cwd, {});
  assert.equal(first.outcome, 'allocated');
  assert.equal(first.name, '0001-use-json.md');
  assert.equal(first.path, 'adr/0001-use-json.md');
  assert.equal(first.widened, false);
  assert.equal((await allocateAdr(cwd, { declaredWidth: 3 })).name, '001-use-json.md');
  assert.equal((await allocateAdr(cwd, { declaredWidth: 11 })).name, '0001-use-json.md');
  write(cwd, 'adr/01-a.md', '# a\n');
  assert.equal((await allocateAdr(cwd, { declaredWidth: 0 })).name, '02-use-json.md');
  assert.equal((await allocateAdr(cwd, {})).name, '02-use-json.md');
});

test('adr-allocate scans excluded files for numbers and reads an underscore separator', async (t) => {
  // project-adr-convention.md: width reads the evidence set, the number reads all files.
  const cwd = tempRoot(t);
  write(cwd, 'adr/001-foo.md', '# a\n');
  write(cwd, 'adr/0002-effective-flow-project-setup.md', '# b\n');
  assert.equal((await allocateAdr(cwd, {})).name, '003-use-json.md');
  write(cwd, 'adr/0009_legacy.md', '# c\n');
  assert.equal((await allocateAdr(cwd, { declaredWidth: 4 })).name, '0010-use-json.md');
});

test('adr-allocate widens on saturation and never wraps', async (t) => {
  // project-adr-convention.md: widen the pad by one digit; numbering never wraps.
  const cwd = tempRoot(t);
  write(cwd, 'adr/9999-x.md', '# x\n');
  const widened = await allocateAdr(cwd, {});
  assert.equal(widened.name, '10000-use-json.md');
  assert.equal(widened.widened, true);
});

test('a trailing slash or a ./ prefix on adrDir allocates like the bare directory', async (t) => {
  // The parent test compares normalized forms, so `adr/` and `./adr` are never `unrecognized`.
  const cwd = tempRoot(t);
  write(cwd, 'adr/0001-a.md', '# a\n');
  for (const adrDir of ['adr/', './adr', 'adr//']) {
    const observed = await data('adr-observe', { cwd, adrDir });
    assert.equal(observed.outcome, 'numbered', adrDir);
    assert.equal(observed.width, 4, adrDir);
    const first = await allocateAdr(cwd, { adrDir });
    assert.equal(first.outcome, 'allocated', adrDir);
    assert.equal(first.path, 'adr/0002-use-json.md', adrDir);
    const second = await allocateAdr(cwd, { adrDir, previousTarget: first.path });
    assert.equal(second.outcome, 'allocated', adrDir);
    assert.equal(second.path, 'adr/0002-use-json.md', adrDir);
    const viaPrefix = await allocateAdr(cwd, { adrDir, previousTarget: './adr/0002-use-json.md' });
    assert.equal(viaPrefix.outcome, 'allocated', adrDir);
  }
});

test('adr-allocate stops on unrecognized under numberless instead of re-calling', async (t) => {
  // project-adr-convention.md "Allocation and collision": the outcome is the same on every call.
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'adr'));
  const result = await allocateAdr(cwd, {
    convention: 'numberless',
    previousTarget: 'adr/Bad_Name.md',
  });
  assert.equal(result.outcome, 'unrecognized');
});

test('adr-allocate writes a numberless slug for the numberless convention', async (t) => {
  const cwd = tempRoot(t);
  const result = await allocateAdr(cwd, { convention: 'numberless' });
  assert.equal(result.name, 'use-json.md');
  assert.equal(result.widened, false);
});

test('adr-allocate stops on a symlink at the target, dangling included', async (t) => {
  // project-adr-convention.md "Allocation and collision": the symlink hard stop runs first.
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'adr'));
  symlinkSync(join(cwd, 'missing.md'), join(cwd, 'adr', 'use-json.md'));
  const first = await allocateAdr(cwd, { convention: 'numberless' });
  assert.equal(first.outcome, 'symlink-stop');
  assert.equal(first.path, 'adr/use-json.md');
  const second = await allocateAdr(cwd, {
    convention: 'numberless',
    previousTarget: 'adr/use-json.md',
  });
  assert.equal(second.outcome, 'symlink-stop');
});

test('adr-allocate reports an unrecognized name or parent', async (t) => {
  // project-adr-convention.md "Allocation and collision": a failing name or parent is unrecognized.
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'adr'));
  assert.equal(
    (await allocateAdr(cwd, { previousTarget: 'adr/Bad_Name.md' })).outcome,
    'unrecognized',
  );
  assert.equal(
    (await allocateAdr(cwd, { previousTarget: 'other/0001-use-json.md' })).outcome,
    'unrecognized',
  );
});

test('an ADR directory outside the repository is outside-repo-stop, not UNSAFE_PATH', async (t) => {
  // project-adr-convention.md "Allocation and collision": hard stop naming the resolved path.
  const cwd = tempRoot(t);
  const outside = tempRoot(t);
  symlinkSync(outside, join(cwd, 'adr'));
  for (const operation of ['adr-allocate', 'adr-observe']) {
    const input =
      operation === 'adr-observe'
        ? { cwd, adrDir: 'adr' }
        : {
            cwd,
            adrDir: 'adr',
            convention: 'numbered',
            declaredWidth: null,
            text: 'x',
            previousTarget: null,
          };
    const result = await data(operation, input);
    assert.equal(result.outcome, 'outside-repo-stop');
    assert.equal(result.resolvedPath, outside);
  }
});

test('adr-allocate collision protocol', async (t) => {
  // project-adr-convention.md "Allocation and collision": the second call is the existence check.
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'adr'));
  const free = await allocateAdr(cwd, { previousTarget: 'adr/0001-use-json.md' });
  assert.equal(free.outcome, 'allocated');
  assert.equal(free.name, '0001-use-json.md');

  write(cwd, 'adr/0001-use-json.md', '# taken\n');
  const reallocated = await allocateAdr(cwd, { previousTarget: 'adr/0001-use-json.md' });
  assert.equal(reallocated.outcome, 'reallocated');
  assert.equal(reallocated.name, '0002-use-json.md');
  assert.equal(reallocated.widened, false);

  // The re-allocated path is taken too (a writer raced the scan): a second collision stops.
  const racing = {
    ...nodeFs,
    lstatSync(target, ...rest) {
      if (target.endsWith('0002-use-json.md')) return nodeFs.lstatSync(join(cwd, 'adr'));
      return nodeFs.lstatSync(target, ...rest);
    },
  };
  const stop = await allocateAdr(cwd, { previousTarget: 'adr/0001-use-json.md' }, { fs: racing });
  assert.equal(stop.outcome, 'collision-stop');
  assert.deepEqual(stop.paths, ['adr/0001-use-json.md', 'adr/0002-use-json.md']);

  write(cwd, 'adr/use-json.md', '# taken\n');
  const numberless = await allocateAdr(cwd, {
    convention: 'numberless',
    previousTarget: 'adr/use-json.md',
  });
  assert.equal(numberless.outcome, 'collision-stop');
  assert.deepEqual(numberless.paths, ['adr/use-json.md']);
});

test('adr operations refuse a parent segment or a dangling ADR directory', async (t) => {
  const cwd = tempRoot(t);
  await failure('adr-observe', { cwd, adrDir: '../adr' }, 'UNSAFE_PATH');
  symlinkSync(join(cwd, 'missing'), join(cwd, 'adr'));
  await failure('adr-observe', { cwd, adrDir: 'adr' }, 'UNSAFE_PATH');
  await failure(
    'adr-allocate',
    {
      cwd,
      adrDir: 'x',
      convention: 'sometimes',
      declaredWidth: null,
      text: 'x',
      previousTarget: null,
    },
    'INVALID_INPUT',
  );
  await failure(
    'adr-allocate',
    {
      cwd,
      adrDir: 'x',
      convention: 'numbered',
      declaredWidth: null,
      text: '!!',
      previousTarget: null,
    },
    'INVALID_INPUT',
  );
});

// ---------------------------------------------------------------------------------------------
// Plan-reference resolution (plan-reference-routing.md, plan-numbering.md "Resolve a plan
// reference"; plan: "Plan-reference resolution is exact")

const OPEN_PLAN = (title) => `# ${title}\n\n**Plan status:** Not implemented\n`;

async function resolve(cwd, reference, planDir = 'docs/plan') {
  return await data('plan-reference-resolve', { cwd, planDir, reference });
}

test('a legacy number resolves through the H1 before the file-name segment', async (t) => {
  // plan-numbering.md: "resolved primarily via the H1 `# NNNN: …`".
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/2026-01-01-2024-retrospective.md', OPEN_PLAN('2024 Retrospective'));
  write(cwd, 'docs/plan/archive/2025-02-02-2024-real-plan.md', OPEN_PLAN('2024: Real plan'));
  const result = await resolve(cwd, '2024');
  assert.equal(result.outcome, 'resolved');
  assert.equal(result.path, 'docs/plan/archive/2025-02-02-2024-real-plan.md');
  assert.equal(result.location, 'archive');
  assert.equal(result.exact, false);
});

test('an unmigrated NNNN-slug file resolves by number and by slug', async (t) => {
  // plan: "Legacy number" — the file-name segment counts for a file without an H1.
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/0007-foo.md', '**Plan status:** Not implemented\n');
  assert.equal((await resolve(cwd, '0007')).path, 'docs/plan/0007-foo.md');
  assert.equal((await resolve(cwd, 'foo')).path, 'docs/plan/0007-foo.md');
});

test('a file name with or without .md resolves exactly and reads the status', async (t) => {
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  for (const reference of ['2026-01-01-feature.md', '2026-01-01-feature']) {
    const result = await resolve(cwd, reference);
    assert.equal(result.outcome, 'resolved');
    assert.equal(result.path, 'docs/plan/2026-01-01-feature.md');
    assert.equal(result.location, 'top');
    assert.equal(result.status, 'open');
    assert.equal(result.exact, true);
    assert.equal(result.archiveIgnored, false);
  }
});

test('ambiguity is reported, never resolved by picking', async (t) => {
  // plan-reference-routing.md: "If multiple files match: ask the user".
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/2026-01-01-dup.md', OPEN_PLAN('Dup'));
  write(cwd, 'docs/plan/archive/2026-01-01-dup.md', OPEN_PLAN('Dup'));
  const duplicate = await resolve(cwd, '2026-01-01-dup.md');
  assert.equal(duplicate.outcome, 'ambiguous');
  assert.deepEqual(
    duplicate.candidates.map((entry) => entry.path),
    ['docs/plan/2026-01-01-dup.md', 'docs/plan/archive/2026-01-01-dup.md'],
  );
  write(cwd, 'docs/plan/2026-02-02-twin.md', OPEN_PLAN('Twin'));
  write(cwd, 'docs/plan/2026-03-03-twin.md', OPEN_PLAN('Twin'));
  assert.equal((await resolve(cwd, 'twin')).outcome, 'ambiguous');
});

test('a substring-only slug is not-found', async (t) => {
  // plan: "Title slug" — no substring or prefix match.
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  assert.equal((await resolve(cwd, 'feat')).outcome, 'not-found');
  assert.equal((await resolve(cwd, 'docs/plan/2026-01-01-missing.md')).outcome, 'not-found');
});

test('a path inside planDir resolves relative or absolute; outside is outside-plan-dir', async (t) => {
  // plan-reference-routing.md "full path": a path elsewhere is an answer hosts fall through on,
  // never UNSAFE_PATH, which stops every host.
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  write(cwd, 'docs/other/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  const absolute = await resolve(cwd, join(cwd, 'docs/plan/2026-01-01-feature.md'));
  assert.equal(absolute.outcome, 'resolved');
  assert.equal(absolute.exact, true);
  const relative = await resolve(cwd, 'docs/plan/2026-01-01-feature.md');
  assert.equal(relative.path, 'docs/plan/2026-01-01-feature.md');
  for (const reference of [
    'docs/other/2026-01-01-feature.md',
    join(cwd, 'docs/other/2026-01-01-feature.md'),
    join(tempRoot(t), 'x.md'),
    '../elsewhere/x.md',
    'src/index.ts',
    'docs\\other\\x.md',
    'docs/plan/sub/x.md',
    cwd,
  ]) {
    const result = await resolve(cwd, reference);
    assert.deepEqual(result, { outcome: 'outside-plan-dir', archiveIgnored: false }, reference);
  }
  // A path back into the plan directory resolves after normalization.
  assert.equal(
    (await resolve(cwd, 'docs/other/../plan/2026-01-01-feature.md')).outcome,
    'resolved',
  );
});

test('a plan-directory path whose file escapes through a symlink stays UNSAFE_PATH', async (t) => {
  // Containment failures inside the plan directory are unsafe state, not outside-plan-dir.
  const cwd = tempRoot(t);
  write(cwd, 'docs/other/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  mkdirSync(join(cwd, 'docs/plan'));
  symlinkSync(
    join(cwd, 'docs/other/2026-01-01-feature.md'),
    join(cwd, 'docs/plan/2026-01-01-feature.md'),
  );
  await failure(
    'plan-reference-resolve',
    { cwd, planDir: 'docs/plan', reference: 'docs/plan/2026-01-01-feature.md' },
    'UNSAFE_PATH',
  );
});

test('a dangling planDir is UNSAFE_PATH and a dangling archive sets archiveIgnored', async (t) => {
  // plan: "Error mapping" (NOT_FOUND from root resolution) and "archiveIgnored".
  const cwd = tempRoot(t);
  mkdirSync(join(cwd, 'docs'));
  symlinkSync(join(cwd, 'missing'), join(cwd, 'docs', 'plan'));
  // Every reference form stops on unsafe root state, keeping the re-coded origin in details.
  for (const reference of ['x', '0030', '2026-01-01-feature.md', 'docs/plan/2026-01-01-x.md']) {
    const envelope = await executeOperation('plan-reference-resolve', {
      cwd,
      planDir: 'docs/plan',
      reference,
    });
    assert.equal(envelope.ok, false, reference);
    assert.equal(envelope.error.code, 'UNSAFE_PATH', reference);
    assert.deepEqual(envelope.error.details, { sourceCode: 'NOT_FOUND' }, reference);
  }
  const other = tempRoot(t);
  write(other, 'docs/plan/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  const noArchive = await resolve(other, 'feature');
  assert.equal(noArchive.outcome, 'resolved');
  assert.equal(noArchive.archiveIgnored, false);
  symlinkSync(join(other, 'missing'), join(other, 'docs', 'plan', 'archive'));
  const ignored = await resolve(other, 'feature');
  assert.equal(ignored.outcome, 'resolved');
  assert.equal(ignored.archiveIgnored, true);
  // An unusable archive answers the path form like the name form: not-found, never UNSAFE_PATH,
  // also when the archive escapes to an existing directory that holds the referenced file.
  const escaping = tempRoot(t);
  const outside = tempRoot(t);
  write(escaping, 'docs/plan/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  write(outside, '2026-01-01-old.md', OPEN_PLAN('Old'));
  symlinkSync(outside, join(escaping, 'docs', 'plan', 'archive'));
  for (const root of [other, escaping]) {
    for (const reference of ['2026-01-01-old.md', 'docs/plan/archive/2026-01-01-old.md']) {
      assert.deepEqual(
        await resolve(root, reference),
        { outcome: 'not-found', archiveIgnored: true },
        reference,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Base-branch resolution with a fake runner (base-branch-resolution.md; plan: "Base-branch
// resolution, split along the fetch")

function revParseCallsUseGuards(calls) {
  for (const call of calls.filter((entry) => entry.args.includes('rev-parse'))) {
    assert.ok(call.args.includes('--verify'), call.args.join(' '));
    assert.ok(call.args.includes('--end-of-options'), call.args.join(' '));
  }
}

test('base-branch-resolve classifies against the remote list and derives the default', async () => {
  // base-branch-resolution.md: default from origin/HEAD, else origin/main; first-segment remote.
  const withHead = fakeGit({
    remotes: ['origin'],
    symbolic: { 'refs/remotes/origin/HEAD': 'refs/remotes/origin/develop' },
  });
  const derived = await data(
    'base-branch-resolve',
    { cwd: tmpdir(), configured: null },
    { runner: withHead.runner },
  );
  assert.equal(derived.outcome, 'fetch-required');
  assert.deepEqual([derived.remote, derived.branch], ['origin', 'develop']);
  const fallback = fakeGit({ remotes: ['origin'] });
  const main = await data(
    'base-branch-resolve',
    { cwd: tmpdir(), configured: null },
    { runner: fallback.runner },
  );
  assert.deepEqual([main.remote, main.branch], ['origin', 'main']);
  assert.equal(fetchCalls(fallback.calls).length, 0);
  assert.equal(
    fallback.calls.some((call) => call.args.includes('rev-parse')),
    false,
    'the remote arm never resolves a local ref',
  );
});

test('base-branch-resolve local arm: as written, then substituted once, else unresolvable', async () => {
  const git = fakeGit({
    remotes: [],
    refs: { 'refs/heads/develop': OID_A, 'refs/heads/feature/foo': OID_B },
  });
  const deps = { runner: git.runner };
  const resolved = await data(
    'base-branch-resolve',
    { cwd: tmpdir(), configured: 'feature/foo' },
    deps,
  );
  assert.equal(resolved.outcome, 'resolved');
  assert.equal(resolved.baseRef, 'feature/foo');
  assert.equal(resolved.localBranch, 'feature/foo');
  const substituted = await data(
    'base-branch-resolve',
    { cwd: tmpdir(), configured: 'origin/develop' },
    deps,
  );
  assert.equal(substituted.outcome, 'resolved-substituted');
  assert.equal(substituted.baseRef, 'develop');
  assert.equal(substituted.localBranch, 'develop');
  for (const configured of ['origin/nope', 'nope', '-x']) {
    const result = await data('base-branch-resolve', { cwd: tmpdir(), configured }, deps);
    assert.equal(result.outcome, 'unresolvable', configured);
  }
  revParseCallsUseGuards(git.calls);
});

function fetchGit(overrides = {}) {
  return fakeGit({
    remotes: ['origin', 'upstream'],
    refs: {
      FETCH_HEAD: OID_A,
      'refs/remotes/origin/develop': OID_A,
      'refs/remotes/origin/main': OID_B,
      'refs/remotes/upstream/develop': OID_A,
      'refs/heads/develop': OID_B,
    },
    symbolic: { 'refs/remotes/origin/HEAD': 'refs/remotes/origin/main' },
    ...overrides,
  });
}

async function fetchBase(git, input = {}) {
  return await run(
    'base-branch-fetch',
    { cwd: tmpdir(), remote: 'origin', branch: 'develop', deliberateDivergence: false, ...input },
    { runner: git.runner, env: {} },
  );
}

test('base-branch-fetch resolves the remote ref and reports origin/HEAD divergence', async () => {
  const git = fetchGit();
  const envelope = await fetchBase(git);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(envelope.data.outcome, 'resolved');
  assert.equal(envelope.data.baseRef, 'origin/develop');
  assert.equal(envelope.data.localBranch, 'develop');
  assert.deepEqual(envelope.data.divergence, { originHead: 'origin/main' });
  // Suppressed by the deliberate-divergence judgment; a non-origin remote is never compared.
  assert.equal((await fetchBase(fetchGit(), { deliberateDivergence: true })).data.divergence, null);
  const other = await fetchBase(fetchGit(), { remote: 'upstream' });
  assert.equal(other.data.divergence, null);
  const noHead = await fetchBase(fetchGit({ symbolic: {} }));
  assert.equal(noHead.data.divergence, null);
  revParseCallsUseGuards(git.calls);
});

test('the fetch is hardened: hooks off, --no-tags, --, non-interactive env, bounded group', async () => {
  // plan: "Import, never copy" — composed from the imported guard, env and hook constants.
  const git = fetchGit();
  await fetchBase(git);
  const [call] = fetchCalls(git.calls);
  assert.deepEqual(call.args.slice(2), [
    '-c',
    'core.hooksPath=/dev/null',
    'fetch',
    '--no-tags',
    '--quiet',
    '--',
    'origin',
    'refs/heads/develop',
  ]);
  assert.equal(call.timeoutMs, UPSTREAM_FETCH_TIMEOUT_MS);
  assert.equal(call.processGroup, true);
  assert.equal(call.timeout, undefined, 'the shipped runner reads timeoutMs, never timeout');
  // A credential prompt fails instead of hanging (the "Hang" edge case).
  assert.equal(call.env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(call.env.GIT_SSH_COMMAND, 'ssh -o BatchMode=yes');
});

test('a forced kill or timeout is fetch-failed', async () => {
  for (const result of [
    { status: null, signal: 'SIGKILL', forcedKill: true, stdout: '', stderr: '' },
    { status: null, signal: 'SIGTERM', timedOut: true, stdout: '', stderr: '' },
  ]) {
    const envelope = await fetchBase(fetchGit({ fetch: () => result }));
    assert.equal(envelope.data.outcome, 'fetch-failed');
  }
});

test('fetch-denied only for named sandbox patterns; SSH auth is fetch-failed', async () => {
  // plan: "base-branch-fetch" — named patterns only.
  const denied = [
    'error: sandbox denied network access',
    "fatal: unable to access 'https://example.invalid/r.git/': Failed to connect to example.invalid port 443: Operation not permitted",
    "error: cannot open '.git/FETCH_HEAD': Operation not permitted",
    "fatal: Unable to create '/repo/.git/refs/remotes/origin/develop.lock': Permission denied",
  ];
  for (const stderr of denied) {
    const envelope = await fetchBase(
      fetchGit({ fetch: () => ({ status: 128, stdout: '', stderr }) }),
    );
    assert.equal(envelope.data.outcome, 'fetch-denied', stderr);
  }
  const ssh = await fetchBase(
    fetchGit({
      fetch: () => ({
        status: 128,
        stdout: '',
        stderr:
          'git@example.invalid: Permission denied (publickey).\nfatal: Could not read from remote repository.',
      }),
    }),
  );
  assert.equal(ssh.data.outcome, 'fetch-failed');
  // A host or URL naming `sandbox` or `.git/`, or a server-side `remote:` line, is no local denial.
  for (const stderr of [
    'fatal: unable to access: Failed to connect to git.sandbox.example.com port 443: Connection refused',
    "fatal: repository 'https://sandbox.corp/r.git/' not found",
    'remote: error: cannot lock ref: /srv/git/r.git/refs/x.lock: Permission denied',
  ]) {
    const envelope = await fetchBase(
      fetchGit({ fetch: () => ({ status: 128, stdout: '', stderr }) }),
    );
    assert.equal(envelope.data.outcome, 'fetch-failed', stderr);
  }
});

test('fetch-failed stderr is redacted through diagnosticText', async () => {
  const envelope = await fetchBase(
    fetchGit({
      fetch: () => ({
        status: 128,
        stdout: '',
        stderr:
          "fatal: unable to access 'https://user:s3cret@example.invalid/r.git/?token=abc': 403",
      }),
    }),
  );
  assert.equal(envelope.data.outcome, 'fetch-failed');
  assert.doesNotMatch(envelope.data.error, /s3cret|abc/);
  assert.match(envelope.data.error, /example\.invalid/);
});

test('a stale or absent tracking ref after the fetch is tracking-stale, never resolved', async () => {
  // delivery-selection fetch.stale precedent: FETCH_HEAD against the tracking ref.
  const stale = await fetchBase(
    fetchGit({ refs: { FETCH_HEAD: OID_A, 'refs/remotes/origin/develop': OID_B } }),
  );
  assert.equal(stale.data.outcome, 'tracking-stale');
  const absent = await fetchBase(fetchGit({ refs: { FETCH_HEAD: OID_A } }));
  assert.equal(absent.data.outcome, 'tracking-stale');
  const nothing = await fetchBase(fetchGit({ refs: {} }));
  assert.equal(nothing.data.outcome, 'unresolvable');
});

test('injection attempts and unlisted remotes are INVALID_INPUT before any fetch', async () => {
  // plan: "Edge cases" — "Injection attempts".
  for (const input of [
    { branch: '--upload-pack=x' },
    { branch: '-x' },
    { branch: 'x:refs/heads/main' },
    { branch: '+x' },
    { branch: 'a\u0001b' },
    { remote: 'nope' },
    { remote: '--upload-pack=x' },
    { deliberateDivergence: 'yes' },
  ]) {
    const git = fetchGit();
    const envelope = await fetchBase(git, input);
    assert.equal(envelope.ok, false, JSON.stringify(input));
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
    assert.equal(fetchCalls(git.calls).length, 0, JSON.stringify(input));
  }
});

// ---------------------------------------------------------------------------------------------
// Error mapping (plan: "Error mapping" — one assertion per table row)

test('imported-core errors are re-coded at the core boundary, keeping their message', () => {
  const rows = [
    [new PlanLintError('INVALID_PAYLOAD', 'm1'), 'INVALID_INPUT'],
    [new PlanLintError('INVALID_CWD', 'm2'), 'INVALID_INPUT'],
    [new PlanLintError('UNSAFE_PATH', 'm3'), 'UNSAFE_PATH'],
    [new PlanLintError('NOT_FOUND', 'm4'), 'UNSAFE_PATH'],
    [new DeliverySelectionError('INVALID_PAYLOAD', 'm5'), 'INVALID_INPUT'],
    [new DeliverySelectionError('INVALID_PATH', 'm6'), 'INVALID_INPUT'],
    [new RemoteTrackerError('INVALID_PAYLOAD', 'm7'), 'INVALID_INPUT'],
    [new DeliverySelectionError('COMMAND_FAILED', 'm8'), 'COMMAND_FAILED'],
    [new Error('m9'), 'INTERNAL'],
  ];
  for (const [error, code] of rows) {
    const recoded = recodeError(error);
    assert.ok(recoded instanceof MechanicsError);
    assert.equal(recoded.code, code, error.message);
    assert.equal(recoded.message, error.message);
  }
  // A single missing entry during resolution is no candidate, not an error (covered above by
  // the not-found fixtures); the envelope carries code, message and details.
  const envelope = errorEnvelope('name-allocate', new PlanLintError('UNSAFE_PATH', 'x'));
  assert.deepEqual(envelope, {
    ok: false,
    operation: 'name-allocate',
    error: { code: 'UNSAFE_PATH', message: 'x', details: {} },
  });
  assert.equal(exitCodeFor(envelope), 3);
  assert.equal(exitCodeFor(errorEnvelope('x', new MechanicsError('INVALID_INPUT', 'x'))), 2);
  assert.equal(exitCodeFor(errorEnvelope('x', new MechanicsError('COMMAND_FAILED', 'x'))), 1);
  assert.equal(exitCodeFor(errorEnvelope('x', new Error('x'))), 1);
});

test('a failing git call through the runner is COMMAND_FAILED', async () => {
  const runner = async () => ({ status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } });
  await failure('base-branch-resolve', { cwd: tmpdir(), configured: 'main' }, 'COMMAND_FAILED', {
    runner,
  });
});

// ---------------------------------------------------------------------------------------------
// CLI (plan: "Architecture decisions" — thin JSON CLI)

function captureIo(overrides = {}) {
  const out = [];
  const err = [];
  let exitCode = 0;
  return {
    io: {
      stdout: { write: (chunk) => out.push(chunk) },
      stderr: { write: (chunk) => err.push(chunk) },
      setExitCode: (code) => {
        exitCode = code;
      },
      ...overrides,
    },
    out,
    err,
    exitCode: () => exitCode,
  };
}

const UNREADABLE = {
  [Symbol.asyncIterator]() {
    throw new Error('stdin must not be read');
  },
};

test('the CLI lists exactly the seven operations', () => {
  assert.deepEqual(
    [...MECHANICS_OPERATIONS],
    [
      'base-branch-resolve',
      'base-branch-fetch',
      'name-allocate',
      'delivery-branch-name',
      'adr-observe',
      'adr-allocate',
      'plan-reference-resolve',
    ],
  );
});

test('the CLI rejects an unknown operation before reading stdin', async () => {
  for (const argv of [['nope'], [], ['name-allocate', '--apply']]) {
    const capture = captureIo({ stdin: UNREADABLE });
    const envelope = await main(argv, capture.io);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.equal(capture.exitCode(), 2);
    assert.equal(capture.out.length, 1);
    assert.deepEqual(JSON.parse(capture.out[0]), envelope);
  }
});

test('the CLI caps stdin and rejects invalid JSON and unknown keys', async (t) => {
  const oversized = captureIo({
    stdin: Readable.from([Buffer.alloc(MAX_STDIN_BYTES + 1, 0x20)]),
  });
  assert.equal((await main(['name-allocate'], oversized.io)).error.code, 'INVALID_INPUT');
  assert.equal(oversized.exitCode(), 2);
  const invalid = captureIo({ stdin: Readable.from(['{nope']) });
  assert.equal((await main(['name-allocate'], invalid.io)).error.code, 'INVALID_INPUT');
  const array = captureIo({ stdin: Readable.from(['[]']) });
  assert.equal((await main(['name-allocate'], array.io)).error.code, 'INVALID_INPUT');
  const cwd = tempRoot(t);
  const unknown = captureIo({
    stdin: Readable.from([JSON.stringify({ cwd, adrDir: 'adr', extra: 1 })]),
  });
  assert.equal((await main(['adr-observe'], unknown.io)).error.code, 'INVALID_INPUT');
});

test('the CLI writes one envelope line and exits 3 on UNSAFE_PATH', async (t) => {
  const cwd = tempRoot(t);
  const ok = captureIo({
    stdin: Readable.from([JSON.stringify({ cwd, family: 'review-report-local', dir: 'r' })]),
  });
  const success = await main(['name-allocate'], ok.io);
  assert.equal(success.ok, true);
  assert.equal(success.data.outcome, 'allocated');
  assert.equal(ok.out.length, 1);
  assert.ok(ok.out[0].endsWith('\n'));
  assert.equal(ok.exitCode(), 0);
  const unsafe = captureIo({
    stdin: Readable.from([JSON.stringify({ cwd, family: 'review-report-local', dir: '../r' })]),
  });
  const refused = await main(['name-allocate'], unsafe.io);
  assert.equal(refused.error.code, 'UNSAFE_PATH');
  assert.equal(unsafe.exitCode(), 3);
});

test('the CLI runs as a script and answers with one envelope line', (t) => {
  const cwd = tempRoot(t);
  write(cwd, 'docs/plan/2026-01-01-feature.md', OPEN_PLAN('Feature'));
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('src/scripts/effective-flow-mechanics.mjs', ROOT)),
      'plan-reference-resolve',
    ],
    {
      input: JSON.stringify({ cwd, planDir: 'docs/plan', reference: 'feature' }),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.path, 'docs/plan/2026-01-01-feature.md');
});
