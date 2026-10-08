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
const cleanupTool = readSource('tools', 'cleanup.md');
const setupTool = readSource('tools', 'setup.md');
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
      /legacy worktrees[^.]{0,40}\s+and remain only in the legacy directory/,
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

// Invariant: migration copies only missing state, never replaces target state, and writes its marker last.
for (const scenario of contractScenarios) {
  test(`runtime-directory migration contract covers ${scenario.name}`, () => {
    for (const clause of scenario.clauses) assert.match(migrationContract, clause);
  });
}

// Invariant: every runtime writer runs the migration prerequisite before its first mutation.
test('all checked-in runtime writers establish migration before their first mutation', () => {
  assert.deepEqual(findRuntimeDirMigrationViolations(collectRuntimeSources()), []);
});

// Invariant: cleanup defers the migration prerequisite, and the `memory-state` contract it nests,
// to the two decision points that need it: Phase 1 step 6, whose pointer arm names both predicates
// that step decides from core text (a legacy runtime directory exists, the marker is missing), and
// the forge contract's one-time `labelMigration.sf` marker write, which reaches `memory.json`
// during the Phase 1 label inventory before step 6 runs. The pointer stays at the former include
// position, after the lazy runtime-state guard and before any cleanup runtime mutation, so the
// ordered migration guard above still sees it first; no eager copy may remain beside it.
test('cleanup loads the migration prerequisite at the marker check and the first tracker write', () => {
  const pointer = cleanupTool.match(
    /```lazy-include\neffective-flow-dir-migration\nwhen: ([^\n]+)\n```/,
  );
  assert.ok(pointer, 'cleanup must carry a lazy pointer to effective-flow-dir-migration');
  const when = pointer[1];
  assert.match(when, /Phase 1 step 6/);
  assert.match(when, /at least one legacy runtime directory/);
  assert.match(when, /no valid `runtimeMigration\.directory\.version: 1` marker/);
  assert.match(
    when,
    /a remote tracker access is about to perform its first runtime-state mutation/,
  );
  assert.match(when, /`labelMigration\.sf` marker/);
  assert.doesNotMatch(cleanupTool, /```include\neffective-flow-dir-migration\n```/);

  const guardPointer = cleanupTool.search(/```lazy-include\nruntime-state-safety\n/);
  assert.ok(guardPointer !== -1, 'cleanup must keep its lazy runtime-state guard pointer');
  assert.ok(pointer.index > guardPointer, 'the migration pointer must follow the runtime guard');
  assert.ok(
    pointer.index < cleanupTool.indexOf('## Workflow'),
    'the migration pointer must precede every workflow phase',
  );

  const stepSix = cleanupTool.indexOf('6. If at least one legacy runtime directory exists, read');
  assert.ok(stepSix !== -1, 'Phase 1 step 6 must keep its legacy-directory predicate in core');
  assert.ok(
    cleanupTool.indexOf('runtimeMigration.directory.version', stepSix) > stepSix,
    'Phase 1 step 6 must keep its marker predicate in core',
  );
});

test('cleanup triggers the shared migration after inventory and refreshes evidence', () => {
  const initialInventory = cleanupTool.indexOf(
    'Capture the existing legacy remnants in the project root',
  );
  const markerCheck = cleanupTool.indexOf(
    'runtimeMigration.directory.version',
    initialInventory + 1,
  );
  const sharedTrigger = cleanupTool.indexOf(
    'invoke the loaded shared runtime-directory migration prerequisite exactly as written',
    markerCheck + 1,
  );
  const refreshedInventory = cleanupTool.indexOf(
    'repeat the legacy-runtime, counterpart, legacy-config, and nested-worktree',
    sharedTrigger + 1,
  );

  assert.ok(initialInventory !== -1, 'cleanup must first inventory legacy remnants');
  assert.ok(markerCheck > initialInventory, 'cleanup must check the marker after inventory');
  assert.ok(
    sharedTrigger > markerCheck,
    'cleanup must invoke the shared migration after the check',
  );
  assert.ok(
    refreshedInventory > sharedTrigger,
    'cleanup must refresh migration-dependent evidence after success',
  );
  assert.match(
    cleanupTool,
    /Do not invoke the prerequisite when no legacy runtime directory exists[\s\S]*creates no runtime footprint/,
  );
  assert.match(
    cleanupTool,
    /if any guard, source inventory, copy, memory validation, lock, or marker write fails[\s\S]*do not offer any runtime directory for deletion/,
  );
  assert.doesNotMatch(cleanupTool, /normal tool run triggers the migration/);
});

// Invariant: an unselected legacy source is never released for deletion by the marker.
test('cleanup keeps simultaneous unselected legacy source separate', () => {
  assert.match(
    cleanupTool,
    /If `\.firmo\/` and `\.sf-plugin\/` both exist[\s\S]*inventory[\s\S]*unselected `\.sf-plugin\/` separately/,
  );
  assert.match(
    cleanupTool,
    /marker does not certify its carry-over and never[\s\S]*releases it for deletion/,
  );
});

// Invariant: setup migrates only for a selected legacy config and writes no marker on failure.
test('setup triggers the shared migration only for a locator-selected legacy config', () => {
  assert.match(
    setupTool,
    /only because the locator selected the[\s\S]*transitional `<source-handle>`[\s\S]*invoke the loaded shared runtime-directory[\s\S]*migration prerequisite before writing `configMigration\.adr`/,
  );
  assert.match(
    setupTool,
    /normal fresh setup with no selected transitional JSON source does not invoke this[\s\S]*creates no `\.effective-flow\/` runtime footprint/,
  );
  assert.match(
    setupTool,
    /If the shared runtime-directory migration fails or remains incomplete[\s\S]*do not write[\s\S]*`configMigration\.adr`[\s\S]*Preserve the locator-selected config source[\s\S]*safely copied[\s\S]*partial runtime target/,
  );
});

// Invariant: the migration marker and its safety clauses survive every harness render.
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
