import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { main as runCli } from '../src/scripts/model-selection.mjs';
import {
  MAX_CAPABILITIES_BYTES,
  MAX_STDIN_BYTES,
  executeOperation,
} from '../src/scripts/model-selection-core.mjs';

const CONTRACT = Object.freeze({
  schemaVersion: 1,
  target: 'codex',
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
  panelModels: { claude: ['fable'], codex: [] },
  roles: {
    'code-documenter': 'standard',
    'nodejs-implementer': 'deep',
  },
  sites: [
    {
      id: 'apply-issues/issue-analysis',
      downAllowed: true,
      panel: false,
      clauses: [{ role: null, tier: 'standard' }],
    },
    {
      id: 'apply-issues/code-documenter',
      downAllowed: true,
      panel: false,
      clauses: [{ role: 'code-documenter', tier: 'standard' }],
    },
    {
      id: 'apply-issues/nodejs-implementer',
      downAllowed: false,
      panel: false,
      clauses: [{ role: 'nodejs-implementer', tier: 'deep' }],
    },
    {
      id: 'backlog-audit/panel',
      downAllowed: false,
      panel: true,
      clauses: [{ role: null, tier: 'deep' }],
    },
  ],
});

const CONTRACT_OPTIONS = { contract: CONTRACT };
const CLAUDE_CONTRACT_OPTIONS = { contract: Object.freeze({ ...CONTRACT, target: 'claude' }) };

async function cli(argv, input, deps = CONTRACT_OPTIONS) {
  const stdout = [];
  const stderr = [];
  let exitCode;
  const envelope = await runCli(argv, {
    stdin: Readable.from([input]),
    stdout: { write: (chunk) => stdout.push(String(chunk)) },
    stderr: { write: (chunk) => stderr.push(String(chunk)) },
    setExitCode: (code) => {
      exitCode = code;
    },
    deps,
  });
  return { envelope, exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

async function select(input) {
  const envelope = await executeOperation('select', input, CONTRACT_OPTIONS);
  assert.equal(envelope.ok, true);
  return envelope.data;
}

async function rejected(operation, input, code) {
  const envelope = await executeOperation(operation, input, CONTRACT_OPTIONS);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, code);
  return envelope;
}

const ENCODED_IDS = {
  parentId: 'thread:delegated-task:command%3Amcp%3Asynthetic-parent',
  childId: 'thread:delegated-task:command%3Amcp%3Asynthetic-child',
};
const SIMPLE_IDS = { parentId: 'synthetic-parent', childId: 'synthetic-child' };

function rolloutIdentity({ parentId, childId }) {
  return {
    type: 'session_meta',
    payload: {
      id: childId,
      source: { subagent: { thread_spawn: { parent_thread_id: parentId } } },
    },
  };
}

function rolloutTurn(overrides = {}) {
  return {
    type: 'turn_context',
    payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna', effort: 'medium', ...overrides },
  };
}

async function syntheticRollout(t, records) {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-host-ids-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = join(root, 'rollout.jsonl');
  await writeFile(fixture, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  return { kind: 'codex-rollout', path: fixture };
}

async function rejectedVerificationCli(input, code, status) {
  const result = await cli(['verify'], JSON.stringify(input));
  assert.equal(result.envelope.ok, false);
  assert.equal(result.envelope.operation, 'verify');
  assert.equal(result.exitCode, code === 'INVALID_INPUT' ? 2 : 1);
  assert.equal(result.envelope.error.code, code);
  assert.equal(result.stdout, `${JSON.stringify(result.envelope)}\n`);
  assert.ok(result.envelope.error.message.length > 0);
  assert.equal(result.stderr, `${code}: ${result.envelope.error.message}\n`);
  if (status) assert.deepEqual(result.envelope.data, { status });
  return result.envelope;
}

test('selects the standard Codex tier and emits provider-native spawn parameters', async () => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });

  assert.equal(selection.defaultTier, 'standard');
  assert.equal(selection.tier, 'standard');
  assert.deepEqual(selection.expected, { model: 'gpt-5.6-luna', effort: 'medium' });
  assert.deepEqual(selection.spawn, {
    role: null,
    parameters: { model: 'gpt-5.6-luna', reasoning_effort: 'medium' },
  });
  assert.match(selection.contractDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(selection.request, {
    harness: 'codex',
    site: 'apply-issues/issue-analysis',
  });
});

test('unmarked unnamed handoffs require an explicit reasoned standard fallback', async () => {
  const selection = await select({
    harness: 'codex',
    fallback: true,
    reason: 'Unmarked commit workflow handoff',
  });
  assert.equal(selection.defaultTier, 'standard');
  assert.deepEqual(selection.spawn.parameters, {
    model: 'gpt-5.6-luna',
    reasoning_effort: 'medium',
  });
  await rejected('select', { harness: 'codex', fallback: true }, 'INVALID_INPUT');
  await rejected(
    'select',
    {
      harness: 'codex',
      fallback: true,
      site: 'unknown/site',
      reason: 'Cannot bypass unknown site',
    },
    'INVALID_INPUT',
  );
  await rejected(
    'select',
    {
      harness: 'codex',
      fallback: true,
      role: 'code-documenter',
      reason: 'Cannot bypass role selector',
    },
    'INVALID_INPUT',
  );
});

test('selects a role default and uses Claude model/effort keys', async () => {
  const selection = await select({ harness: 'claude', role: 'nodejs-implementer' });

  assert.equal(selection.defaultTier, 'deep');
  assert.equal(selection.tier, 'deep');
  assert.deepEqual(selection.expected, { model: 'opus', effort: 'high' });
  assert.deepEqual(selection.spawn, {
    role: 'nodejs-implementer',
    parameters: { model: 'opus', effort: 'high' },
  });
});

test('native Claude retains its effective-flow role and explicit provider parameters', async () => {
  const envelope = await executeOperation(
    'select',
    { harness: 'claude', role: 'code-documenter', native: true },
    CLAUDE_CONTRACT_OPTIONS,
  );
  assert.equal(envelope.ok, true);
  const selection = envelope.data;
  assert.deepEqual(selection.spawn, {
    role: 'effective-flow-code-documenter',
    parameters: { model: 'sonnet', effort: 'medium' },
  });
});

test('rejects every downshift from a deep default, even with an explicit reason', async () => {
  await rejected(
    'select',
    { harness: 'codex', role: 'nodejs-implementer', tier: 'standard' },
    'TIER_POLICY',
  );
  await rejected(
    'select',
    {
      harness: 'codex',
      role: 'nodejs-implementer',
      tier: 'standard',
      reason: 'bounded first implementation attempt',
    },
    'TIER_POLICY',
  );
});

test('allows a reasoned one-step standard move and rejects forbidden retry/portable modes', async () => {
  const down = await select({
    harness: 'codex',
    site: 'apply-issues/issue-analysis',
    tier: 'mechanical',
    reason: 'bounded first implementation attempt',
  });
  assert.equal(down.tier, 'mechanical');

  await rejected(
    'select',
    {
      harness: 'codex',
      role: 'nodejs-implementer',
      tier: 'standard',
      retry: true,
      reason: 'retry',
    },
    'TIER_POLICY',
  );
  await rejected(
    'select',
    { harness: 'portable', site: 'apply-issues/issue-analysis', native: true },
    'INVALID_INPUT',
  );
});

// Invariant: `role` is the bare role name `model-selection.md` states; the rendered
// `effective-flow-<role>` form that `data.spawn.role` returns is rejected, never normalized.
test('rejects the rendered prefixed role form', async () => {
  const envelope = await rejected(
    'select',
    { harness: 'claude', role: 'effective-flow-code-documenter' },
    'INVALID_INPUT',
  );
  assert.match(envelope.error.message, /Unknown worker role/);
  await rejected(
    'select',
    {
      harness: 'codex',
      site: 'apply-issues/code-documenter',
      role: 'effective-flow-code-documenter',
    },
    'INVALID_INPUT',
  );
});

test('rejects missing selectors and site/role mismatches without guessing a default', async () => {
  await rejected('select', { harness: 'codex' }, 'INVALID_INPUT');
  await rejected(
    'select',
    { harness: 'codex', site: 'apply-issues/code-documenter', role: 'nodejs-implementer' },
    'INVALID_INPUT',
  );
  await rejected('select', { harness: 'codex', site: 'unknown/site' }, 'INVALID_INPUT');
  await rejected(
    'select',
    { harness: 'codex', site: 'apply-issues/issue-analysis', model: 'gpt-unknown' },
    'INVALID_INPUT',
  );
  await rejected(
    'select',
    { harness: 'codex', site: 'apply-issues/issue-analysis', profile: 'unknown-profile' },
    'INVALID_INPUT',
  );
});

test('native Codex roles select a tiered role file and omit model parameters', async () => {
  const selection = await select({
    harness: 'codex',
    role: 'nodejs-implementer',
    native: true,
  });

  assert.deepEqual(selection.spawn, {
    role: 'effective-flow-nodejs-implementer',
    parameters: {},
  });
});

