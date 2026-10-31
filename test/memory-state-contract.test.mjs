import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_OPERATION_RE,
  extractBody,
  findMemoryStateContractViolations,
  renderBody,
} from '../build-lib.mjs';
import { STATE_OPERATIONS } from '../src/scripts/effective-flow-state-core.mjs';

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

// Every memory operation is called in the here-string shape an allowlist rule can match; a
// multi-line heredoc cannot be allowlisted.
const helperCall = (operation) =>
  new RegExp(
    `node <skill-root>/scripts/effective-flow-state\\.mjs memory ${operation} <<< '\\{"cwd":"<RUNTIME_STATE_ROOT>","owner":\\{"workflow":"<workflow>"\\}`,
  );
const MEMORY_OPERATIONS = ['reserve', 'set-marker', 'migrate-directory'];
// A heredoc opener (`<<EOF`, `<<-'EOF'`), but not the here-string `<<<`.
const HEREDOC = /(?<!<)<<(?!<)-?\s*['"]?[A-Za-z_]\w*/;
const flat = (text) => text.replace(/\s+/g, ' ');

const requiredClauses = [
  [/Never lock, merge, or rewrite it in prose/, 'no prose writer'],
  [/a new key\s+family needs a new helper operation/, 'no generic write'],
  [/takes and releases\s+the `memory` lock itself/, 'the operation owns its lock'],
  [/preserves every other field/, 'unknown-field preservation'],
  [/never `EXECUTION_ROOT`\s+or\s+another linked worktree/, 'runtime root as cwd'],
  [/`owner` carries no `runId`/, 'memory owner without a run identity'],
  [
    /`MIGRATION_REQUIRED`:\*\* call `memory migrate-directory` once, treating its\s+`MIGRATION_NOT_NEEDED` as success \(another session won the race\), then retry the operation once\.\s+Any other non-success result of either call blocks with its code; a delegated worker reports it\s+and never asks the user/,
    'migrate once (a lost race counts as success), retry once, block otherwise without asking',
  ],
  [
    /`LOCK_HELD`[\s\S]*delegated worker returns these diagnostics to its orchestrator and never asks the user[\s\S]*relayed or non-interactive run fails closed and offers no break/,
    'workers return diagnostics and non-gated runs never break',
  ],
  [
    /Age alone never[\s\S]*apparent\s+orphan[\s\S]*only as a gated orchestrator, run `lock inspect`[\s\S]*explicit user confirmation[\s\S]*`lock break`/,
    'orchestrator-only confirmed orphan recovery',
  ],
  [/`NOT_OWNER`:\*\*[^\n]*nothing was written/, 'lost ownership writes nothing'],
  [
    /`result\.legacyAdopted`[\s\S]*`result\.legacyConflict`[\s\S]*`result\.legacyRemoval`/,
    'legacy adoption reported through the result fields',
  ],
  [/`LEGACY_CHANGED` is an error that wrote nothing/, 'a pre-rename legacy change writes nothing'],
  [
    /unclean release[\s\S]*`lockRelease` of a `result` or an\s+`outcome`[\s\S]*appended to an error message/,
    'an unclean release is reported from a result, an outcome and an error message',
  ],
];

// Invariant: memory.json changes only through the three typed helper operations, called in the
// allowlistable here-string shape, with the outcome handling every call site shares.
test('the memory contract states the three operations and their outcome handling', () => {
  for (const operation of MEMORY_OPERATIONS) {
    assert.match(memoryContract, helperCall(operation), `missing the ${operation} call shape`);
    assert.ok(STATE_OPERATIONS.includes(`memory ${operation}`), `helper lacks memory ${operation}`);
  }
  for (const [pattern, description] of requiredClauses) {
    assert.match(memoryContract, pattern, `missing ${description}`);
  }
  assert.doesNotMatch(memoryContract, HEREDOC, 'a helper call must not use a heredoc');
});

// Invariant: the prose no longer replays the protocol the helper owns — no lock acquisition or
// release for memory, no temp-file or rename steps, no legacy adoption steps.
test('the memory contract carries no protocol replay', () => {
  assert.doesNotMatch(memoryContract, /lock acquire|lock release/, 'no prose memory lock');
  assert.doesNotMatch(memoryContract, /`mkdir [^`]*memory\.lock`/, 'no prose lock directory');
  assert.doesNotMatch(memoryContract, /atomic rename|temporary file|\.tmp`/i, 'no write replay');
  assert.doesNotMatch(memoryContract, /remove `<RUNTIME_STATE_ROOT>\/\.sf-memory\.json`/);
  assert.doesNotMatch(memoryContract, /identity and digest/, 'no legacy adoption replay');
});

// Invariant: every memory writer calls a named operation after the contract and the migration
// prerequisite, and no prose writes memory.json directly.
test('all checked-in memory writers call a named memory operation', () => {
  assert.deepEqual(findMemoryStateContractViolations(collectRuntimeSources()), []);
});

