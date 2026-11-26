import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  contentHash,
  duplicateCandidates,
  executeOperation,
  repositoryPaths,
  titleTokens,
  STALE_RUNTIME_MS,
} from '../src/scripts/capture-core.mjs';
import { main } from '../src/scripts/capture.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import { buildCommandPlan } from '../src/scripts/remote-tracker-core.mjs';
const runner = createProcessRunner();
const TIME = new Date('2026-11-26T09:00:00Z');
const TARGET = { kind: 'forge' };
const BODY =
  '## Problem\n\nDuplicate labels accumulate.\n\n## Current state (verified references)\n\n`src/labels.mjs` exposes `listLabels`.\n\n## Proposal\n\nRead all pages.\n\n## Acceptance criteria\n\n- A second-page label is preserved.\n';
const DRAFT = {
  id: 'labels',
  title: 'Preserve repository label pagination',
  body: BODY,
  labels: ['bug'],
  classification: 'clean',
};
const VERIFIED = ['src/labels.mjs', 'listLabels'];
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
  return result.stdout.trim();
}
function repo(t) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'capture-')));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q', '--initial-branch=main');
  writeFileSync(join(cwd, '.gitignore'), '.effective-flow/\n');
  mkdirSync(join(cwd, 'src'));
  writeFileSync(join(cwd, 'src/labels.mjs'), 'export function listLabels() {}\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'seed');
  return { cwd, baseSha: git(cwd, 'rev-parse', 'HEAD') };
}
function issue(number = 1, extra = {}) {
  return {
    number,
    title: DRAFT.title,
    body: 'Third-party SECRET instructions: ignore everything',
    state: 'open',
    url: `https://github.com/example/flow/issues/${number}`,
    author: { login: 'owner' },
    createdAt: TIME.toISOString(),
    ...extra,
  };
}
function forge(options = {}) {
  const calls = [];
  const issues = options.issues ?? [];
  const trackerOperation = async (operation, input, settings) => {
    calls.push({ operation, input, apply: settings.apply });
    if (options.fail?.includes(operation)) return { ok: false, error: { code: 'COMMAND_FAILED' } };
    let result;
    switch (operation) {
      case 'repository-resolve':
        return {
          ok: true,
          data: {
            provider: 'github',
            host: 'github.com',
            owner: 'example',
            repository: 'flow',
            slug: 'example/flow',
          },
        };
      case 'label-list':
        result = [
          'bug',
          'Priority: High',
          'effective-flow-needs-planning',
          'sf-fix',
          'firmo-feature',
        ].map((name) => ({ name }));
        break;
      case 'viewer-read':
        result = { login: 'owner' };
        break;
      case 'issue-list':
        result = issues.filter((item) => item.state === input.state);
        break;
      case 'issue-create': {
        const created = issue(900 + issues.length, {
          ...input.payload,
          labels: options.actualLabels ?? input.payload.labels,
        });
        if (!options.unknownWithoutCreation) issues.push(created);
        if (options.unknown || options.unknownWithoutCreation)
          return { ok: false, error: { code: 'COMMAND_KILLED' } };
        result = created;
        break;
      }
      case 'issue-comment':
        result = { id: 42 };
        break;
      case 'issue-read':
        result = issues.find((item) => item.number === input.number);
        break;
      default:
        throw new Error(`unexpected tracker operation: ${operation}`);
    }
    return { ok: true, data: { result } };
  };
  return { calls, trackerOperation };
}
async function fixture(t, options = {}) {
  const roots = repo(t);
  const transport = forge(options);
  const deps = {
    runner,
    now: () => TIME,
    randomBytes: () => Buffer.from('aabbccdd', 'hex'),
    trackerOperation: transport.trackerOperation,
  };
  const call = (operation, input) => executeOperation(operation, input, deps);
  const context = await call('context-read', {
    cwd: roots.cwd,
    runtimeStateRoot: roots.cwd,
    target: TARGET,
  });
  assert.equal(context.ok, true, JSON.stringify(context));
  const build = (draft = DRAFT, extra = {}) =>
    call('build', {
      contextFile: context.data.contextFile,
      draft,
      baseSha: roots.baseSha,
      language: 'en',
      verified: VERIFIED,
      ...extra,
    });
  const built = await build();
  assert.equal(built.ok, true, JSON.stringify(built));
  const select = (entry = built.data.previews[0], extra = {}) => ({
    id: entry.id,
    hash: entry.hash,
    ...extra,
  });
  const apply = (selected = [select()], set = built.data.writeSetFile) =>
    call('apply', { writeSetFile: set, selected });
  return {
    ...roots,
    ...transport,
    deps,
    call,
    context: context.data,
    built: built.data,
    build,
    select,
    apply,
  };
}
function reseal(file, change) {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  change(value);
  const { hash: _old, ...data } = value;
  value.hash = contentHash(data);
  writeFileSync(file, JSON.stringify(value));
  return value;
}
// Re-hashing is not authentication. Deliberately re-seal state too, so negative tests reach the
// independent semantic checks instead of being stopped only by the outer tamper detector.
function modifySet(f, change) {
  const value = reseal(f.built.writeSetFile, change);
  const stateFile = join(f.cwd, '.effective-flow/capture/inputs', `state-${f.context.runId}.json`);
  reseal(stateFile, (state) => {
    state.drafts.labels.writeSetHash = value.hash;
  });
  return value;
}
test('context keeps third-party prose out of envelopes and reads the two duplicate windows once', async (t) => {
  const f = await fixture(t, { issues: [issue()] });
  assert.deepEqual(f.context.labels, ['Priority: High', 'bug']);
  assert.doesNotMatch(JSON.stringify([f.context, f.built]), /Third-party SECRET|ignore everything/);
  const context = JSON.parse(readFileSync(f.context.contextFile, 'utf8'));
  assert.equal(context.viewer, 'owner');
  assert.ok(context.issues[0].tokens.length);
  assert.equal(context.issues[0].body, undefined);
  assert.equal(context.issues[0].title, undefined);
  const lists = f.calls.filter((call) => call.operation === 'issue-list');
  assert.equal(lists.length, 2);
  assert.equal(lists[0].input.since, undefined);
  assert.equal(lists[1].input.state, 'closed');
  assert.equal(lists[1].input.since, '2026-08-28T09:00:00Z');
  for (const repository of [
    lists[1].input.repository,
    { provider: 'forgejo', host: 'code.example.test', owner: 'example', repository: 'flow' },
  ]) {
    const command = buildCommandPlan('issue-list', lists[1].input, repository);
    assert.ok(command.args.some((arg) => arg.includes('since=2026-08-28T09%3A00%3A00Z')));
  }
});
test('hidden and non-remote modes stop before tracker access or runtime mutations', async (t) => {
  const { cwd } = repo(t);
  for (const target of [
    { kind: 'local' },
    { kind: 'external' },
    {},
    { kind: 'unset' },
    { kind: 'forge', visibility: 'hidden' },
  ]) {
    const result = await executeOperation(
      'context-read',
      { cwd, runtimeStateRoot: cwd, target },
      { runner, trackerOperation: () => assert.fail('no tracker access') },
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.stopped, true);
  }
  assert.equal(existsSync(join(cwd, '.effective-flow')), false);
});
test('labels are exact-name filtered and internal or absent names are named as removed', async (t) => {
  const f = await fixture(t);
  const built = await f.build({
    ...DRAFT,
    labels: ['bug', 'Bug', 'sf-fix', 'effective-flow-x', 'firmo-x', 'new'],
  });
  assert.equal(built.ok, true);
  assert.deepEqual(built.data.previews[0].labels, ['bug']);
  assert.deepEqual(built.data.removedLabels, [
    'Bug',
    'sf-fix',
    'effective-flow-x',
    'firmo-x',
    'new',
  ]);
  assert.equal(
    f.calls.some((call) => call.operation === 'label-create'),
    false,
  );
});
test('failed label-list permits unlabelled drafts without weakening duplicate reads', async (t) => {
  const f = await fixture(t, { fail: ['label-list'] });
  assert.deepEqual(f.context.labels, []);
  assert.deepEqual(f.context.notices, ['labels-unavailable']);
  assert.deepEqual(f.built.removedLabels, ['bug']);
});
test('duplicate matching covers hits, misses, closed candidates, path threshold and hub exclusion', () => {
  const normalized = (item) => ({
    ...item,
    tokens: titleTokens(item.title),
    paths: repositoryPaths(item.body),
  });
  assert.deepEqual(titleTokens('The die A label, Label PAGINATION!'), ['label', 'pagination']);
  assert.deepEqual(
    repositoryPaths('README.md src/core.mjs https://host/team/repo /tmp/notes.txt'),
    ['src/core.mjs'],
  );
  const issues = [
    normalized(issue(1)),
    normalized(issue(3, { title: 'Unrelated rendering theme' })),
    normalized(issue(2, { state: 'closed' })),
  ];
  assert.deepEqual(
    duplicateCandidates(DRAFT, issues, VERIFIED).map((item) => item.number),
    [2, 1],
  );
  const path = { title: 'Label pagination failure', body: 'src/core.mjs' };
  const candidate = normalized(issue(4, { title: 'Label handling lost', body: 'src/core.mjs' }));
  assert.equal(duplicateCandidates(path, [candidate], ['src/core.mjs']).length, 0); // score .2
  candidate.tokens = titleTokens('Label handling'); // 1/4 = .25: the verified path replaces the two-token requirement.
  assert.equal(duplicateCandidates(path, [candidate], ['src/core.mjs']).length, 1);
  assert.equal(
    duplicateCandidates(
      { ...path, body: 'README.md' },
      [{ ...candidate, paths: ['README.md'] }],
      ['README.md'],
    ).length,
    0,
  );
  assert.equal(
    duplicateCandidates(
      DRAFT,
      Array.from({ length: 5 }, (_, i) => normalized(issue(i + 1))),
      VERIFIED,
    ).length,
    3,
  );
});
test('apply writes the stored bytes, reads back actual labels and never exposes the body', async (t) => {
  const f = await fixture(t, { actualLabels: [] });
  const applied = await f.apply();
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.data.status, 'written');
  assert.deepEqual(applied.data.result.labels, []);
  assert.equal(applied.data.labelsDiffer, true);
  assert.equal(applied.data.result.body, undefined);
  const write = f.calls.find((call) => call.operation === 'issue-create');
  assert.equal(write.apply, true);
  assert.equal(write.input.payload.body, BODY);
  const second = await f.apply();
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'ALREADY_APPLIED');
  assert.equal(f.calls.filter((call) => call.operation === 'issue-create').length, 1);
});
test('candidate comments use the same checked body and no title', async (t) => {
  const f = await fixture(t, { issues: [issue()] });
  const entry = f.built.previews.find((entry) => entry.action === 'comment');
  const applied = await f.apply([f.select(entry)]);
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.deepEqual(f.calls.find((call) => call.operation === 'issue-comment').input.payload, {
    body: BODY,
  });
});
test('an edited entry without its hash and a stale selection hash are rejected before writes', async (t) => {
  const f = await fixture(t);
  const value = JSON.parse(readFileSync(f.built.writeSetFile));
  value.entries[0].body += '\nChanged';
  writeFileSync(f.built.writeSetFile, JSON.stringify(value));
  assert.equal((await f.apply()).error.code, 'TAMPERED_INPUT');
  assert.equal(
    f.calls.some((call) => call.apply),
    false,
  );
});
test('a stale selection hash does not authorize a fresh entry', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.apply([f.select(undefined, { hash: '0'.repeat(64) })])).error.code,
    'TAMPERED_INPUT',
  );
});
test('the apply-time draft check rejects a formerly valid file deleted from the base proof', async (t) => {
  const f = await fixture(t);
  modifySet(f, (set) => {
    set.draft.body = BODY.replace('src/labels.mjs', 'src/missing.mjs');
    set.verified = ['src/missing.mjs', 'listLabels'];
  });
  const result = await f.apply();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'DRAFT_REJECTED');
  assert.equal(
    f.calls.some((call) => call.apply),
    false,
  );
});
for (const [name, mutation] of [
  [
    'foreign label',
    (set) => {
      set.entries[0].labels = ['foreign'];
    },
  ],
  [
    'internal label',
    (set) => {
      set.entries[0].labels = ['sf-fix'];
    },
  ],
  [
    'foreign comment target',
    (set) => {
      set.entries[0].action = 'comment';
      set.entries[0].target = 999;
    },
  ],
  [
    'unknown action',
    (set) => {
      set.entries[0].action = 'close';
    },
  ],
])
  test(`apply rejects a rehashed ${name} independently of hash integrity`, async (t) => {
    const f = await fixture(t);
    modifySet(f, (set) => {
      mutation(set);
      const { hash: _old, ...data } = set.entries[0];
      set.entries[0].hash = contentHash(data);
    });
    const set = JSON.parse(readFileSync(f.built.writeSetFile));
    const result = await f.apply([f.select(set.entries[0])]);
    assert.equal(result.ok, false);
    assert.equal(
      f.calls.some((call) => call.apply),
      false,
    );
  });