test('native Codex standard defaults use the base role and reasoned moves use tier sidecars', async () => {
  const standard = await select({ harness: 'codex', role: 'code-documenter', native: true });
  assert.deepEqual(standard.spawn, { role: 'effective-flow-code-documenter', parameters: {} });

  const mechanical = await select({
    harness: 'codex',
    role: 'code-documenter',
    tier: 'mechanical',
    reason: 'bounded first implementation attempt',
    native: true,
  });
  assert.deepEqual(mechanical.spawn, {
    role: 'effective-flow-code-documenter-tier-mechanical',
    parameters: {},
  });

  const deep = await select({
    harness: 'codex',
    role: 'code-documenter',
    tier: 'deep',
    reason: 'bounded first implementation attempt',
    native: true,
  });
  assert.deepEqual(deep.spawn, {
    role: 'effective-flow-code-documenter-tier-deep',
    parameters: {},
  });
});

// Invariant: a panel site names its model from the harness allowlist only, never the primary deep
// model, and no other site accepts a panel model.
test('panel sites require an allowlisted panelModel distinct from the deep model', async () => {
  const claude = await executeOperation(
    'select',
    { harness: 'claude', site: 'backlog-audit/panel', panelModel: 'fable' },
    CLAUDE_CONTRACT_OPTIONS,
  );
  assert.equal(claude.ok, true);
  assert.equal(claude.data.tier, 'deep');
  assert.deepEqual(claude.data.expected, { model: 'fable', effort: 'high' });
  assert.deepEqual(claude.data.spawn, {
    role: null,
    parameters: { model: 'fable', effort: 'high' },
  });
  const rejectedPanel = async (input, code) => {
    const envelope = await executeOperation('select', input, CLAUDE_CONTRACT_OPTIONS);
    assert.equal(envelope.ok, false, JSON.stringify(input));
    assert.equal(envelope.error.code, code, JSON.stringify(input));
  };
  await rejectedPanel({ harness: 'claude', site: 'backlog-audit/panel' }, 'INVALID_INPUT');
  await rejectedPanel(
    { harness: 'claude', site: 'backlog-audit/panel', panelModel: 'opus' },
    'TIER_POLICY',
  );
  await rejectedPanel(
    { harness: 'claude', site: 'backlog-audit/panel', panelModel: 'sonnet' },
    'TIER_POLICY',
  );
  await rejectedPanel(
    { harness: 'codex', site: 'backlog-audit/panel', panelModel: 'fable' },
    'TIER_POLICY',
  );
  await rejectedPanel(
    { harness: 'claude', site: 'apply-issues/issue-analysis', panelModel: 'fable' },
    'INVALID_INPUT',
  );
  await rejectedPanel(
    {
      harness: 'claude',
      site: 'backlog-audit/panel',
      panelModel: 'fable',
      tier: 'standard',
      reason: 'cheaper',
    },
    'INVALID_INPUT',
  );
  // The selection is recomputable, so a verify call binds the panel model like any other.
  const verified = await executeOperation(
    'verify',
    { selection: claude.data, ...SIMPLE_IDS },
    CLAUDE_CONTRACT_OPTIONS,
  );
  assert.equal(verified.error.code, 'UNVERIFIED');
  // A contract whose allowlist names the deep model is invalid, not silently honored.
  const invalid = await executeOperation(
    'select',
    { harness: 'claude', site: 'apply-issues/issue-analysis' },
    { contract: { ...CONTRACT, panelModels: { claude: ['opus'], codex: [] } } },
  );
  assert.equal(invalid.error.code, 'INVALID_CONTRACT');
  const noPanels = await executeOperation(
    'select',
    { harness: 'claude', site: 'apply-issues/issue-analysis' },
    { contract: { ...CONTRACT, panelModels: undefined } },
  );
  assert.equal(noPanels.error.code, 'INVALID_CONTRACT');
});

test('verify recomputes the selection and requires an exact child rollout proof', async () => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const root = await mkdtemp(join(tmpdir(), 'model-selection-'));
  const cleanup = () => rm(root, { recursive: true, force: true });
  test.after(cleanup);
  const fixture = join(root, 'rollout.jsonl');
  const canary = 'USER-MESSAGE-CANARY-MUST-NOT-LEAK';
  await writeFile(
    fixture,
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'child-1', source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } }, message: canary } })}\n` +
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna', effort: 'medium' } })}\n` +
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-2', model: 'gpt-5.6-luna', effort: 'medium' } })}\n`,
  );

  const envelope = await executeOperation(
    'verify',
    {
      selection,
      parentId: 'parent-1',
      childId: 'child-1',
      evidence: { kind: 'codex-rollout', path: fixture },
    },
    CONTRACT_OPTIONS,
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.status, 'verified');
  assert.deepEqual(envelope.data.observed, {
    childId: 'child-1',
    parentId: 'parent-1',
    model: 'gpt-5.6-luna',
    effort: 'medium',
  });
  assert.deepEqual(envelope.data.observedTurnIds, ['turn-1', 'turn-2']);
  assert.equal(JSON.stringify(envelope.data).includes(canary), false);
});

test('verify rejects tampered selections and missing or unsupported proof as unverified', async () => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const tampered = structuredClone(selection);
  tampered.expected.model = 'gpt-6.1-sol';
  await rejected(
    'verify',
    { selection: tampered, parentId: 'parent-1', childId: 'child-1' },
    'INVALID_SELECTION',
  );

  const missing = await executeOperation(
    'verify',
    { selection, parentId: 'parent-1', childId: 'child-1' },
    CONTRACT_OPTIONS,
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'UNVERIFIED');
  assert.equal(missing.data.status, 'unverified');

  await rejected(
    'verify',
    {
      selection,
      parentId: 'parent-1',
      childId: 'child-1',
      evidence: { kind: 'host-shaped-inline-selfreport', path: '/tmp/nope' },
    },
    'UNVERIFIED',
  );
});

test('verify distinguishes stale identity, model mismatch, missing effort, and conflicting duplicate contexts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-errors-'));
  test.after(() => rm(root, { recursive: true, force: true }));
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const cases = [
    {
      name: 'stale parent',
      record: {
        type: 'session_meta',
        payload: {
          id: 'child-1',
          source: { subagent: { thread_spawn: { parent_thread_id: 'other-parent' } } },
        },
      },
      code: 'UNVERIFIED',
    },
    {
      name: 'wrong child',
      record: {
        type: 'session_meta',
        payload: {
          id: 'other-child',
          source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } },
        },
      },
      code: 'UNVERIFIED',
    },
    {
      name: 'missing effort',
      record: { type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna' } },
      code: 'UNVERIFIED',
    },
    {
      name: 'model mismatch',
      record: {
        type: 'turn_context',
        payload: { turn_id: 'turn-1', model: 'gpt-6.1-sol', effort: 'medium' },
      },
      code: 'MODEL_MISMATCH',
    },
    {
      name: 'effort mismatch',
      record: {
        type: 'turn_context',
        payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna', effort: 'high' },
      },
      code: 'MODEL_MISMATCH',
    },
    {
      name: 'missing turn id',
      record: { type: 'turn_context', payload: { model: 'gpt-5.6-luna', effort: 'medium' } },
      code: 'UNVERIFIED',
    },
    {
      name: 'task started without context',
      record: { type: 'task_started', payload: { task_id: 'child-1' } },
      code: 'UNVERIFIED',
    },
    {
      name: 'resume model mismatch',
      record: {
        type: 'turn_context',
        payload: { turn_id: 'turn-2', model: 'gpt-6.1-sol', effort: 'medium' },
      },
      code: 'MODEL_MISMATCH',
    },
    {
      name: 'truncated json',
      record: '{"type":"turn_context"',
      code: 'UNVERIFIED',
    },
  ];

  for (const item of cases) {
    const fixture = join(root, `${item.name.replaceAll(' ', '-')}.jsonl`);
    const records =
      typeof item.record === 'string'
        ? [
            {
              type: 'session_meta',
              payload: {
                id: 'child-1',
                source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } },
              },
            },
            item.record,
          ]
        : item.record.type === 'session_meta'
          ? [
              item.record,
              {
                type: 'turn_context',
                payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna', effort: 'medium' },
              },
            ]
          : [
              {
                type: 'session_meta',
                payload: {
                  id: 'child-1',
                  source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } },
                },
              },
              item.record,
            ];
    await writeFile(
      fixture,
      `${records.map((record) => (typeof record === 'string' ? record : JSON.stringify(record))).join('\n')}\n`,
    );
    const envelope = await executeOperation(
      'verify',
      {
        selection,
        parentId: 'parent-1',
        childId: 'child-1',
        evidence: { kind: 'codex-rollout', path: fixture },
      },
      CONTRACT_OPTIONS,
    );
    assert.equal(envelope.ok, false, item.name);
    assert.equal(envelope.error.code, item.code, item.name);
    assert.equal(
      envelope.data.status,
      item.code === 'MODEL_MISMATCH' ? 'mismatch' : 'unverified',
      item.name,
    );
  }

  const duplicate = join(root, 'duplicate.jsonl');
  await writeFile(
    duplicate,
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'child-1', source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } } } })}\n` +
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna', effort: 'medium' } })}\n` +
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-6.1-sol', effort: 'medium' } })}\n`,
  );
  const duplicateEnvelope = await executeOperation(
    'verify',
    {
      selection,
      parentId: 'parent-1',
      childId: 'child-1',
      evidence: { kind: 'codex-rollout', path: duplicate },
    },
    CONTRACT_OPTIONS,
  );
  assert.equal(duplicateEnvelope.ok, false);
  assert.equal(duplicateEnvelope.error.code, 'UNVERIFIED');
  assert.equal(duplicateEnvelope.data.status, 'unverified');
});

