import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  symlinkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import test from 'node:test';

import { MAX_STDIN_BYTES, main as runCli } from '../src/scripts/backlog-audit.mjs';
import {
  BACKLOG_AUDIT_OPERATIONS,
  EPIC_END_MARKER,
  LABELS,
  OBSOLETE_MARKER,
  WRITE_ACTIONS,
  STALE_RUNTIME_MS,
  contentHash,
  deriveGoalSlug,
  driftSummary,
  errorEnvelope,
  exitCodeFor,
  executeOperation,
  parseManagedSection,
  readInputFile,
  spliceManagedSection,
  validateConfig,
} from '../src/scripts/backlog-audit-core.mjs';
import { bodyHash, buildDecompositionRecords } from '../src/scripts/remote-tracker-core.mjs';
import { decodeCell, flattenJsonConfiguration } from '../src/scripts/config-resolve-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const runner = createProcessRunner();
const NOW = () => new Date('2026-11-13T12:00:00Z');
const RANDOM = () => Buffer.from('a1b2c3d4', 'hex');
const FORGE = { kind: 'forge' };
const OPEN_PLAN = '# Plan\n\n**Plan status:** Not implemented\n\nBody.\n';

// --- Fixtures --------------------------------------------------------------------------------

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.test',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

// A main checkout with `.effective-flow/` ignored, tracked plans committed and untracked plans
// written afterwards.
function repository(t, { tracked = {}, untracked = {} } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'backlog-audit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  mkdirSync(join(root, 'docs/plan'), { recursive: true });
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  writeFileSync(join(root, 'docs/adr/runtime.md'), '# Runtime\n\nLine two.\nLine three.\n');
  for (const [name, text] of Object.entries(tracked))
    writeFileSync(join(root, 'docs/plan', name), text);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'seed');
  for (const [name, text] of Object.entries(untracked))
    writeFileSync(join(root, 'docs/plan', name), text);
  return root;
}

function issue(number, overrides = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: `SECRET body of issue ${number}`,
    state: 'open',
    labels: [],
    author: { login: 'owner' },
    ...overrides,
  };
}

// An in-memory forge behind the remote-tracker operation surface. Mutations change its state so
// a re-read after a write observes the write.
function forge({
  issues = [],
  comments = {},
  permissions = { owner: 'admin' },
  viewer = 'owner',
  capabilities = { issueSubIssueCreate: true },
  fail: failures = {},
} = {}) {
  const state = {
    issues: new Map(issues.map((entry) => [entry.number, structuredClone(entry)])),
    comments: new Map(
      Object.entries(comments).map(([key, list]) => [Number(key), structuredClone(list)]),
    ),
    labels: new Set(),
    next: 900,
  };
  const calls = [];
  const ok = (data) => ({ ok: true, data });
  const error = (code) => ({ ok: false, error: { code, message: code } });
  const tracker = async (operation, input, options = {}) => {
    calls.push({ operation, input, options });
    if (failures[operation]) return error(failures[operation]);
    const number = input.number;
    switch (operation) {
      case 'repository-resolve':
        return ok({ host: 'github.com', owner: 'example', repository: 'flow', provider: 'github' });
      case 'probe':
        return ok({ executable: 'gh', capabilities });
      case 'viewer-read':
        return ok({ result: { login: viewer } });
      case 'collaborator-permission-read': {
        const permission = permissions[input.login.toLowerCase()];
        // Forgejo refuses to state another user's permission to a non-admin with a 403.
        if (permission === 'FORBIDDEN')
          return {
            ok: false,
            error: { code: 'COMMAND_FAILED', message: 'refused', details: { status: 403 } },
          };
        return permission
          ? ok({ result: { login: input.login, permission } })
          : error('TARGET_NOT_FOUND');
      }
      case 'issue-list':
        return ok({
          result: [...state.issues.values()].filter(
            (entry) =>
              entry.state === 'open' &&
              (!input.labels || input.labels.every((label) => entry.labels.includes(label))),
          ),
        });
      case 'issue-comments-read':
        return ok({ result: state.comments.get(number) ?? [] });
      case 'issue-read':
        return ok({ result: state.issues.get(number) });
      case 'label-create':
        state.labels.add(input.payload.name);
        return ok({ result: { name: input.payload.name, created: true } });
      case 'issue-create': {
        const created = issue(state.next++, {
          title: input.payload.title,
          body: input.payload.body,
          labels: [...input.payload.labels],
        });
        state.issues.set(created.number, created);
        return ok({ result: created });
      }
      case 'issue-update-body': {
        const current = state.issues.get(number);
        if (bodyHash(current.body) !== input.expectedBodyHash) return error('STALE_WRITE');
        current.body = input.payload.body;
        return ok({ result: current });
      }
      case 'issue-comment': {
        const list = state.comments.get(number) ?? [];
        list.push({ id: state.next++, body: input.payload.body, author: { login: viewer } });
        state.comments.set(number, list);
        return ok({ result: { id: state.next } });
      }
      case 'issue-label-add':
        state.issues.get(number).labels.push(...input.payload.labels);
        return ok({ result: { number } });
      default:
        return error('UNEXPECTED_OPERATION');
    }
  };
  return { tracker, calls, state, mutations: () => calls.filter(({ options }) => options.apply) };
}

const noTracker = async () => assert.fail('no tracker call may happen here');

async function run(operation, input, deps = {}) {
  const envelope = await executeOperation(operation, input, {
    runner,
    now: NOW,
    randomBytes: RANDOM,
    ...deps,
  });
  // Stands in for the architecture-context leaf, whose summary verdict validation requires.
  if (operation === 'inventory-build' && envelope.data?.stopped === false)
    writeArchitectureSummary(envelope.data);
  return envelope;
}

async function ok(operation, input, deps) {
  const envelope = await run(operation, input, deps);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  return envelope.data;
}

async function proven(root, fake) {
  return ok('permission-prove', { cwd: root, target: FORGE }, { tracker: fake.tracker });
}

async function inventory(root, fake, extra = {}) {
  const permission = await proven(root, fake);
  const data = await ok(
    'inventory-build',
    {
      cwd: root,
      runtimeStateRoot: root,
      target: FORGE,
      permission,
      planDir: 'docs/plan',
      baseRef: 'HEAD',
      ...extra,
    },
    { tracker: fake.tracker },
  );
  return { permission, inventory: data };
}

function writeArchitectureSummary(data, text = '# Architecture\n\nSummary.\n') {
  writeFileSync(data.architectureSummaryPath, text);
}

function verdict(item, value, extra = {}) {
  return { item, verdict: value, rationale: `Because ${item}.`, ...extra };
}

function selectAll(writeSet, filter = () => true) {
  return writeSet.entries
    .filter((entry) => entry.status === 'available' && filter(entry))
    .map(({ id, hash }) => ({ id, hash }));
}

// --- Configuration and dispatch ------------------------------------------------------------

test('the operation set and the write allowlist hold no close, label removal or delete', () => {
  assert.deepEqual(BACKLOG_AUDIT_OPERATIONS, [
    'permission-prove',
    'epic-candidates',
    'snapshot-cleanup',
    'inventory-build',
    'bounds-check',
    'verdicts-validate',
    'write-set-build',
    'write-set-apply',
    'external-call-check',
  ]);
  assert.deepEqual(WRITE_ACTIONS, [
    'label-create',
    'issue-create',
    'issue-update-body',
    'issue-comment',
    'issue-label-add',
  ]);
  for (const forbidden of ['issue-close', 'issue-label-remove', 'issue-labels', 'delete'])
    assert.ok(!WRITE_ACTIONS.includes(forbidden), forbidden);
});

test('config validation applies defaults and rejects unknown or malformed backlogAudit keys', () => {
  assert.deepEqual(validateConfig({ 'tracker.mode': 'remote' }), {
    panel: [],
    maxItems: 80,
    maxSnapshotKiB: 400,
  });
  assert.deepEqual(
    validateConfig({
      'backlogAudit.panel': 'fable, fable,other-1',
      'backlogAudit.maxItems': 5,
      'backlogAudit.maxSnapshotKiB': 9,
    }),
    { panel: ['fable', 'other-1'], maxItems: 5, maxSnapshotKiB: 9 },
  );
  for (const config of [
    { 'backlogAudit.panels': 'fable' },
    { 'backlogAudit.panel': 'Fable Model' },
    { 'backlogAudit.maxItems': 0 },
    { 'backlogAudit.maxSnapshotKiB': 1.5 },
  ])
    assert.throws(() => validateConfig(config), /backlogAudit/);
});

test('the goal slug is deterministic and the CLI refuses unknown operations before reading stdin', async () => {
  assert.equal(
    deriveGoalSlug('Ship the Übersicht for #123 — v2!'),
    deriveGoalSlug('Ship the Übersicht for #123 — v2!'),
  );
  assert.equal(deriveGoalSlug('Ship the Übersicht for #123'), 'ship-the-uebersicht-for-123');
  const out = [];
  let code;
  const envelope = await runCli(['--help'], {
    stdin: { setEncoding() {}, [Symbol.asyncIterator]: () => assert.fail('stdin read') },
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write() {} },
    setExitCode: (value) => {
      code = value;
    },
  });
  assert.equal(envelope.ok, false);
  assert.equal(code, 2);
  assert.equal(out.length, 1);
  const parsed = await runCli(['permission-prove'], {
    stdin: Readable.from([JSON.stringify({ cwd: '/', target: { kind: 'local' } })]),
    stdout: { write() {} },
    stderr: { write() {} },
    setExitCode() {},
    deps: { tracker: noTracker },
  });
  assert.equal(parsed.data.mode, 'plans-only');
});

// --- Permission proof -----------------------------------------------------------------------

test('local, unset and hidden targets fall back to plans-only without any tracker call', async () => {
  for (const [target, reason] of [
    [{ kind: 'local' }, 'local-mode'],
    [{ kind: 'unset' }, 'unset-mode'],
    [{ kind: 'forge', visibility: 'hidden' }, 'hidden-mode'],
  ]) {
    const data = await ok('permission-prove', { cwd: '/', target }, { tracker: noTracker });
    assert.equal(data.mode, 'plans-only');
    assert.equal(data.proven, false);
    assert.equal(data.reason, reason);
    assert.equal(data.hint, reason === 'unset-mode' ? 'setup' : undefined);
  }
});

test('a forge proof needs the viewer identity and a write permission; anything else is plans-only', async (t) => {
  const root = repository(t);
  const writer = await proven(root, forge());
  assert.equal(writer.mode, 'tracker');
  assert.equal(writer.login, 'owner');
  assert.equal(writer.capabilities.decompose, true);
  for (const action of WRITE_ACTIONS) assert.equal(writer.capabilities[action], true);
  const reader = await proven(root, forge({ permissions: { owner: 'read' } }));
  assert.deepEqual(
    [reader.mode, reader.reason, reader.permission],
    ['plans-only', 'permission-insufficient', 'read'],
  );
  const noViewer = await proven(root, forge({ fail: { 'viewer-read': 'AUTH_FAILED' } }));
  assert.equal(noViewer.reason, 'viewer-unreadable');
  const noPermission = await proven(
    root,
    forge({ fail: { 'collaborator-permission-read': 'UNSUPPORTED_CAPABILITY' } }),
  );
  assert.equal(noPermission.reason, 'permission-unreadable');
  const unreachable = await run(
    'permission-prove',
    { cwd: root, target: FORGE },
    { tracker: forge({ fail: { probe: 'CLI_MISSING' } }).tracker },
  );
  assert.equal(unreachable.error.code, 'TRACKER_UNAVAILABLE');
  const noSplit = await proven(root, forge({ capabilities: {} }));
  assert.equal(noSplit.capabilities.decompose, false);
});

test('an external attestation is proven only with explicit read and write proof', async () => {
  const target = { kind: 'external', externalTool: 'linear' };
  const unknown = await ok('permission-prove', { cwd: '/', target }, { tracker: noTracker });
  assert.equal(unknown.reason, 'external-capability-unknown');
  const partial = await ok(
    'permission-prove',
    {
      cwd: '/',
      target,
      external: { connection: 'mcp:linear', readProven: true, writeProven: false },
    },
    { tracker: noTracker },
  );
  assert.equal(partial.reason, 'external-capability-unproven');
  const full = await ok(
    'permission-prove',
    {
      cwd: '/',
      target,
      external: {
        connection: 'mcp:linear',
        readProven: true,
        writeProven: true,
        actions: { 'issue-comment': true, 'issue-label-add': true },
        nativeContainer: true,
      },
    },
    { tracker: noTracker },
  );
  assert.equal(full.mode, 'tracker');
  assert.deepEqual(
    [
      full.capabilities['issue-comment'],
      full.capabilities['issue-create'],
      full.capabilities.decompose,
    ],
    [true, false, true],
  );
});

// --- Inventory ------------------------------------------------------------------------------

test('a plans-only inventory reads no tracker and lists open and unclear plans with base tracking', async (t) => {
  const root = repository(t, {
    tracked: {
      '2026-01-01-open.md': OPEN_PLAN,
      '2026-01-02-done.md': '# Done\n\n**Plan status:** Implemented\n',
    },
    untracked: { '2026-01-03-unclear.md': '# Unclear\n\nNo status.\n' },
  });
  const permission = await ok(
    'permission-prove',
    { cwd: root, target: { kind: 'local' } },
    { tracker: noTracker },
  );
  const data = await ok(
    'inventory-build',
    {
      cwd: root,
      runtimeStateRoot: root,
      target: { kind: 'local' },
      permission,
      planDir: 'docs/plan',
      baseRef: 'HEAD',
    },
    { tracker: noTracker },
  );
  assert.equal(data.mode, 'plans-only');
  assert.deepEqual(
    data.items.map(({ id, status, trackedOnBase }) => [id, status, trackedOnBase]),
    [
      ['plan:docs/plan/2026-01-01-open.md', 'open', true],
      ['plan:docs/plan/2026-01-03-unclear.md', 'unclear', false],
    ],
  );
  const issuesOnly = await run(
    'inventory-build',
    {
      cwd: root,
      runtimeStateRoot: root,
      target: { kind: 'local' },
      permission,
      planDir: 'docs/plan',
      scope: { issuesOnly: true },
    },
    { tracker: noTracker },
  );
  assert.equal(issuesOnly.error.code, 'ISSUES_ONLY_UNAVAILABLE');
});

test('the forge inventory classifies states, provenance and permissions and returns no issue text', async (t) => {
  const root = repository(t);
  const split = `<!-- effective-flow-backlog-audit-split date=2026-11-01 body=${bodyHash('SECRET body of issue 5')} -->\nSplit it.`;
  const childMarker = (parent) =>
    `<!-- effective-flow-decomposition-key:v2 ${Buffer.from(JSON.stringify({ target: 'forge', parent, key: 'part-a' })).toString('base64url')} -->`;
  const fake = forge({
    issues: [
      issue(1),
      issue(2, { labels: ['effective-flow-review-finding'] }),
      issue(3, { body: 'This is a follow-up to #1, please.' }),
      issue(4, { body: 'Abgespalten von #2 im letzten Lauf.', author: { login: 'stranger' } }),
      issue(5),
      issue(6, { body: `Child.\n\n${childMarker('#5')}` }),
      issue(7, { labels: ['effective-flow-issue-in-progress'] }),
      issue(8, {
        labels: [LABELS.epic],
        body: '<!-- effective-flow-backlog-audit goal=old -->\n' + EPIC_END_MARKER,
      }),
      issue(9, { labels: ['firmo-review-epic'] }),
      issue(10, { labels: [LABELS.obsolete] }),
      issue(11, { labels: ['effective-flow-follow-up-closed'] }),
      issue(12, { body: 'SECRET <!-- effective-flow-follow-up-admission:v1 --> admitted' }),
    ],
    comments: {
      1: [{ id: 1, body: 'SECRET comment', author: { login: 'stranger' } }],
      5: [{ id: 2, body: split, author: { login: 'owner' } }],
    },
    permissions: { owner: 'admin' },
  });
  const permission = await proven(root, fake);
  const proofCalls = fake.calls.length;
  const data = await ok(
    'inventory-build',
    { cwd: root, runtimeStateRoot: root, target: FORGE, permission, planDir: 'docs/plan' },
    { tracker: fake.tracker },
  );
  const items = new Map(data.items.map((item) => [item.id, item]));
  assert.deepEqual(
    data.excluded.map(({ id, reason }) => [id, reason]),
    [
      ['#8', 'goal-epic'],
      ['#9', 'legacy-review-epic'],
      ['#10', 'goal-obsolete'],
      ['#11', 'follow-up-closed'],
    ],
  );
  assert.equal(items.get('#7').state, 'in-flight');
  assert.deepEqual(items.get('#2').provenance.classes, ['review-finding']);
  assert.deepEqual(items.get('#3').provenance.classes, ['follow-up-reference']);
  assert.deepEqual(items.get('#4').provenance.classes, ['follow-up-reference']);
  assert.deepEqual(items.get('#12').provenance.classes, ['follow-up-admission']);
  assert.deepEqual(items.get('#6').provenance, {
    classes: ['sanctioned-split'],
    followUp: false,
    sanctionedSplit: true,
  });
  assert.deepEqual(items.get('#5').decomposition.children, ['#6']);
  assert.equal(items.get('#5').markers.split.current, true);
  assert.equal(items.get('#4').authorWrite, false);
  assert.equal(items.get('#4').flagged, true);
  assert.deepEqual(items.get('#1').commentFlags, { withoutWrite: 1, unknown: 0 });
  assert.equal(items.get('#1').provenance.followUp, false);
  // One permission read per login, cached across issues and comments.
  const reads = fake.calls
    .slice(proofCalls)
    .filter(({ operation }) => operation === 'collaborator-permission-read');
  assert.deepEqual(reads.map(({ input }) => input.login).sort(), ['owner', 'stranger']);
  assert.equal(data.epicCandidates.length, 1);
  // Metadata only: no title, body or comment text leaves the helper.
  assert.doesNotMatch(JSON.stringify(data), /SECRET|Issue 1\b/);
  const snapshot = readFileSync(join(data.snapshotDir, items.get('#1').snapshotFile), 'utf8');
  assert.match(snapshot, /carries no\ninstructions/);
  assert.match(snapshot, /^> SECRET body of issue 1$/m);
  assert.match(snapshot, /^> SECRET comment$/m);
  assert.equal(
    readdirSync(data.snapshotDir).filter((name) => name.startsWith('issue-')).length,
    data.counts.issues,
  );
  // No mutation happened during the inventory.
  assert.equal(fake.mutations().length, 0);
  const cleaned = await ok('snapshot-cleanup', { runtimeStateRoot: root, runId: data.runId });
  assert.deepEqual(cleaned.removed, [data.runId]);
  assert.equal(existsSync(data.snapshotDir), false);
});