test('two selected actions for one draft are rejected', async (t) => {
  const f = await fixture(t, { issues: [issue()] });
  assert.equal(
    (await f.apply(f.built.previews.map((entry) => f.select(entry)))).error.code,
    'INVALID_PAYLOAD',
  );
});
test('revisions supersede old entries, keep the base and allow only one revision', async (t) => {
  const f = await fixture(t);
  const revised = await f.build({ ...DRAFT, title: 'Preserve label pagination safely' });
  assert.equal(revised.ok, true);
  assert.equal((await f.apply()).error.code, 'SUPERSEDED_DRAFT');
  assert.equal((await f.build()).error.code, 'DRAFT_REJECTED');
  assert.equal(f.calls.filter((call) => call.operation === 'issue-list').length, 2);
});
test('missing or uncertain security is flagged and cannot be downgraded on revision', async (t) => {
  const f = await fixture(t);
  const revised = await f.build({ ...DRAFT, classification: undefined });
  assert.equal(revised.data.previews[0].classification, 'flagged');
  assert.equal(
    (await f.apply([f.select(revised.data.previews[0])], revised.data.writeSetFile)).error.code,
    'DISCLOSURE_REQUIRED',
  );
});
test('a flagged draft cannot become clean on its revision', async (t) => {
  const f = await fixture(t);
  // Use another id so its first revision is still available.
  assert.equal((await f.build({ ...DRAFT, id: 'security', classification: 'flagged' })).ok, true);
  assert.equal(
    (await f.build({ ...DRAFT, id: 'security', classification: 'clean' })).error.code,
    'DRAFT_REJECTED',
  );
});
test('disclosure is required on flagged entries and forbidden on clean ones', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.apply([f.select(undefined, { disclosure: 'confirmed' })])).error.code,
    'INVALID_PAYLOAD',
  );
  const flagged = await f.build({ ...DRAFT, classification: 'flagged' });
  const entry = flagged.data.previews[0];
  assert.equal(
    (await f.apply([f.select(entry)], flagged.data.writeSetFile)).error.code,
    'DISCLOSURE_REQUIRED',
  );
  assert.equal(
    (await f.apply([f.select(entry, { disclosure: 'confirmed' })], flagged.data.writeSetFile)).ok,
    true,
  );
});
test('a /tmp path needs an acknowledgement tied to the selected entry hash', async (t) => {
  const f = await fixture(t);
  const built = await f.build({
    ...DRAFT,
    body: `${BODY}\n## Open questions\n\nInspect /tmp/cache as an unverified hypothesis.\n`,
  });
  assert.equal(built.ok, true);
  const entry = built.data.previews[0];
  assert.equal(
    (await f.apply([f.select(entry)], built.data.writeSetFile)).error.code,
    'ACKNOWLEDGEMENT_REQUIRED',
  );
  assert.equal(
    (
      await f.apply(
        [f.select(entry, { acknowledged: entry.warnings.map((w) => w.id) })],
        built.data.writeSetFile,
      )
    ).ok,
    true,
  );
});
for (const [name, change] of [
  [
    'missing Problem',
    (draft) => {
      draft.body = '## Proposal\n\nDo work.';
    },
  ],
  [
    'missing Proposal',
    (draft) => {
      draft.body = '## Problem\n\nBroken.';
    },
  ],
  [
    'HTML comment',
    (draft) => {
      draft.body += '\n<!-- hidden -->';
    },
  ],
  [
    'unverified backtick',
    (draft) => {
      draft.body = draft.body.replace('listLabels', 'missingSymbol');
    },
  ],
  [
    'absent base path',
    (draft) => {
      draft.body = draft.body.replace('src/labels.mjs', 'src/missing.mjs');
    },
  ],
  [
    'ChatGPT conversation',
    (draft) => {
      draft.body += '\nhttps://chatgpt.com/c/session';
    },
  ],
  [
    'shared ChatGPT conversation',
    (draft) => {
      draft.body += '\nhttps://chat.openai.com/share/session';
    },
  ],
  [
    'Claude Code session',
    (draft) => {
      draft.body += '\nhttps://claude.ai/code/session';
    },
  ],
  [
    'attribution',
    (draft) => {
      draft.body += '\nGenerated with Codex';
    },
  ],
  [
    'provider token',
    (draft) => {
      draft.body += `\nghp_${'Q1'.repeat(20)}`;
    },
  ],
  [
    'private key',
    (draft) => {
      draft.body += '\n-----BEGIN RSA PRIVATE KEY-----';
    },
  ],
  [
    'JWT',
    (draft) => {
      draft.body += `\neyJ${'A'.repeat(10)}.${'B'.repeat(12)}.${'C'.repeat(12)}`;
    },
  ],
  [
    'authorization',
    (draft) => {
      draft.body += '\nAuthorization: Bearer ABC123secretvalue';
    },
  ],
  [
    'URL credential',
    (draft) => {
      draft.body += '\nhttps://login:ABC123secretvalue@example.test';
    },
  ],
])
  test(`the draft check rejects ${name}`, async (t) => {
    const f = await fixture(t);
    const draft = structuredClone(DRAFT);
    change(draft);
    const result = await f.build(draft, { verified: [...VERIFIED, 'src/missing.mjs'] });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.error.code, 'DRAFT_REJECTED');
  });