test('verify does not follow symlinked evidence outside the bounded rollout file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-links-'));
  const outside = await mkdtemp(join(tmpdir(), 'model-selection-outside-'));
  test.after(() =>
    Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]),
  );
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const outsideFixture = join(outside, 'rollout.jsonl');
  await writeFile(
    outsideFixture,
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'child-1', source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } } } })}\n`,
  );
  const linked = join(root, 'rollout.jsonl');
  await symlink(outsideFixture, linked);

  const envelope = await executeOperation(
    'verify',
    {
      selection,
      parentId: 'parent-1',
      childId: 'child-1',
      evidence: { kind: 'codex-rollout', path: linked },
    },
    CONTRACT_OPTIONS,
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'UNVERIFIED');
  assert.equal(envelope.data.status, 'unverified');
});

test('CLI emits exactly one JSON line and exit zero for a successful selection', async () => {
  const result = await cli(
    ['select'],
    JSON.stringify({ harness: 'codex', site: 'apply-issues/issue-analysis' }),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.split('\n').filter(Boolean).length, 1);
  assert.deepEqual(JSON.parse(result.stdout), result.envelope);
  assert.equal(result.envelope.ok, true);
});

test('CLI returns non-zero and useful stderr for malformed JSON and missing verification evidence', async () => {
  const malformed = await cli(['select'], '{');
  assert.equal(malformed.exitCode, 2);
  assert.equal(malformed.envelope.ok, false);
  assert.equal(malformed.envelope.error.code, 'INVALID_INPUT');
  assert.match(malformed.stderr, /^INVALID_INPUT:/);

  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const missing = await cli(
    ['verify'],
    JSON.stringify({ selection, parentId: 'parent-1', childId: 'child-1' }),
  );
  assert.notEqual(missing.exitCode, 0);
  assert.equal(missing.envelope.ok, false);
  assert.equal(missing.envelope.error.code, 'UNVERIFIED');
  assert.equal(missing.envelope.data.status, 'unverified');
  assert.match(missing.stderr, /^UNVERIFIED:/);
});

test('CLI reports model mismatch and rejects conflicting top-level parent identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-cli-'));
  test.after(() => rm(root, { recursive: true, force: true }));
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const mismatchFixture = join(root, 'mismatch.jsonl');
  await writeFile(
    mismatchFixture,
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'child-1', source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } } } })}\n` +
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-6.1-sol', effort: 'medium' } })}\n`,
  );
  const result = await cli(
    ['verify'],
    JSON.stringify({
      selection,
      parentId: 'parent-1',
      childId: 'child-1',
      evidence: { kind: 'codex-rollout', path: mismatchFixture },
    }),
  );
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.envelope.ok, false);
  assert.equal(result.envelope.error.code, 'MODEL_MISMATCH');
  assert.equal(result.envelope.data.status, 'mismatch');
  assert.match(result.stderr, /^MODEL_MISMATCH:/);

  const parentFixture = join(root, 'parent-conflict.jsonl');
  await writeFile(
    parentFixture,
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'child-1', parent_thread_id: 'other-parent', source: { subagent: { thread_spawn: { parent_thread_id: 'parent-1' } } } } })}\n` +
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-5.6-luna', effort: 'medium' } })}\n`,
  );
  const parentResult = await cli(
    ['verify'],
    JSON.stringify({
      selection,
      parentId: 'parent-1',
      childId: 'child-1',
      evidence: { kind: 'codex-rollout', path: parentFixture },
    }),
  );
  assert.notEqual(parentResult.exitCode, 0);
  assert.equal(parentResult.envelope.ok, false);
  assert.equal(parentResult.envelope.error.code, 'UNVERIFIED');
  assert.equal(parentResult.envelope.data.status, 'unverified');
});

test('distinct simple and encoded T3 host IDs without evidence retain the UNVERIFIED envelope and CLI exit 1', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  for (const [name, ids] of [
    ['simple', SIMPLE_IDS],
    ['encoded issue 624 pair', ENCODED_IDS],
  ]) {
    const input = { selection, ...ids, evidence: null };
    const expected = {
      ok: false,
      operation: 'verify',
      error: { code: 'UNVERIFIED', message: 'No supported runtime evidence was supplied' },
      data: { status: 'unverified' },
    };
    await t.test(`${name}: API`, async () => {
      assert.deepEqual(await executeOperation('verify', input, CONTRACT_OPTIONS), expected);
    });
    await t.test(`${name}: CLI`, async () => {
      assert.deepEqual(await rejectedVerificationCli(input, 'UNVERIFIED', 'unverified'), expected);
    });
  }
});

test('host ID bounds count raw characters and percent triplets stay opaque', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const cases = [
    ['one character', 'A', true],
    ['plain 200 characters', 'A'.repeat(200), true],
    ['plain 201 characters', 'A'.repeat(201), false],
    ['encoded 200 characters', `A${'%3A'.repeat(66)}a`, true],
    ['encoded 201 characters', `A${'%3A'.repeat(66)}ab`, false],
    ['existing ASCII alphabet', 'aZ09._:/-', true],
    ['encoded controls, whitespace and invalid UTF-8', 'A%00%0A%20%7f%FF%C3%28', true],
  ];
  for (const [name, id, valid] of cases) {
    await t.test(name, async () => {
      for (const field of ['parentId', 'childId']) {
        await rejectedVerificationCli(
          { selection, ...SIMPLE_IDS, [field]: id, evidence: null },
          valid ? 'UNVERIFIED' : 'INVALID_INPUT',
          valid ? 'unverified' : undefined,
        );
      }
    });
  }
});

test('host IDs reject malformed encoding, invalid initials, equal IDs and unsupported raw characters with CLI exit 2', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const invalid = [
    ['empty', ''],
    ['null', null],
    ['number', 7],
    ['boolean', true],
    ['object', {}],
    ['array', []],
    ['bare percent', 'A%'],
    ['short triplet', 'A%0'],
    ['nonhex triplet', 'A%G0'],
    ['non-ASCII hex digit', 'A%３A'],
    ['trailing percent after valid encoding', 'A%3A%'],
    ['initial percent', '%41'],
    ['initial punctuation', '_A'],
    ['leading whitespace', ' A'],
    ['embedded whitespace', 'A B'],
    ['raw tab', 'A\tB'],
    ['trailing newline', 'A\n'],
    ['raw NUL', 'A\u0000B'],
    ['raw DEL', 'A\u007fB'],
    ['Unicode whitespace', 'A\u00a0B'],
    ['Unicode letter', 'Aé'],
    ['Unicode punctuation', 'A—B'],
    ['unsupported ASCII punctuation', 'A+B'],
  ];
  for (const [name, id] of invalid) {
    await t.test(name, async () => {
      for (const field of ['parentId', 'childId']) {
        await rejectedVerificationCli(
          { selection, ...SIMPLE_IDS, [field]: id, evidence: null },
          'INVALID_INPUT',
        );
      }
    });
  }
  for (const id of [SIMPLE_IDS.parentId, ENCODED_IDS.parentId]) {
    await t.test(`equal IDs: ${id}`, async () => {
      await rejectedVerificationCli(
        { selection, parentId: id, childId: id, evidence: null },
        'INVALID_INPUT',
      );
    });
  }
});

test('matching synthetic rollouts verify literal host IDs without decoding or case folding', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const cases = [
    ['encoded issue 624 pair', ENCODED_IDS],
    ['percent hex case remains distinct', { parentId: 'task%3A1', childId: 'task%3a1' }],
    ['encoded and literal remain distinct', { parentId: 'task%3A1', childId: 'task:1' }],
    ['opaque octets remain literal', { parentId: 'task%00%20', childId: 'task%FF%C3%28' }],
  ];
  for (const [name, ids] of cases) {
    await t.test(name, async (t) => {
      const evidence = await syntheticRollout(t, [rolloutIdentity(ids), rolloutTurn()]);
      const result = await cli(['verify'], JSON.stringify({ selection, ...ids, evidence }));
      assert.equal(result.envelope.ok, true);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, `${JSON.stringify(result.envelope)}\n`);
      assert.equal(result.envelope.data.status, 'verified');
      assert.deepEqual(result.envelope.data.observed, { ...ids, ...selection.expected });
      assert.deepEqual(result.envelope.data.observedTurnIds, ['turn-1']);
    });
  }
});