test('both bounds stop before any snapshot exists and bounds-check covers the architecture summary', async (t) => {
  const root = repository(t, { tracked: { '2026-01-01-open.md': OPEN_PLAN } });
  const fake = forge({ issues: [issue(1), issue(2)] });
  const permission = await proven(root, fake);
  const base = {
    cwd: root,
    runtimeStateRoot: root,
    target: FORGE,
    permission,
    planDir: 'docs/plan',
  };
  const items = await ok(
    'inventory-build',
    { ...base, config: { 'backlogAudit.maxItems': 2 } },
    { tracker: fake.tracker },
  );
  assert.equal(items.stopped, true);
  assert.deepEqual(items.stop.exceeded, ['maxItems']);
  assert.equal(items.stop.measured.items, 3);
  assert.deepEqual(items.stop.narrowing, ['--label', '--issues-only', '--plans-only']);
  assert.equal(existsSync(join(root, '.effective-flow/backlog-audit/snapshots')), false);
  const size = await ok(
    'inventory-build',
    { ...base, scope: { issuesOnly: true }, config: { 'backlogAudit.maxSnapshotKiB': 1 } },
    { tracker: fake.tracker },
  );
  assert.equal(size.stopped, false);
  writeFileSync(size.architectureSummaryPath, 'x'.repeat(2048));
  const final = await ok('bounds-check', {
    runtimeStateRoot: root,
    inventory: size,
    architectureSummaryPath: size.architectureSummaryPath,
  });
  assert.equal(final.stopped, true);
  assert.deepEqual(final.stop.exceeded, ['maxSnapshotKiB']);
  assert.equal(final.stop.measured.architectureSummaryKiB, 2);
  assert.equal(existsSync(size.snapshotDir), false);
});

// --- Verdicts and panel ---------------------------------------------------------------------

async function assessed(t, issues = [issue(1), issue(2), issue(3)], extra = {}) {
  const root = repository(t, extra.repo);
  const fake = forge({ issues, ...extra.forge });
  const result = await inventory(root, fake, extra.inventory);
  return { root, fake, ...result };
}

test('verdict validation rejects missing, duplicate, unknown and uncited obsolete verdicts', async (t) => {
  const { root, inventory: data } = await assessed(t);
  const validate = (primary, more = {}) =>
    run('verdicts-validate', { cwd: root, inventory: data, primary, ...more });
  const problems = async (primary) =>
    (await validate(primary)).error.details.problems.map(({ code }) => code);
  assert.deepEqual(await problems({ verdicts: [verdict('#1', 'core')], path: ['#1'] }), [
    'missing',
  ]);
  assert.deepEqual(
    await problems({
      verdicts: [
        verdict('#1', 'drift'),
        verdict('#1', 'core'),
        verdict('#2', 'drift'),
        verdict('#3', 'drift'),
      ],
      path: [],
    }),
    ['duplicate'],
  );
  assert.deepEqual(
    await problems({
      verdicts: [
        verdict('#1', 'great'),
        verdict('#2', 'drift'),
        verdict('#3', 'drift'),
        verdict('#99', 'drift'),
      ],
      path: [],
    }),
    ['unknown-verdict', 'unknown-item', 'missing'],
  );
  writeFileSync(data.architectureSummaryPath, '# Summary\n');
  const obsolete = (citations) => ({
    verdicts: [
      verdict('#1', 'obsolete-architecture', { citations }),
      verdict('#2', 'drift'),
      verdict('#3', 'drift'),
    ],
    path: [],
  });
  assert.deepEqual(await problems(obsolete([])), ['obsolete-without-primary-citation']);
  assert.deepEqual(await problems(obsolete(['docs/adr/missing.md', 'docs/adr/runtime.md:99'])), [
    'obsolete-without-primary-citation',
  ]);
  assert.equal((await validate(obsolete(['docs/adr/runtime.md:3']))).ok, true);
  // Invariant: the architecture summary is exactly the inventory's path; a summary elsewhere is
  // refused rather than validated against, and the summary is never citable evidence.
  writeFileSync(join(root, 'docs/adr/summary.md'), '# Summary\n');
  const elsewhere = await validate(obsolete(['docs/adr/runtime.md']), {
    architectureSummaryPath: join(root, 'docs/adr/summary.md'),
  });
  assert.equal(elsewhere.error.code, 'INVALID_PAYLOAD');
  const relativeSummary = data.architectureSummaryPath.slice(root.length + 1);
  const summaryOnly = await validate(obsolete([relativeSummary]));
  assert.deepEqual(summaryOnly.error.details.problems[0].citationProblems, ['runtime-state']);
  assert.deepEqual(
    await problems({
      ...obsolete(['docs/adr/runtime.md']),
      verdicts: [verdict('#1', 'overlap'), verdict('#2', 'core'), verdict('#3', 'drift')],
      path: [],
    }),
    ['overlap-without-target', 'path-incomplete'],
  );
  const inside = await validate(obsolete(['.effective-flow/backlog-audit/x.md']));
  assert.equal(inside.error.details.problems[0].citationProblems[0], 'runtime-state');
});

test('the panel merge follows the precedence rules and counts only members that ran', async (t) => {
  const { root, inventory: data } = await assessed(t, [
    issue(1),
    issue(2),
    issue(3),
    issue(4),
    issue(5),
  ]);
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      verdict('#3', 'supporting'),
      verdict('#4', 'oversized'),
      verdict('#5', 'overlap', { overlapTarget: '#1' }),
    ],
    path: ['#1', '#4'],
    splits: [{ item: '#4', outline: 'Two parts.' }],
  };
  const member = (name, values) => ({
    member: name,
    verdicts: values.map(([item, value]) =>
      verdict(item, value, value === 'overlap' ? { overlapTarget: '#1' } : {}),
    ),
  });
  const merged = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary,
    panel: [
      member('fable', [
        ['#1', 'drift'],
        ['#2', 'drift'],
        ['#3', 'unclear'],
        ['#4', 'supporting'],
        ['#5', 'overlap'],
      ]),
      { member: 'other', skipped: 'not startable on this host' },
      { member: 'broken', verdicts: 'nope' },
    ],
  });
  const records = new Map(merged.records.map((record) => [record.item, record]));
  assert.equal(records.get('#1').verdict, 'core');
  assert.equal(records.get('#2').verdict, 'unclear');
  assert.equal(records.get('#2').primaryVerdict, 'obsolete-architecture');
  assert.equal(records.get('#3').verdict, 'supporting');
  assert.equal(records.get('#5').agreement, 'unanimous');
  assert.deepEqual(
    merged.decisionPoints.map(({ item, kind }) => [item, kind]),
    [
      ['#1', 'core-drift'],
      ['#2', 'obsolete-disagreement'],
      ['#4', 'path-membership'],
    ],
  );
  assert.deepEqual(
    merged.listedDisagreements.map(({ item }) => item),
    ['#3'],
  );
  assert.deepEqual(merged.path, ['#1', '#4']);
  assert.deepEqual(merged.panel.ran, ['fable']);
  assert.deepEqual(
    merged.panel.skipped.map(({ member: name }) => name),
    ['other', 'broken'],
  );
  const alone = await ok('verdicts-validate', { cwd: root, inventory: data, primary });
  assert.ok(alone.records.every(({ agreement }) => agreement === 'primary-only'));
});

test('drift shares count follow-ups by provenance and never count sanctioned splits', async (t) => {
  const childMarker = `<!-- effective-flow-decomposition-key:v2 ${Buffer.from(JSON.stringify({ target: 'forge', parent: '#1', key: 'part' })).toString('base64url')} -->`;
  const { root, inventory: data } = await assessed(
    t,
    [
      issue(1),
      issue(2, { body: `Part.\n\n${childMarker}` }),
      issue(3, { labels: ['effective-flow-review-finding'] }),
      issue(4, { body: 'Follow-up of #1.' }),
      issue(5, { body: 'Nachfolger von #3.' }),
      issue(6),
    ],
    {
      forge: {
        comments: {
          1: [
            {
              id: 1,
              body: `<!-- effective-flow-backlog-audit-split date=2026-11-01 body=${bodyHash('SECRET body of issue 1')} -->\nx`,
              author: { login: 'owner' },
            },
          ],
        },
      },
    },
  );
  const merged = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: {
      verdicts: [
        verdict('#1', 'oversized'),
        verdict('#2', 'core'),
        verdict('#3', 'core'),
        verdict('#4', 'supporting'),
        verdict('#5', 'drift'),
        verdict('#6', 'drift'),
      ],
      path: ['#1', '#2', '#3'],
    },
  });
  assert.deepEqual(merged.drift, {
    followUpShareCoreSupporting: { numerator: 2, denominator: 3, share: 0.667 },
    followUpShareDrift: { numerator: 1, denominator: 2, share: 0.5 },
    followUpOnPath: 1,
    sanctionedSplits: 1,
    noProvenance: 2,
  });
});

// --- Write set ------------------------------------------------------------------------------

async function writeSetFixture(
  t,
  {
    issues,
    comments,
    capabilities,
    primary,
    epic = { mode: 'new' },
    drafts,
    decisions,
    inventoryExtra,
    extraIssues = [],
    repo,
    language,
    reportFile = '2026-11-13-backlog-audit.md',
  },
) {
  const {
    root,
    fake,
    permission,
    inventory: data,
  } = await assessed(t, [...issues, ...extraIssues], {
    forge: { comments, ...(capabilities ? { capabilities } : {}) },
    inventory: inventoryExtra,
    repo,
  });
  const merged = await ok('verdicts-validate', { cwd: root, inventory: data, primary });
  const built = await run('write-set-build', {
    inventory: data,
    merged,
    permission,
    goal: 'Ship the portable build',
    epic,
    reportFile,
    date: '2026-11-13',
    drafts: drafts ?? { epic: { title: 'Goal: portable build' } },
    ...(decisions ? { decisions } : {}),
    ...(language ? { language } : {}),
  });
  return { root, fake, permission, inventory: data, merged, built };
}

const corePrimary = {
  verdicts: [verdict('#1', 'core'), verdict('#2', 'supporting'), verdict('#3', 'drift')],
  path: ['#1'],
};

test('a new epic is one create with its label, in the fixed order, with stable ids and hashes', async (t) => {
  const { built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: corePrimary,
  });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  const set = built.data;
  assert.deepEqual(
    set.entries.map(({ id }) => id),
    [`label-create:${LABELS.epic}`, 'epic:create'],
  );
  const create = set.entries[1];
  assert.deepEqual(create.payload.labels, [LABELS.epic]);
  assert.match(
    create.payload.body,
    /^<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->$/m,
  );
  assert.match(create.payload.body, /^- \[ \] #1$/m);
  assert.match(create.payload.body, /^- #2$/m);
  assert.doesNotMatch(create.payload.body, /#3/);
  assert.match(create.payload.body, /`2026-11-13-backlog-audit\.md`/);
  for (const entry of set.entries) {
    const { hash, ...rest } = entry;
    assert.equal(hash, contentHash(rest));
    assert.ok(WRITE_ACTIONS.includes(entry.action));
  }
});

test('an empty selection applies nothing, and the applied calls equal the selected entries', async (t) => {
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: corePrimary,
  });
  const before = fake.calls.length;
  const empty = await ok(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: built.data, selected: [] },
    { tracker: fake.tracker },
  );
  assert.deepEqual([empty.applied, empty.skipped], [[], []]);
  assert.equal(fake.calls.length, before);
  const chosen = selectAll(built.data, ({ action }) => action === 'label-create');
  const applied = await ok(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: built.data, selected: chosen },
    { tracker: fake.tracker },
  );
  assert.deepEqual(
    applied.applied.map(({ id }) => id),
    chosen.map(({ id }) => id),
  );
  assert.deepEqual(
    fake.mutations().map(({ operation }) => operation),
    ['label-create'],
  );
});

test('a changed entry hash, a tampered set and a changed target each skip or refuse the write', async (t) => {
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: corePrimary,
  });
  const [label, create] = built.data.entries;
  const stale = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: [{ id: label.id, hash: 'f'.repeat(64) }],
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(stale.skipped, [{ id: label.id, reason: 'hash-mismatch' }]);
  const tampered = structuredClone(built.data);
  tampered.entries[1].payload.title = 'Other';
  const refused = await run(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: tampered, selected: [] },
    { tracker: fake.tracker },
  );
  assert.equal(refused.error.code, 'TAMPERED_INPUT');
  // An epic with the same slug appeared after the gate: the create is skipped, never duplicated.
  fake.state.issues.set(
    50,
    issue(50, { body: '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->' }),
  );
  const duplicate = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: [{ id: create.id, hash: create.hash }],
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(duplicate.skipped, [{ id: 'epic:create', reason: 'duplicate-epic' }]);
  assert.equal(fake.mutations().length, 0);
});

test('the managed section update preserves outside text, history and out-of-scope entries', async (t) => {
  const epicBody = [
    'Intro written by a person.',
    '',
    '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->',
    '**Goal:** old',
    '- [x] #20',
    '- [ ] #3',
    '- [ ] #30',
    EPIC_END_MARKER,
    '',
    'Trailing notes.',
  ].join('\n');
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [
      issue(1, { labels: ['area-a'] }),
      issue(2, { labels: ['area-a'] }),
      issue(3, { labels: ['area-a'] }),
    ],
    extraIssues: [issue(30), issue(40, { labels: [LABELS.epic], body: epicBody })],
    primary: corePrimary,
    epic: { mode: 'existing', reference: '#40' },
    inventoryExtra: { scope: { label: 'area-a' }, epic: { reference: '#40' } },
    drafts: {},
  });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  const update = built.data.entries.find(({ action }) => action === 'issue-update-body');
  assert.deepEqual(update.removedEntries, ['#3']);
  assert.match(update.payload.section, /^- \[x\] #20$/m);
  assert.match(update.payload.section, /^- \[ \] #1$/m);
  assert.match(update.payload.section, /^- \[ \] #30 — not assessed in this run$/m);
  assert.doesNotMatch(update.payload.section, /^- \[ \] #3$/m);
  const applied = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: [{ id: update.id, hash: update.hash }],
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(
    applied.applied.map(({ id }) => id),
    [update.id],
  );
  const body = fake.state.issues.get(40).body;
  assert.match(body, /^Intro written by a person\.\n\n<!-- effective-flow-backlog-audit/);
  assert.match(body, /\n\nTrailing notes\.$/);
  assert.equal(
    parseManagedSection(body).entries.find(({ reference }) => reference === '#30').carried,
    true,
  );
  // A rerun against the edited body is a stale write and is skipped, never overwritten.
  const again = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: [{ id: update.id, hash: update.hash }],
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(again.skipped, [{ id: update.id, reason: 'stale-body' }]);
});

test('duplicate epic candidates and a malformed managed section stop the epic write', async (t) => {
  const marker = '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->';
  const { built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    extraIssues: [issue(40, { labels: [LABELS.epic], body: marker }), issue(41, { body: marker })],
    primary: corePrimary,
  });
  assert.equal(built.error.code, 'DUPLICATE_EPIC');
  assert.throws(
    () => parseManagedSection(`${marker}\n${marker}\n${EPIC_END_MARKER}`),
    /exactly one managed/,
  );
  assert.equal(spliceManagedSection('Body only', 'S'), 'Body only\n\nS\n');
});

test('a split is offered only where the target decomposes, and a rerun repairs only the label', async (t) => {
  const primary = {
    verdicts: [verdict('#1', 'oversized'), verdict('#2', 'drift'), verdict('#3', 'drift')],
    path: ['#1'],
    splits: [{ item: '#1', outline: 'A and B.' }],
  };
  const drafts = { epic: { title: 'Goal' }, splits: [{ item: '#1', body: 'Split into A and B.' }] };
  const blocked = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
    capabilities: {},
  });
  const unavailable = blocked.built.data.entries.filter(({ id }) => id.startsWith('split-'));
  assert.deepEqual(
    unavailable.map(({ status, reason }) => [status, reason]),
    [
      ['unavailable', 'decomposition-unavailable'],
      ['unavailable', 'decomposition-unavailable'],
    ],
  );
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
  });
  assert.match(
    built.data.entries.find(({ id }) => id === 'epic:create').payload.body,
    /^- \[ \] #1 — split pending \(plan-issue\)$/m,
  );
  const splitIds = built.data.entries
    .filter(({ id }) => id.includes('#1') && id.startsWith('split-'))
    .map(({ id }) => id);
  assert.deepEqual(splitIds, ['split-comment:#1', 'split-label:#1']);
  const comment = built.data.entries.find(({ id }) => id === 'split-comment:#1');
  assert.match(
    comment.payload.body,
    new RegExp(
      `^<!-- effective-flow-backlog-audit-split date=2026-11-13 body=${bodyHash('SECRET body of issue 1')} -->\n`,
    ),
  );
  const result = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: selectAll(
        built.data,
        ({ id }) => id.startsWith('split-') || id === `label-create:${LABELS.needsPlanning}`,
      ),
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(
    result.applied.map(({ id }) => id),
    [`label-create:${LABELS.needsPlanning}`, ...splitIds],
  );
  assert.deepEqual(
    fake.mutations().map(({ operation }) => operation),
    ['label-create', 'issue-comment', 'issue-label-add'],
  );
  // Rerun after the comment landed but its label was removed: only the label is offered.
  fake.state.issues.get(1).labels = [];
  const rerun = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    comments: { 1: fake.state.comments.get(1) },
    primary,
    drafts,
  });
  assert.deepEqual(
    rerun.built.data.entries.filter(({ id }) => id.startsWith('split-')).map(({ id }) => id),
    ['split-label:#1'],
  );
});

test('an obsolete mark is a marked comment then its label, and a rerun never duplicates the comment', async (t) => {
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md:2'] }),
      verdict('#3', 'drift'),
    ],
    path: ['#1'],
  };
  const drafts = {
    epic: { title: 'Goal' },
    obsolete: [{ item: '#2', body: 'Contradicts docs/adr/runtime.md.' }],
  };
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
  });
  const ids = built.data.entries.map(({ id }) => id);
  assert.deepEqual(ids, [
    `label-create:${LABELS.epic}`,
    `label-create:${LABELS.obsolete}`,
    'epic:create',
    'obsolete-comment:#2',
    'obsolete-label:#2',
  ]);
  const label = built.data.entries.find(({ id }) => id === 'obsolete-label:#2');
  const alone = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: [{ id: label.id, hash: label.hash }],
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(alone.skipped, [{ id: label.id, reason: 'dependency-not-selected' }]);
  const chosen = selectAll(built.data, ({ id }) => id.includes('obsolete'));
  const applied = await ok(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: built.data, selected: chosen },
    { tracker: fake.tracker },
  );
  assert.deepEqual(
    applied.applied.map(({ id }) => id),
    chosen.map(({ id }) => id),
  );
  assert.equal(fake.state.comments.get(2)[0].body.split('\n')[0], OBSOLETE_MARKER);
  // The obsolete label now excludes the issue; with the label gone again, only the label returns.
  fake.state.issues.get(2).labels = [];
  const rerun = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    comments: { 2: fake.state.comments.get(2) },
    primary,
    drafts,
  });
  assert.deepEqual(
    rerun.built.data.entries.filter(({ id }) => id.startsWith('obsolete')).map(({ id }) => id),
    ['obsolete-label:#2'],
  );
});

test('a partial failure stops the run and reports what was done and what remains', async (t) => {
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      verdict('#3', 'drift'),
    ],
    path: ['#1'],
  };
  const drafts = { epic: { title: 'Goal' }, obsolete: [{ item: '#2', body: 'Obsolete.' }] };
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
  });
  const failing = {
    ...fake,
    tracker: async (operation, input, options) =>
      operation === 'issue-comment'
        ? { ok: false, error: { code: 'COMMAND_FAILED' } }
        : fake.tracker(operation, input, options),
  };
  const result = await ok(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: built.data, selected: selectAll(built.data) },
    { tracker: failing.tracker },
  );
  assert.deepEqual(
    result.applied.map(({ id }) => id),
    [`label-create:${LABELS.epic}`, `label-create:${LABELS.obsolete}`, 'epic:create'],
  );
  assert.deepEqual(result.failed, {
    id: 'obsolete-comment:#2',
    code: 'COMMAND_FAILED',
    message: 'tracker issue-comment failed',
  });
  assert.deepEqual(result.remaining, ['obsolete-label:#2']);
});

