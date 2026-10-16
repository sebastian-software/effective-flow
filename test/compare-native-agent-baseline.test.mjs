import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  EXPECTED_NATIVE_DELTAS,
  compareNativeSidecar,
  formatBaselineReport,
  splitNativeSidecar,
} from '../scripts/compare-native-agent-baseline.mjs';

const WORKER =
  '- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol.';
const LAST =
  "- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.";
const TIER_SENTENCE =
  ' The orchestrator gives every spawn it starts the tier rendered at its spawn site.';
const POINTER =
  '**Load on demand:** Read `shared/model-tiers.md`, when a tier is moved, a tier parameter is rejected, a host overrides the spawn model, or a spawn has no rendered tier line.';

const BASE_BODY = `\n## Delegation mandate\n\n${WORKER}\n- Another bullet.\n${LAST}\n\n## Recommended skills\n`;
const MANDATE_BODY = `\n## Delegation mandate\n\n${WORKER}${TIER_SENTENCE}\n- Another bullet.\n${LAST}\n\n${POINTER}\n\n## Recommended skills\n`;

function claude({ worker = 'effective-flow-rust-reviewer', model = 'opus', effort, body }) {
  return `---\nname: ${worker}\nmodel: ${model}\neffort: ${effort}\ntools: Read, Skill\n---\n${body}`;
}

function codex({ model = 'gpt-5.6-sol', effort = 'high', body }) {
  return `name = "effective-flow-rust-reviewer"\nmodel = "${model}"\nmodel_reasoning_effort = "${effort}"\ndeveloper_instructions = '''${body}'''\n`;
}

test('an identical sidecar shows no delta', () => {
  const content = claude({ effort: 'xhigh', body: BASE_BODY });
  assert.deepEqual(
    compareNativeSidecar('claude', 'effective-flow-rust-reviewer', content, content),
    [],
  );
});

test('a deep worker may show the Claude effort delta and the mandate body delta', () => {
  assert.deepEqual(
    compareNativeSidecar(
      'claude',
      'effective-flow-rust-reviewer',
      claude({ effort: 'xhigh', body: BASE_BODY }),
      claude({ effort: 'high', body: MANDATE_BODY }),
    ),
    ['claude-deep-tier-effort', 'delegation-mandate-model-tiers'],
  );
  assert.deepEqual(
    compareNativeSidecar(
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ body: MANDATE_BODY }),
    ),
    ['delegation-mandate-model-tiers'],
  );
});

// Invariant: every native difference outside EXPECTED_NATIVE_DELTAS fails the baseline proof.
test('a delta outside the allowlist fails', () => {
  const cases = [
    [
      'Claude effort change in a standard worker',
      'claude',
      'effective-flow-code-validator',
      claude({ worker: 'effective-flow-code-validator', effort: 'xhigh', body: BASE_BODY }),
      claude({ worker: 'effective-flow-code-validator', effort: 'high', body: BASE_BODY }),
      /configuration drift outside the expected deltas: effective-flow-code-validator \(claude\): key "effort": "xhigh" -> "high"/,
    ],
    [
      'Claude effort moved to another level',
      'claude',
      'effective-flow-rust-reviewer',
      claude({ effort: 'xhigh', body: BASE_BODY }),
      claude({ effort: 'max', body: BASE_BODY }),
      /key "effort": "xhigh" -> "max"/,
    ],
    [
      'Claude model change beside the allowed effort change',
      'claude',
      'effective-flow-rust-reviewer',
      claude({ effort: 'xhigh', body: BASE_BODY }),
      claude({ model: 'sonnet', effort: 'high', body: BASE_BODY }),
      /key "effort": "xhigh" -> "high"; key "model": "opus" -> "sonnet"/,
    ],
    [
      'Codex reasoning effort change',
      'codex',
      'effective-flow-rust-reviewer',
      codex({ effort: 'xhigh', body: BASE_BODY }),
      codex({ effort: 'high', body: BASE_BODY }),
      /configuration drift outside the expected deltas: effective-flow-rust-reviewer \(codex\): key "model_reasoning_effort"/,
    ],
    [
      'an unrelated body edit',
      'claude',
      'effective-flow-rust-reviewer',
      claude({ effort: 'xhigh', body: BASE_BODY }),
      claude({ effort: 'xhigh', body: BASE_BODY.replace('Another bullet.', 'Another bullet!') }),
      /body drift outside the expected deltas: effective-flow-rust-reviewer \(claude\)/,
    ],
    [
      'the mandate delta plus an unrelated body edit',
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ body: MANDATE_BODY.replace('Another bullet.', 'Another bullet!') }),
      /body drift outside the expected deltas/,
    ],
    [
      'half of the mandate delta',
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ body: BASE_BODY.replace(WORKER, `${WORKER}${TIER_SENTENCE}`) }),
      /body drift outside the expected deltas/,
    ],
    [
      'the tier sentence on another bullet than the worker-start bullet',
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({
        body: MANDATE_BODY.replace(`${WORKER}${TIER_SENTENCE}`, WORKER).replace(
          '- Another bullet.',
          `- Another bullet.${TIER_SENTENCE}`,
        ),
      }),
      /body drift outside the expected deltas/,
    ],
  ];
  for (const [name, harness, worker, baseline, working, expected] of cases) {
    assert.throws(() => compareNativeSidecar(harness, worker, baseline, working), expected, name);
  }
});

