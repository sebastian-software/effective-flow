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

const ANALYSIS =
  '- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.';
const LEAN_SENTENCE =
  " The orchestrator sends all other substantive work to a sub-agent as well, unless a tool's explicit in-run rule binds that work to the run (such as the `merge-gate` state reading and guard evaluation) or the triviality exception applies.";

const PROGRESS_SENTENCE =
  ' **Load on demand:** Read `shared/subagent-progress.md` only as the overview owner considering genuinely long or multi-phase work with a candidate native parent channel, or as a worker explicitly enabled by its handoff with the actual parent address and messaging capability; known fallback workers skip it.';

const COMPACT_PROGRESS_SENTENCE =
  ' **Load on demand:** Read `shared/subagent-progress.md` only as the active overview owner considering longer ordinary worker/analysis work with a candidate native channel and ordinary parent event wait; workers never load it. If an ordinary handoff enables progress and supplies the parent address and messaging tool, check your own actual tool and supplied parent address, then send at most one meaningful checkpoint (current phase, observed result, next action; at most 20 words); none for short tasks, no acknowledgement, and continue work if unavailable or denied.';

const BASE_BODY = `\n## Delegation mandate\n\n${WORKER}\n- Another bullet.\n${LAST}\n\n## Recommended skills\n`;
const MANDATE_BODY = `\n## Delegation mandate\n\n${WORKER}${TIER_SENTENCE}\n- Another bullet.\n${LAST}\n\n${POINTER}\n\n## Recommended skills\n`;

function claude({ worker = 'effective-flow-rust-reviewer', model = 'opus', effort, body }) {
  return `---\nname: ${worker}\nmodel: ${model}\neffort: ${effort}\ntools: Read, Skill\n---\n${body}`;
}

function codex({
  worker = 'effective-flow-rust-reviewer',
  model = 'gpt-5.6-sol',
  effort = 'high',
  body,
}) {
  return `name = "${worker}"\nmodel = "${model}"\nmodel_reasoning_effort = "${effort}"\ndeveloper_instructions = '''${body}'''\n`;
}

test('an identical sidecar shows no delta', () => {
  const content = claude({ effort: 'xhigh', body: BASE_BODY });
  assert.deepEqual(
    compareNativeSidecar('claude', 'effective-flow-rust-reviewer', content, content),
    [],
  );
});

test('a deep worker may show the deep-tier configuration delta and the mandate body delta', () => {
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
  assert.deepEqual(
    compareNativeSidecar(
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ model: 'gpt-6.1-sol', body: MANDATE_BODY }),
    ),
    ['codex-deep-tier-model', 'delegation-mandate-model-tiers'],
  );
});

// Invariant: body deltas compose. A worker built after both mandate changes matches the base through
// the model-tiers and the lean-orchestrator deltas together, and one built from a base that already
// carries the tier sentence matches through the lean delta alone; the lean sentence anywhere but on
// the analysis-default bullet still fails.
test('the lean-orchestrator body delta composes with the model-tiers delta', () => {
  const base = `\n## Delegation mandate\n\n${ANALYSIS}\n${WORKER}\n- Another bullet.\n${LAST}\n\n## Recommended skills\n`;
  const tiers = `\n## Delegation mandate\n\n${ANALYSIS}\n${WORKER}${TIER_SENTENCE}\n- Another bullet.\n${LAST}\n\n${POINTER}\n\n## Recommended skills\n`;
  const lean = tiers.replace(ANALYSIS, `${ANALYSIS}${LEAN_SENTENCE}`);
  assert.deepEqual(
    compareNativeSidecar(
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: base }),
      codex({ body: lean }),
    ),
    ['delegation-mandate-model-tiers', 'delegation-mandate-lean-orchestrator'],
  );
  assert.deepEqual(
    compareNativeSidecar(
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: tiers }),
      codex({ body: lean }),
    ),
    ['delegation-mandate-lean-orchestrator'],
  );
  assert.throws(
    () =>
      compareNativeSidecar(
        'codex',
        'effective-flow-rust-reviewer',
        codex({ body: tiers }),
        codex({ body: tiers.replace('- Another bullet.', `- Another bullet.${LEAN_SENTENCE}`) }),
      ),
    /body drift outside the expected deltas/,
  );
  assert.deepEqual(
    EXPECTED_NATIVE_DELTAS.body.map(({ id }) => id),
    [
      'delegation-mandate-model-tiers',
      'delegation-mandate-lean-orchestrator',
      'delegation-mandate-subagent-progress',
      'delegation-mandate-compact-checkpoint',
    ],
  );
});

// The progress delta permits only the exact conditional pointer on the worker-start bullet.
// A relocated pointer or a weakened load condition remains an unrelated body edit.
test('the conditional progress delta composes and rejects relocation or condition drift', () => {
  const progress = MANDATE_BODY.replace(
    `${WORKER}${TIER_SENTENCE}`,
    `${WORKER}${TIER_SENTENCE}${PROGRESS_SENTENCE}`,
  );
  assert.deepEqual(
    compareNativeSidecar(
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ body: progress }),
    ),
    ['delegation-mandate-model-tiers', 'delegation-mandate-subagent-progress'],
  );
  for (const body of [
    MANDATE_BODY.replace('- Another bullet.', `- Another bullet.${PROGRESS_SENTENCE}`),
    progress.replace('known fallback workers skip it', 'all workers load it'),
  ]) {
    assert.throws(
      () =>
        compareNativeSidecar(
          'codex',
          'effective-flow-rust-reviewer',
          codex({ body: MANDATE_BODY }),
          codex({ body }),
        ),
      /body drift outside the expected deltas/,
    );
  }
});