test('a target closed after the gate is skipped and reported', async (t) => {
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      verdict('#3', 'drift'),
    ],
    path: ['#1'],
  };
  const drafts = { epic: { title: 'Goal' }, obsolete: [{ item: '#2', body: 'Obsolete.' }] };
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
  });
  fake.state.issues.get(2).state = 'closed';
  const result = await ok(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission,
      writeSet: built.data,
      selected: selectAll(built.data, ({ id }) => id.startsWith('obsolete')),
    },
    { tracker: fake.tracker },
  );
  assert.deepEqual(result.skipped, [
    { id: 'obsolete-comment:#2', reason: 'target-closed' },
    { id: 'obsolete-label:#2', reason: 'dependency-not-applied' },
  ]);
  assert.equal(fake.mutations().length, 0);
});

test('an external write set returns the ordered abstract calls and contacts no tracker', async (t) => {
  const root = repository(t);
  const target = { kind: 'external', externalTool: 'linear' };
  const permission = await ok(
    'permission-prove',
    {
      cwd: root,
      target,
      external: {
        connection: 'mcp:linear',
        readProven: true,
        writeProven: true,
        actions: {
          'label-create': true,
          'issue-create': true,
          'issue-label-add': true,
          'issue-comment': true,
          'issue-update-body': true,
        },
        nativeContainer: false,
      },
    },
    { tracker: noTracker },
  );
  const externalIssue = (reference, extra = {}) => ({
    reference,
    title: 't',
    body: 'SECRET',
    labels: [],
    author: { login: 'a', write: true },
    comments: [],
    ...extra,
  });
  const data = await ok(
    'inventory-build',
    {
      cwd: root,
      runtimeStateRoot: root,
      target,
      permission,
      planDir: 'docs/plan',
      externalIssues: [
        externalIssue('ABC-1'),
        externalIssue('ABC-2', { author: { login: 'b', write: null } }),
      ],
    },
    { tracker: noTracker },
  );
  assert.deepEqual(
    data.items.map(({ id, flagged }) => [id, flagged]),
    [
      ['ABC-1', false],
      ['ABC-2', true],
    ],
  );
  const merged = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: { verdicts: [verdict('ABC-1', 'core'), verdict('ABC-2', 'drift')], path: ['ABC-1'] },
  });
  const set = await ok('write-set-build', {
    inventory: data,
    merged,
    permission,
    goal: 'Goal',
    epic: { mode: 'new' },
    reportFile: 'report.md',
    date: '2026-11-13',
    drafts: { epic: { title: 'Goal' } },
  });
  assert.deepEqual(
    set.entries.map(({ id }) => id),
    [`label-create:${LABELS.epic}`, 'epic:create', 'epic:label'],
  );
  const calls = await ok(
    'write-set-apply',
    { cwd: root, target, permission, writeSet: set, selected: selectAll(set) },
    { tracker: noTracker },
  );
  assert.deepEqual(
    calls.calls.map(({ id, action }) => [id, action]),
    [
      [`label-create:${LABELS.epic}`, 'label-create'],
      ['epic:create', 'issue-create'],
      ['epic:label', 'issue-label-add'],
    ],
  );
  assert.equal(calls.calls[2].dependsOn, 'epic:create');
});

// --- Coverage additions: permission proof and plans-only per target ---------------------------

const GITHUB_REPOSITORY = { host: 'github.com', owner: 'example', repository: 'flow' };

function childKeyMarker(parent, key) {
  const payload = Buffer.from(JSON.stringify({ target: 'forge', parent, key })).toString(
    'base64url',
  );
  return `<!-- effective-flow-decomposition-key:v2 ${payload} -->`;
}

// A canonical `plan-issues` comment as plan-issue writes it, so the helper parses real records.
function planIssuesComment(parent, children) {
  const { section } = buildDecompositionRecords({
    language: 'en',
    target: 'forge',
    repository: { ...GITHUB_REPOSITORY, provider: 'github' },
    externalTool: null,
    parent: Number(parent.slice(1)),
    records: children.map(({ number, key }) => ({
      key,
      title: `Child ${key}`,
      workflow: 'Feature',
      body: '**Recommended workflow:** Feature\n\nSelf-contained requirement',
      status: 'created',
      issue: number,
    })),
  });
  return `<!-- effective-flow-plan-issues -->\n\n${section}\n`;
}

const splitMarkerFor = (body, date = '2026-11-01') =>
  `<!-- effective-flow-backlog-audit-split date=${date} body=${bodyHash(body)} -->\nSplit it.`;

// Invariant: when the runner permission is not proven, or the mode forbids the tracker, the run
// reads and writes no tracker content after the proof, whatever the target, and no write set can
// carry entries into an apply.
test('every plans-only proof leaves the tracker untouched through inventory, write set and apply', async (t) => {
  const root = repository(t, { tracked: { '2026-01-01-open.md': OPEN_PLAN } });
  const writer = forge({ issues: [issue(1)] });
  const reader = forge({ permissions: { owner: 'read' }, issues: [issue(1)] });
  const hidden = { kind: 'forge', visibility: 'hidden' };
  const external = { kind: 'external', externalTool: 'linear' };
  const cases = [
    ['unproven forge', FORGE, reader, {}],
    ['hidden', hidden, forge(), {}],
    ['local', { kind: 'local' }, forge(), {}],
    ['unset', { kind: 'unset' }, forge(), {}],
    [
      'unproven external',
      external,
      forge(),
      { external: { connection: 'mcp:linear', readProven: true, writeProven: false } },
    ],
  ];
  for (const [name, target, spy, extra] of cases) {
    const permission = await ok(
      'permission-prove',
      { cwd: root, target, ...extra },
      { tracker: spy.tracker },
    );
    assert.equal(permission.mode, 'plans-only', name);
    const afterProof = spy.calls.length;
    const data = await ok(
      'inventory-build',
      { cwd: root, runtimeStateRoot: root, target, permission, planDir: 'docs/plan' },
      { tracker: spy.tracker },
    );
    assert.deepEqual(
      data.items.map(({ id }) => id),
      ['plan:docs/plan/2026-01-01-open.md'],
      name,
    );
    assert.equal(data.mode, 'plans-only', name);
    assert.equal(data.capabilities, null, name);
    // An epic or external issues cannot be passed into a run without proven tracker access.
    for (const extraInput of [{ epic: { reference: '#1' } }, { externalIssues: [] }]) {
      const refused = await run(
        'inventory-build',
        {
          cwd: root,
          runtimeStateRoot: root,
          target,
          permission,
          planDir: 'docs/plan',
          ...extraInput,
        },
        { tracker: spy.tracker },
      );
      assert.equal(refused.error.code, 'INVALID_PAYLOAD', name);
    }
    const merged = await ok('verdicts-validate', {
      cwd: root,
      inventory: data,
      primary: {
        verdicts: [verdict('plan:docs/plan/2026-01-01-open.md', 'core')],
        path: ['plan:docs/plan/2026-01-01-open.md'],
      },
    });
    const set = await ok(
      'write-set-build',
      {
        inventory: data,
        merged,
        permission,
        goal: 'Goal',
        epic: { mode: 'new' },
        reportFile: 'report.md',
        date: '2026-11-13',
        drafts: { epic: { title: 'Goal' } },
      },
      { tracker: spy.tracker },
    );
    assert.deepEqual(
      [set.mode, set.entries, set.notices],
      ['plans-only', [], ['plans-only']],
      name,
    );
    const applied = await ok(
      'write-set-apply',
      { cwd: root, target, permission, writeSet: set, selected: [] },
      { tracker: spy.tracker },
    );
    assert.deepEqual([applied.applied, applied.skipped, applied.calls], [[], [], []], name);
    const selecting = await run(
      'write-set-apply',
      {
        cwd: root,
        target,
        permission,
        writeSet: set,
        selected: [{ id: 'epic:create', hash: 'x' }],
      },
      { tracker: spy.tracker },
    );
    assert.equal(selecting.error.code, 'INVALID_PAYLOAD', name);
    assert.equal(spy.calls.length, afterProof, `${name}: no tracker call after the proof`);
    await ok('snapshot-cleanup', { runtimeStateRoot: root, runId: data.runId });
  }
  // Only the unproven forge made calls at all, and only the four of the proof itself.
  assert.deepEqual(
    reader.calls.map(({ operation }) => operation),
    ['repository-resolve', 'probe', 'viewer-read', 'collaborator-permission-read'],
  );
  assert.equal(reader.mutations().length, 0);
  // A set built for a proven run cannot be pushed through a proof that is plans-only.
  const full = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: corePrimary,
  });
  const readerProof = await proven(root, reader);
  const refused = await run(
    'write-set-apply',
    {
      cwd: root,
      target: FORGE,
      permission: readerProof,
      writeSet: full.built.data,
      selected: selectAll(full.built.data),
    },
    { tracker: writer.tracker },
  );
  assert.equal(refused.error.code, 'PLANS_ONLY');
  assert.equal(writer.calls.length, 0);
});

// Invariant: the Forgejo target is proven with the same two reads as GitHub, forwards its provider
// to the repository resolution, and never claims a decomposition capability the forge lacks.
test('a Forgejo proof reads viewer and permission, and its splits are unavailable', async (t) => {
  const root = repository(t);
  const FORGEJO = { kind: 'forge', provider: 'forgejo' };
  const forgejoTracker = (fake) => async (operation, input, options) => {
    const envelope = await fake.tracker(operation, input, options);
    if (operation !== 'repository-resolve') return envelope;
    return {
      ok: true,
      data: {
        host: 'code.example.test',
        owner: 'team',
        repository: 'flow',
        slug: 'team/flow',
        provider: 'forgejo',
      },
    };
  };
  const fake = forge({ issues: [issue(1), issue(2), issue(3)], capabilities: {} });
  const permission = await ok(
    'permission-prove',
    { cwd: root, target: FORGEJO },
    { tracker: forgejoTracker(fake) },
  );
  assert.equal(fake.calls[0].operation, 'repository-resolve');
  assert.equal(fake.calls[0].input.provider, 'forgejo');
  assert.deepEqual(
    fake.calls.slice(2).map(({ operation }) => operation),
    ['viewer-read', 'collaborator-permission-read'],
  );
  assert.deepEqual(
    [permission.mode, permission.provider, permission.capabilities.decompose],
    ['tracker', 'forgejo', false],
  );
  const data = await ok(
    'inventory-build',
    { cwd: root, runtimeStateRoot: root, target: FORGEJO, permission, planDir: 'docs/plan' },
    { tracker: forgejoTracker(fake) },
  );
  const merged = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: {
      verdicts: [verdict('#1', 'oversized'), verdict('#2', 'drift'), verdict('#3', 'drift')],
      path: ['#1'],
      splits: [{ item: '#1', outline: 'A and B.' }],
    },
  });
  const set = await ok('write-set-build', {
    inventory: data,
    merged,
    permission,
    goal: 'Goal',
    epic: { mode: 'new' },
    reportFile: 'report.md',
    date: '2026-11-13',
    drafts: { epic: { title: 'Goal' }, splits: [{ item: '#1', body: 'Split it.' }] },
  });
  assert.deepEqual(
    set.entries
      .filter(({ id }) => id.startsWith('split-'))
      .map(({ status, reason }) => [status, reason]),
    [
      ['unavailable', 'decomposition-unavailable'],
      ['unavailable', 'decomposition-unavailable'],
    ],
  );
  const reader = await ok(
    'permission-prove',
    { cwd: root, target: FORGEJO },
    { tracker: forgejoTracker(forge({ permissions: { owner: 'read' } })) },
  );
  assert.deepEqual(
    [reader.mode, reader.reason, reader.provider],
    ['plans-only', 'permission-insufficient', 'forgejo'],
  );
});

// --- Coverage additions: inventory states, provenance, bounds ----------------------------------

test('in-flight labels, containers and their children are classified and counted', async (t) => {
  const root = repository(t);
  const fake = forge({
    issues: [
      issue(1, { labels: ['effective-flow-issue-in-progress'] }),
      issue(2, { labels: ['effective-flow-issue-done'] }),
      issue(3, { labels: ['firmo-issue-done'] }),
      issue(20),
      issue(21, { body: `Part A.\n\n${childKeyMarker('#20', 'part-a')}` }),
      issue(22, { body: `Part B.\n\n${childKeyMarker('#20', 'part-b')}` }),
      issue(30, { labels: ['firmo-review-epic'] }),
      issue(31, { labels: ['effective-flow-review-epic'] }),
    ],
    comments: {
      20: [
        {
          id: 1,
          body: planIssuesComment('#20', [
            { number: 21, key: 'part-a' },
            { number: 22, key: 'part-b' },
          ]),
          author: { login: 'owner' },
        },
      ],
    },
  });
  const { inventory: data } = await inventory(root, fake);
  const items = new Map(data.items.map((item) => [item.id, item]));
  assert.deepEqual(
    ['#1', '#2', '#3'].map((id) => items.get(id).state),
    ['in-flight', 'in-flight', 'in-flight'],
  );
  const container = items.get('#20');
  assert.deepEqual(
    [container.state, container.decomposition.active, container.decomposition.canonical],
    ['container', true, true],
  );
  assert.deepEqual(container.decomposition.children, ['#21', '#22']);
  // The children of a container are themselves assessed items.
  assert.deepEqual([items.get('#21').state, items.get('#22').state], ['assessed', 'assessed']);
  assert.deepEqual(
    data.excluded.map(({ id, reason }) => [id, reason]),
    [
      ['#30', 'legacy-review-epic'],
      ['#31', 'legacy-review-epic'],
    ],
  );
  assert.deepEqual(
    [data.counts.inFlight, data.counts.containers, data.counts.excluded, data.counts.issues],
    [3, 1, 2, 6],
  );
});

// Invariant: provenance comes only from deterministic signals, so a drift share can be recomputed
// from the snapshot alone. Each marker, label and English or German phrase is one signal.
test('provenance classifies every marker, label and English or German phrase', async (t) => {
  const root = repository(t, {
    tracked: { '2026-01-01-open.md': `${OPEN_PLAN}\nThis is a follow-up to #3.\n` },
  });
  const bodies = {
    1: 'Follow-up of #9',
    2: 'We open this as follow up to ABC-12 today.',
    3: 'Split from #4.',
    4: 'Folge von #4',
    5: 'Nachfolger von #4',
    6: 'Abgespalten von #4 gestern.',
    7: 'FOLLOW-UP OF #4',
    8: 'A follow-up of the release #5 is planned.',
    9: 'Followed by #3 later.',
    10: 'Prefollow-up of #3',
    11: 'Follow-up of #12abc',
    12: 'SECRET <!-- effective-flow-follow-up-admission:v1 -->',
    13: '<!-- effective-flow-iterate:v1 pass=3 -->\nIterate finding.',
    14: `Orphan child.\n\n${childKeyMarker('#99', 'part')}`,
    15: 'Plain issue.',
  };
  const fake = forge({
    issues: [
      ...Object.entries(bodies).map(([number, body]) => issue(Number(number), { body })),
      issue(16, { labels: ['firmo-review-finding'], body: 'Folge von #2' }),
      issue(17, { labels: ['effective-flow-review-finding'] }),
    ],
  });
  const { inventory: data } = await inventory(root, fake);
  const classes = new Map(data.items.map((item) => [item.id, item.provenance?.classes]));
  for (const id of ['#1', '#2', '#3', '#4', '#5', '#6', '#7'])
    assert.deepEqual(classes.get(id), ['follow-up-reference'], id);
  for (const id of ['#8', '#9', '#10', '#11', '#15'])
    assert.deepEqual(classes.get(id), [], `${id} carries no signal`);
  assert.deepEqual(classes.get('#12'), ['follow-up-admission']);
  assert.deepEqual(classes.get('#13'), ['iterate']);
  // A decomposition child whose parent holds no split marker is a follow-up, not a sanctioned split.
  assert.deepEqual(data.items.find(({ id }) => id === '#14').provenance, {
    classes: ['decomposition-child'],
    followUp: true,
    sanctionedSplit: false,
  });
  assert.deepEqual(classes.get('#16'), ['review-finding', 'follow-up-reference']);
  assert.deepEqual(classes.get('#17'), ['review-finding']);
  assert.deepEqual(data.items.find(({ id }) => id === '#15').provenance.followUp, false);
  // Plans carry the phrase signal, too.
  assert.deepEqual(classes.get('plan:docs/plan/2026-01-01-open.md'), ['follow-up-reference']);
});

// Invariant: the drift shares are plain ratios over the verdict records and the provenance flags,
// so a hand-computed fixture must match exactly, including empty denominators.
test('driftSummary equals hand-computed shares for a fixed fixture', () => {
  const entry = (id, classes, extra = {}) => ({
    id,
    provenance: {
      classes,
      followUp: classes.length > 0 && !extra.sanctionedSplit,
      sanctionedSplit: extra.sanctionedSplit === true,
    },
  });
  const inventoryFixture = {
    items: [
      entry('#a', ['review-finding']),
      entry('#b', []),
      entry('#c', ['iterate']),
      entry('#d', []),
      entry('#e', ['follow-up-reference']),
      entry('#f', []),
      entry('#g', []),
      entry('#h', ['sanctioned-split'], { sanctionedSplit: true }),
      entry('#i', ['follow-up-admission']),
    ],
  };
  const record = (item, value, onPath = false) => ({ item, verdict: value, onPath });
  const summary = driftSummary(
    [
      record('#a', 'core', true),
      record('#b', 'core', true),
      record('#c', 'supporting'),
      record('#d', 'supporting'),
      record('#e', 'drift'),
      record('#f', 'drift'),
      record('#g', 'drift'),
      record('#h', 'oversized', true),
      record('#i', 'unclear'),
    ],
    inventoryFixture,
  );
  assert.deepEqual(summary, {
    // core + supporting: #a #b #c #d, follow-ups #a #c.
    followUpShareCoreSupporting: { numerator: 2, denominator: 4, share: 0.5 },
    // drift: #e #f #g, follow-up #e.
    followUpShareDrift: { numerator: 1, denominator: 3, share: 0.333 },
    // on the path: #a #b #h, follow-up #a; the sanctioned split #h is not one.
    followUpOnPath: 1,
    sanctionedSplits: 1,
    // no signal at all: #b #d #f #g.
    noProvenance: 4,
  });
  const empty = driftSummary([], { items: [] });
  assert.deepEqual(empty.followUpShareCoreSupporting, {
    numerator: 0,
    denominator: 0,
    share: null,
  });
  assert.deepEqual(empty.followUpShareDrift, { numerator: 0, denominator: 0, share: null });
});