test('encoded host IDs preserve exact identity binding and conflicting-context rejection', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const contradiction = rolloutIdentity(ENCODED_IDS);
  contradiction.payload.parent_thread_id = 'stale-parent';
  const cases = [
    [
      'stale parent',
      [rolloutIdentity({ ...ENCODED_IDS, parentId: 'stale-parent' }), rolloutTurn()],
    ],
    [
      'parent percent case differs',
      [
        rolloutIdentity({
          ...ENCODED_IDS,
          parentId: ENCODED_IDS.parentId.replaceAll('%3A', '%3a'),
        }),
        rolloutTurn(),
      ],
    ],
    [
      'child percent case differs',
      [
        rolloutIdentity({ ...ENCODED_IDS, childId: ENCODED_IDS.childId.replaceAll('%3A', '%3a') }),
        rolloutTurn(),
      ],
    ],
    [
      'parent uses literal delimiters',
      [
        rolloutIdentity({ ...ENCODED_IDS, parentId: ENCODED_IDS.parentId.replaceAll('%3A', ':') }),
        rolloutTurn(),
      ],
    ],
    [
      'child uses literal delimiters',
      [
        rolloutIdentity({ ...ENCODED_IDS, childId: ENCODED_IDS.childId.replaceAll('%3A', ':') }),
        rolloutTurn(),
      ],
    ],
    ['contradictory top-level parent', [contradiction, rolloutTurn()]],
    [
      'conflicting duplicate context',
      [rolloutIdentity(ENCODED_IDS), rolloutTurn(), rolloutTurn({ model: 'gpt-6.1-sol' })],
    ],
  ];
  for (const [name, records] of cases) {
    await t.test(name, async (t) => {
      const evidence = await syntheticRollout(t, records);
      await rejectedVerificationCli(
        { selection, ...ENCODED_IDS, evidence },
        'UNVERIFIED',
        'unverified',
      );
    });
  }
});

test('matching encoded identity with wrong model or effort remains MODEL_MISMATCH with CLI exit 1', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  for (const overrides of [{ model: 'gpt-6.1-sol' }, { effort: 'high' }]) {
    await t.test(Object.keys(overrides)[0], async (t) => {
      const evidence = await syntheticRollout(t, [
        rolloutIdentity(ENCODED_IDS),
        rolloutTurn(overrides),
      ]);
      const result = await cli(['verify'], JSON.stringify({ selection, ...ENCODED_IDS, evidence }));
      assert.equal(result.envelope.ok, false);
      assert.equal(result.envelope.error.code, 'MODEL_MISMATCH');
      assert.equal(result.envelope.data.status, 'mismatch');
      assert.deepEqual(result.envelope.data.observed, {
        ...ENCODED_IDS,
        ...selection.expected,
        ...overrides,
      });
      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, `${JSON.stringify(result.envelope)}\n`);
      assert.match(result.stderr, /^MODEL_MISMATCH: .+\n$/);
    });
  }
});

test('percent evidence fields remain structurally UNVERIFIED ahead of an earlier model mismatch', async (t) => {
  const selection = await select({ harness: 'codex', site: 'apply-issues/issue-analysis' });
  const contextMessage = 'A turn context lacks verified identity, turn ID, model, or effort';
  const cases = [
    ['rollout turn ID', rolloutTurn({ turn_id: 'turn%3A2' }), contextMessage],
    ['model', rolloutTurn({ turn_id: 'turn-2', model: 'gpt%2D5.6-luna' }), contextMessage],
    ['effort', rolloutTurn({ turn_id: 'turn-2', effort: 'med%69um' }), contextMessage],
    ...['task_started', 'task_complete'].map((type) => [
      type,
      { type: 'event_msg', payload: { type, turn_id: 'turn%3A2' } },
      'A task event lacks a verified turn ID',
    ]),
  ];
  for (const [host, ids] of [
    ['simple', SIMPLE_IDS],
    ['encoded', ENCODED_IDS],
  ]) {
    for (const [name, record, message] of cases) {
      await t.test(`${host} host IDs: ${name}`, async (t) => {
        const evidence = await syntheticRollout(t, [
          rolloutIdentity(ids),
          rolloutTurn({ model: 'gpt-6.1-sol' }),
          record,
        ]);
        const envelope = await rejectedVerificationCli(
          { selection, ...ids, evidence },
          'UNVERIFIED',
          'unverified',
        );
        assert.equal(envelope.error.message, message);
      });
    }
  }
});

// --- T3 delegation transport (`transport: "t3-delegate"`) ---
//
// Invariant: a transport selection resolves the spawn site's existing tier for the harness of the
// inherited provider instance's driver and targets that same instance. Claude aliases resolve
// through the portable contract's `t3Pins`, Codex model IDs pass through, and the helper selects
// only what the bounded capabilities projection advertises, never Fast. Every refusal to resolve a
// target is `TRANSPORT_UNAVAILABLE` with one named reason and CLI exit 3, so the orchestrator takes
// the no-mechanism path instead of treating it as a selection error.

const T3_PINS = Object.freeze({
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  fable: 'claude-fable-5-2',
});
const T3_CONTRACT = Object.freeze({
  ...CONTRACT,
  target: 'portable',
  panelModels: { claude: ['fable'], codex: ['gpt-6-astra'] },
  fast: {
    mappings: {
      claude: { model: 'sonnet', effort: 'medium' },
      codex: { model: 'gpt-5.6-luna', reasoning_effort: 'medium' },
    },
    sites: ['apply-issues/nodejs-implementer'],
  },
  t3Pins: T3_PINS,
});
const T3_OPTIONS = { contract: T3_CONTRACT };

const CLAUDE_INSTANCE = 'claudeAgent';
const CODEX_INSTANCE = 'codex';
const PROVIDERS = [
  { providerInstanceId: CLAUDE_INSTANCE, driverKind: 'claudeAgent' },
  { providerInstanceId: CODEX_INSTANCE, driverKind: 'codex' },
];
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['low', 'medium', 'high'];

const optionOf = (id, values) => ({ id, values });
const offerOf = (id, providerInstanceId, options) => ({ id, providerInstanceId, options });
const claudeOffer = (id, options = [optionOf('effort', CLAUDE_EFFORTS)]) =>
  offerOf(id, CLAUDE_INSTANCE, options);
const codexOffer = (id, options = [optionOf('reasoningEffort', CODEX_EFFORTS)]) =>
  offerOf(id, CODEX_INSTANCE, options);
const CLAUDE_OFFERS = Object.values(T3_PINS).map((id) => claudeOffer(id));
const projectionOf = (models, overrides = {}) => ({
  inheritedProviderInstanceId: CLAUDE_INSTANCE,
  providers: PROVIDERS,
  models,
  ...overrides,
});
const claudeProjection = (models = CLAUDE_OFFERS, overrides) => projectionOf(models, overrides);
const codexProjection = (models = [codexOffer('gpt-6.1-sol'), codexOffer('gpt-5.6-luna')]) =>
  projectionOf(models, { inheritedProviderInstanceId: CODEX_INSTANCE });
const transportRequest = (extra = {}, capabilities = claudeProjection()) => ({
  transport: 't3-delegate',
  capabilities,
  ...extra,
});

async function transportSelect(input, options = T3_OPTIONS) {
  const envelope = await executeOperation('select', input, options);
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.data;
}

async function assertUnavailable(input, reason, extra = {}, options = T3_OPTIONS) {
  const envelope = await executeOperation('select', input, options);
  assert.equal(envelope.ok, false, 'the selection must not resolve');
  assert.equal(envelope.error.code, 'TRANSPORT_UNAVAILABLE');
  assert.deepEqual(envelope.data, { reason, ...extra });
  return envelope;
}

test('a transport selection targets the inherited instance with the pinned catalog ID and the tier effort', async () => {
  const input = transportRequest({
    site: 'apply-issues/nodejs-implementer',
    role: 'nodejs-implementer',
  });
  const selection = await transportSelect(input);

  assert.equal(selection.transport, 't3-delegate');
  assert.equal(selection.defaultTier, 'deep');
  assert.equal(selection.tier, 'deep');
  assert.deepEqual(selection.spawn, {
    target: {
      providerInstanceId: CLAUDE_INSTANCE,
      model: 'claude-opus-5-5',
      options: { effort: 'high' },
    },
  });
  // The pinned catalog ID is the expected model, so a compliance check compares like with like.
  assert.deepEqual(selection.expected, { model: 'claude-opus-5-5', effort: 'high' });
  assert.equal(selection.expected.model, selection.spawn.target.model);
  assert.match(selection.contractDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    Object.keys(selection).sort(),
    ['contractDigest', 'defaultTier', 'expected', 'request', 'spawn', 'tier', 'transport'],
    'a transport selection carries no native role or parameters',
  );
});