// Invariant: the new exact replacement composes from the older baseline and the previous
// progress-bearing PR body without authorizing another edit or a native permission change.
test('the compact checkpoint delta composes from older and previous progress baselines', () => {
  const older = BASE_BODY.replace(WORKER, `${ANALYSIS}\n${WORKER}`);
  const previous = MANDATE_BODY.replace(WORKER, `${ANALYSIS}${LEAN_SENTENCE}\n${WORKER}`).replace(
    `${WORKER}${TIER_SENTENCE}`,
    `${WORKER}${TIER_SENTENCE}${PROGRESS_SENTENCE}`,
  );
  const current = previous.replace(PROGRESS_SENTENCE, COMPACT_PROGRESS_SENTENCE);
  for (const [harness, sidecar] of [
    ['claude', claude],
    ['codex', codex],
  ]) {
    const compare = (baseline, working) =>
      compareNativeSidecar(
        harness,
        'effective-flow-rust-reviewer',
        sidecar({ effort: 'high', body: baseline }),
        sidecar({ effort: 'high', body: working }),
      );
    assert.deepEqual(
      compare(older, current),
      [
        'delegation-mandate-model-tiers',
        'delegation-mandate-lean-orchestrator',
        'delegation-mandate-subagent-progress',
        'delegation-mandate-compact-checkpoint',
      ],
      harness,
    );
    assert.deepEqual(
      compare(previous, current),
      ['delegation-mandate-compact-checkpoint'],
      harness,
    );
    for (const body of [
      current.replace('Another bullet.', 'Another bullet!'),
      current.replace('workers never load it', 'workers may load it'),
      current.replace('at most 20 words', 'at most 200 words'),
      current.replace('ordinary parent event wait', 'any parent wait'),
      current
        .replace(COMPACT_PROGRESS_SENTENCE, '')
        .replace('- Another bullet.', `- Another bullet.${COMPACT_PROGRESS_SENTENCE}`),
      current + COMPACT_PROGRESS_SENTENCE,
    ]) {
      assert.throws(
        () => compare(previous, body),
        /body drift outside the expected deltas/,
        harness,
      );
    }
    const baseline = sidecar({ effort: 'high', body: previous });
    const permissionDrift = sidecar({ effort: 'high', body: current }).replace(
      harness === 'claude' ? 'tools: Read, Skill' : 'model_reasoning_effort = "high"',
      harness === 'claude' ? 'tools: Read, Skill, SendMessage' : 'model_reasoning_effort = "xhigh"',
    );
    assert.throws(
      () =>
        compareNativeSidecar(harness, 'effective-flow-rust-reviewer', baseline, permissionDrift),
      /configuration drift outside the expected deltas/,
    );
  }
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
      'Codex model change in a standard worker',
      'codex',
      'effective-flow-code-validator',
      codex({ worker: 'effective-flow-code-validator', body: BASE_BODY }),
      codex({ worker: 'effective-flow-code-validator', model: 'gpt-6.1-sol', body: BASE_BODY }),
      /configuration drift outside the expected deltas: effective-flow-code-validator \(codex\): key "model": "gpt-5\.6-sol" -> "gpt-6\.1-sol"/,
    ],
    [
      'Codex model moved to another model',
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ model: 'gpt-5.6-luna', body: BASE_BODY }),
      /key "model": "gpt-5\.6-sol" -> "gpt-5\.6-luna"/,
    ],
    [
      'Codex reasoning effort change beside the allowed model change',
      'codex',
      'effective-flow-rust-reviewer',
      codex({ body: BASE_BODY }),
      codex({ model: 'gpt-6.1-sol', effort: 'xhigh', body: BASE_BODY }),
      /key "model": "gpt-5\.6-sol" -> "gpt-6\.1-sol"; key "model_reasoning_effort": "high" -> "xhigh"/,
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

// Invariant: both configuration allowlists name exactly the agents whose source declares
// `tier: deep`, and each changes only its one deep-tier key.
test('the deep-tier configuration deltas cover exactly the deep-tier workers', () => {
  const deep = readdirSync(new URL('../src/agents/', import.meta.url))
    .filter((name) => name.endsWith('.md'))
    .filter((name) =>
      /^tier: deep$/m.test(readFileSync(new URL(`../src/agents/${name}`, import.meta.url), 'utf8')),
    )
    .map((name) => `effective-flow-${name.slice(0, -3)}`)
    .sort();
  assert.equal(deep.length, 10);
  const [effort, model] = EXPECTED_NATIVE_DELTAS.configuration;
  assert.deepEqual(EXPECTED_NATIVE_DELTAS.configuration, [effort, model]);
  assert.deepEqual([...effort.workers].sort(), deep);
  assert.deepEqual([...model.workers].sort(), deep);
  assert.deepEqual(
    [effort.id, effort.harness, effort.key, effort.from, effort.to],
    ['claude-deep-tier-effort', 'claude', 'effort', 'xhigh', 'high'],
  );
  assert.deepEqual(
    [model.id, model.harness, model.key, model.from, model.to],
    ['codex-deep-tier-model', 'codex', 'model', 'gpt-5.6-sol', 'gpt-6.1-sol'],
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