test('the snapshot bound stops over issues, comments and plans with per-component values and writes nothing', async (t) => {
  const root = repository(t, {
    tracked: { '2026-01-01-open.md': `${OPEN_PLAN}${'p'.repeat(1500)}\n` },
  });
  const fake = forge({
    issues: [issue(1, { body: 'b'.repeat(2500) }), issue(2)],
    comments: { 1: [{ id: 1, body: 'c'.repeat(1500), author: { login: 'owner' } }] },
  });
  const permission = await proven(root, fake);
  const base = {
    cwd: root,
    runtimeStateRoot: root,
    target: FORGE,
    permission,
    planDir: 'docs/plan',
  };
  const snapshots = join(root, '.effective-flow/backlog-audit/snapshots');
  // Invariant: a scope whose listed text alone exceeds a bound stops right after the listing, as
  // a lower bound, before any comment or permission read.
  const beforeListing = fake.calls.length;
  const early = await ok(
    'inventory-build',
    { ...base, config: { 'backlogAudit.maxSnapshotKiB': 1 } },
    { tracker: fake.tracker },
  );
  assert.deepEqual([early.stopped, early.stop.lowerBound], [true, true]);
  assert.deepEqual(early.stop.exceeded, ['maxSnapshotKiB']);
  assert.ok(
    !fake.calls
      .slice(beforeListing)
      .some(({ operation }) =>
        ['issue-comments-read', 'collaborator-permission-read'].includes(operation),
      ),
  );
  const sizeOnly = await ok(
    'inventory-build',
    { ...base, config: { 'backlogAudit.maxSnapshotKiB': 5 } },
    { tracker: fake.tracker },
  );
  assert.equal(sizeOnly.stopped, true);
  assert.equal(sizeOnly.stop.lowerBound, undefined);
  assert.deepEqual(sizeOnly.stop.exceeded, ['maxSnapshotKiB']);
  const measured = sizeOnly.stop.measured;
  assert.deepEqual([measured.items, measured.issues, measured.plans], [3, 2, 1]);
  assert.ok(measured.issueKiB >= 2.4, `issues ${measured.issueKiB}`);
  assert.ok(measured.commentKiB >= 1.4, `comments ${measured.commentKiB}`);
  assert.ok(measured.planKiB >= 1.4, `plans ${measured.planKiB}`);
  assert.equal(measured.architectureSummaryKiB, 0);
  assert.ok(
    Math.abs(
      measured.totalKiB -
        (measured.issueKiB +
          measured.commentKiB +
          measured.planKiB +
          measured.architectureSummaryKiB),
    ) < 0.3,
  );
  assert.deepEqual([sizeOnly.stop.maxItems, sizeOnly.stop.maxSnapshotKiB], [80, 5]);
  assert.equal(existsSync(snapshots), false);
  const both = await ok(
    'inventory-build',
    { ...base, config: { 'backlogAudit.maxItems': 2, 'backlogAudit.maxSnapshotKiB': 1 } },
    { tracker: fake.tracker },
  );
  assert.deepEqual(both.stop.exceeded, ['maxItems', 'maxSnapshotKiB']);
  assert.equal(existsSync(snapshots), false);
  // The same inventory passes a roomy bound; the architecture summary then tips the total over.
  const roomy = await ok(
    'inventory-build',
    { ...base, config: { 'backlogAudit.maxSnapshotKiB': 400 } },
    { tracker: fake.tracker },
  );
  assert.equal(roomy.stopped, false);
  const noSummary = await ok('bounds-check', { runtimeStateRoot: root, inventory: roomy });
  assert.deepEqual([noSummary.stopped, noSummary.measured.architectureSummaryKiB], [false, 0]);
  await ok('snapshot-cleanup', { runtimeStateRoot: root, runId: roomy.runId });
  const bytes = roomy.measuredBytes;
  const used = bytes.issueBytes + bytes.commentBytes + bytes.planBytes;
  const tight = await ok(
    'inventory-build',
    { ...base, config: { 'backlogAudit.maxSnapshotKiB': Math.ceil(used / 1024) + 1 } },
    { tracker: fake.tracker },
  );
  assert.equal(tight.stopped, false);
  writeFileSync(tight.architectureSummaryPath, 'a'.repeat(2048));
  const tipped = await ok('bounds-check', {
    runtimeStateRoot: root,
    inventory: tight,
    architectureSummaryPath: tight.architectureSummaryPath,
  });
  assert.equal(tipped.stopped, true);
  assert.deepEqual(tipped.stop.exceeded, ['maxSnapshotKiB']);
  assert.equal(tipped.stop.measured.architectureSummaryKiB, 2);
  assert.deepEqual(tipped.stop.narrowing, ['--label', '--issues-only', '--plans-only']);
  assert.equal(existsSync(tight.snapshotDir), false, 'a bounds stop removes the snapshot');
});

test('snapshot-cleanup removes the leftovers of every earlier run at entry', async (t) => {
  const root = repository(t);
  const fake = forge({ issues: [issue(1)] });
  const permission = await proven(root, fake);
  const build = (bytes) =>
    ok(
      'inventory-build',
      { cwd: root, runtimeStateRoot: root, target: FORGE, permission, planDir: 'docs/plan' },
      { tracker: fake.tracker, randomBytes: () => Buffer.from(bytes, 'hex') },
    );
  const first = await build('a1b2c3d4');
  const second = await build('0a0b0c0d');
  assert.notEqual(first.runId, second.runId);
  assert.deepEqual([existsSync(first.snapshotDir), existsSync(second.snapshotDir)], [true, true]);
  // One run id collides with a leftover and fails closed instead of reusing the directory.
  const collision = await run(
    'inventory-build',
    { cwd: root, runtimeStateRoot: root, target: FORGE, permission, planDir: 'docs/plan' },
    { tracker: fake.tracker },
  );
  assert.equal(collision.error.code, 'UNSAFE_RUNTIME_STATE');
  // Invariant: entry cleanup never removes a snapshot a concurrent run may still use. A fresh
  // snapshot is kept; one untouched for STALE_RUNTIME_MS is a leftover and removed.
  const atEntry = (now) => ok('snapshot-cleanup', { runtimeStateRoot: root }, { now });
  const fresh = await atEntry(() => new Date());
  assert.deepEqual([fresh.removed, fresh.kept], [[], [second.runId, first.runId].sort()]);
  assert.deepEqual([existsSync(first.snapshotDir), existsSync(second.snapshotDir)], [true, true]);
  const inputs = join(root, '.effective-flow/backlog-audit/inputs');
  mkdirSync(inputs, { recursive: true });
  writeFileSync(join(inputs, 'inventory-build-1.json'), '{}');
  const later = () => new Date(Date.now() + STALE_RUNTIME_MS + 60_000);
  const cleaned = await atEntry(later);
  assert.deepEqual(cleaned.removed, [second.runId, first.runId].sort());
  assert.deepEqual([existsSync(first.snapshotDir), existsSync(second.snapshotDir)], [false, false]);
  assert.equal(existsSync(join(inputs, 'inventory-build-1.json')), false, 'a stale input goes');
  assert.deepEqual((await atEntry(later)).removed, []);
});

// --- Coverage additions: verdict validation, membership and panel ------------------------------

test('verdict validation checks the path, overlap targets, splits and citation mixes', async (t) => {
  const { root, inventory: data } = await assessed(t);
  const three = (a, b, c) => [verdict('#1', a), verdict('#2', b), verdict('#3', c)];
  const problems = async (primary) =>
    (await run('verdicts-validate', { cwd: root, inventory: data, primary })).error.details
      .problems;
  const codes = async (primary) => (await problems(primary)).map(({ code }) => code);
  // The path holds only core and oversized items, each once, and every such item.
  const supportingOnPath = await problems({
    verdicts: three('core', 'supporting', 'drift'),
    path: ['#1', '#2'],
  });
  assert.deepEqual(supportingOnPath, [
    { code: 'path-member-not-core', item: '#2', verdict: 'supporting' },
  ]);
  assert.deepEqual(await codes({ verdicts: three('core', 'drift', 'drift'), path: ['#1', '#1'] }), [
    'path-duplicate',
  ]);
  assert.deepEqual(
    await problems({ verdicts: three('core', 'drift', 'drift'), path: ['#1', '#77'] }),
    [{ code: 'path-member-not-core', item: '#77', verdict: null }],
  );
  assert.deepEqual(await codes({ verdicts: three('core', 'drift', 'drift') }), ['path-missing']);
  assert.deepEqual(await codes({ verdicts: three('core', 'drift', 'drift'), path: 'all' }), [
    'invalid-path',
  ]);
  // An overlap names another inventory item; any other verdict names none.
  assert.deepEqual(
    await codes({
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'overlap', { overlapTarget: '#2' }),
        verdict('#3', 'overlap', { overlapTarget: '#404' }),
      ],
      path: ['#1'],
    }),
    ['overlap-without-target', 'overlap-without-target'],
  );
  assert.deepEqual(
    await codes({
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'drift', { overlapTarget: '#1' }),
        verdict('#3', 'drift'),
      ],
      path: ['#1'],
    }),
    ['target-without-overlap'],
  );
  assert.deepEqual(
    await codes({
      verdicts: [
        verdict('#1', 'core', { surprise: true }),
        verdict('#2', 'drift'),
        verdict('#3', 'drift'),
      ],
      path: ['#1'],
    }),
    ['unknown-keys'],
  );
  // A split proposal exists only for an oversized item.
  assert.deepEqual(
    await codes({
      verdicts: three('core', 'drift', 'drift'),
      path: ['#1'],
      splits: [{ item: '#1', outline: 'Split.' }],
    }),
    ['split-not-oversized'],
  );
  // An overlap leaves the path: it is valid without being listed, and only its target is a member.
  const overlap = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: {
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'overlap', { overlapTarget: '#1', relevance: 'Same scope.' }),
        verdict('#3', 'drift'),
      ],
      path: ['#1'],
    },
  });
  const records = new Map(overlap.records.map((record) => [record.item, record]));
  assert.deepEqual([records.get('#2').onPath, records.get('#2').overlapTarget], [false, '#1']);
  assert.deepEqual(overlap.path, ['#1']);
  // The summary alone is no primary evidence, but a primary file beside it is.
  const withSummary = await run('verdicts-validate', {
    cwd: root,
    inventory: data,
    architectureSummaryPath: data.architectureSummaryPath,
    primary: {
      verdicts: [
        verdict('#1', 'obsolete-architecture', {
          citations: [data.architectureSummaryPath.slice(root.length + 1), 'docs/adr/runtime.md:2'],
        }),
        verdict('#2', 'drift'),
        verdict('#3', 'drift'),
      ],
      path: [],
    },
  });
  assert.equal(withSummary.ok, true, JSON.stringify(withSummary.error));
  // A citation must stay inside the repository.
  for (const [citation, expected] of [
    ['../outside.md', 'outside-repository'],
    ['/etc/passwd', 'outside-repository'],
    ['docs/adr/runtime.md:0', 'malformed'],
    ['docs/adr', 'missing'],
  ]) {
    const refused = await run('verdicts-validate', {
      cwd: root,
      inventory: data,
      primary: {
        verdicts: [
          verdict('#1', 'obsolete-architecture', { citations: [citation] }),
          verdict('#2', 'drift'),
          verdict('#3', 'drift'),
        ],
        path: [],
      },
    });
    assert.deepEqual(refused.error.details.problems[0].citationProblems, [expected], citation);
  }
});

test('the panel merge keeps unanimity to members that ran and never lets a member invalidate the primary', async (t) => {
  const { root, inventory: data } = await assessed(t, [issue(1), issue(2), issue(3), issue(4)]);
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md:2'] }),
      verdict('#3', 'supporting'),
      verdict('#4', 'unclear'),
    ],
    path: ['#1'],
  };
  const same = (name, overrides = {}) => ({
    member: name,
    verdicts: primary.verdicts.map(({ item, verdict: value, citations }) =>
      verdict(item, overrides[item] ?? value, {
        ...((overrides[item] ?? value) === 'obsolete-architecture'
          ? { citations: citations ?? ['docs/adr/runtime.md'] }
          : {}),
      }),
    ),
  });
  const merge = (panel) => ok('verdicts-validate', { cwd: root, inventory: data, primary, panel });
  // One member ran and agrees, one was skipped: unanimity counts the member that ran.
  const lone = await merge([same('a'), { member: 'b', skipped: 'not startable' }]);
  assert.ok(lone.records.every(({ agreement }) => agreement === 'unanimous'));
  assert.deepEqual(lone.panel, { ran: ['a'], skipped: [{ member: 'b', reason: 'not startable' }] });
  assert.deepEqual(
    lone.decisionPoints.map(({ item, kind }) => [item, kind]),
    [['#4', 'unclear']],
  );
  assert.deepEqual(lone.listedDisagreements, []);
  // Every member skipped: the primary stands alone.
  const none = await merge([
    { member: 'a', skipped: 'x' },
    { member: 'b', skipped: 'y' },
  ]);
  assert.ok(none.records.every(({ agreement }) => agreement === 'primary-only'));
  assert.deepEqual(none.panel.ran, []);
  // Two members, one dissenting on an obsolete verdict: one record collapses to unclear.
  const split = await merge([same('a'), same('b', { '#2': 'core', '#3': 'unclear' })]);
  const byItem = new Map(split.records.map((record) => [record.item, record]));
  assert.deepEqual(
    [byItem.get('#2').verdict, byItem.get('#2').primaryVerdict, byItem.get('#2').agreement],
    ['unclear', 'obsolete-architecture', 'disagreement'],
  );
  assert.deepEqual(byItem.get('#2').panel, { a: 'obsolete-architecture', b: 'core' });
  assert.deepEqual(
    split.decisionPoints.filter(({ item }) => item === '#2').map(({ kind }) => kind),
    ['obsolete-disagreement'],
  );
  assert.equal(byItem.get('#3').verdict, 'supporting');
  assert.deepEqual(
    split.listedDisagreements.map(({ item }) => item),
    ['#3'],
  );
  assert.equal(byItem.get('#1').agreement, 'unanimous');
  // The primary path and the split proposals are authoritative.
  assert.deepEqual(split.path, ['#1']);
  // A member with invalid output is skipped with a reason, never failing the run.
  const invalidMembers = await merge([
    { member: 'short', verdicts: [verdict('#1', 'core')] },
    {
      member: 'uncited',
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'obsolete-architecture'),
        verdict('#3', 'core'),
        verdict('#4', 'core'),
      ],
    },
    {
      member: 'noTarget',
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'drift'),
        verdict('#3', 'overlap'),
        verdict('#4', 'core'),
      ],
    },
    {
      member: 'vocab',
      verdicts: [
        verdict('#1', 'great'),
        verdict('#2', 'drift'),
        verdict('#3', 'core'),
        verdict('#4', 'core'),
      ],
    },
    same('ok'),
  ]);
  assert.deepEqual(invalidMembers.panel.ran, ['ok']);
  assert.deepEqual(
    invalidMembers.panel.skipped.map(({ member, reason }) => [member, reason]),
    [
      ['short', 'invalid-output'],
      ['uncited', 'invalid-output'],
      ['noTarget', 'invalid-output'],
      ['vocab', 'invalid-output'],
    ],
  );
  // The panel cannot repair an invalid primary, and a malformed panel is refused outright.
  const badPrimary = await run('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: { verdicts: [verdict('#1', 'core')], path: ['#1'] },
    panel: [same('a')],
  });
  assert.equal(badPrimary.error.code, 'VERDICTS_INVALID');
  for (const panel of ['a', [same('a'), same('a')], [{ verdicts: [] }]]) {
    const refused = await run('verdicts-validate', { cwd: root, inventory: data, primary, panel });
    assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  }
});

// --- Coverage additions: write-set membership, drafts and ordering -----------------------------

test('only the canonical overlap target joins the epic, and a decomposition child needs its own verdict', async (t) => {
  const overlap = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: {
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'overlap', { overlapTarget: '#1' }),
        verdict('#3', 'drift'),
      ],
      path: ['#1'],
    },
  });
  const overlapBody = overlap.built.data.entries.find(({ id }) => id === 'epic:create').payload
    .body;
  assert.match(overlapBody, /^- \[ \] #1$/m);
  assert.doesNotMatch(overlapBody, /#2|#3/);
  // A container's child enters the epic with its own core or supporting verdict only.
  const decomposed = (children) => ({
    issues: [
      issue(20),
      issue(21, { body: `A.\n\n${childKeyMarker('#20', 'a')}` }),
      issue(22, { body: `B.\n\n${childKeyMarker('#20', 'b')}` }),
      issue(23, { body: `C.\n\n${childKeyMarker('#20', 'c')}` }),
    ],
    comments: {
      20: [
        {
          id: 1,
          body: planIssuesComment('#20', [
            { number: 21, key: 'a' },
            { number: 22, key: 'b' },
            { number: 23, key: 'c' },
          ]),
          author: { login: 'owner' },
        },
      ],
    },
    primary: {
      verdicts: [
        verdict('#20', 'oversized'),
        ...children.map(([item, value]) => verdict(item, value)),
      ],
      path: ['#20', ...children.filter(([, value]) => value === 'core').map(([item]) => item)],
      splits: [{ item: '#20', outline: 'Already split.' }],
    },
    drafts: { epic: { title: 'Goal' }, splits: [] },
  });
  const mixed = await writeSetFixture(
    t,
    decomposed([
      ['#21', 'core'],
      ['#22', 'drift'],
      ['#23', 'supporting'],
    ]),
  );
  const mixedBody = mixed.built.data.entries.find(({ id }) => id === 'epic:create').payload.body;
  assert.match(mixedBody, /^- \[ \] #21$/m);
  assert.match(mixedBody, /^- \[ \] #23$/m);
  assert.doesNotMatch(mixedBody, /#20|#22/);
  assert.ok(
    !mixed.built.data.entries.some(({ id }) => id.startsWith('split-')),
    'no new split for an active decomposition',
  );
  assert.equal(mixed.built.data.path.includes('#20'), true);
  // No child qualifies: the container itself stays, with no pending-split note.
  const unqualified = await writeSetFixture(
    t,
    decomposed([
      ['#21', 'drift'],
      ['#22', 'drift'],
      ['#23', 'drift'],
    ]),
  );
  const unqualifiedBody = unqualified.built.data.entries.find(({ id }) => id === 'epic:create')
    .payload.body;
  assert.match(unqualifiedBody, /^- \[ \] #20$/m);
  assert.doesNotMatch(unqualifiedBody, /split pending|#21|#22|#23/);
});

test('a declined or stale split marker changes the offer, and a pending one keeps its note', async (t) => {
  const primary = {
    verdicts: [verdict('#1', 'oversized'), verdict('#2', 'drift'), verdict('#3', 'drift')],
    path: ['#1'],
    splits: [{ item: '#1', outline: 'A and B.' }],
  };
  const drafts = { epic: { title: 'Goal' }, splits: [{ item: '#1', body: 'Split into A and B.' }] };
  const body = 'SECRET body of issue 1';
  // A planning comment newer than the marker, without active records, declines the split.
  const declined = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    comments: {
      1: [
        { id: 1, body: splitMarkerFor(body), author: { login: 'owner' } },
        {
          id: 2,
          body: '<!-- effective-flow-plan-issues -->\nDeclined.',
          author: { login: 'owner' },
        },
      ],
    },
    primary,
    drafts,
  });
  assert.ok(!declined.built.data.entries.some(({ id }) => id.startsWith('split-')));
  const declinedBody = declined.built.data.entries.find(({ id }) => id === 'epic:create').payload
    .body;
  assert.match(declinedBody, /^- \[ \] #1$/m);
  // A marker bound to an older body is stale: a fresh hand-off is offered, bound to the new body.
  const stale = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    comments: { 1: [{ id: 1, body: splitMarkerFor('an older body'), author: { login: 'owner' } }] },
    primary,
    drafts,
  });
  assert.deepEqual(
    stale.built.data.entries.filter(({ id }) => id.startsWith('split-')).map(({ id }) => id),
    ['split-comment:#1', 'split-label:#1'],
  );
  assert.match(
    stale.built.data.entries.find(({ id }) => id === 'split-comment:#1').payload.body,
    new RegExp(`body=${bodyHash(body)} -->`),
  );
  // A current marker without any planning comment is a pending split in the epic.
  const pending = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    comments: { 1: [{ id: 1, body: splitMarkerFor(body), author: { login: 'owner' } }] },
    primary,
    drafts,
  });
  assert.match(
    pending.built.data.entries.find(({ id }) => id === 'epic:create').payload.body,
    /^- \[ \] #1 — split pending \(plan-issue\)$/m,
  );
  // An already labeled, marked split needs no entry at all.
  const complete = await writeSetFixture(t, {
    issues: [issue(1, { labels: [LABELS.needsPlanning] }), issue(2), issue(3)],
    comments: { 1: [{ id: 1, body: splitMarkerFor(body), author: { login: 'owner' } }] },
    primary,
    drafts,
  });
  assert.ok(!complete.built.data.entries.some(({ id }) => id.startsWith('split-')));
});