test('a transport selection resolves each tier through its own pin', async () => {
  for (const [site, role, tier, model, effort] of [
    ['apply-issues/issue-analysis', undefined, 'standard', 'claude-sonnet-5-5', 'medium'],
    ['apply-issues/nodejs-implementer', 'nodejs-implementer', 'deep', 'claude-opus-5-5', 'high'],
  ]) {
    const selection = await transportSelect(transportRequest({ site, ...(role ? { role } : {}) }));
    assert.equal(selection.tier, tier);
    assert.equal(selection.spawn.target.model, model);
    assert.deepEqual(selection.spawn.target.options, { effort });
  }
  const moved = await transportSelect(
    transportRequest({
      site: 'apply-issues/code-documenter',
      role: 'code-documenter',
      tier: 'mechanical',
      reason: 'Documentation-only edit',
    }),
  );
  assert.equal(moved.defaultTier, 'standard');
  assert.equal(moved.tier, 'mechanical');
  assert.deepEqual(moved.spawn.target, {
    providerInstanceId: CLAUDE_INSTANCE,
    model: 'claude-haiku-5-5',
    options: { effort: 'low' },
  });
});

test('a Codex driver passes its model through unchanged and gets reasoningEffort, not effort', async () => {
  const selection = await transportSelect(
    transportRequest(
      { site: 'apply-issues/nodejs-implementer', role: 'nodejs-implementer' },
      codexProjection(),
    ),
  );
  assert.deepEqual(selection.spawn.target, {
    providerInstanceId: CODEX_INSTANCE,
    model: 'gpt-6.1-sol',
    options: { reasoningEffort: 'high' },
  });
  assert.deepEqual(selection.expected, { model: 'gpt-6.1-sol', effort: 'high' });
  assert.equal(Object.hasOwn(selection.spawn.target.options, 'effort'), false);

  // A renamed instance keeps its own ID: the target is the inherited instance, whatever it is called.
  const renamed = await transportSelect(
    transportRequest(
      { site: 'apply-issues/issue-analysis' },
      projectionOf(
        [offerOf('gpt-5.6-luna', 'codex_personal', [optionOf('reasoningEffort', ['medium'])])],
        {
          inheritedProviderInstanceId: 'codex_personal',
          providers: [{ providerInstanceId: 'codex_personal', driverKind: 'codex' }],
        },
      ),
    ),
  );
  assert.equal(renamed.spawn.target.providerInstanceId, 'codex_personal');
  assert.equal(renamed.spawn.target.model, 'gpt-5.6-luna');
});

test('the request echoes the complete transport input and no derived harness', async () => {
  const input = transportRequest({
    site: 'apply-issues/issue-analysis',
    tier: 'deep',
    reason: 'A structural question the standard tier cannot settle',
    retry: true,
  });
  const selection = await transportSelect(input);
  assert.deepEqual(selection.request, input);
  assert.equal(Object.hasOwn(selection.request, 'harness'), false);
  assert.equal(selection.defaultTier, 'standard');
  assert.equal(selection.tier, 'deep');
  assert.equal(selection.spawn.target.model, 'claude-opus-5-5');

  const fallback = transportRequest({
    fallback: true,
    reason: 'Unmarked commit workflow handoff',
  });
  assert.deepEqual((await transportSelect(fallback)).request, fallback);
});

test('a role-only transport selection takes the role default and applies the tier rules unchanged', async () => {
  const selection = await transportSelect(transportRequest({ role: 'nodejs-implementer' }));
  assert.equal(selection.defaultTier, 'deep');
  assert.equal(selection.spawn.target.model, 'claude-opus-5-5');

  const documenter = await transportSelect(transportRequest({ role: 'code-documenter' }));
  assert.equal(documenter.defaultTier, 'standard');
  assert.equal(documenter.spawn.target.model, 'claude-sonnet-5-5');

  const unknown = await executeOperation(
    'select',
    transportRequest({ role: 'ghost-role' }),
    T3_OPTIONS,
  );
  assert.equal(unknown.error.code, 'INVALID_INPUT');
  // The same policy as a plain select: a deep role never moves down, and a move needs a reason.
  for (const extra of [
    { role: 'nodejs-implementer', tier: 'standard', reason: 'Cheaper please' },
    { role: 'code-documenter', tier: 'mechanical' },
    { role: 'code-documenter', tier: 'mechanical', reason: 'Tiny edit', retry: true },
  ]) {
    const refused = await executeOperation('select', transportRequest(extra), T3_OPTIONS);
    assert.equal(refused.error.code, 'TIER_POLICY', JSON.stringify(extra));
  }
});

test('a transport fallback needs its reason and no site or role, as in a plain select', async () => {
  const selection = await transportSelect(
    transportRequest({ fallback: true, reason: 'Unmarked commit workflow handoff' }),
  );
  assert.equal(selection.defaultTier, 'standard');
  assert.equal(selection.spawn.target.model, 'claude-sonnet-5-5');
  for (const extra of [
    { fallback: true },
    { fallback: true, reason: 'x', site: 'apply-issues/issue-analysis' },
    { fallback: true, reason: 'x', role: 'code-documenter' },
    {},
  ]) {
    const refused = await executeOperation('select', transportRequest(extra), T3_OPTIONS);
    assert.equal(refused.error.code, 'INVALID_INPUT', JSON.stringify(extra));
  }
});

test('a panel transport selection resolves panelModel through its pin or passes a Codex model through', async () => {
  const panel = await transportSelect(
    transportRequest({ site: 'backlog-audit/panel', panelModel: 'fable' }),
  );
  assert.equal(panel.tier, 'deep');
  assert.deepEqual(panel.spawn.target, {
    providerInstanceId: CLAUDE_INSTANCE,
    model: 'claude-fable-5-2',
    options: { effort: 'high' },
  });
  assert.deepEqual(panel.expected, { model: 'claude-fable-5-2', effort: 'high' });

  const codexPanel = await transportSelect(
    transportRequest(
      { site: 'backlog-audit/panel', panelModel: 'gpt-6-astra' },
      codexProjection([codexOffer('gpt-6.1-sol'), codexOffer('gpt-6-astra')]),
    ),
  );
  assert.equal(codexPanel.spawn.target.model, 'gpt-6-astra');

  // The panel member resolves on the same instance, else it is unavailable under its pinned ID.
  await assertUnavailable(
    transportRequest(
      { site: 'backlog-audit/panel', panelModel: 'fable' },
      claudeProjection(CLAUDE_OFFERS.filter((offer) => offer.id !== 'claude-fable-5-2')),
    ),
    'model-not-advertised',
    { model: 'claude-fable-5-2' },
  );
  for (const [extra, code] of [
    [{ site: 'backlog-audit/panel', panelModel: 'sonnet' }, 'TIER_POLICY'],
    [{ site: 'backlog-audit/panel', panelModel: 'opus' }, 'TIER_POLICY'],
    [{ site: 'backlog-audit/panel' }, 'INVALID_INPUT'],
    [{ site: 'apply-issues/issue-analysis', panelModel: 'fable' }, 'INVALID_INPUT'],
    [
      { site: 'backlog-audit/panel', panelModel: 'fable', tier: 'mechanical', reason: 'x' },
      'INVALID_INPUT',
    ],
  ]) {
    const refused = await executeOperation('select', transportRequest(extra), T3_OPTIONS);
    assert.equal(refused.error.code, code, JSON.stringify(extra));
  }
});

test('fastMode false is set exactly where the model offers it, and Fast is never selected', async () => {
  const withFast = await transportSelect(
    transportRequest(
      { site: 'apply-issues/nodejs-implementer', role: 'nodejs-implementer' },
      claudeProjection([
        claudeOffer('claude-opus-5-5', [
          optionOf('effort', CLAUDE_EFFORTS),
          optionOf('fastMode', [false, true]),
        ]),
      ]),
    ),
  );
  assert.deepEqual(withFast.spawn.target.options, { effort: 'high', fastMode: false });

  const withoutFast = await transportSelect(
    transportRequest({ site: 'apply-issues/nodejs-implementer', role: 'nodejs-implementer' }),
  );
  assert.deepEqual(withoutFast.spawn.target.options, { effort: 'high' });
  assert.equal(Object.hasOwn(withoutFast.spawn.target.options, 'fastMode'), false);

  const codexFast = await transportSelect(
    transportRequest(
      { site: 'apply-issues/nodejs-implementer', role: 'nodejs-implementer' },
      codexProjection([
        codexOffer('gpt-6.1-sol', [
          optionOf('reasoningEffort', CODEX_EFFORTS),
          optionOf('fastMode', [true]),
        ]),
      ]),
    ),
  );
  assert.deepEqual(codexFast.spawn.target.options, { reasoningEffort: 'high', fastMode: false });
});

test('a model the inherited instance does not advertise is unavailable, with the pinned ID named', async () => {
  const input = transportRequest({ site: 'apply-issues/issue-analysis' });
  // Short list without the pinned Claude model.
  const withoutSonnet = claudeProjection(
    CLAUDE_OFFERS.filter((offer) => offer.id !== 'claude-sonnet-5-5'),
  );
  await assertUnavailable({ ...input, capabilities: withoutSonnet }, 'model-not-advertised', {
    model: 'claude-sonnet-5-5',
  });
  // The bare alias is no catalog ID: only the pin matches.
  await assertUnavailable(
    { ...input, capabilities: claudeProjection([claudeOffer('sonnet')]) },
    'model-not-advertised',
    { model: 'claude-sonnet-5-5' },
  );
  // Another instance advertising the model offers the inherited instance nothing.
  await assertUnavailable(
    {
      ...input,
      capabilities: claudeProjection([
        offerOf('claude-sonnet-5-5', CODEX_INSTANCE, [optionOf('effort', CLAUDE_EFFORTS)]),
      ]),
    },
    'model-not-advertised',
    { model: 'claude-sonnet-5-5' },
  );
  // A Codex model is looked up under its own ID.
  await assertUnavailable(
    transportRequest(
      { site: 'apply-issues/issue-analysis' },
      codexProjection([codexOffer('gpt-6.1-sol')]),
    ),
    'model-not-advertised',
    { model: 'gpt-5.6-luna' },
  );
});

