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

// The memory lock goes only through the runtime-state helper, called in the here-string shape an
// allowlist rule can match; a multi-line heredoc cannot be allowlisted.
const HELPER_HERE_STRING =
  /node <skill-root>\/scripts\/effective-flow-state\.mjs lock acquire <<< '\{[^\n]*"lock":"memory"/;
// A heredoc opener (`<<EOF`, `<<-'EOF'`), but not the here-string `<<<`.
const HEREDOC = /(?<!<)<<(?!<)-?\s*['"]?[A-Za-z_]\w*/;

const requiredClauses = [
  [HELPER_HERE_STRING, 'helper acquisition in the here-string shape'],
  [/`waitSeconds: 30`/, 'bounded 30-second acquisition wait'],
  [/\(no `runId`\)/, 'memory owner without a run identity'],
  [
    /`LOCK_HELD`[\s\S]*report the `outcome` owner[\s\S]*block the owning mutation/,
    'owner diagnostics and a blocked mutation on LOCK_HELD',
  ],
  [
    /delegated worker never asks the user[\s\S]*relayed or\s+non-interactive run fails closed[\s\S]*offers no break/,
    'workers return diagnostics and non-gated runs never break',
  ],
  [
    /Age alone never[\s\S]*apparent orphan[\s\S]*`lock inspect`[\s\S]*explicit user confirmation[\s\S]*`lock break`/,
    'confirmed orphan recovery through inspect, confirmation and break',
  ],
  [
    /immediately before the atomic rename of `memory\.json`, run `lock inspect`[\s\S]*token equals the retained token/,
    'ownership re-check before the rename',
  ],
  [
    /`finally`[\s\S]*`lock release`[\s\S]*`NOT_HELD` or `NOT_OWNER` is reported as lost ownership/,
    'token-checked release reporting lost ownership',
  ],
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

// Invariant: the memory lock runs only through the helper, with today's wait, orphan and release
// semantics, and the memory.json protocol around it stays intact.
test('the canonical memory contract covers locking, merging, atomic replacement, and reservation', () => {
  for (const [pattern, description] of requiredClauses) {
    assert.match(memoryContract, pattern, `missing ${description}`);
  }
  assert.doesNotMatch(memoryContract, HEREDOC, 'a helper call must not use a heredoc');
  assert.doesNotMatch(memoryContract, /`mkdir [^`]*memory\.lock`/, 'no prose replay of the lock');
});

// Invariant: every memory writer goes through the shared locked mutation contract.
test('all checked-in memory writers route through the shared contract', () => {
  assert.deepEqual(findMemoryStateContractViolations(collectRuntimeSources()), []);
});

// Invariant: the locked, atomic memory protocol survives every harness render.
test('all consumer targets preserve the memory mutation protocol', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(`${memoryContract}\n`, harness, {
      ...renderConfig,
      context: `shared/memory-state.md (${harness})`,
    });

    assert.match(rendered, HELPER_HERE_STRING);
    assert.doesNotMatch(rendered, HEREDOC);
    assert.match(rendered, /Never inspect, lock, migrate, or mutate a same-named path below/);
    assert.match(rendered, /exact nonzero contiguous range/i);
    assert.match(rendered, /atomic rename/i);
    assert.match(rendered, /permanent\s+gaps/i);
    assert.doesNotMatch(rendered, /\{\{(?:SKILL|AGENT):/);
  }
});

// Invariant: finding numbers are reserved after filtering and before publication.
test('finding producers reserve only after filtering and before publication', () => {
  const review = readSource('tools', 'review.md');
  const unresolved = readSource('shared', 'unresolved-review-report.md');

  const reviewTriage = review.indexOf('Finish scope/high-risk triage');
  const reviewFilter = review.indexOf('confidence and design-decision filtering', reviewTriage);
  const reviewExactList = review.indexOf(
    'For the exact ordered list of `admitted` findings',
    reviewFilter,
  );
  const reviewReserve = review.indexOf('reserve one contiguous range', reviewExactList);
  const reviewPublish = review.indexOf('before any report, finding', reviewReserve);
  assert.ok(
    reviewTriage >= 0 &&
      reviewTriage < reviewFilter &&
      reviewFilter < reviewExactList &&
      reviewExactList < reviewReserve &&
      reviewReserve < reviewPublish,
  );

  const unresolvedFilter = unresolved.indexOf('Finish confidence and design-decision filtering');
  const unresolvedReserve = unresolved.indexOf('reserve the exact range', unresolvedFilter);
  const unresolvedPublish = unresolved.indexOf('publish the', unresolvedReserve);
  assert.ok(
    unresolvedFilter >= 0 &&
      unresolvedFilter < unresolvedReserve &&
      unresolvedReserve < unresolvedPublish,
  );
});

// Invariant: every migration marker writes through the shared memory mutation contract.
test('every existing migration marker delegates its owned subtree to the protocol', () => {
  assert.match(
    readSource('shared', 'effective-flow-dir-migration.md'),
    /memory-state[\s\S]*runtimeMigration\.directory/,
  );
  assert.match(
    readSource('shared', 'issue-tracker-forge.md'),
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

// Invariant: legacy memory is the base of one replacement, so the finding counter is never lost.
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
