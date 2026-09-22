import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseNativeAgentInventory, reconcileNativeAgentInventories } from '../build-lib.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT_DIR, 'scripts/native-agent-inventory.mjs');
const FAILURE = 'Native agent inventory validation failed\n';

function inventory(harness, { baseWorkers = ['effective-flow-alpha'], fastWorkers = [] } = {}) {
  return { schemaVersion: 1, harness, baseWorkers, fastWorkers };
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function createFixture(root) {
  const claudeInventory = inventory('claude', {
    fastWorkers: ['effective-flow-alpha-fast'],
  });
  const codexInventory = inventory('codex');
  const claudeInventoryPath = join(root, 'claude/native-agent-inventory.json');
  const codexInventoryPath = join(root, 'codex/native-agent-inventory.json');
  const claudeAgents = join(root, 'claude-agents');
  const codexAgents = join(root, 'codex-agents');
  mkdirSync(dirname(claudeInventoryPath), { recursive: true });
  mkdirSync(dirname(codexInventoryPath), { recursive: true });
  mkdirSync(claudeAgents, { recursive: true });
  mkdirSync(codexAgents, { recursive: true });
  writeFileSync(claudeInventoryPath, canonical(claudeInventory));
  writeFileSync(codexInventoryPath, canonical(codexInventory));
  writeFileSync(
    join(claudeAgents, 'effective-flow-alpha.md'),
    '---\nname: effective-flow-alpha\n---\nbase\n',
  );
  writeFileSync(
    join(claudeAgents, 'effective-flow-alpha-fast.md'),
    '---\nname: effective-flow-alpha-fast\n---\nfast\n',
  );
  writeFileSync(join(codexAgents, 'effective-flow-alpha.toml'), 'name = "effective-flow-alpha"\n');
  return {
    claudeInventory,
    codexInventory,
    claudeInventoryPath,
    codexInventoryPath,
    claudeAgents,
    codexAgents,
  };
}

function runCli(fixture, args) {
  return spawnSync(
    process.execPath,
    [
      CLI,
      ...(args ?? [
        'validate',
        fixture.claudeInventoryPath,
        fixture.claudeAgents,
        fixture.codexInventoryPath,
        fixture.codexAgents,
      ]),
    ],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    },
  );
}

test('parseNativeAgentInventory accepts only the canonical schema-1 bytes', () => {
  const expected = inventory('claude', {
    baseWorkers: ['effective-flow-alpha', 'effective-flow-beta'],
    fastWorkers: ['effective-flow-alpha-fast'],
  });
  assert.deepEqual(parseNativeAgentInventory(canonical(expected)), expected);
  assert.deepEqual(parseNativeAgentInventory(Buffer.from(canonical(expected))), expected);

  for (const [content, diagnostic] of [
    [canonical({ ...expected, schemaVersion: 2 }), /schemaVersion must be 1/],
    [canonical({ ...expected, extra: true }), /keys must be exactly/],
    [
      canonical({
        harness: expected.harness,
        schemaVersion: expected.schemaVersion,
        baseWorkers: expected.baseWorkers,
        fastWorkers: expected.fastWorkers,
      }),
      /keys must be exactly.*canonical order/,
    ],
    [canonical({ ...expected, baseWorkers: 'effective-flow-alpha' }), /must be an array/],
    [
      canonical({ ...expected, baseWorkers: ['effective-flow-beta', 'effective-flow-alpha'] }),
      /sorted and unique/,
    ],
    [
      canonical({ ...expected, baseWorkers: ['effective-flow-alpha', 'effective-flow-alpha'] }),
      /sorted and unique/,
    ],
    [canonical({ ...expected, fastWorkers: ['effective-flow-alpha'] }), /must be disjoint/],
    [canonical(expected).trimEnd(), /bytes are not canonical/],
    [`${canonical(expected)}\n`, /bytes are not canonical/],
  ]) {
    assert.throws(() => parseNativeAgentInventory(content, { context: 'fixture' }), diagnostic);
  }
});