// Invariant: every memory operation a source names is one the helper implements.
test('every memory operation named in the sources exists in the helper', () => {
  const named = new Set();
  for (const body of collectRuntimeSources().values()) {
    for (const match of body.matchAll(new RegExp(MEMORY_OPERATION_RE.source, 'g'))) {
      named.add(match[0]);
    }
  }
  assert.ok(named.size > 0);
  for (const operation of named) assert.ok(STATE_OPERATIONS.includes(operation), operation);
});

// Invariant: the operation contract survives every harness render.
test('all consumer targets preserve the memory operation contract', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(`${memoryContract}\n`, harness, {
      ...renderConfig,
      context: `shared/memory-state.md (${harness})`,
    });
    for (const operation of MEMORY_OPERATIONS) assert.match(rendered, helperCall(operation));
    assert.doesNotMatch(rendered, HEREDOC);
    assert.match(rendered, /`MIGRATION_REQUIRED`/);
    assert.match(rendered, /permanent gaps/);
    assert.doesNotMatch(rendered, /\{\{(?:SKILL|AGENT):/);
  }
});

// Invariant: finding numbers are reserved after filtering and before publication, and a failure
// after the reservation leaves gaps rather than reusing the range.
test('finding producers reserve only after filtering and before publication', () => {
  const contract = flat(memoryContract);
  const filter = contract.indexOf('Finish confidence filtering, design-decision filtering');
  const reserve = contract.indexOf('call `memory reserve` with the exact count', filter);
  const publish = contract.indexOf('only after the call succeeded publish', reserve);
  assert.ok(filter >= 0 && filter < reserve && reserve < publish);
  assert.match(contract, /If no new finding remains, reserve nothing/);
  assert.match(contract, /unpublished IDs stay permanent gaps/);

  // Each producer keeps only its site-specific list and defers the ordering to the contract above:
  // it finishes its own filtering first, then reserves through `memory reserve` by pointing at
  // "Reserve finding IDs before publication" rather than restating the ordering or gaps rule.
  const pointer = /“Reserve\s+finding IDs before publication”/;
  const review = flat(readSource('tools', 'review.md'));
  const reviewTriage = review.indexOf('Finish scope/high-risk triage first');
  const reviewList = review.indexOf('ordered list of `admitted` findings', reviewTriage);
  const reviewReserve = review.indexOf('through `memory reserve`', reviewList);
  assert.ok(reviewTriage >= 0 && reviewTriage < reviewList && reviewList < reviewReserve);
  assert.match(review.slice(reviewReserve), pointer);
  assert.match(
    review,
    /\*\*Reserve IDs:\*\* Reserve one `R-XXXXXXX` range through `memory reserve` \(“Reserve finding IDs before publication”\)/,
  );
  assert.doesNotMatch(review, /a failed reservation publishes nothing/);

  const unresolved = flat(readSource('shared', 'unresolved-review-report.md'));
  const unresolvedAdmission = unresolved.indexOf('run admission once for the unresolved batch');
  const unresolvedReserve = unresolved.indexOf('call `memory reserve`', unresolvedAdmission);
  const unresolvedPublish = unresolved.indexOf('publish the report', unresolvedReserve);
  assert.ok(
    unresolvedAdmission >= 0 &&
      unresolvedAdmission < unresolvedReserve &&
      unresolvedReserve < unresolvedPublish,
  );
  assert.match(unresolved, pointer);
  assert.doesNotMatch(unresolved, /permanent gaps/);
});

// Invariant: every migration marker is set through its own typed operation, never in prose.
test('every migration marker is set through a typed memory operation', () => {
  assert.match(
    readSource('shared', 'effective-flow-dir-migration.md'),
    /runtimeMigration\.directory[\s\S]*call `memory migrate-directory`/,
  );
  assert.match(
    readSource('shared', 'issue-tracker-forge.md'),
    /labelMigration\.sf[\s\S]*`memory set-marker` and `"marker":"label-migration-sf"`/,
  );
  assert.match(
    readSource('tools', 'setup.md'),
    /set `configMigration\.adr` with\s+`memory set-marker`, `"marker":"config-migration-adr"`/,
  );
});

// Invariant: root legacy memory is adopted inside the first memory operation, never by a
// preliminary prose step that could publish a marker first and hide the legacy counter.
test('root legacy memory is adopted by the first memory operation', () => {
  assert.match(
    readSource('tools', 'review.md'),
    /A `<RUNTIME_STATE_ROOT>\/\.sf-memory\.json` is adopted by the first `memory` operation, never by\s+a preliminary step/,
  );
  assert.match(memoryContract, /Legacy `\.sf-memory\.json`\*\* is adopted inside the call/);
});

// Invariant: a host that reserves finding IDs loads the migration prerequisite through a trigger
// that names memory, so `memory reserve` never meets an unmigrated runtime directory unprepared.
test('the fix migration trigger names memory', () => {
  const fix = readSource('tools', 'fix.md');
  const pointer = fix.match(/```lazy-include\neffective-flow-dir-migration\nwhen: ([^\n]+)\n```/);
  assert.ok(pointer, 'fix must keep its lazy migration pointer');
  assert.match(pointer[1], /\bmemory\b/);
});
