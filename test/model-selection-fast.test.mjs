import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  executeOperation,
  fastMappingIdentity,
  validateFastHarnessQualification,
} from '../src/scripts/model-selection-core.mjs';

const FAST = Object.freeze({
  claude: Object.freeze({ model: 'sonnet', effort: 'medium' }),
  codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' }),
});
const SITE = 'build-delegated-run/initial-implementation';
const CONTRACT = Object.freeze({
  schemaVersion: 1,
  target: 'portable',
  mappings: {
    mechanical: {
      claude: { model: 'haiku', effort: 'low' },
      codex: { model: 'gpt-5.6-luna', reasoning_effort: 'low' },
    },
    standard: {
      claude: { model: 'sonnet', effort: 'medium' },
      codex: { model: 'gpt-5.6-luna', reasoning_effort: 'medium' },
    },
    deep: {
      claude: { model: 'opus', effort: 'high' },
      codex: { model: 'gpt-6.1-sol', reasoning_effort: 'high' },
    },
  },
  panelModels: { claude: [], codex: [] },
  roles: { 'nodejs-implementer': 'deep' },
  sites: [
    {
      id: SITE,
      downAllowed: false,
      panel: false,
      clauses: [{ role: 'nodejs-implementer', tier: 'deep' }],
    },
    {
      id: 'build-delegated-run/review',
      downAllowed: false,
      panel: false,
      clauses: [{ role: null, tier: 'deep' }],
    },
  ],
  fast: { mappings: FAST, sites: [SITE] },
  t3Pins: { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' },
});
const record = (harnessFamily, overrides = {}) => ({
  installKind: 'portable',
  harnessFamily,
  outcome: 'qualified',
  hostVersion: '2.1',
  probedOn: '2026-11-21',
  fastMappingIdentity: fastMappingIdentity(FAST[harnessFamily]),
  ...overrides,
});
const QUALIFICATION = Object.freeze({
  schemaVersion: 1,
  records: [record('claude'), record('codex', { outcome: 'unproven', hostVersion: null })],
});
const SESSION = '1e8a8166-aa6c-4627-8fc1-a72005a14bb2';
const AGENT = 'a750f7780dafc12fe';
const PROJECT = '-work-repo';

// Invariant: the Fast lookup returns only the portable per-spawn Fast values of a site that renders
// a Fast tier line; it authorizes nothing and refuses a native build, which uses its sidecar.
test('fast returns only the rendered Fast values and refuses native builds and other sites', async () => {
  const claude = await executeOperation(
    'fast',
    { harness: 'claude', site: SITE },
    { contract: CONTRACT },
  );
  assert.equal(claude.ok, true);
  assert.deepEqual(claude.data.expected, { model: 'sonnet', effort: 'medium' });
  assert.deepEqual(claude.data.spawn, { parameters: { model: 'sonnet', effort: 'medium' } });
  assert.equal(claude.data.profile, 'fast');
  const codex = await executeOperation(
    'fast',
    { harness: 'codex', site: SITE },
    { contract: CONTRACT },
  );
  assert.deepEqual(codex.data.spawn.parameters, {
    model: 'gpt-5.6-luna',
    reasoning_effort: 'medium',
  });
  const other = await executeOperation(
    'fast',
    { harness: 'claude', site: 'build-delegated-run/review' },
    { contract: CONTRACT },
  );
  assert.equal(other.error.code, 'INVALID_INPUT');
  // The T3 pins are portable-only as well, so the native form drops them beside the Fast values.
  const { fast: _fast, t3Pins: _t3Pins, ...native } = CONTRACT;
  const nativeResult = await executeOperation(
    'fast',
    { harness: 'claude', site: SITE },
    { contract: { ...native, target: 'claude' } },
  );
  assert.equal(nativeResult.error.code, 'PROFILE_UNAVAILABLE');
  // A native contract carrying Fast values, or a portable one without them, is invalid.
  const forged = await executeOperation(
    'fast',
    { harness: 'claude', site: SITE },
    { contract: { ...CONTRACT, target: 'claude' } },
  );
  assert.equal(forged.error.code, 'INVALID_CONTRACT');
  const missing = await executeOperation(
    'select',
    { harness: 'claude', site: SITE, role: 'nodejs-implementer' },
    { contract: { ...native, t3Pins: CONTRACT.t3Pins } },
  );
  assert.equal(missing.error.code, 'INVALID_CONTRACT');
});

// Invariant: the build-validated qualification record has exactly one portable record per harness
// family, closed outcomes, a major.minor host version, and the identity of the current mapping.
test('validateFastHarnessQualification enforces the closed record and the mapping identity', async () => {
  assert.equal(
    fastMappingIdentity(FAST.claude),
    'c44bca229590200420783d89007d5f6b8f3b0898fa48dc091f655d1cbaeb9e8f',
  );
  assert.doesNotThrow(() =>
    validateFastHarnessQualification(QUALIFICATION, { fastMappings: FAST }),
  );
  const shipped = JSON.parse(
    await readFile(new URL('../src/scripts/fast-harness-qualification.json', import.meta.url)),
  );
  assert.doesNotThrow(() => validateFastHarnessQualification(shipped, { fastMappings: FAST }));
  const invalid = [
    [{ ...QUALIFICATION, schemaVersion: 2 }, /schemaVersion/],
    [{ ...QUALIFICATION, records: [record('claude')] }, /missing the portable codex record/],
    [
      { ...QUALIFICATION, records: [record('claude'), record('claude'), record('codex')] },
      /duplicate/,
    ],
    [
      { ...QUALIFICATION, records: [record('claude', { installKind: 'native' }), record('codex')] },
      /only portable/,
    ],
    [
      {
        ...QUALIFICATION,
        records: [record('claude', { hostVersion: '2.1.318' }), record('codex')],
      },
      /hostVersion/,
    ],
    [
      { ...QUALIFICATION, records: [record('claude', { hostVersion: null }), record('codex')] },
      /hostVersion/,
    ],
    [
      { ...QUALIFICATION, records: [record('claude', { outcome: 'maybe' }), record('codex')] },
      /outcome/,
    ],
    [
      {
        ...QUALIFICATION,
        records: [record('claude', { probedOn: '2026-13-01' }), record('codex')],
      },
      /probedOn/,
    ],
  ];
  for (const [value, message] of invalid) {
    assert.throws(() => validateFastHarnessQualification(value), message);
  }
  assert.throws(
    () =>
      validateFastHarnessQualification(QUALIFICATION, {
        fastMappings: { ...FAST, claude: { model: 'haiku', effort: 'medium' } },
      }),
    /claude fastMappingIdentity differs from the current Fast mapping/,
  );
});

async function transcriptFixture(entries, { session = SESSION, agent = AGENT } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-fast-'));
  const subagents = join(root, PROJECT, session, 'subagents');
  await mkdir(subagents, { recursive: true });
  await writeFile(
    join(subagents, `agent-${agent}.jsonl`),
    `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
  );
  return root;
}

const assistant = (overrides = {}) => ({
  type: 'assistant',
  sessionId: SESSION,
  agentId: AGENT,
  effort: 'medium',
  version: '2.1.318',
  cwd: '/private/path',
  gitBranch: 'secret-branch',
  message: { model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'private content' }] },
  ...overrides,
});
const user = { type: 'user', sessionId: SESSION, agentId: AGENT, message: { content: 'task' } };

async function verifyClaude(entries, options = {}) {
  const root = options.root ?? (await transcriptFixture(entries, options));
  try {
    const selection = (
      await executeOperation('fast', { harness: 'claude', site: SITE }, { contract: CONTRACT })
    ).data;
    return await executeOperation(
      'verify',
      {
        selection,
        evidence: { kind: 'claude-subagent-transcript', agentId: options.agentId ?? AGENT },
      },
      {
        contract: CONTRACT,
        qualification: options.qualification ?? QUALIFICATION,
        env: { CLAUDE_CODE_SESSION_ID: options.envSession ?? SESSION },
        claudeProjectsRoot: root,
        cwd: '/elsewhere',
        ...options.deps,
      },
    );
  } finally {
    await rm(options.cleanup ?? root, { recursive: true, force: true });
  }
}

// Invariant: the transcript adapter verifies a Fast spawn from model, effort and host version only,
// returns no content, cwd or branch, and treats a missing observation as unverified.
test('the Claude transcript adapter returns verified, mismatch, and unverified', async () => {
  const verified = await verifyClaude([user, assistant(), assistant()]);
  assert.equal(verified.ok, true);
  assert.equal(verified.data.modelCompliance, 'verified');
  assert.deepEqual(verified.data.observed, [
    { model: 'claude-sonnet-5-5', effort: 'medium', hostVersion: '2.1.318' },
  ]);
  const serialized = JSON.stringify(verified);
  for (const secret of ['private content', '/private/path', 'secret-branch', 'task']) {
    assert.ok(!serialized.includes(secret), `the result must not carry ${secret}`);
  }
  const deep = await verifyClaude([assistant({ message: { model: 'claude-opus-5-5' } })]);
  assert.equal(deep.data.modelCompliance, 'mismatch');
  assert.deepEqual(deep.data.reasons, ['model']);
  const version = await verifyClaude([assistant({ version: '2.2.0' })]);
  assert.equal(version.data.modelCompliance, 'mismatch');
  assert.deepEqual(version.data.reasons, ['host-version']);
  const unqualified = await verifyClaude([assistant()], {
    qualification: {
      schemaVersion: 1,
      records: [record('claude', { outcome: 'unproven', hostVersion: null }), record('codex')],
    },
  });
  assert.equal(unqualified.data.modelCompliance, 'mismatch');
  assert.deepEqual(unqualified.data.reasons, ['host-version', 'qualification']);
  // A synthetic notice is no model turn; a transcript with no assistant turn is no observation.
  const synthetic = await verifyClaude([
    user,
    assistant({ message: { model: '<synthetic>' }, effort: undefined }),
  ]);
  assert.equal(synthetic.data.modelCompliance, 'unverified');
  const noSession = await verifyClaude([assistant()], { envSession: '../escape' });
  assert.equal(noSession.data.modelCompliance, 'unverified');
});

// Invariant: the adapter reads only the one transcript of this session and agent: foreign IDs in an
// entry, traversal in the agent ID, and symlinked directories are rejected.
test('the Claude transcript adapter rejects foreign IDs, traversal, and symlinks', async () => {
  const foreignSession = await verifyClaude([assistant({ sessionId: 'other-session' })]);
  assert.equal(foreignSession.data.modelCompliance, 'unverified');
  const foreignAgent = await verifyClaude([user, assistant({ agentId: 'other-agent' })]);
  assert.equal(foreignAgent.data.modelCompliance, 'unverified');
  for (const agentId of ['../x', 'a/b', '..', '']) {
    const traversal = await verifyClaude([assistant()], { agentId });
    assert.equal(traversal.ok, false);
    assert.equal(traversal.error.code, 'INVALID_INPUT');
  }
  const root = await mkdtemp(join(tmpdir(), 'model-selection-fast-link-'));
  const real = await transcriptFixture([assistant()]);
  try {
    await mkdir(join(root, PROJECT), { recursive: true });
    await symlink(join(real, PROJECT, SESSION), join(root, PROJECT, SESSION));
    const linked = await verifyClaude([], { root });
    assert.equal(linked.data.modelCompliance, 'unverified');
  } finally {
    await rm(real, { recursive: true, force: true });
  }
  // The transcript adapter binds session and agent; parent and child IDs are rejected beside it.
  const selection = (
    await executeOperation('fast', { harness: 'claude', site: SITE }, { contract: CONTRACT })
  ).data;
  const mixed = await executeOperation(
    'verify',
    {
      selection,
      parentId: 'p',
      childId: 'c',
      evidence: { kind: 'claude-subagent-transcript', agentId: AGENT },
    },
    { contract: CONTRACT },
  );
  assert.equal(mixed.error.code, 'INVALID_INPUT');
});

// Invariant: a Quality selection never uses the Claude transcript adapter; it stays unverified.
test('a Quality selection keeps the Claude transcript adapter unsupported', async () => {
  const selection = (
    await executeOperation(
      'select',
      { harness: 'claude', site: SITE, role: 'nodejs-implementer' },
      { contract: CONTRACT },
    )
  ).data;
  const result = await executeOperation(
    'verify',
    { selection, evidence: { kind: 'claude-subagent-transcript', agentId: AGENT } },
    { contract: CONTRACT, env: { CLAUDE_CODE_SESSION_ID: SESSION } },
  );
  assert.equal(result.error.code, 'UNVERIFIED');
});

// Invariant: Claude Code keeps its transcripts under `$CLAUDE_CONFIG_DIR/projects` when that
// variable holds an absolute path and under `~/.claude/projects` when it is unset; any other value
// is no evidence location and stays unverified rather than guessing a path.
test('the Claude transcript adapter resolves the projects root from CLAUDE_CONFIG_DIR', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'model-selection-fast-config-'));
  const projects = await transcriptFixture([assistant()]);
  await rename(projects, join(configDir, 'projects'));
  const fromConfig = await verifyClaude([], {
    root: configDir,
    deps: {
      claudeProjectsRoot: undefined,
      env: { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: configDir },
    },
  });
  assert.equal(fromConfig.data.modelCompliance, 'verified');

  const home = await mkdtemp(join(tmpdir(), 'model-selection-fast-home-'));
  const homeProjects = await transcriptFixture([assistant()]);
  await mkdir(join(home, '.claude'));
  await rename(homeProjects, join(home, '.claude', 'projects'));
  for (const env of [
    { CLAUDE_CODE_SESSION_ID: SESSION },
    { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: '' },
  ]) {
    const fromHome = await verifyClaude([], {
      root: home,
      cleanup: join(tmpdir(), 'model-selection-fast-none'),
      deps: { claudeProjectsRoot: undefined, homedir: home, env },
    });
    assert.equal(fromHome.data.modelCompliance, 'verified');
  }
  // A relative config directory names no location; the home default is not used in its place.
  const relative = await verifyClaude([], {
    root: home,
    deps: {
      claudeProjectsRoot: undefined,
      homedir: home,
      env: { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: 'relative/config' },
    },
  });
  assert.equal(relative.data.modelCompliance, 'unverified');
});

// Invariant: the working directory's Claude project name (leading `-` included) resolves the
// project directory directly; only when it holds no such session does the names-only fallback
// accept the single project directory that does, and an ambiguous fallback stays unverified.
test('the Claude transcript adapter resolves the cwd project and a unique names-only fallback', async () => {
  const cwd = '/home/dev/my.repo';
  const candidate = '-home-dev-my-repo';
  const fixture = async () => {
    const root = await transcriptFixture([assistant()]);
    const subagents = join(root, candidate, SESSION, 'subagents');
    await mkdir(subagents, { recursive: true });
    await writeFile(
      join(subagents, `agent-${AGENT}.jsonl`),
      `${JSON.stringify(assistant({ message: { model: 'claude-opus-5-5' } }))}\n`,
    );
    return root;
  };
  // Two projects hold the session: the cwd candidate decides, and its transcript is the one read.
  const direct = await verifyClaude([], { root: await fixture(), deps: { cwd } });
  assert.equal(direct.data.modelCompliance, 'mismatch');
  assert.deepEqual(direct.data.reasons, ['model']);
  // From another working directory the same two matches are ambiguous.
  const ambiguous = await verifyClaude([], { root: await fixture() });
  assert.equal(ambiguous.data.modelCompliance, 'unverified');
  assert.match(ambiguous.data.reason, /cannot be resolved uniquely/);
  // One project holds the session and the cwd differs: the fallback finds it by name.
  const fallback = await verifyClaude([assistant()], { deps: { cwd } });
  assert.equal(fallback.data.modelCompliance, 'verified');
});

// Invariant: `verify` with a Fast selection returns `data.modelCompliance` for every well-formed
// request; missing evidence or missing handles are `unverified`, never an input error.
test('a Fast verify without evidence or handles reports unverified', async () => {
  for (const harness of ['claude', 'codex']) {
    const selection = (
      await executeOperation('fast', { harness, site: SITE }, { contract: CONTRACT })
    ).data;
    const bare = await executeOperation('verify', { selection }, { contract: CONTRACT });
    assert.equal(bare.ok, true);
    assert.equal(bare.data.modelCompliance, 'unverified');
    const handlesOnly = await executeOperation(
      'verify',
      { selection, parentId: 'parent-1', childId: 'child-1' },
      { contract: CONTRACT },
    );
    assert.equal(handlesOnly.data.modelCompliance, 'unverified');
    // Present handles must still be well-formed.
    const partial = await executeOperation(
      'verify',
      { selection, parentId: 'parent-1' },
      { contract: CONTRACT },
    );
    assert.equal(partial.error.code, 'INVALID_INPUT');
  }
  const codex = (
    await executeOperation('fast', { harness: 'codex', site: SITE }, { contract: CONTRACT })
  ).data;
  const noHandle = await executeOperation(
    'verify',
    { selection: codex, evidence: { kind: 'codex-rollout', path: '/nonexistent/rollout.jsonl' } },
    { contract: CONTRACT },
  );
  assert.equal(noHandle.ok, true);
  assert.equal(noHandle.data.modelCompliance, 'unverified');
  // A Quality verify keeps requiring its exact parent and child handles.
  const quality = (
    await executeOperation(
      'select',
      { harness: 'codex', site: SITE, role: 'nodejs-implementer' },
      { contract: CONTRACT },
    )
  ).data;
  const qualityBare = await executeOperation(
    'verify',
    { selection: quality },
    { contract: CONTRACT },
  );
  assert.equal(qualityBare.error.code, 'INVALID_INPUT');
});

const CODEX_QUALIFICATION = Object.freeze({
  schemaVersion: 1,
  records: [record('claude'), record('codex', { hostVersion: '0.98' })],
});

async function verifyCodex({ cliVersion = '0.98.2', model = 'gpt-5.6-luna', qualification } = {}) {
  // `cliVersion: null` omits the field from the session metadata.
  const directory = await mkdtemp(join(tmpdir(), 'model-selection-fast-rollout-'));
  const file = join(directory, 'rollout.jsonl');
  const meta = {
    id: 'child-1',
    source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } },
    ...(cliVersion === null ? {} : { cli_version: cliVersion }),
  };
  await writeFile(
    file,
    [
      { type: 'session_meta', payload: meta },
      { type: 'turn_context', payload: { turn_id: 'turn-1', model, effort: 'medium' } },
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } },
      { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1' } },
    ]
      .map((event) => `${JSON.stringify(event)}\n`)
      .join(''),
  );
  try {
    const selection = (
      await executeOperation('fast', { harness: 'codex', site: SITE }, { contract: CONTRACT })
    ).data;
    return await executeOperation(
      'verify',
      {
        selection,
        parentId: 'parent-1',
        childId: 'child-1',
        evidence: { kind: 'codex-rollout', path: file },
      },
      { contract: CONTRACT, qualification: qualification ?? CODEX_QUALIFICATION },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Invariant: the Codex Fast branch judges every turn context of the exact child rollout against
// the Fast model and effort and the session `cli_version` against the qualified major.minor; a
// rollout without `cli_version` is no observation of the host.
test('the Codex rollout adapter returns verified, mismatch, and unverified for Fast', async () => {
  const verified = await verifyCodex();
  assert.equal(verified.ok, true);
  assert.equal(verified.data.modelCompliance, 'verified');
  assert.deepEqual(verified.data.observed, [
    { model: 'gpt-5.6-luna', effort: 'medium', hostVersion: '0.98.2' },
  ]);
  const deep = await verifyCodex({ model: 'gpt-6.1-sol' });
  assert.equal(deep.data.modelCompliance, 'mismatch');
  assert.deepEqual(deep.data.reasons, ['model']);
  const host = await verifyCodex({ cliVersion: '0.99.0' });
  assert.equal(host.data.modelCompliance, 'mismatch');
  assert.deepEqual(host.data.reasons, ['host-version']);
  const missing = await verifyCodex({ cliVersion: null });
  assert.equal(missing.data.modelCompliance, 'unverified');
  assert.match(missing.data.reason, /names no host version/);
  // The shipped Codex record is unproven: matching evidence still cannot become verified.
  const unproven = await verifyCodex({ qualification: QUALIFICATION });
  assert.equal(unproven.data.modelCompliance, 'mismatch');
  assert.ok(unproven.data.reasons.includes('qualification'));
  // An absent installed record is no qualification evidence at all: unverified, not mismatch.
  const absent = await verifyCodex({ qualification: { schemaVersion: 1, records: [] } });
  assert.equal(absent.data.modelCompliance, 'unverified');
});