test('a repeated select with the search-result projection finds a pin the short list lacked', async () => {
  const input = transportRequest(
    { site: 'apply-issues/issue-analysis' },
    claudeProjection(CLAUDE_OFFERS.filter((offer) => offer.id !== 'claude-sonnet-5-5')),
  );
  const first = await assertUnavailable(input, 'model-not-advertised', {
    model: 'claude-sonnet-5-5',
  });
  // The repeat carries the identical input except `capabilities`, and never `retry: true`.
  const searched = {
    ...input,
    capabilities: claudeProjection([claudeOffer(first.data.model)]),
  };
  assert.equal(Object.hasOwn(searched, 'retry'), false);
  const found = await transportSelect(searched);
  assert.equal(found.spawn.target.model, 'claude-sonnet-5-5');
  assert.deepEqual(found.spawn.target.options, { effort: 'medium' });
  assert.deepEqual(found.request, searched);
  assert.equal(found.tier, 'standard');

  // A search that finds nothing is a second miss with the same reason, and it is final.
  await assertUnavailable(
    { ...input, capabilities: claudeProjection([]) },
    'model-not-advertised',
    { model: 'claude-sonnet-5-5' },
  );
});

test('a model that does not offer the tier effort is unavailable', async () => {
  const input = { site: 'apply-issues/nodejs-implementer', role: 'nodejs-implementer' };
  // Deep needs `high`; the model offers only lower efforts.
  await assertUnavailable(
    transportRequest(
      input,
      claudeProjection([claudeOffer('claude-opus-5-5', [optionOf('effort', ['low', 'medium'])])]),
    ),
    'effort-not-offered',
  );
  // No effort option at all, or only the other harness's effort option, is the same refusal.
  for (const options of [[], [optionOf('reasoningEffort', ['high'])]]) {
    await assertUnavailable(
      transportRequest(input, claudeProjection([claudeOffer('claude-opus-5-5', options)])),
      'effort-not-offered',
    );
  }
  await assertUnavailable(
    transportRequest(
      input,
      codexProjection([codexOffer('gpt-6.1-sol', [optionOf('effort', ['high'])])]),
    ),
    'effort-not-offered',
  );
});

test('an offer on another provider instance only is rejected, never adopted', async () => {
  // The inherited Claude instance lists nothing; the Codex instance offers the pinned model.
  await assertUnavailable(
    transportRequest(
      { site: 'apply-issues/issue-analysis' },
      claudeProjection([
        offerOf('claude-sonnet-5-5', CODEX_INSTANCE, [optionOf('effort', CLAUDE_EFFORTS)]),
        codexOffer('gpt-5.6-luna'),
      ]),
    ),
    'model-not-advertised',
    { model: 'claude-sonnet-5-5' },
  );
});

test('an unknown driver or a missing inherited instance is unavailable', async () => {
  const input = { site: 'apply-issues/issue-analysis' };
  await assertUnavailable(
    transportRequest(
      input,
      claudeProjection(CLAUDE_OFFERS, {
        providers: [{ providerInstanceId: CLAUDE_INSTANCE, driverKind: 'opencode' }],
      }),
    ),
    'unknown-driver',
  );
  // The T3 driver kinds are exact: the harness name is no driver kind.
  await assertUnavailable(
    transportRequest(
      input,
      claudeProjection(CLAUDE_OFFERS, {
        providers: [{ providerInstanceId: CLAUDE_INSTANCE, driverKind: 'claude' }],
      }),
    ),
    'unknown-driver',
  );
  await assertUnavailable(
    transportRequest(input, claudeProjection(CLAUDE_OFFERS, { inheritedProviderInstanceId: null })),
    'no-inherited-instance',
  );
  await assertUnavailable(
    transportRequest(
      input,
      claudeProjection(CLAUDE_OFFERS, { inheritedProviderInstanceId: 'unlisted-instance' }),
    ),
    'no-inherited-instance',
  );
  await assertUnavailable(
    transportRequest(input, claudeProjection(CLAUDE_OFFERS, { providers: [] })),
    'no-inherited-instance',
  );
});

test("a contract without t3Pins is unavailable before the projection's offers are evaluated", async () => {
  // Native targets carry no pins, whatever a well-formed projection says.
  for (const contract of [CONTRACT, Object.freeze({ ...CONTRACT, target: 'claude' })]) {
    await assertUnavailable(
      transportRequest({ site: 'apply-issues/issue-analysis' }, codexProjection()),
      'no-t3-pins',
      {},
      { contract },
    );
    await assertUnavailable(
      transportRequest(
        { site: 'apply-issues/issue-analysis' },
        claudeProjection(CLAUDE_OFFERS, { inheritedProviderInstanceId: null }),
      ),
      'no-t3-pins',
      {},
      { contract },
    );
    // The projection is validated first: a malformed one is invalid input, never unavailable.
    const malformed = await executeOperation(
      'select',
      transportRequest(
        { site: 'apply-issues/issue-analysis' },
        { ...codexProjection(), raw: { envelope: true } },
      ),
      { contract },
    );
    assert.equal(malformed.ok, false);
    assert.equal(malformed.error.code, 'INVALID_INPUT');
  }
});

test('invalid input and a tier-policy refusal precede every TRANSPORT_UNAVAILABLE reason with exit code 2', async () => {
  const unknownDriver = claudeProjection(CLAUDE_OFFERS, {
    providers: [{ providerInstanceId: CLAUDE_INSTANCE, driverKind: 'opencode' }],
  });
  const noInstance = claudeProjection(CLAUDE_OFFERS, { inheritedProviderInstanceId: null });
  const noOffer = claudeProjection([]);
  const noEffort = claudeProjection(Object.values(T3_PINS).map((id) => claudeOffer(id, [])));
  const invalid = [
    [{ site: 'ghost/site' }, 'INVALID_INPUT'],
    [{ role: 'ghost-role' }, 'INVALID_INPUT'],
    [{ site: 'apply-issues/issue-analysis', fallback: true, reason: 'x' }, 'INVALID_INPUT'],
    [{ fallback: true }, 'INVALID_INPUT'],
    [{ site: 'apply-issues/issue-analysis', tier: 'ultra', reason: 'x' }, 'INVALID_INPUT'],
    [{ site: 'backlog-audit/panel' }, 'INVALID_INPUT'],
    [{ role: 'nodejs-implementer', tier: 'standard', reason: 'Cheaper please' }, 'TIER_POLICY'],
    [{ role: 'code-documenter', tier: 'mechanical' }, 'TIER_POLICY'],
  ];
  // A panel model the allowlist refuses is a TIER_POLICY refusal once the harness is derived.
  const panelRefused = [
    [{ site: 'backlog-audit/panel', panelModel: 'sonnet' }, 'TIER_POLICY'],
    [{ site: 'backlog-audit/panel', panelModel: 'opus' }, 'TIER_POLICY'],
  ];
  for (const [label, projection, options, unavailable, refused] of [
    ['native contract', codexProjection(), CONTRACT_OPTIONS, ['no-t3-pins'], invalid],
    ['portable contract, unknown driver', unknownDriver, T3_OPTIONS, ['unknown-driver'], invalid],
    [
      'portable contract, no inherited instance',
      noInstance,
      T3_OPTIONS,
      ['no-inherited-instance'],
      invalid,
    ],
    [
      'portable contract, no matching offer',
      noOffer,
      T3_OPTIONS,
      ['model-not-advertised', { model: 'claude-sonnet-5-5' }],
      [...invalid, ...panelRefused],
    ],
    [
      'portable contract, no effort offered',
      noEffort,
      T3_OPTIONS,
      ['effort-not-offered'],
      [...invalid, ...panelRefused],
    ],
  ]) {
    // Valid input on this projection would be unavailable with the row's reason.
    const [reason, reasonData = {}] = unavailable;
    await assertUnavailable(
      transportRequest({ site: 'apply-issues/issue-analysis' }, projection),
      reason,
      reasonData,
      options,
    );
    for (const [extra, code] of refused) {
      const name = `${label}: ${JSON.stringify(extra)}`;
      const result = await cli(
        ['select'],
        JSON.stringify(transportRequest(extra, projection)),
        options,
      );
      assert.equal(result.envelope.error.code, code, name);
      assert.equal(result.exitCode, 2, name);
    }
  }
  // Valid input on a native contract stays no-t3-pins; the panel allowlist depends on the derived
  // harness, so it is checked only after availability.
  for (const extra of [
    { site: 'apply-issues/issue-analysis' },
    { site: 'backlog-audit/panel', panelModel: 'sonnet' },
  ]) {
    await assertUnavailable(
      transportRequest(extra, codexProjection()),
      'no-t3-pins',
      {},
      CONTRACT_OPTIONS,
    );
  }
});