test('decisions answer decision points only, and an unrelated or undecidable answer is refused', async (t) => {
  const primary = {
    verdicts: [verdict('#1', 'core'), verdict('#2', 'unclear'), verdict('#3', 'unclear')],
    path: ['#1'],
  };
  const common = { issues: [issue(1), issue(2), issue(3)], primary };
  const answered = await writeSetFixture(t, {
    ...common,
    decisions: [{ item: '#2', verdict: 'core' }],
  });
  assert.deepEqual(
    [answered.built.data.path, answered.built.data.userAdded],
    [['#1', '#2'], ['#2']],
  );
  const body = answered.built.data.entries.find(({ id }) => id === 'epic:create').payload.body;
  assert.ok(
    body.indexOf('- [ ] #1') < body.indexOf('- [ ] #2'),
    'a user-added item closes the path',
  );
  assert.doesNotMatch(body, /#3/);
  for (const decision of [
    { item: '#1', verdict: 'drift' },
    { item: '#2', verdict: 'overlap' },
    { item: '#2', verdict: 'core', extra: 1 },
  ]) {
    const { merged, inventory: data, permission } = answered;
    const refused = await run('write-set-build', {
      inventory: data,
      merged,
      permission,
      goal: 'Goal',
      epic: { mode: 'new' },
      reportFile: 'report.md',
      date: '2026-11-13',
      drafts: { epic: { title: 'Goal' } },
      decisions: [decision],
    });
    assert.equal(refused.error.code, 'INVALID_PAYLOAD', JSON.stringify(decision));
  }
  // An answer of obsolete sends the item to the individually confirmed obsolete question.
  const obsolete = await writeSetFixture(t, {
    ...common,
    decisions: [{ item: '#3', verdict: 'obsolete-architecture' }],
    drafts: { epic: { title: 'Goal' }, obsolete: [{ item: '#3', body: 'Obsolete per user.' }] },
  });
  assert.deepEqual(
    obsolete.built.data.entries.map(({ id }) => id).filter((id) => id.includes('obsolete')),
    [`label-create:${LABELS.obsolete}`, 'obsolete-comment:#3', 'obsolete-label:#3'],
  );
});

test('a run with no goal-relevant item creates no epic, and a bound epic only offers in-scope removal', async (t) => {
  const allDrift = {
    verdicts: [verdict('#1', 'drift'), verdict('#2', 'drift'), verdict('#3', 'drift')],
    path: [],
  };
  const withEpic = { ...allDrift, verdicts: [...allDrift.verdicts, verdict('#50', 'drift')] };
  const none = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: allDrift,
  });
  assert.deepEqual(
    [none.built.data.entries, none.built.data.notices],
    [[], ['no-goal-relevant-items']],
  );
  const epicBody = [
    '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->',
    '- [x] #20',
    '- [ ] #1',
    '- [ ] #50',
    EPIC_END_MARKER,
  ].join('\n');
  const bound = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    extraIssues: [issue(50), issue(40, { labels: [LABELS.epic], body: epicBody })],
    primary: withEpic,
    epic: { mode: 'existing', reference: '#40' },
    inventoryExtra: { epic: { reference: '#40' } },
    drafts: {},
  });
  assert.equal(bound.built.ok, true, JSON.stringify(bound.built.error));
  const update = bound.built.data.entries.find(({ action }) => action === 'issue-update-body');
  // #1 and #50 are open, in-scope and assessed off the path: offered for removal. History stays.
  assert.deepEqual(update.removedEntries, ['#1', '#50']);
  assert.match(update.payload.section, /^- \[x\] #20$/m);
  assert.doesNotMatch(update.payload.section, /#1$|#50$/m);
  assert.ok(!bound.built.data.entries.some(({ action }) => action === 'issue-create'));
});

test('a narrowed run carries out-of-scope epic entries and plan bullets over, marked as not assessed', async (t) => {
  const epicBody = [
    '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->',
    '- [x] #20',
    '- [ ] #1',
    '- [ ] #3',
    '',
    '### Plans',
    '',
    '- `docs/plan/2026-01-01-old.md`',
    EPIC_END_MARKER,
  ].join('\n');
  const repo = { tracked: { '2026-01-02-open.md': OPEN_PLAN } };
  const bindAndBuild = async (scope, primary) => {
    const fixture = await writeSetFixture(t, {
      issues: [issue(1), issue(2), issue(3)],
      extraIssues: [issue(40, { labels: [LABELS.epic], body: epicBody })],
      primary,
      epic: { mode: 'existing', reference: '#40' },
      inventoryExtra: { scope, epic: { reference: '#40' } },
      drafts: {},
      repo,
    });
    assert.equal(fixture.built.ok, true, JSON.stringify(fixture.built.error));
    return fixture;
  };
  // --plans-only: issues are out of scope, so their checklist entries are carried, never removed.
  const plansId = 'plan:docs/plan/2026-01-02-open.md';
  const plansOnly = await bindAndBuild(
    { plansOnly: true },
    { verdicts: [verdict(plansId, 'core')], path: [plansId] },
  );
  assert.equal(plansOnly.inventory.partial, true);
  assert.deepEqual(
    plansOnly.inventory.items.map(({ id }) => id),
    [plansId],
  );
  const plansUpdate = plansOnly.built.data.entries.find(
    ({ action }) => action === 'issue-update-body',
  );
  assert.deepEqual(plansUpdate.removedEntries, []);
  assert.match(plansUpdate.payload.section, /^- \[x\] #20$/m);
  assert.match(plansUpdate.payload.section, /^- \[ \] #1 — not assessed in this run$/m);
  assert.match(plansUpdate.payload.section, /^- \[ \] #3 — not assessed in this run$/m);
  assert.match(plansUpdate.payload.section, /^- `docs\/plan\/2026-01-02-open\.md`$/m);
  assert.ok(
    !plansOnly.fake.calls.some(({ operation }) =>
      ['issue-comments-read', 'issue-read'].includes(operation),
    ),
    'no issue content is read for a plans-only scope',
  );
  // --issues-only: plans are out of scope, so the epic's plan bullets are carried over.
  const issuesOnly = await bindAndBuild(
    { issuesOnly: true },
    {
      verdicts: [verdict('#1', 'core'), verdict('#2', 'drift'), verdict('#3', 'drift')],
      path: ['#1'],
    },
  );
  const issuesUpdate = issuesOnly.built.data.entries.find(
    ({ action }) => action === 'issue-update-body',
  );
  assert.deepEqual(issuesUpdate.removedEntries, ['#3']);
  assert.match(
    issuesUpdate.payload.section,
    /^- `docs\/plan\/2026-01-01-old\.md` — not assessed in this run$/m,
  );
  assert.match(issuesUpdate.payload.section, /^- \[x\] #20$/m);
});

test('plan bullets name only plans tracked on the base branch, the rest is a count, and the report is a bare name', async (t) => {
  const repo = {
    tracked: { '2026-01-01-tracked.md': OPEN_PLAN },
    untracked: { '2026-01-03-local.md': OPEN_PLAN, '2026-01-04-local.md': OPEN_PLAN },
  };
  const ids = [
    'plan:docs/plan/2026-01-01-tracked.md',
    'plan:docs/plan/2026-01-03-local.md',
    'plan:docs/plan/2026-01-04-local.md',
  ];
  const primary = {
    verdicts: [verdict('#1', 'core'), ...ids.map((id) => verdict(id, 'core'))],
    path: ['#1', ...ids],
  };
  const english = await writeSetFixture(t, { issues: [issue(1)], primary, repo });
  const body = english.built.data.entries.find(({ id }) => id === 'epic:create').payload.body;
  assert.match(body, /^- `docs\/plan\/2026-01-01-tracked\.md`$/m);
  assert.doesNotMatch(body, /local\.md/);
  assert.match(body, /^2 further open plans not tracked on the base branch\.$/m);
  assert.doesNotMatch(body, /^- \[ \] plan:/m);
  assert.doesNotMatch(body, new RegExp(english.root.replaceAll('/', '\\/')));
  assert.doesNotMatch(body, /\.effective-flow/);
  assert.match(body, /\*\*Report:\*\* `2026-11-13-backlog-audit\.md`/);
  const german = await writeSetFixture(t, { issues: [issue(1)], primary, repo, language: 'de' });
  const germanBody = german.built.data.entries.find(({ id }) => id === 'epic:create').payload.body;
  assert.match(germanBody, /^\*\*Ziel:\*\* Ship the portable build$/m);
  assert.match(germanBody, /^### Minimaler Zielpfad$/m);
  assert.match(germanBody, /^2 weitere offene Pläne sind nicht auf dem Basis-Branch\.$/m);
  // The report is a bare file name: any path, traversal or other extension is refused.
  for (const reportFile of [
    'docs/report.md',
    '../report.md',
    '/tmp/report.md',
    'report.txt',
    '.hidden.md',
  ]) {
    const refused = await run('write-set-build', {
      inventory: english.inventory,
      merged: english.merged,
      permission: english.permission,
      goal: 'Goal',
      epic: { mode: 'new' },
      reportFile,
      date: '2026-11-13',
      drafts: { epic: { title: 'Goal' } },
    });
    assert.equal(refused.error.code, 'INVALID_PAYLOAD', reportFile);
  }
});

test('the full write set is ordered, stable, allowlisted and applies exactly in that order', async (t) => {
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'oversized'),
      verdict('#3', 'obsolete-architecture', { citations: ['docs/adr/runtime.md:2'] }),
      verdict('#4', 'drift'),
    ],
    path: ['#1', '#2'],
    splits: [{ item: '#2', outline: 'A and B.' }],
  };
  const drafts = {
    epic: { title: 'Goal' },
    splits: [{ item: '#2', body: 'Split into A and B.' }],
    obsolete: [{ item: '#3', body: 'Contradicts the runtime ADR.' }],
  };
  const {
    root,
    fake,
    permission,
    inventory: data,
    merged,
    built,
  } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3), issue(4)],
    primary,
    drafts,
  });
  const order = [
    `label-create:${LABELS.epic}`,
    `label-create:${LABELS.needsPlanning}`,
    `label-create:${LABELS.obsolete}`,
    'epic:create',
    'split-comment:#2',
    'split-label:#2',
    'obsolete-comment:#3',
    'obsolete-label:#3',
  ];
  assert.deepEqual(
    built.data.entries.map(({ id }) => id),
    order,
  );
  for (const entry of built.data.entries) {
    assert.ok(WRITE_ACTIONS.includes(entry.action), entry.id);
    assert.equal(entry.status, 'available');
  }
  // The same inputs rebuild the identical set: stable ids, hashes and set hash.
  const again = await ok('write-set-build', {
    inventory: data,
    merged,
    permission,
    goal: 'Ship the portable build',
    epic: { mode: 'new' },
    reportFile: '2026-11-13-backlog-audit.md',
    date: '2026-11-13',
    drafts,
  });
  assert.deepEqual(again, built.data);
  const applied = await ok(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: built.data, selected: selectAll(built.data) },
    { tracker: fake.tracker },
  );
  assert.deepEqual(
    applied.applied.map(({ id }) => id),
    order,
  );
  assert.deepEqual(
    fake.mutations().map(({ operation }) => operation),
    [
      'label-create',
      'label-create',
      'label-create',
      'issue-create',
      'issue-comment',
      'issue-label-add',
      'issue-comment',
      'issue-label-add',
    ],
  );
  assert.deepEqual(
    fake
      .mutations()
      .filter(({ operation }) => operation === 'label-create')
      .map(({ input }) => input.payload.name),
    [LABELS.epic, LABELS.needsPlanning, LABELS.obsolete],
  );
  for (const { operation } of fake.calls)
    assert.doesNotMatch(
      operation,
      /close|remove|delete/,
      'no destructive tracker operation is ever called',
    );
  assert.equal(fake.state.issues.get(900).labels.includes(LABELS.epic), true);
  assert.deepEqual(fake.state.issues.get(2).labels, [LABELS.needsPlanning]);
  assert.deepEqual(fake.state.issues.get(3).labels, [LABELS.obsolete]);
  assert.equal(fake.state.issues.get(4).labels.length, 0, 'drift is report-only and gets no label');
  assert.equal(fake.state.issues.get(1).labels.length, 0);
});

// --- Coverage additions: capability gating, re-read skips, tamper detection --------------------

test('a missing tracker capability makes the matching entries unavailable, and applying them writes nothing', async (t) => {
  const primary = {
    verdicts: [
      verdict('#1', 'core'),
      verdict('#2', 'oversized'),
      verdict('#3', 'obsolete-architecture', { citations: ['docs/adr/runtime.md:2'] }),
    ],
    path: ['#1', '#2'],
    splits: [{ item: '#2', outline: 'A and B.' }],
  };
  const drafts = {
    epic: { title: 'Goal' },
    splits: [{ item: '#2', body: 'Split.' }],
    obsolete: [{ item: '#3', body: 'Obsolete.' }],
  };
  const gated = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
    capabilities: {
      issueSubIssueCreate: true,
      labelCreate: false,
      issueCreate: false,
      issueComment: false,
      issueLabelAdd: false,
    },
  });
  const reasons = Object.fromEntries(
    gated.built.data.entries.map(({ id, status, reason }) => [
      id.replace(/:.*/, ''),
      [status, reason],
    ]),
  );
  assert.deepEqual(reasons['label-create'], ['unavailable', 'capability-missing:label-create']);
  assert.deepEqual(reasons.epic, ['unavailable', 'capability-missing:issue-create']);
  assert.deepEqual(reasons['split-comment'], ['unavailable', 'capability-missing:issue-comment']);
  assert.deepEqual(reasons['obsolete-comment'], [
    'unavailable',
    'capability-missing:issue-comment',
  ]);
  assert.ok(gated.built.data.entries.every(({ status }) => status === 'unavailable'));
  const result = await ok(
    'write-set-apply',
    {
      cwd: gated.root,
      target: FORGE,
      permission: gated.permission,
      writeSet: gated.built.data,
      selected: gated.built.data.entries.map(({ id, hash }) => ({ id, hash })),
    },
    { tracker: gated.fake.tracker },
  );
  assert.deepEqual(result.applied, []);
  assert.ok(result.skipped.every(({ reason }) => reason === 'unavailable'));
  assert.equal(result.skipped.length, gated.built.data.entries.length);
  assert.equal(gated.fake.mutations().length, 0);
});

test('a target changed after the gate skips only the entries it affects', async (t) => {
  const primary = {
    verdicts: [
      verdict('#1', 'oversized'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      verdict('#3', 'drift'),
    ],
    path: ['#1'],
    splits: [{ item: '#1', outline: 'A and B.' }],
  };
  const drafts = {
    epic: { title: 'Goal' },
    splits: [{ item: '#1', body: 'Split.' }],
    obsolete: [{ item: '#2', body: 'Obsolete.' }],
  };
  const applyOnly = async (change, prefix) => {
    const fixture = await writeSetFixture(t, {
      issues: [issue(1), issue(2), issue(3)],
      primary,
      drafts,
    });
    await change(fixture.fake);
    const result = await ok(
      'write-set-apply',
      {
        cwd: fixture.root,
        target: FORGE,
        permission: fixture.permission,
        writeSet: fixture.built.data,
        selected: selectAll(fixture.built.data, ({ id }) => id.startsWith(prefix)),
      },
      { tracker: fixture.fake.tracker },
    );
    return { ...fixture, result };
  };
  const owner = { login: 'owner' };
  // The body changed after the split was drafted.
  const edited = await applyOnly((fake) => {
    fake.state.issues.get(1).body = 'Rewritten.';
  }, 'split-');
  assert.deepEqual(edited.result.skipped, [
    { id: 'split-comment:#1', reason: 'target-changed' },
    { id: 'split-label:#1', reason: 'dependency-not-applied' },
  ]);
  // The label appeared elsewhere in the meantime: the comment lands, the label is skipped.
  const labeled = await applyOnly((fake) => {
    fake.state.issues.get(1).labels.push(LABELS.needsPlanning);
  }, 'split-');
  assert.deepEqual(
    labeled.result.applied.map(({ id }) => id),
    ['split-comment:#1'],
  );
  assert.deepEqual(labeled.result.skipped, [{ id: 'split-label:#1', reason: 'already-labeled' }]);
  // A split marker for the current body appeared after the gate: no second marker comment.
  const marked = await applyOnly((fake) => {
    fake.state.comments.set(1, [
      { id: 7, body: splitMarkerFor('SECRET body of issue 1'), author: owner },
    ]);
  }, 'split-');
  assert.deepEqual(marked.result.skipped[0], { id: 'split-comment:#1', reason: 'marker-present' });
  assert.equal(marked.fake.mutations().length, 0);
  // The issue was decomposed in the meantime: the hand-off no longer applies.
  const decomposed = await applyOnly((fake) => {
    fake.state.comments.set(1, [
      { id: 8, body: planIssuesComment('#1', [{ number: 31, key: 'a' }]), author: owner },
    ]);
  }, 'split-');
  assert.deepEqual(decomposed.result.skipped[0], {
    id: 'split-comment:#1',
    reason: 'target-changed',
  });
  // An obsolete marker appeared after the gate: the comment is never duplicated.
  const obsolete = await applyOnly((fake) => {
    fake.state.comments.set(2, [{ id: 9, body: `${OBSOLETE_MARKER}\nAlready.`, author: owner }]);
  }, 'obsolete-');
  assert.deepEqual(obsolete.result.skipped, [
    { id: 'obsolete-comment:#2', reason: 'marker-present' },
    { id: 'obsolete-label:#2', reason: 'dependency-not-applied' },
  ]);
  assert.equal(obsolete.fake.mutations().length, 0);
  // A selection that names an unknown or repeated entry is refused before any tracker call.
  const base = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary,
    drafts,
  });
  const before = base.fake.calls.length;
  const [first] = base.built.data.entries;
  for (const selected of [
    [{ id: 'epic:delete', hash: 'x' }],
    [
      { id: first.id, hash: first.hash },
      { id: first.id, hash: first.hash },
    ],
  ]) {
    const refused = await run(
      'write-set-apply',
      {
        cwd: base.root,
        target: FORGE,
        permission: base.permission,
        writeSet: base.built.data,
        selected,
      },
      { tracker: base.fake.tracker },
    );
    assert.equal(refused.error.code, 'INVALID_PAYLOAD');
  }
  assert.equal(base.fake.calls.length, before);
  // A stale hash skips only its own entry; the other selected entries still apply.
  const mixed = await ok(
    'write-set-apply',
    {
      cwd: base.root,
      target: FORGE,
      permission: base.permission,
      writeSet: base.built.data,
      selected: [
        { id: first.id, hash: '0'.repeat(64) },
        ...base.built.data.entries.slice(1, 2).map(({ id, hash }) => ({ id, hash })),
      ],
    },
    { tracker: base.fake.tracker },
  );
  assert.deepEqual(mixed.skipped, [{ id: first.id, reason: 'hash-mismatch' }]);
  assert.equal(mixed.applied.length, 1);
});

