import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { main as runCli } from '../src/scripts/model-selection.mjs';
import { executeOperation } from '../src/scripts/model-selection-core.mjs';

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
  roles: {
    'code-documenter': 'standard',
    'nodejs-implementer': 'deep',
  },
  sites: [
    {
      id: 'apply-issues/issue-analysis',
      downAllowed: true,
      clauses: [{ role: null, tier: 'standard' }],
    },
    {
      id: 'apply-issues/code-documenter',
      downAllowed: true,
      clauses: [{ role: 'code-documenter', tier: 'standard' }],
    },
    {
      id: 'apply-issues/nodejs-implementer',
      downAllowed: false,
      clauses: [{ role: 'nodejs-implementer', tier: 'deep' }],
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