test('the contract validator requires t3Pins exactly on a portable contract with exactly the derived aliases', async () => {
  const input = transportRequest({ site: 'apply-issues/issue-analysis' });
  const { t3Pins: _pins, ...withoutPins } = T3_CONTRACT;
  const aliasSet = Object.keys(T3_PINS);
  const cases = {
    'a native Codex contract with t3Pins': { ...CONTRACT, t3Pins: T3_PINS },
    'a native Claude contract with t3Pins': { ...CONTRACT, target: 'claude', t3Pins: T3_PINS },
    'a portable contract without t3Pins': withoutPins,
    'an extra pin': { ...T3_CONTRACT, t3Pins: { ...T3_PINS, gpt: 'gpt-catalog-1' } },
    'a missing tier pin': {
      ...T3_CONTRACT,
      t3Pins: Object.fromEntries(Object.entries(T3_PINS).filter(([alias]) => alias !== 'sonnet')),
    },
    'a missing panel pin': {
      ...T3_CONTRACT,
      t3Pins: Object.fromEntries(Object.entries(T3_PINS).filter(([alias]) => alias !== 'fable')),
    },
    'a pin value with a space': { ...T3_CONTRACT, t3Pins: { ...T3_PINS, opus: 'claude opus' } },
    'an empty pin value': { ...T3_CONTRACT, t3Pins: { ...T3_PINS, opus: '' } },
    'a non-string pin value': { ...T3_CONTRACT, t3Pins: { ...T3_PINS, opus: 5 } },
    'an oversized pin value': { ...T3_CONTRACT, t3Pins: { ...T3_PINS, opus: 'a'.repeat(129) } },
    'a pin object that is an array': { ...T3_CONTRACT, t3Pins: aliasSet },
  };
  for (const [name, contract] of Object.entries(cases)) {
    for (const [operation, request] of [
      ['select', input],
      ['select', { harness: 'claude', site: 'apply-issues/issue-analysis' }],
    ]) {
      const envelope = await executeOperation(operation, request, { contract });
      assert.equal(envelope.ok, false, name);
      assert.equal(envelope.error.code, 'INVALID_CONTRACT', name);
    }
  }
});

test('a transport selection refuses harness, native, unknown fields and a wrong transport name', async () => {
  const base = { site: 'apply-issues/issue-analysis' };
  for (const [name, input] of Object.entries({
    harness: transportRequest({ ...base, harness: 'claude' }),
    native: transportRequest({ ...base, native: true }),
    'harness and native': transportRequest({ ...base, harness: 'claude', native: false }),
    'unknown field': transportRequest({ ...base, extra: true }),
    'unknown transport': { ...transportRequest(base), transport: 't3-other' },
    'non-string transport': { ...transportRequest(base), transport: true },
    'missing capabilities': { transport: 't3-delegate', ...base },
    'null capabilities': transportRequest(base, null),
    'array capabilities': transportRequest(base, []),
    'mistyped retry': transportRequest({ ...base, retry: 'yes' }),
    'mistyped site': transportRequest({ site: 5 }),
  })) {
    const envelope = await executeOperation('select', input, T3_OPTIONS);
    assert.equal(envelope.ok, false, name);
    assert.equal(envelope.error.code, 'INVALID_INPUT', name);
  }
});

test('the capabilities projection rejects raw envelopes, wrong types and every unbounded field', async () => {
  const base = { site: 'apply-issues/issue-analysis' };
  const repeated = (count, make) => Array.from({ length: count }, (_, index) => make(index));
  const ok = (overrides) => claudeProjection(CLAUDE_OFFERS, overrides);
  const model = (overrides) => ({ ...claudeOffer('claude-sonnet-5-5'), ...overrides });
  for (const [name, capabilities] of Object.entries({
    'an extra top-level field (raw envelope)': { ...ok(), providerDetails: {} },
    'an inherited instance that is not a string': ok({ inheritedProviderInstanceId: 5 }),
    'an over-long inherited instance': ok({ inheritedProviderInstanceId: 'x'.repeat(129) }),
    'providers not an array': ok({ providers: { providerInstanceId: CLAUDE_INSTANCE } }),
    'models not an array': ok({ models: 'claude-sonnet-5-5' }),
    'too many providers': ok({
      providers: repeated(33, (index) => ({
        providerInstanceId: `p${index}`,
        driverKind: 'codex',
      })),
    }),
    'a repeated provider instance': ok({ providers: [PROVIDERS[0], PROVIDERS[0]] }),
    'a provider with an extra field': ok({ providers: [{ ...PROVIDERS[0], enabled: true }] }),
    'a provider without a driver kind': ok({
      providers: [{ providerInstanceId: CLAUDE_INSTANCE }],
    }),
    'too many models': ok({
      models: repeated(257, (index) => claudeOffer(`model-${index}`)),
    }),
    'a repeated model on one instance': ok({ models: [model(), model()] }),
    'a model with an extra field': ok({ models: [model({ displayName: 'Sonnet' })] }),
    'a model id that is not a string': ok({ models: [model({ id: 7 })] }),
    'an over-long model id': ok({ models: [model({ id: 'm'.repeat(129) })] }),
    'a control character in a model id': ok({ models: [model({ id: 'claude\nsonnet' })] }),
    'options not an array': ok({ models: [model({ options: {} })] }),
    'too many options': ok({
      models: [model({ options: repeated(17, (index) => optionOf(`option-${index}`, ['a'])) })],
    }),
    'a repeated option': ok({
      models: [model({ options: [optionOf('effort', ['low']), optionOf('effort', ['high'])] })],
    }),
    'an option with an extra field': ok({
      models: [model({ options: [{ id: 'effort', values: ['low'], label: 'Effort' }] })],
    }),
    'option values not an array': ok({
      models: [model({ options: [{ id: 'effort', values: 'low' }] })],
    }),
    'a numeric option value': ok({ models: [model({ options: [optionOf('effort', [3])] })] }),
    'an object option value': ok({ models: [model({ options: [optionOf('effort', [{}])] })] }),
    'a null option value': ok({ models: [model({ options: [optionOf('effort', [null])] })] }),
    'too many option values': ok({
      models: [
        model({
          options: [
            optionOf(
              'effort',
              repeated(33, (index) => `v${index}`),
            ),
          ],
        }),
      ],
    }),
  })) {
    const envelope = await executeOperation(
      'select',
      { transport: 't3-delegate', ...base, capabilities },
      T3_OPTIONS,
    );
    assert.equal(envelope.ok, false, name);
    assert.equal(envelope.error.code, 'INVALID_INPUT', name);
  }
});

// A projection of padded models whose serialized size is as close to the bound as one more model
// allows; `over` is the same list with that one more model.
function projectionAtBound() {
  const pad = (index) =>
    claudeOffer(`padding-${String(index).padStart(4, '0')}-${'x'.repeat(100)}`);
  const models = [...CLAUDE_OFFERS];
  const size = (list) => Buffer.byteLength(JSON.stringify(claudeProjection(list)), 'utf8');
  for (let index = 0; ; index += 1) {
    const next = [...models, pad(index)];
    if (size(next) > MAX_CAPABILITIES_BYTES) return { models, over: next, size: size(models) };
    models.push(pad(index));
  }
}

test('the projection size bound is exact and a bound-sized selection still verifies within stdin', async () => {
  const { models, over, size } = projectionAtBound();
  assert.ok(models.length < 256, 'the size bound, not the model-count bound, ends the list');
  assert.ok(size <= MAX_CAPABILITIES_BYTES && size > MAX_CAPABILITIES_BYTES - 256);

  const input = transportRequest({ site: 'apply-issues/issue-analysis' }, claudeProjection(models));
  const selected = await cli(['select'], JSON.stringify(input), T3_OPTIONS);
  assert.equal(selected.exitCode, 0, selected.stderr);
  assert.equal(selected.envelope.ok, true);
  assert.deepEqual(selected.envelope.data.request, input);

  // Echoing the whole selection, projection included, leaves room inside the stdin bound.
  const verifyPayload = JSON.stringify({ selection: selected.envelope.data });
  assert.ok(Buffer.byteLength(verifyPayload) > MAX_CAPABILITIES_BYTES);
  assert.ok(Buffer.byteLength(verifyPayload) < MAX_STDIN_BYTES);
  const verified = await cli(['verify'], verifyPayload, T3_OPTIONS);
  assert.equal(verified.envelope.error.code, 'UNVERIFIED');
  assert.deepEqual(verified.envelope.data, { status: 'unverified' });
  assert.equal(verified.exitCode, 1);

  const refused = await cli(
    ['select'],
    JSON.stringify(
      transportRequest({ site: 'apply-issues/issue-analysis' }, claudeProjection(over)),
    ),
    T3_OPTIONS,
  );
  assert.equal(refused.envelope.error.code, 'INVALID_INPUT');
  assert.match(refused.envelope.error.message, /size bound/);
  assert.equal(refused.exitCode, 2);
});