// Invariant: every split and obsolete mark is bound to the body that was assessed. A body
// rewritten after the assessment, even between a mark comment and its label, is never marked.
test('a body rewritten after the assessment skips every split and obsolete mark of that issue', async (t) => {
  const owner = { login: 'owner' };
  const primary = {
    verdicts: [
      verdict('#1', 'oversized'),
      verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      verdict('#3', 'drift'),
    ],
    path: ['#1'],
    splits: [{ item: '#1', outline: 'A and B.' }],
  };
  const drafts = {
    epic: { title: 'Goal' },
    splits: [{ item: '#1', body: 'Split.' }],
    obsolete: [{ item: '#2', body: 'Obsolete.' }],
  };
  const applyOnly = async ({ comments, change = () => {}, afterComment }, prefix) => {
    const fixture = await writeSetFixture(t, {
      issues: [issue(1), issue(2), issue(3)],
      comments,
      primary,
      drafts,
    });
    change(fixture.fake);
    // Stands in for an edit that lands after the mark comment and before its label.
    const tracker = async (operation, input, options) => {
      const result = await fixture.fake.tracker(operation, input, options);
      if (operation === 'issue-comment' && afterComment) afterComment(fixture.fake);
      return result;
    };
    const result = await ok(
      'write-set-apply',
      {
        cwd: fixture.root,
        target: FORGE,
        permission: fixture.permission,
        writeSet: fixture.built.data,
        selected: selectAll(fixture.built.data, ({ id }) => id.startsWith(prefix)),
      },
      { tracker },
    );
    return { ...fixture, result };
  };
  const rewrite = (number) => (fake) => {
    fake.state.issues.get(number).body = 'Rewritten.';
  };
  const labelAdds = (fake) =>
    fake.mutations().filter(({ operation }) => operation === 'issue-label-add');
  // Rewritten before the obsolete comment: neither the comment nor its label is written.
  const before = await applyOnly({ change: rewrite(2) }, 'obsolete-');
  assert.deepEqual(before.result.skipped, [
    { id: 'obsolete-comment:#2', reason: 'target-changed' },
    { id: 'obsolete-label:#2', reason: 'dependency-not-applied' },
  ]);
  assert.equal(before.fake.mutations().length, 0);
  // Rewritten between the obsolete comment and its label: the label is skipped.
  const between = await applyOnly({ afterComment: rewrite(2) }, 'obsolete-');
  assert.deepEqual(
    between.result.applied.map(({ id }) => id),
    ['obsolete-comment:#2'],
  );
  assert.deepEqual(between.result.skipped, [{ id: 'obsolete-label:#2', reason: 'target-changed' }]);
  assert.deepEqual(labelAdds(between.fake), []);
  // Rewritten between the split comment and its label: the label is skipped.
  const split = await applyOnly({ afterComment: rewrite(1) }, 'split-');
  assert.deepEqual(
    split.result.applied.map(({ id }) => id),
    ['split-comment:#1'],
  );
  assert.deepEqual(split.result.skipped, [{ id: 'split-label:#1', reason: 'target-changed' }]);
  assert.deepEqual(labelAdds(split.fake), []);
  // A label repair under an existing marker is bound to the assessed body as well.
  const marked = {
    1: [{ id: 7, body: splitMarkerFor('SECRET body of issue 1'), author: owner }],
    2: [{ id: 8, body: `${OBSOLETE_MARKER}\nAlready.`, author: owner }],
  };
  const repairObsolete = await applyOnly({ comments: marked, change: rewrite(2) }, 'obsolete-');
  assert.deepEqual(repairObsolete.result.skipped, [
    { id: 'obsolete-label:#2', reason: 'target-changed' },
  ]);
  const repairSplit = await applyOnly({ comments: marked, change: rewrite(1) }, 'split-');
  assert.deepEqual(repairSplit.result.skipped, [
    { id: 'split-label:#1', reason: 'target-changed' },
  ]);
  assert.deepEqual([...labelAdds(repairObsolete.fake), ...labelAdds(repairSplit.fake)], []);
  // An unchanged body still repairs both labels.
  const unchanged = await applyOnly({ comments: marked }, '');
  assert.deepEqual(
    unchanged.result.applied.map(({ id }) => id).filter((id) => id.includes('-label:')),
    ['split-label:#1', 'obsolete-label:#2'],
  );
});

// Invariant: every object the orchestrator hands back is one the helper produced. A model cannot
// widen a capability, drop an item, edit a verdict or add a write by editing the JSON in between.
test('proof, inventory, merged verdicts and write set each detect tampering by their own hash', async (t) => {
  const fixture = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: corePrimary,
  });
  const { root, fake, permission, inventory: data, merged, built } = fixture;
  const set = built.data;
  const input = {
    inventory: data,
    merged,
    permission,
    goal: 'Goal',
    epic: { mode: 'new' },
    reportFile: 'report.md',
    date: '2026-11-13',
    drafts: { epic: { title: 'Goal' } },
  };
  const tamperedCode = (envelope) => envelope.error?.code;
  // proofHash: a widened capability and a flipped mode.
  const widened = structuredClone(permission);
  widened.capabilities.decompose = false;
  const plans = structuredClone(permission);
  plans.mode = 'plans-only';
  for (const forged of [widened, plans]) {
    assert.equal(
      tamperedCode(
        await run(
          'inventory-build',
          {
            cwd: root,
            runtimeStateRoot: root,
            target: FORGE,
            permission: forged,
            planDir: 'docs/plan',
          },
          { tracker: fake.tracker },
        ),
      ),
      'TAMPERED_INPUT',
    );
    assert.equal(
      tamperedCode(await run('write-set-build', { ...input, permission: forged })),
      'TAMPERED_INPUT',
    );
    assert.equal(
      tamperedCode(
        await run(
          'write-set-apply',
          { cwd: root, target: FORGE, permission: forged, writeSet: set, selected: [] },
          { tracker: fake.tracker },
        ),
      ),
      'TAMPERED_INPUT',
    );
  }
  // inventoryHash: a dropped item.
  const dropped = structuredClone(data);
  dropped.items = dropped.items.slice(1);
  assert.equal(
    tamperedCode(
      await run('verdicts-validate', { cwd: root, inventory: dropped, primary: corePrimary }),
    ),
    'TAMPERED_INPUT',
  );
  assert.equal(
    tamperedCode(await run('bounds-check', { runtimeStateRoot: root, inventory: dropped })),
    'TAMPERED_INPUT',
  );
  assert.equal(
    tamperedCode(await run('write-set-build', { ...input, inventory: dropped })),
    'TAMPERED_INPUT',
  );
  // mergedHash: an edited verdict, and a record set rehashed for another inventory.
  const edited = structuredClone(merged);
  edited.records[2].verdict = 'core';
  assert.equal(
    tamperedCode(await run('write-set-build', { ...input, merged: edited })),
    'TAMPERED_INPUT',
  );
  const foreign = structuredClone(merged);
  foreign.inventoryHash = 'f'.repeat(64);
  const { mergedHash: dropMerged, ...foreignRest } = foreign;
  foreign.mergedHash = contentHash(foreignRest);
  const mismatch = await run('write-set-build', { ...input, merged: foreign });
  assert.equal(mismatch.error.code, 'INVALID_PAYLOAD');
  assert.match(mismatch.error.message, /another inventory/);
  // setHash: an edited notice, a dropped entry, and an edited entry under a valid set hash.
  const notice = structuredClone(set);
  notice.notices.push('extra');
  const shorter = structuredClone(set);
  shorter.entries.pop();
  const entryEdited = structuredClone(set);
  entryEdited.entries[1].payload.title = 'Other';
  const { setHash: dropSet, ...entryRest } = entryEdited;
  entryEdited.setHash = contentHash(entryRest);
  const apply = (writeSet) =>
    run(
      'write-set-apply',
      { cwd: root, target: FORGE, permission, writeSet, selected: [] },
      { tracker: fake.tracker },
    );
  for (const forged of [notice, shorter, entryEdited])
    assert.equal(tamperedCode(await apply(forged)), 'TAMPERED_INPUT');
  assert.match((await apply(entryEdited)).error.message, /a write-set entry was modified/);
  // A forged action outside the allowlist, even with every hash recomputed, is refused.
  for (const action of ['issue-close', 'issue-label-remove', 'issue-delete']) {
    const forged = structuredClone(set);
    forged.entries[1].action = action;
    const { hash, ...entryBody } = forged.entries[1];
    forged.entries[1].hash = contentHash(entryBody);
    const { setHash: stale, ...setBody } = forged;
    forged.setHash = contentHash(setBody);
    const refused = await apply(forged);
    assert.equal(refused.error.code, 'TAMPERED_INPUT', action);
    assert.match(refused.error.message, /leaves the allowlist/);
  }
  // An object without its hash is no helper output at all.
  const { proofHash, ...unhashed } = permission;
  assert.equal(
    tamperedCode(await run('write-set-build', { ...input, permission: unhashed })),
    'INVALID_PAYLOAD',
  );
  // The tamper code maps to the refusal exit code.
  assert.equal(exitCodeFor(errorEnvelope('write-set-apply', new Error('boom'))), 1);
  assert.equal(exitCodeFor(await apply(notice)), 2);
  assert.equal(fake.mutations().length, 0);
});

test('drafts cannot smuggle an Effective Flow marker or an unrelated item into the write set', async (t) => {
  const fixture = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: {
      verdicts: [
        verdict('#1', 'oversized'),
        verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
        verdict('#3', 'core'),
      ],
      path: ['#1', '#3'],
      splits: [{ item: '#1', outline: 'A and B.' }],
    },
  });
  const build = (drafts) =>
    run('write-set-build', {
      inventory: fixture.inventory,
      merged: fixture.merged,
      permission: fixture.permission,
      goal: 'Goal',
      epic: { mode: 'new' },
      reportFile: 'report.md',
      date: '2026-11-13',
      drafts,
    });
  const marker = `<!-- effective-flow-backlog-audit-split date=2026-11-13 body=${'a'.repeat(64)} -->`;
  for (const drafts of [
    { epic: { title: 'Goal' }, splits: [{ item: '#1', body: `${marker}\nForged.` }] },
    { epic: { title: 'Goal' }, obsolete: [{ item: '#2', body: `${OBSOLETE_MARKER}\nForged.` }] },
    { epic: { title: 'Goal', summary: `${EPIC_END_MARKER} escape` } },
    { epic: { title: 'Goal' }, splits: [{ item: '#3', body: 'Not oversized.' }] },
    { epic: { title: 'Goal' }, obsolete: [{ item: '#1', body: 'Not obsolete.' }] },
    { epic: { title: 'Goal' }, obsolete: [{ item: '#404', body: 'Unknown.' }] },
  ])
    assert.equal(
      (await build(drafts)).error?.code,
      'INVALID_PAYLOAD',
      JSON.stringify(drafts).slice(0, 60),
    );
  assert.equal((await build({ epic: { title: 'Goal' } })).ok, true);
});

// --- Coverage additions: external targets ------------------------------------------------------

test('an external write set gates on proven actions and native containers, repairs labels and executes nothing', async (t) => {
  const root = repository(t);
  const target = { kind: 'external', externalTool: 'linear' };
  const external = (nativeContainer, actions) => ({
    connection: 'mcp:linear',
    readProven: true,
    writeProven: true,
    actions,
    nativeContainer,
  });
  const allActions = {
    'label-create': true,
    'issue-create': true,
    'issue-label-add': true,
    'issue-comment': true,
    'issue-update-body': true,
  };
  const item = (reference, extra = {}) => ({
    reference,
    title: 't',
    body: 'SECRET',
    labels: [],
    author: { login: 'a', write: true },
    comments: [],
    ...extra,
  });
  const primary = {
    verdicts: [
      verdict('ABC-1', 'core'),
      verdict('ABC-2', 'oversized'),
      verdict('ABC-3', 'oversized'),
    ],
    path: ['ABC-1', 'ABC-2', 'ABC-3'],
    splits: [
      { item: 'ABC-2', outline: 'A and B.' },
      { item: 'ABC-3', outline: 'C and D.' },
    ],
  };
  const drafts = { epic: { title: 'Goal' }, splits: [{ item: 'ABC-2', body: 'Split.' }] };
  const build = async (attestation) => {
    const permission = await ok(
      'permission-prove',
      { cwd: root, target, external: attestation },
      { tracker: noTracker },
    );
    const data = await ok(
      'inventory-build',
      {
        cwd: root,
        runtimeStateRoot: root,
        target,
        permission,
        planDir: 'docs/plan',
        externalIssues: [
          item('ABC-1'),
          item('ABC-2'),
          // Marked for the current body but never labeled: only the label is left to offer.
          item('ABC-3', {
            comments: [
              { id: 'c1', body: splitMarkerFor('SECRET'), author: { login: 'a', write: true } },
            ],
          }),
        ],
      },
      { tracker: noTracker },
    );
    const merged = await ok('verdicts-validate', { cwd: root, inventory: data, primary });
    const set = await ok(
      'write-set-build',
      {
        inventory: data,
        merged,
        permission,
        goal: 'Goal',
        epic: { mode: 'new' },
        reportFile: 'report.md',
        date: '2026-11-13',
        drafts,
      },
      { tracker: noTracker },
    );
    await ok('snapshot-cleanup', { runtimeStateRoot: root, runId: data.runId });
    return { permission, set };
  };
  // With a native container the split is available, and an existing marker offers only the label.
  const native = await build(external(true, allActions));
  const byId = new Map(native.set.entries.map((entry) => [entry.id, entry]));
  assert.deepEqual(
    native.set.entries.map(({ id }) => id),
    [
      `label-create:${LABELS.epic}`,
      `label-create:${LABELS.needsPlanning}`,
      'epic:create',
      'epic:label',
      'split-comment:ABC-2',
      'split-label:ABC-2',
      'split-label:ABC-3',
    ],
  );
  assert.ok(native.set.entries.every(({ status }) => status === 'available'));
  assert.equal(byId.get('epic:label').dependsOn, 'epic:create');
  // Without one the split is unavailable and never emulated.
  const flat = await build(external(false, allActions));
  assert.deepEqual(
    flat.set.entries
      .filter(({ id }) => id === 'split-comment:ABC-2' || id === 'split-label:ABC-2')
      .map(({ status, reason }) => [status, reason]),
    [
      ['unavailable', 'decomposition-unavailable'],
      ['unavailable', 'decomposition-unavailable'],
    ],
  );
  // An action the connection did not prove is unavailable, too.
  const noCreate = await build(external(true, { ...allActions, 'issue-create': false }));
  assert.deepEqual(
    noCreate.set.entries
      .filter(({ status }) => status === 'unavailable')
      .map(({ id, reason }) => [id, reason]),
    [['epic:create', 'capability-missing:issue-create']],
  );
  // Apply returns only the selected, runnable calls in order; skipped entries never become calls.
  const selected = [
    ...native.set.entries.slice(0, 4).map(({ id, hash }) => ({ id, hash })),
    { id: 'split-label:ABC-3', hash: '0'.repeat(64) },
  ];
  const result = await ok(
    'write-set-apply',
    { cwd: root, target, permission: native.permission, writeSet: native.set, selected },
    { tracker: noTracker },
  );
  assert.deepEqual(
    result.calls.map(({ id }) => id),
    [
      `label-create:${LABELS.epic}`,
      `label-create:${LABELS.needsPlanning}`,
      'epic:create',
      'epic:label',
    ],
  );
  assert.deepEqual(result.skipped, [{ id: 'split-label:ABC-3', reason: 'hash-mismatch' }]);
  assert.deepEqual(result.applied, []);
  for (const call of result.calls) assert.ok(WRITE_ACTIONS.includes(call.action));
  assert.equal(result.mode, 'external');
});

// --- Coverage additions: CLI envelope ----------------------------------------------------------

// --- Review corrections ----------------------------------------------------------------------

// Invariant: config values arrive exactly as config-resolve decodes them (a table cell as its
// literal string, `(empty)` as `[]`, a JSON list as strings), and each of those shapes validates.
test('config validation accepts the values config-resolve actually hands over', () => {
  const cell = (raw) => decodeCell(raw).value;
  assert.deepEqual(
    validateConfig({
      'backlogAudit.panel': cell('fable, other-1'),
      'backlogAudit.maxItems': cell('80'),
      'backlogAudit.maxSnapshotKiB': cell('512'),
    }),
    { panel: ['fable', 'other-1'], maxItems: 80, maxSnapshotKiB: 512 },
  );
  assert.deepEqual(validateConfig({ 'backlogAudit.panel': cell('(empty)') }).panel, []);
  const json = Object.fromEntries(
    flattenJsonConfiguration({ backlogAudit: { panel: ['fable'], maxItems: 12 } }).map(
      ({ key, decoded }) => [key, decoded.value],
    ),
  );
  assert.deepEqual(validateConfig(json), { panel: ['fable'], maxItems: 12, maxSnapshotKiB: 400 });
  for (const value of ['80 items', '0', '1001', cell('true'), cell('null') ?? 'x'])
    assert.throws(() => validateConfig({ 'backlogAudit.maxItems': value }), /backlogAudit/);
  assert.throws(() => validateConfig({ 'backlogAudit.panel': [1] }), /backlogAudit/);
});

// Invariant: an external attestation belongs to a non-hidden external target only, so a mode
// that forces plans-only can never carry a tracker proof.
test('an external attestation is refused outside a non-hidden external target', async () => {
  const external = { connection: 'mcp:linear', readProven: true, writeProven: true };
  for (const target of [
    { kind: 'external', externalTool: 'linear', visibility: 'hidden' },
    { kind: 'forge' },
    { kind: 'local' },
  ]) {
    const refused = await run(
      'permission-prove',
      { cwd: '/', target, external },
      { tracker: noTracker },
    );
    assert.equal(refused.error.code, 'INVALID_PAYLOAD', JSON.stringify(target));
  }
});

