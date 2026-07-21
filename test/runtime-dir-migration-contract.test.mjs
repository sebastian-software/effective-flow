import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBody, findRuntimeDirMigrationViolations, renderBody } from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const SHARED_DIR = join(SOURCE_DIR, 'shared');

const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const migrationContract = readSource('shared', 'effective-flow-dir-migration.md').trim();
const toolNames = readdirSync(TOOLS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -3));
const agentNames = readdirSync(AGENTS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -3));
const renderConfig = {
  exposedTools: toolNames,
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: new Set(toolNames),
  knownAgents: new Set(agentNames),
};

function collectRuntimeSources() {
  const sources = new Map();
  for (const tool of toolNames.sort()) {
    sources.set(`tools/${tool}.md`, extractBody(readSource('tools', `${tool}.md`)));
  }
  for (const agent of agentNames.sort()) {
    sources.set(`agents/${agent}.md`, extractBody(readSource('agents', `${agent}.md`)));
  }
  for (const file of readdirSync(SHARED_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    sources.set(`shared/${file}`, readSource('shared', file));
  }
  return sources;
}

const contractScenarios = [
  {
    name: 'partial target with transitional config and missing runtime entries',
    clauses: [
      /Merely finding `\.effective-flow\/` does not prove that migration ran/,
      /missing marker starts the migration scan even when\s+`\.effective-flow\/` already contains a transitional `config\.json`/,
      /copy only missing files/,
      /including `cache\.json`, report or investigation trees, and wisdom\s+files/,
      /an existing target\s+path wins/,
    ],
  },
  {
    name: 'recursive memory conflicts and missing nested keys',
    clauses: [
      /recursively adding only keys absent from that\s+freshest\s+base/,
      /At every scalar, array, object, or type conflict preserve the base value/,
      /Never reduce or\s+replace\s+existing counters, migration markers, status, or unrelated fields/,
    ],
  },
  {
    name: 'whole-source precedence',
    clauses: [
      /Use the whole `<RUNTIME_STATE_ROOT>\/\.firmo\/` tree when\s+it exists; otherwise use `<RUNTIME_STATE_ROOT>\/\.sf-plugin\/`/,
      /If both exist, do\s+not combine them/,
    ],
  },
  {
    name: 'no legacy source and rerun idempotency',
    clauses: [
      /If neither exists, proceed directly to the final marker update as part\s+of the already-authorized first runtime write/,
      /Once version `1` is present, later prerequisites skip the legacy\s+scan and are idempotent/,
    ],
  },
  {
    name: 'blocked or incomplete merge leaves no marker',
    clauses: [
      /invalid\s+JSON[\s\S]*leave the completion marker unset/,
      /A copy, read, or guard failure stops the merge,\s+leaves the marker unset/,
      /The marker is the final migration mutation and is written only after\s+all safe carry-over work succeeds/,
    ],
  },
  {
    name: 'legacy worktrees remain excluded',
    clauses: [
      /except for the entire `\.worktrees\/` subtree/,
      /legacy worktrees are path-registered\s+and remain only in the legacy directory/,
    ],
  },
  {
    name: 'concurrent target memory uses the shared lock',
    clauses: [
      /```include\s+memory-state\s+```/,
      /Inside its lock,\s+select the retained absolute\s+`<RUNTIME_STATE_ROOT>\/\.effective-flow\/memory\.json` handle or a\s+valid unchanged `<RUNTIME_STATE_ROOT>\/\.sf-memory\.json` as the base/,
      /do not introduce a migration-specific lock or direct writer/,
    ],
  },
];

for (const scenario of contractScenarios) {
  test(`runtime-directory migration contract covers ${scenario.name}`, () => {
    for (const clause of scenario.clauses) assert.match(migrationContract, clause);
  });
}

test('all checked-in runtime writers establish migration before their first mutation', () => {
  assert.deepEqual(findRuntimeDirMigrationViolations(collectRuntimeSources()), []);
});

test('native and portable renders preserve the same migration marker and behavior clauses', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(`${migrationContract}\n`, harness, {
      ...renderConfig,
      context: `shared/effective-flow-dir-migration.md (${harness})`,
    });

    assert.match(rendered, /runtimeMigration\.directory\.version: 1/);
    assert.match(rendered, /Use the whole `<RUNTIME_STATE_ROOT>\/\.firmo\/` tree/);
    assert.match(rendered, /Inside its lock,\s+select the retained absolute/);
    assert.match(
      rendered,
      /Never scan or mutate a legacy\/current\s+runtime tree below a linked execution worktree/,
    );
    assert.match(rendered, /except for the entire `\.worktrees\/` subtree/);
    assert.doesNotMatch(rendered, /\{\{(?:SKILL|AGENT):/);
  }
});
