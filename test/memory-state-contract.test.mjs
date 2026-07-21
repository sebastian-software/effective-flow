import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBody, findMemoryStateContractViolations, renderBody } from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const SHARED_DIR = join(SOURCE_DIR, 'shared');

const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const memoryContract = readSource('shared', 'memory-state.md').trim();
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

const requiredClauses = [
  [
    /atomic command\s+`mkdir <RUNTIME_STATE_ROOT>\/\.effective-flow\/memory\.lock`/,
    'atomic lock acquisition',
  ],
  [/owner.*session.*timestamp/is, 'lock owner metadata'],
  [/no more than 30\s+seconds/i, 'bounded acquisition retry'],
  [/timeout[\s\S]*report[\s\S]*owner/i, 'owner diagnostics on timeout'],
  [/apparent orphan[\s\S]*confirmation/i, 'confirmed orphan recovery'],
  [/release.*only.*own lock/is, 'ownership-checked release'],
  [
    /re-read the retained absolute `<RUNTIME_STATE_ROOT>\/\.effective-flow\/memory\.json` handle inside\s+the lock/is,
    'fresh locked read',
  ],
  [/valid JSON[\s\S]*JSON object/i, 'object validation'],
  [/preserve.*unknown fields/is, 'unknown-field preservation'],
  [/same-directory unique\s+(?:absolute\s+)?file/i, 'same-directory unique temp file'],
  [/atomic rename/i, 'atomic replacement'],
  [/clean up only.*own temporary file/is, 'owned temp cleanup'],
  [/exact nonzero contiguous range/i, 'exact range reservation'],
  [/before\s+publishing/i, 'reservation before publication'],
  [/permanent\s+gaps/i, 'monotonic gaps'],
  [/invalid.*lastFindingNumber/is, 'invalid counter failure'],
];

test('the canonical memory contract covers locking, merging, atomic replacement, and reservation', () => {
  for (const [pattern, description] of requiredClauses) {
    assert.match(memoryContract, pattern, `missing ${description}`);
  }
});

test('all checked-in memory writers route through the shared contract', () => {
  assert.deepEqual(findMemoryStateContractViolations(collectRuntimeSources()), []);
});

test('all consumer targets preserve the memory mutation protocol', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(`${memoryContract}\n`, harness, {
      ...renderConfig,
      context: `shared/memory-state.md (${harness})`,
    });

    assert.match(
      rendered,
      /atomic command\s+`mkdir <RUNTIME_STATE_ROOT>\/\.effective-flow\/memory\.lock`/,
    );
    assert.match(rendered, /Never inspect, lock, migrate, or mutate a same-named path below/);
    assert.match(rendered, /exact nonzero contiguous range/i);
    assert.match(rendered, /atomic rename/i);
    assert.match(rendered, /permanent\s+gaps/i);
    assert.doesNotMatch(rendered, /\{\{(?:SKILL|AGENT):/);
  }
});

test('finding producers reserve only after filtering and before publication', () => {
  const review = readSource('tools', 'review.md');
  const unresolved = readSource('shared', 'unresolved-review-report.md');

  const reviewFilter = review.indexOf('Finish all confidence filtering');
  const reviewReserve = review.indexOf('reserve one contiguous range', reviewFilter);
  const reviewPublish = review.indexOf('before any report, finding', reviewReserve);
  assert.ok(reviewFilter >= 0 && reviewFilter < reviewReserve && reviewReserve < reviewPublish);

  const unresolvedFilter = unresolved.indexOf('Finish confidence and design-decision filtering');
  const unresolvedReserve = unresolved.indexOf('reserve the exact range', unresolvedFilter);
  const unresolvedPublish = unresolved.indexOf('publish the', unresolvedReserve);
  assert.ok(
    unresolvedFilter >= 0 &&
      unresolvedFilter < unresolvedReserve &&
      unresolvedReserve < unresolvedPublish,
  );
});

test('every existing migration marker delegates its owned subtree to the protocol', () => {
  assert.match(
    readSource('shared', 'effective-flow-dir-migration.md'),
    /memory-state[\s\S]*runtimeMigration\.directory/,
  );
  assert.match(
    readSource('shared', 'issue-tracker.md'),
    /labelMigration\.sf[\s\S]*memory mutation contract/,
  );
  assert.match(
    readSource('tools', 'setup.md'),
    /configMigration\.adr[\s\S]*memory mutation contract/,
  );
  assert.match(
    readSource('tools', 'review.md'),
    /\.sf-memory\.json[\s\S]*shared memory (?:mutation contract|transaction)/,
  );
});

test('root legacy memory is the base for the prerequisite and the following reservation', () => {
  const legacySection = memoryContract.slice(
    memoryContract.indexOf('### Legacy `.sf-memory.json`'),
  );
  const base = legacySection.indexOf('validate it as the initial object');
  const mutation = legacySection.indexOf("Merge the current writer's intended mutation", base);
  const replacement = legacySection.indexOf('one atomic replacement', mutation);
  const removal = legacySection.indexOf(
    'remove `<RUNTIME_STATE_ROOT>/.sf-memory.json`',
    replacement,
  );

  assert.ok(base >= 0 && base < mutation && mutation < replacement && replacement < removal);
  assert.match(
    legacySection,
    /runtime-directory prerequisite adds `runtimeMigration\.directory` without losing the legacy\s+counter/,
  );
  assert.match(
    legacySection,
    /`lastFindingNumber: 41`[\s\S]*`R-0000042`–`R-0000043`[\s\S]*persists `43`/,
  );
  assert.match(
    readSource('tools', 'review.md'),
    /do not run a\s+preliminary migration[\s\S]*merge that writer's intended mutation[\s\S]*one\s+replacement/,
  );
});