// Invariant: anyone can paste a marker; split, obsolete and epic markers count only from the
// proven runner or an author with stated write permission, at inventory and at apply time.
test('forged split, obsolete and epic markers neither count nor hide an issue', async (t) => {
  const body = 'SECRET body of issue 1';
  const forgedEpic = `<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->\n${EPIC_END_MARKER}`;
  const fixture = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    extraIssues: [issue(4, { body: forgedEpic, author: { login: 'stranger' } })],
    comments: {
      1: [{ id: 1, body: splitMarkerFor(body), author: { login: 'stranger' } }],
      2: [{ id: 2, body: `${OBSOLETE_MARKER}\nForged.`, author: { login: 'stranger' } }],
    },
    primary: {
      verdicts: [
        verdict('#1', 'oversized'),
        verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
        verdict('#3', 'core'),
        verdict('#4', 'drift'),
      ],
      path: ['#1', '#3'],
      splits: [{ item: '#1', outline: 'A and B.' }],
    },
    drafts: {
      epic: { title: 'Goal' },
      splits: [{ item: '#1', body: 'Split.' }],
      obsolete: [{ item: '#2', body: 'Obsolete.' }],
    },
  });
  assert.equal(fixture.built.ok, true, JSON.stringify(fixture.built.error));
  const items = new Map(fixture.inventory.items.map((item) => [item.id, item]));
  assert.equal(items.get('#1').markers.split, null);
  assert.equal(items.get('#2').markers.obsolete, false);
  assert.ok(items.has('#4'), 'a forged epic marker does not exclude the issue');
  assert.deepEqual(fixture.inventory.epicCandidates, []);
  const ids = fixture.built.data.entries.map(({ id }) => id);
  for (const id of ['epic:create', 'split-comment:#1', 'obsolete-comment:#2'])
    assert.ok(ids.includes(id), id);
  const applied = await ok(
    'write-set-apply',
    {
      cwd: fixture.root,
      target: FORGE,
      permission: fixture.permission,
      writeSet: fixture.built.data,
      selected: selectAll(fixture.built.data, ({ id }) => !id.startsWith('epic:')),
    },
    { tracker: fixture.fake.tracker },
  );
  assert.deepEqual(applied.skipped, []);
  assert.ok(applied.applied.some(({ id }) => id === 'split-comment:#1'));
  assert.ok(applied.applied.some(({ id }) => id === 'obsolete-comment:#2'));
  // The runner's own marker does count on a rerun: no second hand-off is offered.
  await ok('snapshot-cleanup', { runtimeStateRoot: fixture.root, runId: fixture.inventory.runId });
  const rerun = await inventory(fixture.root, fixture.fake);
  const rerunItem = rerun.inventory.items.find(({ id }) => id === '#1');
  assert.equal(rerunItem.markers.split.current, true);
});

// Invariant: one split-resolution rule: a planning comment created after the marker, or a
// canonical planning comment whose decomposition is active or all declined, wherever it stands.
test('a split is resolved by a later planning comment or by a decided canonical comment', async (t) => {
  const body = 'SECRET body of issue 1';
  const primary = {
    verdicts: [verdict('#1', 'oversized'), verdict('#2', 'drift'), verdict('#3', 'drift')],
    path: ['#1'],
    splits: [{ item: '#1', outline: 'A and B.' }],
  };
  const drafts = { epic: { title: 'Goal' }, splits: [{ item: '#1', body: 'Split.' }] };
  const marker = { id: 5, body: splitMarkerFor(body), author: { login: 'owner' } };
  const { section } = buildDecompositionRecords({
    language: 'en',
    target: 'forge',
    repository: { ...GITHUB_REPOSITORY, provider: 'github' },
    externalTool: null,
    parent: 1,
    records: [
      {
        key: 'child-01',
        title: 'Child',
        workflow: 'Feature',
        body: '**Recommended workflow:** Feature\n\nRequirement',
        status: 'declined',
        issue: null,
      },
    ],
  });
  const canonical = (text) => ({ id: 1, body: text, author: { login: 'owner' } });
  const declinedComment = canonical(`<!-- effective-flow-plan-issues -->\n\n${section}\n`);
  const plainComment = canonical('<!-- effective-flow-plan-issues -->\nPlanned.');
  const resolved = async (comments) => {
    const fixture = await writeSetFixture(t, {
      issues: [issue(1), issue(2), issue(3)],
      comments: { 1: comments },
      primary,
      drafts,
    });
    return fixture.inventory.items.find(({ id }) => id === '#1').markers.split.resolved;
  };
  assert.equal(await resolved([marker, plainComment]), true, 'a later planning comment');
  assert.equal(await resolved([declinedComment, marker]), true, 'an earlier, declined canonical');
  assert.equal(await resolved([plainComment, marker]), false, 'an earlier, undecided canonical');
  assert.equal(await resolved([marker]), false, 'no planning comment');
});

// Invariant: an external write lands only through the helper's check of the target the run
// re-read: the helper decides skip or proceed and returns the exact payload, splice included.
test('external-call-check decides each external write from the re-read target', async (t) => {
  const root = repository(t);
  const target = { kind: 'external', externalTool: 'linear' };
  const actions = Object.fromEntries(WRITE_ACTIONS.map((action) => [action, true]));
  const permission = await ok(
    'permission-prove',
    {
      cwd: root,
      target,
      external: { connection: 'mcp:linear', readProven: true, writeProven: true, actions },
    },
    { tracker: noTracker },
  );
  const epicBody = [
    'Intro.\r',
    '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->\r',
    '- [ ] ABC-9\r',
    `${EPIC_END_MARKER}\r`,
    'Outro.  ',
  ].join('\n');
  const item = (reference, extra = {}) => ({
    reference,
    title: 't',
    body: `SECRET ${reference}`,
    labels: [],
    author: { login: 'a', write: true },
    comments: [],
    ...extra,
  });
  const data = await ok(
    'inventory-build',
    {
      cwd: root,
      runtimeStateRoot: root,
      target,
      permission,
      planDir: 'docs/plan',
      epic: { reference: 'ABC-40' },
      externalIssues: [
        item('ABC-1'),
        item('ABC-2'),
        item('ABC-40', { labels: [LABELS.epic], body: epicBody }),
      ],
    },
    { tracker: noTracker },
  );
  const merged = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: {
      verdicts: [
        verdict('ABC-1', 'core'),
        verdict('ABC-2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      ],
      path: ['ABC-1'],
    },
  });
  const set = await ok('write-set-build', {
    inventory: data,
    merged,
    permission,
    goal: 'Ship the portable build',
    epic: { mode: 'existing', reference: 'ABC-40' },
    reportFile: 'report.md',
    date: '2026-11-13',
    drafts: { obsolete: [{ item: 'ABC-2', body: 'Obsolete.' }] },
  });
  const check = (id, current, extra = {}) =>
    run('external-call-check', { permission, writeSet: set, id, current, ...extra });
  const updateId = 'epic:update:ABC-40';
  const current = (body, comments = []) => ({ state: 'open', labels: [], body, comments });
  const proceed = await check(updateId, current(epicBody));
  assert.equal(proceed.data.proceed, true, JSON.stringify(proceed.error));
  const spliced = proceed.data.payload.body;
  assert.ok(spliced.startsWith('Intro.\r\n'), 'the text before the section keeps its CRLF');
  assert.ok(spliced.endsWith(`${EPIC_END_MARKER}\r\nOutro.  `), 'the text after it is unchanged');
  assert.match(spliced, /^- \[ \] ABC-1\r$/m);
  const stale = await check(updateId, current(`${epicBody} edited`));
  assert.deepEqual([stale.data.proceed, stale.data.reason], [false, 'stale-body']);
  // A forged obsolete marker from an author without write permission does not block the comment.
  const forged = { author: { login: 'x', write: false }, body: `${OBSOLETE_MARKER}\nForged.` };
  const obsoleteId = 'obsolete-comment:ABC-2';
  const forgedCheck = await check(obsoleteId, current('SECRET ABC-2', [forged]));
  assert.equal(forgedCheck.data.proceed, true);
  const genuine = { ...forged, author: { login: 'y', write: true } };
  const genuineCheck = await check(obsoleteId, current('SECRET ABC-2', [genuine]));
  assert.deepEqual(
    [genuineCheck.data.proceed, genuineCheck.data.reason],
    [false, 'marker-present'],
  );
  // A body rewritten after the assessment is never marked obsolete from the stale verdict.
  const rewritten = await check(obsoleteId, current('Rewritten.'));
  assert.deepEqual([rewritten.data.proceed, rewritten.data.reason], [false, 'target-changed']);
  // Rewritten after the comment was confirmed applied: its label is skipped as well.
  const label = await check('obsolete-label:ABC-2', current('Rewritten.'), {
    appliedIds: [obsoleteId],
  });
  assert.deepEqual([label.data.proceed, label.data.reason], [false, 'target-changed']);
  const unknown = await check('epic:create', current(''));
  assert.equal(unknown.error.code, 'INVALID_PAYLOAD');
  // A forge write set is never checked here.
  const forgeFixture = await writeSetFixture(t, {
    issues: [issue(1)],
    primary: {
      verdicts: [verdict('#1', 'core')],
      path: ['#1'],
    },
  });
  const refused = await run('external-call-check', {
    permission: forgeFixture.permission,
    writeSet: forgeFixture.built.data,
    id: 'epic:create',
    current: { issues: [] },
  });
  assert.equal(refused.error.code, 'INVALID_PAYLOAD');
});

// Invariant: a large input travels as one runtime-state file the helper reads once and removes;
// only a regular file of the input family directly in the inputs directory is accepted.
test('an input file is read once from the inputs directory and removed', async (t) => {
  const root = repository(t);
  const inputs = join(root, '.effective-flow/backlog-audit/inputs');
  mkdirSync(inputs, { recursive: true });
  const file = join(inputs, 'permission-prove-1.json');
  writeFileSync(file, JSON.stringify({ cwd: root, target: { kind: 'local' } }));
  const proven = await ok('permission-prove', { inputFile: file }, { tracker: noTracker });
  assert.equal(proven.mode, 'plans-only');
  assert.equal(existsSync(file), false, 'the input file is removed after the read');
  const outside = join(root, 'docs/input.json');
  writeFileSync(outside, '{}');
  for (const inputFile of [
    outside,
    join(inputs, '../inputs/permission-prove-1.json'),
    join(inputs, 'Bad Name.json'),
    'relative.json',
  ])
    assert.equal(
      (await run('permission-prove', { inputFile }, { tracker: noTracker })).error.code,
      'INVALID_PAYLOAD',
      inputFile,
    );
  symlinkSync(outside, join(inputs, 'linked.json'));
  await assert.rejects(readInputFile(join(inputs, 'linked.json'), { runner }), /regular file/);
  assert.equal(existsSync(outside), true, 'a symlinked input is never followed or removed');
});

// Invariant: a citation is a repository file: normalization cannot smuggle a runtime-state or
// Git-internal path past the check, and a symlink is judged by its real target.
test('citations reject runtime-state and Git paths in every spelling', async (t) => {
  const { root, inventory: data } = await assessed(t);
  symlinkSync(data.architectureSummaryPath, join(root, 'docs/adr/linked.md'));
  symlinkSync(join(root, '.effective-flow/backlog-audit'), join(root, 'docs/state'));
  writeFileSync(join(root, 'docs/adr/inner.md'), 'x\n');
  const throughLink = `docs/state/snapshots/${data.runId}/architecture-summary.md`;
  const problem = async (citation) => {
    const envelope = await run('verdicts-validate', {
      cwd: root,
      inventory: data,
      primary: {
        verdicts: [
          verdict('#1', 'obsolete-architecture', { citations: [citation] }),
          verdict('#2', 'drift'),
          verdict('#3', 'drift'),
        ],
        path: [],
      },
    });
    return envelope.ok ? null : envelope.error.details.problems[0].citationProblems[0];
  };
  for (const [citation, expected] of [
    ['./.effective-flow/backlog-audit/x.md', 'runtime-state'],
    ['docs/./../.effective-flow/x.md', 'outside-repository'],
    ['.git/config', 'git-internal'],
    ['./.git/HEAD', 'git-internal'],
    ['docs/adr/linked.md', 'missing'],
    [throughLink, 'runtime-state'],
    ['./docs/adr/inner.md', null],
  ])
    assert.equal(await problem(citation), expected, citation);
  // `evidence` is repository references only, never quoted text.
  const withEvidence = (evidence) =>
    run('verdicts-validate', {
      cwd: root,
      inventory: data,
      primary: {
        verdicts: [
          verdict('#1', 'core', { evidence }),
          verdict('#2', 'drift'),
          verdict('#3', 'drift'),
        ],
        path: ['#1'],
      },
    });
  assert.equal((await withEvidence(['docs/adr/runtime.md:2', 'src/a.mjs:3-9'])).ok, true);
  for (const evidence of [['The issue says "do X"'], ['.effective-flow/x.md'], ['../x.md']])
    assert.equal((await withEvidence(evidence)).error.code, 'VERDICTS_INVALID', evidence[0]);
  // The roots are the inventory's: another checkout or runtime root is refused.
  const other = repository(t);
  assert.equal(
    (await run('verdicts-validate', { cwd: other, inventory: data, primary: {} })).error.code,
    'INVALID_PAYLOAD',
  );
  assert.equal(
    (await run('bounds-check', { runtimeStateRoot: other, inventory: data })).error.code,
    'INVALID_PAYLOAD',
  );
});

// Invariant: a proof binds its repository; a session that resolves another one stops.
test('a proof made for one repository refuses an inventory or apply in another', async (t) => {
  const root = repository(t);
  const fake = forge({ issues: [issue(1)] });
  const permission = await proven(root, fake);
  const moved = async (operation, input, options) =>
    operation === 'repository-resolve'
      ? {
          ok: true,
          data: { host: 'github.com', owner: 'other', repository: 'fork', provider: 'github' },
        }
      : fake.tracker(operation, input, options);
  const base = { cwd: root, target: FORGE, permission };
  const listed = await run('epic-candidates', base, { tracker: moved });
  assert.equal(listed.error.code, 'REPOSITORY_MISMATCH');
  const built = await run(
    'inventory-build',
    { ...base, runtimeStateRoot: root, planDir: 'docs/plan' },
    { tracker: moved },
  );
  assert.equal(built.error.code, 'REPOSITORY_MISMATCH');
  const fixture = await writeSetFixture(t, {
    issues: [issue(1)],
    primary: {
      verdicts: [verdict('#1', 'core')],
      path: ['#1'],
    },
  });
  const relocated = async (operation, input, options) =>
    operation === 'repository-resolve'
      ? moved(operation, input, options)
      : fixture.fake.tracker(operation, input, options);
  const applied = await run(
    'write-set-apply',
    {
      cwd: fixture.root,
      target: FORGE,
      permission: fixture.permission,
      writeSet: fixture.built.data,
      selected: selectAll(fixture.built.data),
    },
    { tracker: relocated },
  );
  assert.equal(applied.error.code, 'REPOSITORY_MISMATCH');
  assert.equal(fixture.fake.mutations().length, 0);
});

// Invariant: a forge that refuses to state other users' permission is reported as such, not
// silently read as "no write permission".
test('a Forgejo 403 on other users permission yields a distinct unreadable notice', async (t) => {
  const root = repository(t);
  const fake = forge({
    issues: [issue(1, { author: { login: 'stranger' } })],
    permissions: { owner: 'admin', stranger: 'FORBIDDEN' },
  });
  const { inventory: data } = await inventory(root, fake);
  assert.deepEqual(data.notices, ['permission-unreadable']);
  assert.equal(data.counts.permissionUnreadable, 1);
  assert.equal(data.items[0].authorWrite, null);
  assert.equal(data.items[0].flagged, true);
});

// Invariant: external intake admits open issues only, with bounded labels, typed comment ids and
// case-insensitive identifiers.
test('external intake refuses closed issues, unbounded labels, odd comment ids and case duplicates', async (t) => {
  const root = repository(t);
  const target = { kind: 'external', externalTool: 'linear' };
  const permission = await ok(
    'permission-prove',
    { cwd: root, target, external: { connection: 'mcp', readProven: true, writeProven: true } },
    { tracker: noTracker },
  );
  const item = (reference, extra = {}) => ({
    reference,
    title: 't',
    body: 'b',
    labels: [],
    author: { login: 'a', write: true },
    comments: [],
    ...extra,
  });
  const comment = (id) => ({ id, author: { login: 'a', write: true }, body: 'c' });
  for (const externalIssues of [
    [item('ABC-1', { state: 'closed' })],
    [item('ABC-1', { labels: Array.from({ length: 101 }, (_, index) => `l${index}`) })],
    [item('ABC-1', { labels: ['x'.repeat(101)] })],
    [item('ABC-1', { comments: [comment({ nested: true })] })],
    [item('ABC-1'), item('abc-1')],
  ])
    assert.equal(
      (await run('epic-candidates', { cwd: root, target, permission, externalIssues })).error.code,
      'INVALID_PAYLOAD',
      JSON.stringify(externalIssues).slice(0, 80),
    );
  const fine = await ok('epic-candidates', {
    cwd: root,
    target,
    permission,
    goal: 'Ship it',
    externalIssues: [item('ABC-1', { comments: [comment(7), comment('c-2')] })],
  });
  assert.deepEqual([fine.newEpicSlug, fine.newEpicSlugTaken], ['ship-it', false]);
});

// Invariant: a bound epic's draft is its summary only, its slug is well formed and unique, and
// without goal-relevant items the run says so while the update still offers the removals.
test('a bound epic takes only a summary draft, a valid unique slug and reports no relevance', async (t) => {
  const epicBody = (slug) =>
    [`<!-- effective-flow-backlog-audit goal=${slug} -->`, '- [ ] #1', EPIC_END_MARKER].join('\n');
  const build = (epic, drafts, extraIssues = []) =>
    writeSetFixture(t, {
      issues: [issue(1), issue(2), issue(3)],
      extraIssues: [issue(40, { labels: [LABELS.epic] }), ...extraIssues],
      primary: {
        verdicts: [verdict('#1', 'drift'), verdict('#2', 'drift'), verdict('#3', 'drift')],
        path: [],
      },
      epic,
      inventoryExtra: { epic: { reference: '#40' } },
      drafts,
    });
  const existing = { mode: 'existing', reference: '#40' };
  const titled = await build(existing, { epic: { title: 'New title' } });
  assert.equal(titled.built.error.code, 'INVALID_PAYLOAD');
  const malformed = await build({ ...existing, slug: 'Bad Slug' }, {});
  assert.equal(malformed.built.error.code, 'INVALID_PAYLOAD');
  const taken = await build({ ...existing, slug: 'taken' }, {}, [
    issue(41, { labels: [LABELS.epic], body: epicBody('taken') }),
  ]);
  assert.equal(taken.built.error.code, 'DUPLICATE_EPIC');
  const summary = await build(existing, { epic: { summary: 'Status.' } });
  assert.equal(summary.built.ok, true, JSON.stringify(summary.built.error));
  assert.deepEqual(summary.built.data.notices, ['no-goal-relevant-items']);
  assert.ok(summary.built.data.entries.some(({ id }) => id === 'epic:update:#40'));
});

