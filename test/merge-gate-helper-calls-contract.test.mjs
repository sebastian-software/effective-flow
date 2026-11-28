import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  MECHANICS_OPERATIONS,
  executeOperation as executeMechanics,
} from '../src/scripts/effective-flow-mechanics-core.mjs';
import {
  REMOTE_TRACKER_OPERATIONS,
  executeOperation as executeRemoteTracker,
} from '../src/scripts/remote-tracker-core.mjs';

// Contract tests for the helper calls `merge-gate` shows its orchestrator: the `probe` and
// `plan-reference-resolve` calls are spelled out literally, because an orchestrator that must
// assemble them from an operation table or a payload description improvises a shape (a shell
// variable, a pipe) that the permission rules refuse. Each test names the invariant it protects.

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const MERGE_GATE = readFileSync(join(ROOT_DIR, 'src', 'tools', 'merge-gate.md'), 'utf8');

const PROBE_CALL =
  'node <skill-root>/scripts/remote-tracker.mjs probe <<< \'{"cwd":"<RUNTIME_STATE_ROOT>"}\'';
const PLAN_REFERENCE_CALL =
  'node <skill-root>/scripts/effective-flow-mechanics.mjs plan-reference-resolve <<< \'{"cwd":"<root>","planDir":"<plan.dir>","reference":"<repo-relative path>"}\'';

// Copied character for character from test/helper-call-shape-contract.test.mjs (INLINE_BAN): the
// one sentence every source showing a read-helper call carries instead of the call-shape fragment.
const INLINE_BAN =
  "Each call is exactly one such command, with `<skill-root>` and every JSON value spelled out literally: no shell variable, no pipe, no trailing command, no compound command, and every `'` inside the JSON, untrusted text included, spelled as `'\\''`.";

const OPERATIONS_BY_HELPER = {
  'remote-tracker': REMOTE_TRACKER_OPERATIONS,
  'effective-flow-mechanics': MECHANICS_OPERATIONS,
};

const flat = (text) => text.replace(/\s+/g, ' ');

// Every inline code span of merge-gate.md that starts a helper call, with its source line.
function helperCalls() {
  return MERGE_GATE.split('\n').flatMap((line, index) =>
    [...line.matchAll(/`(node <skill-root>\/scripts\/([\w-]+)\.mjs[^`]*)`/g)].map((match) => ({
      line: index + 1,
      span: match[1],
      helper: match[2],
    })),
  );
}

// `node <skill-root>/scripts/<helper>.mjs <operation> <<< '<json>'` -> its parts.
function parseCall({ span, helper }) {
  const match = span.match(
    new RegExp(`^node <skill-root>/scripts/${helper}\\.mjs (\\S+) <<< '(.*)'$`),
  );
  assert.ok(match, `not a single here-string call: ${span}`);
  return { operation: match[1], payload: JSON.parse(match[2]) };
}

test('merge-gate.md shows the probe call as one literal line', () => {
  // Invariant: the orchestrator copies the probe call instead of assembling it from a table.
  assert.ok(
    MERGE_GATE.split('\n').some((line) => line.includes(`\`${PROBE_CALL}\``)),
    `missing literal probe call: ${PROBE_CALL}`,
  );
});

test('merge-gate.md shows the plan-reference-resolve call as one literal line', () => {
  // Invariant: the orchestrator copies the resolve call, including all three payload keys.
  assert.ok(
    MERGE_GATE.split('\n').some((line) => line.includes(`\`${PLAN_REFERENCE_CALL}\``)),
    `missing literal plan-reference-resolve call: ${PLAN_REFERENCE_CALL}`,
  );
});

test('merge-gate.md carries the inline call-shape ban sentence', () => {
  // Invariant: a source showing helper calls states the one-command, literal-values rule once.
  assert.ok(flat(MERGE_GATE).includes(flat(INLINE_BAN)), 'missing INLINE_BAN sentence');
});

test('every shown helper call names a mapped helper and a known operation', () => {
  // Invariant: a shown call never names an operation its helper does not accept, and both
  // helpers the gate depends on are shown at all.
  const calls = helperCalls();
  assert.ok(calls.length > 0, 'merge-gate.md shows no helper call');
  const seen = new Set();
  for (const call of calls) {
    const operations = OPERATIONS_BY_HELPER[call.helper];
    assert.ok(operations, `line ${call.line}: unmapped helper ${call.helper}`);
    const { operation } = parseCall(call);
    assert.ok(
      operations.includes(operation),
      `line ${call.line}: ${call.helper} has no operation ${operation}`,
    );
    seen.add(call.helper);
  }
  for (const helper of Object.keys(OPERATIONS_BY_HELPER)) {
    assert.ok(seen.has(helper), `merge-gate.md shows no ${helper} call`);
  }
});

test('the shown plan-reference-resolve payload resolves a real plan file', async (t) => {
  // Invariant: the payload shown in the source is accepted by the real helper once its
  // placeholders are bound by key, so the shown keys cannot drift from the operation's input.
  const call = helperCalls().find(({ span }) => span.includes(' plan-reference-resolve '));
  assert.ok(call, 'no plan-reference-resolve call shown');
  const { operation, payload } = parseCall(call);
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'merge-gate-helper-calls-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = 'docs/plan/2026-01-01-feature.md';
  mkdirSync(join(root, 'docs', 'plan'), { recursive: true });
  writeFileSync(join(root, file), '# Feature\n\n**Plan status:** Not implemented\n');
  assert.deepEqual(Object.keys(payload).sort(), ['cwd', 'planDir', 'reference']);
  const bound = { ...payload, cwd: root, planDir: 'docs/plan', reference: file };
  const envelope = await executeMechanics(operation, bound);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(envelope.data.outcome, 'resolved');
  assert.equal(envelope.data.exact, true);
});

test('the shown probe payload is exactly the cwd and runs without a forge read', async () => {
  // Invariant: the probe call needs nothing beyond `cwd`; with the repository override and
  // skipProbe it succeeds without reaching the runner.
  const call = helperCalls().find(({ span }) => span.includes(' probe '));
  assert.ok(call, 'no probe call shown');
  const { operation, payload } = parseCall(call);
  assert.deepEqual(Object.keys(payload), ['cwd']);
  let runnerCalls = 0;
  const runner = async () => {
    runnerCalls += 1;
    throw new Error('SENTINEL runner reached');
  };
  const envelope = await executeRemoteTracker(
    operation,
    {
      ...payload,
      repository: { host: 'github.com', owner: 'o', repository: 'r', provider: 'github' },
    },
    { runner, skipProbe: true, sleeper: async () => {}, clock: () => 1_700_000_000_000 },
  );
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  assert.equal(runnerCalls, 0);
});