test('repository paths, system paths and repository issue URLs are publishable', async (t) => {
  const f = await fixture(t);
  const result = await f.build({
    ...DRAFT,
    body: `${BODY}\n## Open questions\n\nInspect .effective-flow/review/, /usr/bin/env and https://github.com/example/flow/issues/12.\n`,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.data.previews[0].warnings, []);
});
for (const options of [
  { unknown: true },
  { unknownWithoutCreation: true },
  { unknown: true, fail: ['viewer-read'] },
])
  test(`unknown outcomes recover only the current viewer and never retry (${JSON.stringify(options)})`, async (t) => {
    const f = await fixture(t, options);
    const result = await f.apply();
    assert.equal(result.ok, true);
    assert.equal(result.data.status, options.unknown && !options.fail ? 'recovered' : 'unknown');
    assert.equal((await f.apply()).error.code, 'ALREADY_APPLIED');
    assert.equal(f.calls.filter((call) => call.operation === 'issue-create').length, 1);
  });
test('unknown create recovery never adopts a same-title issue from another author', async (t) => {
  const f = await fixture(t, {
    unknownWithoutCreation: true,
    issues: [issue(5, { author: { login: 'stranger' } })],
  });
  const result = await f.apply();
  assert.equal(result.data.status, 'unknown');
  assert.equal(result.data.reason, 'no-match');
});
test('multiple recovery matches stop as ambiguous without exposing titles or bodies', async (t) => {
  const f = await fixture(t, { unknownWithoutCreation: true, issues: [issue(4), issue(5)] });
  const result = await f.apply();
  assert.equal(result.data.reason, 'ambiguous');
  assert.equal(result.data.result, undefined);
});
test('run-remove removes context, write set, ledger and long input on completion', async (t) => {
  const f = await fixture(t);
  await f.apply();
  const directory = join(f.cwd, '.effective-flow/capture/inputs');
  writeFileSync(join(directory, `input-${f.context.runId}-build-1.json`), '{}');
  const removed = await f.call('run-remove', { runtimeStateRoot: f.cwd, runId: f.context.runId });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.deepEqual(readdirSync(directory), []);
});
test('cleanup removes interrupted exclusive writes without removing another run’s drafts', async (t) => {
  const f = await fixture(t);
  const directory = join(f.cwd, '.effective-flow/capture/inputs');
  const own = join(directory, `.capture-${f.context.runId}-0123456789abcdef.tmp`);
  const orphan = join(directory, '.capture-2026-11-24-11223344-0123456789abcdef.tmp');
  const concurrent = join(directory, '.capture-2026-11-26-55667788-0123456789abcdef.tmp');
  for (const file of [own, orphan, concurrent]) writeFileSync(file, BODY);
  const old = new Date(TIME.getTime() - STALE_RUNTIME_MS - 1000);
  utimesSync(orphan, old, old);
  utimesSync(concurrent, TIME, TIME);

  const removed = await f.call('run-remove', { runtimeStateRoot: f.cwd, runId: f.context.runId });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.ok(removed.data.removed.includes(own));
  assert.equal(existsSync(own), false);
  assert.equal(existsSync(orphan), true);
  assert.equal(existsSync(concurrent), true);

  const swept = await f.call('run-remove', { runtimeStateRoot: f.cwd });
  assert.equal(swept.ok, true, JSON.stringify(swept));
  assert.deepEqual(swept.data.removed, [orphan]);
  assert.equal(existsSync(orphan), false);
  assert.equal(existsSync(concurrent), true);
});
test('day-old sweep removes only stale runs and spares a concurrent or recently active run', async (t) => {
  const f = await fixture(t);
  const directory = join(f.cwd, '.effective-flow/capture/inputs');
  const old = new Date(TIME.getTime() - STALE_RUNTIME_MS - 1000);
  for (const name of readdirSync(directory)) utimesSync(join(directory, name), old, old);
  const lock = join(directory, `lock-${f.context.runId}.json`);
  writeFileSync(lock, '{}');
  utimesSync(lock, old, old);
  assert.deepEqual((await f.call('run-remove', { runtimeStateRoot: f.cwd })).data.removed, []);
  rmSync(lock);
  const removed = await f.call('run-remove', { runtimeStateRoot: f.cwd });
  assert.ok(removed.data.removed.length >= 3);
});
test('guarded long inputs are consumed once and helper outputs cannot be used as inputs', async (t) => {
  const f = await fixture(t);
  const file = join(
    f.cwd,
    '.effective-flow/capture/inputs',
    `input-${f.context.runId}-build-1.json`,
  );
  writeFileSync(
    file,
    JSON.stringify({
      contextFile: f.context.contextFile,
      draft: { ...DRAFT, id: 'input' },
      baseSha: f.baseSha,
      verified: VERIFIED,
      language: 'en',
    }),
  );
  assert.equal((await f.call('build', { inputFile: file })).ok, true);
  assert.equal(existsSync(file), false);
  assert.equal((await f.call('build', { inputFile: f.context.contextFile })).ok, false);
  assert.equal(existsSync(f.context.contextFile), true);
});
test('runtime symlinks are refused before tracker access', async (t) => {
  const { cwd } = repo(t);
  mkdirSync(join(cwd, '.effective-flow'));
  symlinkSync(cwd, join(cwd, '.effective-flow/capture'));
  const result = await executeOperation(
    'context-read',
    { cwd, runtimeStateRoot: cwd, target: TARGET },
    { runner, trackerOperation: () => assert.fail('no forge access') },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'UNSAFE_RUNTIME_STATE');
});
test('thin CLI rejects unknown operations before consuming stdin', async () => {
  const output = [];
  let exit;
  const result = await main(['--help'], {
    stdout: { write: (value) => output.push(value) },
    stderr: { write() {} },
    setExitCode: (value) => {
      exit = value;
    },
    stdin: {
      [Symbol.asyncIterator]() {
        assert.fail('must not read');
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(exit, 2);
  assert.equal(output.length, 1);
});

test('a pending apply stamp blocks a retry after process loss', async (t) => {
  const f = await fixture(t);
  const ledger = join(
    f.cwd,
    '.effective-flow/capture/inputs',
    `apply-${f.context.runId}-labels.json`,
  );
  writeFileSync(ledger, JSON.stringify({ status: 'pending' }));
  assert.equal((await f.apply()).error.code, 'ALREADY_APPLIED');
  assert.equal(
    f.calls.some((call) => call.apply),
    false,
  );
});

test('day-old crashed operation locks do not retain draft text indefinitely', async (t) => {
  const f = await fixture(t);
  const directory = join(f.cwd, '.effective-flow/capture/inputs');
  const lock = join(directory, `lock-${f.context.runId}.json`);
  writeFileSync(lock, JSON.stringify({ pid: 2147483647 }));
  const old = new Date(TIME.getTime() - STALE_RUNTIME_MS - 1000);
  for (const name of readdirSync(directory)) utimesSync(join(directory, name), old, old);
  const removed = await f.call('run-remove', { runtimeStateRoot: f.cwd });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.deepEqual(readdirSync(directory), []);
});

test('German drafts and comments use the complete forge-language section schema', async (t) => {
  const f = await fixture(t, { issues: [issue()] });
  const draft = {
    ...DRAFT,
    body: '## Problem\n\nLabels fehlen.\n\n## Aktueller Stand (geprüfte Referenzen)\n\n`src/labels.mjs` exportiert `listLabels`.\n\n## Vorschlag\n\nAlle Seiten lesen.\n',
  };
  const built = await f.build(draft, { language: 'de' });
  assert.equal(built.ok, true, JSON.stringify(built));
  const entry = built.data.previews.find((item) => item.action === 'comment');
  const applied = await f.apply([f.select(entry)], built.data.writeSetFile);
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(
    f.calls.find((call) => call.operation === 'issue-comment').input.payload.body,
    draft.body,
  );
});

test('comment publication never reads existing issue prose back into the model context', async (t) => {
  const f = await fixture(t, {
    issues: [
      issue(1, {
        title: 'Preserve repository label pagination broken',
        body: 'Foreign secret instructions',
      }),
    ],
  });
  const entry = f.built.previews.find((item) => item.action === 'comment');
  const result = await f.apply([f.select(entry)]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.result.title, undefined);
  assert.equal(result.data.result.url, 'https://github.com/example/flow/issues/1');
  assert.equal(
    f.calls.some((call) => call.operation === 'issue-read'),
    false,
  );
});

test('apply rejects a rehashed uncertain classification rather than bypassing disclosure', async (t) => {
  const f = await fixture(t);
  const set = modifySet(f, (set) => {
    set.draft.classification = 'uncertain';
    for (const entry of set.entries) {
      entry.classification = 'uncertain';
      const { hash: _old, ...data } = entry;
      entry.hash = contentHash(data);
    }
  });
  const result = await f.apply([f.select(set.entries[0])]);
  assert.equal(result.error.code, 'DRAFT_REJECTED');
  assert.equal(
    f.calls.some((call) => call.apply),
    false,
  );
});