test('reconcileNativeAgentInventories enforces cross-target and artifact agreement', () => {
  const claude = inventory('claude', { fastWorkers: ['effective-flow-alpha-fast'] });
  const codex = inventory('codex');
  assert.deepEqual(
    reconcileNativeAgentInventories(claude, codex, {
      claudeArtifacts: [
        { name: 'effective-flow-alpha.md', declaredName: 'effective-flow-alpha' },
        {
          name: 'effective-flow-alpha-fast.md',
          declaredName: 'effective-flow-alpha-fast',
        },
      ],
      codexArtifacts: [{ name: 'effective-flow-alpha.toml', declaredName: 'effective-flow-alpha' }],
    }),
    {
      baseWorkers: ['effective-flow-alpha'],
      claudeFastWorkers: ['effective-flow-alpha-fast'],
    },
  );

  assert.throws(
    () =>
      reconcileNativeAgentInventories(
        claude,
        inventory('codex', {
          baseWorkers: ['effective-flow-beta'],
        }),
      ),
    /disagree on baseWorkers/,
  );
  assert.throws(
    () =>
      reconcileNativeAgentInventories(
        claude,
        inventory('codex', { fastWorkers: ['effective-flow-alpha-fast'] }),
      ),
    /Codex native inventory must not list Fast sidecars/,
  );
  assert.throws(
    () =>
      reconcileNativeAgentInventories(
        inventory('claude', { fastWorkers: ['effective-flow-orphan-fast'] }),
        codex,
      ),
    /has no declared base worker/,
  );
  assert.throws(
    () =>
      reconcileNativeAgentInventories(claude, codex, {
        claudeArtifacts: ['effective-flow-alpha.md'],
        codexArtifacts: ['effective-flow-alpha.toml'],
      }),
    /Claude native artifacts do not match the inventory/,
  );
  assert.throws(
    () =>
      reconcileNativeAgentInventories(claude, codex, {
        claudeArtifacts: [
          { name: 'effective-flow-alpha.md', declaredName: 'effective-flow-wrong' },
          {
            name: 'effective-flow-alpha-fast.md',
            declaredName: 'effective-flow-alpha-fast',
          },
        ],
        codexArtifacts: ['effective-flow-alpha.toml'],
      }),
    /declaration does not match its filename/,
  );
});

test('the inventory CLI is silent on success and stable, non-echoing on every failure class', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-native-inventory-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const successFixture = createFixture(join(sandbox, 'success'));
  const success = runCli(successFixture);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stdout, '');
  assert.equal(success.stderr, '');

  const cases = [
    {
      name: 'usage',
      mutate: () => {},
      args: ['validate'],
    },
    {
      name: 'read',
      mutate: (fixture) => rmSync(fixture.claudeInventoryPath),
    },
    {
      name: 'schema',
      mutate: (fixture) =>
        writeFileSync(
          fixture.claudeInventoryPath,
          canonical({ ...fixture.claudeInventory, schemaVersion: 2 }),
        ),
    },
    {
      name: 'wrong keys',
      mutate: (fixture) =>
        writeFileSync(
          fixture.claudeInventoryPath,
          canonical({ ...fixture.claudeInventory, unexpected: 'do-not-echo' }),
        ),
    },
    {
      name: 'wrong types',
      mutate: (fixture) =>
        writeFileSync(
          fixture.claudeInventoryPath,
          canonical({ ...fixture.claudeInventory, baseWorkers: 'do-not-echo' }),
        ),
    },
    {
      name: 'canonical bytes',
      mutate: (fixture) =>
        writeFileSync(
          fixture.claudeInventoryPath,
          `${canonical(fixture.claudeInventory)}do-not-echo`,
        ),
    },
    {
      name: 'reconciliation',
      mutate: (fixture) =>
        writeFileSync(join(fixture.claudeAgents, 'effective-flow-unlisted.md'), 'do-not-echo'),
    },
  ];

  for (const entry of cases) {
    const fixture = createFixture(join(sandbox, entry.name.replaceAll(' ', '-')));
    entry.mutate(fixture);
    const beforeCodex = readdirSync(fixture.codexAgents).sort();
    const result = runCli(fixture, entry.args);
    assert.equal(result.status, 1, `${entry.name}: ${result.stdout}${result.stderr}`);
    assert.equal(result.stdout, '', `${entry.name}: stdout must remain empty`);
    assert.equal(result.stderr, FAILURE, `${entry.name}: stable stderr diagnostic`);
    assert.doesNotMatch(result.stderr, /do-not-echo/);
    assert.deepEqual(readdirSync(fixture.codexAgents).sort(), beforeCodex);
    if (entry.name !== 'read') {
      assert.equal(
        readFileSync(fixture.codexInventoryPath, 'utf8'),
        canonical(fixture.codexInventory),
      );
    }
  }
});