// Invariant: the effort allowlist names exactly the agents whose source declares `tier: deep`.
test('the Claude effort delta covers exactly the deep-tier workers', () => {
  const deep = readdirSync(new URL('../src/agents/', import.meta.url))
    .filter((name) => name.endsWith('.md'))
    .filter((name) =>
      /^tier: deep$/m.test(readFileSync(new URL(`../src/agents/${name}`, import.meta.url), 'utf8')),
    )
    .map((name) => `effective-flow-${name.slice(0, -3)}`)
    .sort();
  assert.equal(deep.length, 10);
  const [effort] = EXPECTED_NATIVE_DELTAS.configuration;
  assert.deepEqual(EXPECTED_NATIVE_DELTAS.configuration, [effort]);
  assert.deepEqual([...effort.workers].sort(), deep);
  assert.deepEqual(
    [effort.harness, effort.key, effort.from, effort.to],
    ['claude', 'effort', 'xhigh', 'high'],
  );
});

test('a sidecar splits into native configuration and prompt body', () => {
  assert.deepEqual(splitNativeSidecar('claude', claude({ effort: 'high', body: 'B\n' }), 'x'), {
    configuration:
      '---\nname: effective-flow-rust-reviewer\nmodel: opus\neffort: high\ntools: Read, Skill\n---\n',
    body: 'B\n',
  });
  const split = splitNativeSidecar('codex', codex({ body: '\nB\n' }), 'x');
  assert.equal(split.body, '\nB\n');
  assert.doesNotMatch(split.configuration, /\nB\n/);
  assert.throws(() => splitNativeSidecar('codex', 'name = "x"\n', 'x'), /missing prompt body/);
  assert.throws(() => splitNativeSidecar('claude', 'body only\n', 'x'), /missing frontmatter/);
});

test('the report names each used delta with its workers', () => {
  assert.equal(formatBaselineReport('abc1234', new Map()), 'Native agents match abc1234\n');
  assert.equal(
    formatBaselineReport(
      'abc1234',
      new Map([
        ['delegation-mandate-model-tiers', new Set(['effective-flow-b', 'effective-flow-a'])],
        ['claude-deep-tier-effort', new Set(['effective-flow-b'])],
      ]),
    ),
    'Native agents match abc1234\n' +
      'Expected delta claude-deep-tier-effort: effective-flow-b\n' +
      'Expected delta delegation-mandate-model-tiers: effective-flow-a, effective-flow-b\n',
  );
});