// Invariant: an epic's task-list lines are its members, so no drafted epic text may add one, and
// no draft may open an HTML comment the gate would not show.
test('drafted text cannot add epic members or hidden comments', async (t) => {
  const fixture = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: {
      verdicts: [
        verdict('#1', 'oversized'),
        verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
        verdict('#3', 'core'),
      ],
      path: ['#1', '#3'],
      splits: [{ item: '#1', outline: 'A and B.' }],
    },
  });
  const build = (drafts) =>
    run('write-set-build', {
      inventory: fixture.inventory,
      merged: fixture.merged,
      permission: fixture.permission,
      goal: 'Goal',
      epic: { mode: 'new' },
      reportFile: 'report.md',
      date: '2026-11-13',
      drafts,
    });
  for (const drafts of [
    { epic: { title: '- [ ] #99' } },
    { epic: { title: 'Goal', intro: 'Intro.\n\n- [ ] #99' } },
    { epic: { title: 'Goal', summary: '  * [x] #99 done' } },
    { epic: { title: 'Goal', intro: '+ [ ] ABC-1' } },
    { epic: { title: 'Goal', summary: 'Hidden <!-- - [ ] #99 -->' } },
    // A summary line the managed-section parser would re-read as a supporting reference, a plan
    // bullet or the untracked-plans count is refused, too.
    { epic: { title: 'Goal', summary: 'Status.\n- #99 matters' } },
    { epic: { title: 'Goal', summary: '- ABC-7' } },
    { epic: { title: 'Goal', summary: 'Plans:\n- `docs/plan/x.md`' } },
    { epic: { title: 'Goal', summary: '3 further open plans not tracked on the base branch.' } },
    { epic: { title: 'Goal', summary: '1 weiterer offener Plan ist nicht auf dem Basis-Branch.' } },
    { epic: { title: 'Goal' }, splits: [{ item: '#1', body: 'A <!-- hidden --> B' }] },
    { epic: { title: 'Goal' }, obsolete: [{ item: '#2', body: '<!--\nhidden\n-->' }] },
  ])
    assert.equal((await build(drafts)).error?.code, 'INVALID_PAYLOAD', JSON.stringify(drafts));
  // A summary that only mentions a reference or a plan in prose stays allowed.
  const prose = await build({
    epic: { title: 'Goal', summary: 'Track #99 and `docs/plan/x.md` first.\n- Next: ship it' },
  });
  assert.equal(prose.ok, true, JSON.stringify(prose.error));
  // A task list stays allowed in a split proposal, whose list is the proposed outline.
  const split = await build({
    epic: { title: 'Goal' },
    splits: [{ item: '#1', body: '- [ ] Part A\n- [ ] Part B' }],
  });
  assert.equal(split.ok, true, JSON.stringify(split.error));
});

// Invariant: the managed-section splice changes only the section's bytes, so CRLF line endings
// and trailing whitespace outside it survive, also when the section is appended.
test('the managed-section splice preserves line endings and trailing whitespace', () => {
  const section = `<!-- effective-flow-backlog-audit goal=g -->\n- [ ] #1\n${EPIC_END_MARKER}`;
  const old = `<!-- effective-flow-backlog-audit goal=g -->\r\n- [ ] #9\r\n${EPIC_END_MARKER}`;
  const body = `Top  \r\n\r\n${old}\r\nBottom \t`;
  assert.equal(
    spliceManagedSection(body, section),
    `Top  \r\n\r\n${section.replaceAll('\n', '\r\n')}\r\nBottom \t`,
  );
  assert.equal(spliceManagedSection('Plain text  ', section), `Plain text  \n\n${section}\n`);
  assert.equal(
    spliceManagedSection('Line\r\n', section),
    `Line\r\n\r\n${section.replaceAll('\n', '\r\n')}\r\n`,
  );
});

// Invariant: a narrowed run carries over what it did not assess: out-of-scope supporting
// references and, with plans out of scope, the untracked-plans count.
test('a narrowed run carries supporting references and the untracked-plans count over', async (t) => {
  const epicBody = [
    '<!-- effective-flow-backlog-audit goal=ship-the-portable-build -->',
    '### Minimal goal path',
    '',
    '- [ ] #1',
    '',
    '### Supporting',
    '',
    '- #7',
    '',
    '### Plans',
    '',
    '3 further open plans not tracked on the base branch.',
    EPIC_END_MARKER,
  ].join('\n');
  const fixture = await writeSetFixture(t, {
    issues: [issue(1, { labels: ['mobile'] }), issue(7)],
    extraIssues: [issue(40, { labels: [LABELS.epic], body: epicBody })],
    primary: { verdicts: [verdict('#1', 'core')], path: ['#1'] },
    epic: { mode: 'existing', reference: '#40' },
    inventoryExtra: { scope: { label: 'mobile', issuesOnly: true }, epic: { reference: '#40' } },
    drafts: {},
  });
  assert.equal(fixture.built.ok, true, JSON.stringify(fixture.built.error));
  const update = fixture.built.data.entries.find(({ id }) => id === 'epic:update:#40');
  assert.match(update.payload.section, /^- #7 — not assessed in this run$/m);
  assert.match(update.payload.section, /^3 further open plans not tracked on the base branch\.$/m);
  assert.deepEqual(fixture.inventory.epic.supporting, ['#7']);
  assert.equal(fixture.inventory.epic.otherPlans, 3);
  assert.ok(!JSON.stringify(fixture.inventory.epic).includes('note'));
});

// Invariant: an unexpected failure inside the apply loop still reports what was applied and
// what remains, so a rerun can offer only the missing steps.
test('an unexpected write failure still reports applied and remaining entries', async (t) => {
  const { root, fake, permission, built } = await writeSetFixture(t, {
    issues: [issue(1), issue(2), issue(3)],
    primary: corePrimary,
  });
  const exploding = async (operation, input, options) => {
    if (operation === 'issue-create') throw new TypeError('boom');
    return fake.tracker(operation, input, options);
  };
  const result = await ok(
    'write-set-apply',
    { cwd: root, target: FORGE, permission, writeSet: built.data, selected: selectAll(built.data) },
    { tracker: exploding },
  );
  assert.deepEqual(
    result.applied.map(({ id }) => id),
    [`label-create:${LABELS.epic}`],
  );
  assert.deepEqual([result.failed.id, result.failed.code], ['epic:create', 'INTERNAL_ERROR']);
  assert.deepEqual(
    result.remaining,
    built.data.entries.slice(2).map(({ id }) => id),
  );
});

function drive(argv, stdin, deps) {
  const out = [];
  const err = [];
  const state = { code: undefined };
  const reader = { setEncoding() {}, [Symbol.asyncIterator]: () => assert.fail('stdin read') };
  return runCli(argv, {
    stdin: stdin === undefined ? reader : Readable.from([stdin]),
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write: (chunk) => err.push(chunk) },
    setExitCode: (value) => {
      state.code = value;
    },
    deps,
  }).then((envelope) => ({ envelope, out, err, code: state.code }));
}

// Invariant: whatever fails, the CLI answers with exactly one JSON envelope line, a coded message on
// stderr and a non-zero exit, so a caller never mistakes a failure for a result.
test('the CLI fails closed with one envelope line and a distinguishing exit code', async () => {
  const cases = [
    ['invalid JSON', ['permission-prove'], '{not json', 'INVALID_PAYLOAD', 'permission-prove', 2],
    ['a JSON array', ['permission-prove'], '[]', 'INVALID_PAYLOAD', 'permission-prove', 2],
    ['an empty stdin', ['permission-prove'], '', 'INVALID_PAYLOAD', 'permission-prove', 2],
    [
      'unknown input key',
      ['permission-prove'],
      JSON.stringify({ cwd: '/', target: { kind: 'local' }, extra: 1 }),
      'INVALID_PAYLOAD',
      'permission-prove',
      2,
    ],
    [
      'a malformed permission',
      ['write-set-apply'],
      JSON.stringify({
        cwd: '/',
        target: { kind: 'local' },
        permission: {},
        writeSet: {},
        selected: [],
      }),
      'INVALID_PAYLOAD',
      'write-set-apply',
      2,
    ],
  ];
  for (const [name, argv, stdin, code, operation, exit] of cases) {
    const { envelope, out, err, code: exitCode } = await drive(argv, stdin, { tracker: noTracker });
    assert.equal(envelope.ok, false, name);
    assert.deepEqual(
      [envelope.error.code, envelope.operation, exitCode],
      [code, operation, exit],
      name,
    );
    assert.equal(out.length, 1, name);
    assert.ok(out[0].endsWith('\n'), name);
    assert.deepEqual(JSON.parse(out[0]), envelope, name);
    assert.equal(err.join(''), `${code}: ${envelope.error.message}\n`, name);
  }
  // Unknown operations and stray arguments are refused before stdin is read.
  for (const argv of [['issue-close'], ['permission-prove', 'extra'], [], ['--help']]) {
    const { envelope, out, code } = await drive(argv, undefined, { tracker: noTracker });
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD', argv.join(' '));
    assert.equal(code, 2);
    assert.equal(out.length, 1);
  }
  // An unreachable tracker is a runtime failure, not a refused input.
  const unreachable = await drive(
    ['permission-prove'],
    JSON.stringify({ cwd: '/', target: { kind: 'forge' } }),
    {
      tracker: forge({ fail: { probe: 'CLI_MISSING' } }).tracker,
    },
  );
  assert.deepEqual([unreachable.envelope.error.code, unreachable.code], ['TRACKER_UNAVAILABLE', 1]);
  // A success sets no exit code and writes nothing to stderr.
  const success = await drive(
    ['permission-prove'],
    JSON.stringify({ cwd: '/', target: { kind: 'local' } }),
    { tracker: noTracker },
  );
  assert.deepEqual([success.envelope.ok, success.code, success.err], [true, undefined, []]);
  assert.equal(exitCodeFor(success.envelope), 0);
});

// Invariant: stdin is bounded by a running byte count across chunks, so an oversized input fails
// closed as INVALID_PAYLOAD before any operation runs.
test('the CLI refuses stdin beyond its bound, counted across chunks', async () => {
  const chunk = 'x'.repeat(1024 * 1024);
  const chunks = Array.from({ length: MAX_STDIN_BYTES / chunk.length + 1 }, () => chunk);
  const out = [];
  const envelope = await runCli(['permission-prove'], {
    stdin: Readable.from(chunks),
    stdout: { write: (line) => out.push(line) },
    stderr: { write() {} },
    setExitCode() {},
    deps: { tracker: noTracker },
  });
  assert.deepEqual([envelope.ok, envelope.error.code], [false, 'INVALID_PAYLOAD']);
  assert.match(envelope.error.message, /input bound/);
  assert.equal(out.length, 1);
});

test('the CLI script exits non-zero with a single envelope line for a bad operation or bad JSON', () => {
  const script = fileURLToPath(new URL('../src/scripts/backlog-audit.mjs', import.meta.url));
  for (const [args, input] of [
    [['bogus'], ''],
    [['permission-prove'], '{'],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    const envelope = JSON.parse(lines[0]);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
    assert.match(result.stderr, /^INVALID_PAYLOAD: /);
  }
});

// Invariant: an external run trusts the markers its own connection login wrote even where the
// tool states no permission for that author, and without that login it trusts only stated write.
test('an external run trusts markers from its own connection login only when the proof names it', async (t) => {
  const root = repository(t);
  const target = { kind: 'external', externalTool: 'linear' };
  const actions = Object.fromEntries(WRITE_ACTIONS.map((action) => [action, true]));
  const attestation = { connection: 'mcp:linear', readProven: true, writeProven: true, actions };
  const prove = (extra = {}) =>
    run(
      'permission-prove',
      { cwd: root, target, external: { ...attestation, ...extra } },
      {
        tracker: noTracker,
      },
    );
  const withLogin = (await prove({ login: ' Runner ' })).data;
  assert.equal(withLogin.login, 'runner');
  const withoutLogin = (await prove()).data;
  assert.equal(withoutLogin.login, null);
  assert.equal((await prove({ login: 'a\nb' })).error.code, 'INVALID_PAYLOAD');
  const own = { login: 'Runner', write: null };
  const item = (reference, extra = {}) => ({
    reference,
    title: 't',
    body: 'SECRET',
    labels: [],
    author: { login: 'a', write: true },
    comments: [],
    ...extra,
  });
  const externalIssues = [
    item('ABC-1', { comments: [{ id: 'c1', body: splitMarkerFor('SECRET'), author: own }] }),
    item('ABC-2', { comments: [{ id: 'c2', body: `${OBSOLETE_MARKER}\nObsolete.`, author: own }] }),
  ];
  const markers = async (permission) => {
    const data = await ok(
      'inventory-build',
      {
        cwd: root,
        runtimeStateRoot: root,
        target,
        permission,
        planDir: 'docs/plan',
        externalIssues,
      },
      { tracker: noTracker },
    );
    await ok('snapshot-cleanup', { runtimeStateRoot: root, runId: data.runId });
    const items = new Map(data.items.map((entry) => [entry.id, entry]));
    return [items.get('ABC-1').markers.split !== null, items.get('ABC-2').markers.obsolete];
  };
  assert.deepEqual(await markers(withLogin), [true, true]);
  assert.deepEqual(await markers(withoutLogin), [false, false]);
});

// Invariant: external-call-check refuses an entry that is unavailable or whose dependency was not
// confirmed applied, and trusts the run's own login in the re-read comments.
test('external-call-check refuses unavailable and unconfirmed dependent calls', async (t) => {
  const root = repository(t);
  const target = { kind: 'external', externalTool: 'linear' };
  const actions = Object.fromEntries(WRITE_ACTIONS.map((action) => [action, true]));
  const external = { connection: 'mcp:linear', readProven: true, writeProven: true, actions };
  const permission = await ok(
    'permission-prove',
    { cwd: root, target, external: { ...external, login: 'runner' } },
    { tracker: noTracker },
  );
  const strangerProof = await ok(
    'permission-prove',
    { cwd: root, target, external },
    { tracker: noTracker },
  );
  const own = { login: 'runner', write: null };
  const item = (reference, extra = {}) => ({
    reference,
    title: 't',
    body: `SECRET ${reference}`,
    labels: [],
    author: { login: 'a', write: true },
    comments: [],
    ...extra,
  });
  const data = await ok(
    'inventory-build',
    {
      cwd: root,
      runtimeStateRoot: root,
      target,
      permission,
      planDir: 'docs/plan',
      externalIssues: [
        item('ABC-1'),
        item('ABC-2', {
          comments: [{ id: 'c2', body: `${OBSOLETE_MARKER}\nObsolete.`, author: own }],
        }),
        item('ABC-3'),
      ],
    },
    { tracker: noTracker },
  );
  const merged = await ok('verdicts-validate', {
    cwd: root,
    inventory: data,
    primary: {
      verdicts: [
        verdict('ABC-1', 'oversized'),
        verdict('ABC-2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
        verdict('ABC-3', 'core'),
      ],
      path: ['ABC-1', 'ABC-3'],
      splits: [{ item: 'ABC-1', outline: 'A and B.' }],
    },
  });
  const set = await ok('write-set-build', {
    inventory: data,
    merged,
    permission,
    goal: 'Goal',
    epic: { mode: 'new' },
    reportFile: 'report.md',
    date: '2026-11-13',
    drafts: { epic: { title: 'Goal' }, splits: [{ item: 'ABC-1', body: 'Split.' }] },
  });
  await ok('snapshot-cleanup', { runtimeStateRoot: root, runId: data.runId });
  const check = (id, current, extra = {}, proof = permission) =>
    run('external-call-check', { permission: proof, writeSet: set, id, current, ...extra });
  const current = (comments = []) => ({ state: 'open', labels: [], body: 'SECRET', comments });
  // Without a native container the split is unavailable, and the check refuses it.
  const split = set.entries.find(({ id }) => id === 'split-comment:ABC-1');
  assert.equal(split.status, 'unavailable');
  const refused = await check(split.id, current());
  assert.deepEqual([refused.data.proceed, refused.data.reason], [false, 'unavailable']);
  // The epic label waits for its create to be confirmed applied.
  const label = set.entries.find(({ id }) => id === 'epic:label');
  assert.equal(label.dependsOn, 'epic:create');
  const early = await check(label.id, current());
  assert.deepEqual([early.data.proceed, early.data.reason], [false, 'dependency-not-applied']);
  const other = await check(label.id, current(), { appliedIds: ['label-create:x'] });
  assert.equal(other.data.reason, 'dependency-not-applied');
  const confirmed = await check(label.id, current(), { appliedIds: ['epic:create'] });
  assert.equal(confirmed.data.proceed, true, JSON.stringify(confirmed.error));
  for (const appliedIds of ['epic:create', [1]])
    assert.equal((await check(label.id, current(), { appliedIds })).error.code, 'INVALID_PAYLOAD');
  // The run's own obsolete marker, re-read without a stated permission, counts for its login only.
  const obsoleteLabel = 'obsolete-label:ABC-2';
  const marked = {
    ...current([{ author: own, body: `${OBSOLETE_MARKER}\nObsolete.` }]),
    body: 'SECRET ABC-2',
  };
  const trusted = await check(obsoleteLabel, marked);
  assert.equal(trusted.data.proceed, true, JSON.stringify(trusted.error));
  const untrusted = await check(obsoleteLabel, marked, {}, strangerProof);
  assert.deepEqual([untrusted.data.proceed, untrusted.data.reason], [false, 'marker-missing']);
  // The label repair is bound to the assessed body: a rewritten body is never labeled.
  const rewritten = await check(obsoleteLabel, { ...marked, body: 'Rewritten.' });
  assert.deepEqual([rewritten.data.proceed, rewritten.data.reason], [false, 'target-changed']);
});

// Invariant: the apply re-read needs a complete comment listing; anything else stops the write.
test('an apply re-read without a comment array fails before any comment is written', async (t) => {
  const fixture = await writeSetFixture(t, {
    issues: [issue(1), issue(2)],
    primary: {
      verdicts: [
        verdict('#1', 'core'),
        verdict('#2', 'obsolete-architecture', { citations: ['docs/adr/runtime.md'] }),
      ],
      path: ['#1'],
    },
    drafts: { epic: { title: 'Goal' }, obsolete: [{ item: '#2', body: 'Obsolete.' }] },
  });
  assert.equal(fixture.built.ok, true, JSON.stringify(fixture.built.error));
  const broken = async (operation, input, options) =>
    operation === 'issue-comments-read'
      ? { ok: true, data: { result: null } }
      : fixture.fake.tracker(operation, input, options);
  const applied = await ok(
    'write-set-apply',
    {
      cwd: fixture.root,
      target: FORGE,
      permission: fixture.permission,
      writeSet: fixture.built.data,
      selected: selectAll(fixture.built.data, ({ id }) => !id.startsWith('epic:')),
    },
    { tracker: broken },
  );
  assert.deepEqual(
    [applied.failed?.id, applied.failed?.code],
    ['obsolete-comment:#2', 'FORGE_READ_FAILED'],
  );
  assert.ok(applied.remaining.includes('obsolete-label:#2'));
  assert.equal(
    fixture.fake.mutations().filter(({ operation }) => operation === 'issue-comment').length,
    0,
  );
});

// Invariant: a proof binds host, provider and slug; only the GitHub slug compares case-insensitively.
test('the repository check compares host, provider and slug', async (t) => {
  const root = repository(t);
  const fake = forge({ issues: [issue(1)] });
  const permission = await proven(root, fake);
  const resolving = (data) => async (operation, input, options) =>
    operation === 'repository-resolve'
      ? { ok: true, data }
      : fake.tracker(operation, input, options);
  const listed = (data) =>
    run('epic-candidates', { cwd: root, target: FORGE, permission }, { tracker: resolving(data) });
  const github = { host: 'github.com', owner: 'example', repository: 'flow', provider: 'github' };
  const sameCase = await listed({ ...github, owner: 'Example', repository: 'FLOW' });
  assert.equal(sameCase.ok, true, JSON.stringify(sameCase.error));
  assert.equal((await listed({ ...github, host: 'GitHub.com' })).ok, true);
  for (const data of [
    { ...github, host: 'git.example.org' },
    { ...github, provider: 'forgejo' },
    { ...github, owner: 'other' },
  ])
    assert.equal((await listed(data)).error?.code, 'REPOSITORY_MISMATCH', JSON.stringify(data));
});