test('verify on a transport selection returns UNVERIFIED without handles, with handles and with rollout evidence', async (t) => {
  const request = { site: 'apply-issues/nodejs-implementer', role: 'nodejs-implementer' };
  const selection = await transportSelect(transportRequest(request, codexProjection()));
  const unverified = async (input) => {
    const envelope = await executeOperation('verify', input, T3_OPTIONS);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'UNVERIFIED');
    assert.deepEqual(envelope.data, { status: 'unverified' });
  };

  await unverified({ selection });
  await unverified({ selection, ...SIMPLE_IDS });
  await unverified({ selection, ...ENCODED_IDS });

  // A rollout that matches the expected model and effort proves nothing for a transport selection,
  // which no runtime adapter reads, while the same rollout verifies a plain Codex selection.
  const evidence = await syntheticRollout(t, [
    rolloutIdentity(SIMPLE_IDS),
    rolloutTurn({ model: 'gpt-6.1-sol', effort: 'high' }),
  ]);
  await unverified({ selection, ...SIMPLE_IDS, evidence });
  await unverified({ selection, evidence });
  const plain = await executeOperation('select', { harness: 'codex', ...request }, T3_OPTIONS);
  const control = await executeOperation(
    'verify',
    { selection: plain.data, ...SIMPLE_IDS, evidence },
    T3_OPTIONS,
  );
  assert.equal(control.ok, true);
  assert.equal(control.data.status, 'verified');
});

test('verify on a transport selection still checks handles, selection integrity and the contract pins', async () => {
  const selection = await transportSelect(
    transportRequest({ site: 'apply-issues/issue-analysis' }),
  );
  // Handles that are present stay bounded and distinct.
  for (const input of [
    { selection, parentId: 'same', childId: 'same' },
    { selection, parentId: 'only-parent' },
    { selection, parentId: 'bad parent', childId: 'child' },
  ]) {
    const envelope = await executeOperation('verify', input, T3_OPTIONS);
    assert.equal(envelope.error.code, 'INVALID_INPUT', JSON.stringify(input));
  }
  // Evidence of an unsupported shape is rejected before the transport shortcut.
  const badEvidence = await executeOperation(
    'verify',
    { selection, evidence: { kind: 'codex-rollout', path: '/tmp/x', extra: true } },
    T3_OPTIONS,
  );
  assert.equal(badEvidence.error.code, 'INVALID_INPUT');
  // A tampered target is not the recomputed selection.
  const tampered = structuredClone(selection);
  tampered.spawn.target.model = 'claude-opus-5-5';
  const tamperedEnvelope = await executeOperation('verify', { selection: tampered }, T3_OPTIONS);
  assert.equal(tamperedEnvelope.error.code, 'INVALID_SELECTION');
  // A selection recorded under other pins no longer matches: the digest covers the pins.
  const repinned = {
    contract: { ...T3_CONTRACT, t3Pins: { ...T3_PINS, sonnet: 'claude-sonnet-5-6' } },
  };
  const stale = await executeOperation('verify', { selection }, repinned);
  assert.equal(stale.error.code, 'INVALID_SELECTION');
  // A transport selection never verifies on a native contract.
  const native = await executeOperation('verify', { selection }, CLAUDE_CONTRACT_OPTIONS);
  assert.equal(native.error.code, 'INVALID_SELECTION');
});

test('fast with a transport key is rejected as invalid input with exit code 2', async () => {
  const input = {
    harness: 'claude',
    site: 'apply-issues/nodejs-implementer',
    transport: 't3-delegate',
  };
  const envelope = await executeOperation('fast', input, T3_OPTIONS);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  const result = await cli(['fast'], JSON.stringify(input), T3_OPTIONS);
  assert.equal(result.exitCode, 2);
  assert.equal(result.envelope.error.code, 'INVALID_INPUT');
  assert.match(result.stderr, /^INVALID_INPUT:/);
  // A transport-only request has no harness and so never reaches a Fast lookup either.
  const transportOnly = await executeOperation(
    'fast',
    transportRequest({ site: 'apply-issues/nodejs-implementer' }),
    T3_OPTIONS,
  );
  assert.equal(transportOnly.error.code, 'INVALID_INPUT');
});

test('the CLI reports TRANSPORT_UNAVAILABLE with its reason, the model and exit code 3', async () => {
  for (const [name, input, options, reason, extra] of [
    [
      'model not advertised',
      transportRequest({ site: 'apply-issues/issue-analysis' }, claudeProjection([])),
      T3_OPTIONS,
      'model-not-advertised',
      { model: 'claude-sonnet-5-5' },
    ],
    [
      'effort not offered',
      transportRequest(
        { site: 'apply-issues/issue-analysis' },
        claudeProjection([claudeOffer('claude-sonnet-5-5', [])]),
      ),
      T3_OPTIONS,
      'effort-not-offered',
      {},
    ],
    [
      'unknown driver',
      transportRequest(
        { site: 'apply-issues/issue-analysis' },
        claudeProjection(CLAUDE_OFFERS, {
          providers: [{ providerInstanceId: CLAUDE_INSTANCE, driverKind: 'opencode' }],
        }),
      ),
      T3_OPTIONS,
      'unknown-driver',
      {},
    ],
    [
      'no inherited instance',
      transportRequest(
        { site: 'apply-issues/issue-analysis' },
        claudeProjection(CLAUDE_OFFERS, { inheritedProviderInstanceId: null }),
      ),
      T3_OPTIONS,
      'no-inherited-instance',
      {},
    ],
    [
      'no t3 pins on a native build',
      transportRequest({ site: 'apply-issues/issue-analysis' }, codexProjection()),
      CONTRACT_OPTIONS,
      'no-t3-pins',
      {},
    ],
  ]) {
    const result = await cli(['select'], JSON.stringify(input), options);
    assert.equal(result.exitCode, 3, name);
    assert.equal(result.envelope.ok, false, name);
    assert.equal(result.envelope.error.code, 'TRANSPORT_UNAVAILABLE', name);
    assert.deepEqual(result.envelope.data, { reason, ...extra }, name);
    assert.ok(result.envelope.error.message.length > 0, name);
    assert.equal(result.stdout, `${JSON.stringify(result.envelope)}\n`, name);
    assert.equal(result.stderr, `TRANSPORT_UNAVAILABLE: ${result.envelope.error.message}\n`, name);
  }
  // Exit code 3 belongs to TRANSPORT_UNAVAILABLE alone: other refusals keep theirs.
  const invalid = await cli(
    ['select'],
    JSON.stringify(transportRequest({ site: 'apply-issues/issue-analysis', harness: 'claude' })),
    T3_OPTIONS,
  );
  assert.equal(invalid.exitCode, 2);
  const brokenContract = await cli(
    ['select'],
    JSON.stringify(transportRequest({ site: 'apply-issues/issue-analysis' })),
    { contract: { ...T3_CONTRACT, t3Pins: {} } },
  );
  assert.equal(brokenContract.exitCode, 1);
  assert.equal(brokenContract.envelope.error.code, 'INVALID_CONTRACT');
  const success = await cli(
    ['select'],
    JSON.stringify(transportRequest({ site: 'apply-issues/issue-analysis' })),
    T3_OPTIONS,
  );
  assert.equal(success.exitCode, 0);
  assert.equal(success.stderr, '');
  assert.equal(success.stdout.split('\n').filter(Boolean).length, 1);
});

test('plain select output is unchanged by the transport path, except the portable contract digest', async () => {
  // The digest of a native contract has no t3Pins term, so it stays what the base commit computed.
  const NATIVE_DIGEST = '0e816d093c3cc1f6a1899b41c07627d3189ee2b9096727bd5f925188681c3432';
  const native = await executeOperation(
    'select',
    { harness: 'codex', site: 'apply-issues/issue-analysis' },
    CONTRACT_OPTIONS,
  );
  assert.equal(native.data.contractDigest, NATIVE_DIGEST);
  assert.deepEqual(native.data, {
    request: { harness: 'codex', site: 'apply-issues/issue-analysis' },
    contractDigest: NATIVE_DIGEST,
    defaultTier: 'standard',
    tier: 'standard',
    expected: { model: 'gpt-5.6-luna', effort: 'medium' },
    spawn: { role: null, parameters: { model: 'gpt-5.6-luna', reasoning_effort: 'medium' } },
  });
  const portable = await executeOperation(
    'select',
    { harness: 'claude', role: 'nodejs-implementer' },
    T3_OPTIONS,
  );
  assert.deepEqual(
    { ...portable.data, contractDigest: undefined },
    {
      request: { harness: 'claude', role: 'nodejs-implementer' },
      contractDigest: undefined,
      defaultTier: 'deep',
      tier: 'deep',
      expected: { model: 'opus', effort: 'high' },
      spawn: { role: 'nodejs-implementer', parameters: { model: 'opus', effort: 'high' } },
    },
    'a harness select on the portable contract names the alias and no transport target',
  );
  assert.notEqual(portable.data.contractDigest, NATIVE_DIGEST);
});
