import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  extractBody,
  extractFrontmatter,
  findProviderModelNames,
  getField,
  parseNativeAgentInventory,
  reconcileNativeAgentInventories,
  resolveAgentTier,
} from '../build-lib.mjs';
import { PILOT_MEASUREMENT_QUALITY_MAPPING_IDENTITY } from '../src/scripts/pilot-measurement-protocol.mjs';
import { AGENT_PROFILE_MAPPINGS, MODEL_TIER_MAPPINGS } from './support/native-profile-config.mjs';
import { copyRepository } from './support/repository-copy.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CODEX_FAST = AGENT_PROFILE_MAPPINGS.fast.codex;
const PROVIDER_MODEL_NAMES = [
  ...new Set(
    [...Object.values(MODEL_TIER_MAPPINGS), ...Object.values(AGENT_PROFILE_MAPPINGS)].flatMap(
      ({ claude, codex }) => [claude.model, codex.model],
    ),
  ),
];
const FAST_SUFFIX =
  ' Fast-profile variant; use only for the first eligible implementation attempt.';
const FAST_WORKERS = [
  'effective-flow-generic-implementer-fast',
  'effective-flow-generic-product-implementer-fast',
  'effective-flow-nodejs-implementer-fast',
  'effective-flow-rust-implementer-fast',
  'effective-flow-ui-implementer-fast',
];

let sandbox;
let outputRoot;
let distRoot;

function runBuild(cwd, destination) {
  return spawnSync(process.execPath, ['build.mjs'], {
    cwd,
    env: {
      ...process.env,
      EFFECTIVE_FLOW_BUILD_GIT_HASH: 'profile-rendering-test',
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: destination,
    },
    encoding: 'utf8',
  });
}

function field(frontmatter, name) {
  return getField(frontmatter, name, { required: true, context: `${name} fixture` });
}

function tomlField(source, name) {
  return source.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, 'm'))?.[1] ?? '';
}

function sourceAgentNames() {
  return readdirSync(join(ROOT_DIR, 'src/agents'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `effective-flow-${name.slice(0, -3)}`)
    .sort();
}

function replaceOnce(path, beforeText, afterText) {
  const source = readFileSync(path, 'utf8');
  const occurrences = source.split(beforeText).length - 1;
  assert.equal(occurrences, 1, `mutation anchor must occur once in ${path}`);
  writeFileSync(path, source.replace(beforeText, afterText));
}

function raiseBudget(checkout, tool) {
  const path = join(checkout, 'build.mjs');
  const source = readFileSync(path, 'utf8');
  const entry = new RegExp(`\\n    ${tool}: (\\d+),\\n`);
  assert.match(source, entry, `CONTEXT_BUDGET_LINES must carry an entry for ${tool}`);
  writeFileSync(
    path,
    source.replace(entry, (_, lines) => `\n    ${tool}: ${Number(lines) + 10},\n`),
  );
}

function assertMutatedBuildFails(name, mutate, expected) {
  const caseRoot = join(sandbox, `invalid-${name}`);
  const checkout = join(caseRoot, 'checkout');
  const destination = join(caseRoot, 'output');
  copyRepository(ROOT_DIR, checkout);
  mutate(checkout);
  const result = runBuild(checkout, destination);
  assert.notEqual(result.status, 0, `${name}: build unexpectedly succeeded`);
  assert.match(`${result.stdout}\n${result.stderr}`, expected, name);
  assert.equal(existsSync(join(destination, 'dist')), false, `${name}: output swapped on failure`);
}

function assertMutatedBuildSucceeds(name, mutate) {
  const caseRoot = join(sandbox, `valid-${name}`);
  const checkout = join(caseRoot, 'checkout');
  const destination = join(caseRoot, 'output');
  copyRepository(ROOT_DIR, checkout);
  mutate(checkout);
  const result = runBuild(checkout, destination);
  assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(join(destination, 'dist')), true, `${name}: output was not swapped`);
}

before(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-profile-rendering-'));
  outputRoot = join(sandbox, 'output');
  const result = runBuild(ROOT_DIR, outputRoot);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  distRoot = join(outputRoot, 'dist');
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

test('native inventories are canonical and reconcile to exact asymmetric artifacts', () => {
  const claudeInventoryPath = join(distRoot, 'claude/effective-flow/native-agent-inventory.json');
  const codexInventoryPath = join(distRoot, 'codex/effective-flow/native-agent-inventory.json');
  const claudeBytes = readFileSync(claudeInventoryPath, 'utf8');
  const codexBytes = readFileSync(codexInventoryPath, 'utf8');
  const claudeInventory = parseNativeAgentInventory(claudeBytes);
  const codexInventory = parseNativeAgentInventory(codexBytes);
  const baseWorkers = sourceAgentNames();

  assert.equal(claudeBytes.endsWith('\n'), true);
  assert.equal(claudeBytes.endsWith('\n\n'), false);
  assert.equal(codexBytes.endsWith('\n'), true);
  assert.equal(codexBytes.endsWith('\n\n'), false);
  assert.deepEqual(claudeInventory, {
    schemaVersion: 1,
    harness: 'claude',
    baseWorkers,
    fastWorkers: FAST_WORKERS,
  });
  assert.deepEqual(codexInventory, {
    schemaVersion: 1,
    harness: 'codex',
    baseWorkers,
    fastWorkers: [],
  });
  assert.deepEqual(
    reconcileNativeAgentInventories(claudeInventory, codexInventory, {
      claudeArtifacts: readdirSync(join(distRoot, 'claude/agents')),
      codexArtifacts: readdirSync(join(distRoot, 'codex/agents')),
    }),
    { baseWorkers, claudeFastWorkers: FAST_WORKERS },
  );
  assert.equal(
    existsSync(join(distRoot, 'portable/effective-flow/native-agent-inventory.json')),
    false,
  );
});

test('every Claude Fast sidecar changes only sanctioned frontmatter fields', () => {
  const claudeAgents = join(distRoot, 'claude/agents');
  for (const fastWorker of FAST_WORKERS) {
    const baseWorker = fastWorker.replace(/-fast$/, '');
    const baseArtifact = readFileSync(join(claudeAgents, `${baseWorker}.md`), 'utf8');
    const fastArtifact = readFileSync(join(claudeAgents, `${fastWorker}.md`), 'utf8');
    const baseFrontmatter = extractFrontmatter(baseArtifact);
    const fastFrontmatter = extractFrontmatter(fastArtifact);

    assert.equal(extractBody(fastArtifact), extractBody(baseArtifact), `${fastWorker}: body drift`);
    assert.equal(field(fastFrontmatter, 'name'), fastWorker);
    assert.equal(
      field(fastFrontmatter, 'description'),
      `${field(baseFrontmatter, 'description')}${FAST_SUFFIX}`,
    );
    assert.equal(field(fastFrontmatter, 'model'), 'sonnet');
    assert.equal(field(fastFrontmatter, 'effort'), 'medium');
    assert.equal(getField(fastFrontmatter, 'color'), getField(baseFrontmatter, 'color'));
    assert.equal(getField(fastFrontmatter, 'tools'), getField(baseFrontmatter, 'tools'));

    const stripSanctioned = (frontmatter) =>
      frontmatter
        .split('\n')
        .filter((line) => !/^(?:name|description|model|effort):/.test(line))
        .join('\n');
    assert.equal(stripSanctioned(fastFrontmatter), stripSanctioned(baseFrontmatter));
  }
});

test('all base workers retain complete native metadata and independent native artifacts', () => {
  const claudeAgents = join(distRoot, 'claude/agents');
  const codexAgents = join(distRoot, 'codex/agents');
  for (const worker of sourceAgentNames()) {
    const claude = readFileSync(join(claudeAgents, `${worker}.md`), 'utf8');
    const codex = readFileSync(join(codexAgents, `${worker}.toml`), 'utf8');
    // Invariant: each native sidecar's model and effort derive from the agent's `tier:` through
    // MODEL_TIER_MAPPINGS, never from per-agent fields.
    const source = readFileSync(
      join(ROOT_DIR, 'src/agents', `${worker.replace(/^effective-flow-/, '')}.md`),
      'utf8',
    );
    const tier =
      MODEL_TIER_MAPPINGS[resolveAgentTier(extractFrontmatter(source), { agentName: worker })];
    assert.equal(
      field(extractFrontmatter(claude), 'model'),
      tier.claude.model,
      `${worker}: tier model`,
    );
    assert.equal(
      field(extractFrontmatter(claude), 'effort'),
      tier.claude.effort,
      `${worker}: tier effort`,
    );
    assert.equal(tomlField(codex, 'model'), tier.codex.model, `${worker}: tier Codex model`);
    assert.equal(
      tomlField(codex, 'model_reasoning_effort'),
      tier.codex.reasoning_effort,
      `${worker}: tier Codex effort`,
    );
    assert.notEqual(field(extractFrontmatter(claude), 'model'), '', `${worker}: Claude model`);
    assert.notEqual(field(extractFrontmatter(claude), 'effort'), '', `${worker}: Claude effort`);
    assert.notEqual(tomlField(codex, 'model'), '', `${worker}: Codex model`);
    assert.notEqual(
      tomlField(codex, 'model_reasoning_effort'),
      '',
      `${worker}: Codex reasoning effort`,
    );
  }
  assert.deepEqual(
    readdirSync(codexAgents).filter((name) => name.endsWith('-fast.toml')),
    [],
  );
});

test('portable output contains only base workers and no native profile representation', () => {
  const portable = join(distRoot, 'portable/effective-flow');
  const workerNames = readdirSync(join(portable, 'workers'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => basename(name, '.md'))
    .sort();
  assert.deepEqual(workerNames, sourceAgentNames());

  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(portable);
  for (const path of files) {
    const content = readFileSync(path, 'utf8');
    assert.doesNotMatch(content, /\{\{AGENT_PROFILE:/, path);
    assert.doesNotMatch(
      content,
      /^\s*(?:model|effort|model_reasoning_effort|reasoning_effort)\s*[:=]/m,
      path,
    );
    // Provider model names appear only as build-generated tier text: the marked harness table and
    // the two-harness values of a rendered spawn-site line.
    assert.deepEqual(
      findProviderModelNames(content, {
        modelNames: PROVIDER_MODEL_NAMES,
        allowGenerated: true,
        mappings: MODEL_TIER_MAPPINGS,
      }),
      [],
      path,
    );
    assert.doesNotMatch(content, /<!-- spawn-site:/, path);
    for (const worker of FAST_WORKERS) assert.doesNotMatch(content, new RegExp(worker), path);
  }
});

// `build` Phase 2 and `refactor` Phase 3 are the adopted Fast surfaces. Each of their five
// implementer selector lines keeps the Quality reference and appends exactly one target-native Fast
// rendering; portable output keeps the base worker and states that it runs Quality only, without
// naming a native profile or a gate reason to record. A selector line is found by its Quality
// reference, so the invariant does not depend on each tool's bucket labels.
const ADOPTED_RENDERED_PHASES = {
  build: { start: '\n### Phase 2: Implementation\n', end: '\n### Phase 3: Documentation\n' },
  refactor: { start: '\n### Phase 3: Refactoring\n', end: '\n### Phase 3.5: Documentation sync\n' },
};

test('the adopted selector lines render the exact per-target Fast representation', () => {
  const agents = [
    'ui-implementer',
    'nodejs-implementer',
    'rust-implementer',
    'generic-product-implementer',
    'generic-implementer',
  ];
  const expected = {
    claude: (worker) => `Fast: \`${worker}-fast\`.`,
    codex: (worker) =>
      `Fast: \`${worker}\` with \`model: "${CODEX_FAST.model}"\` and \`reasoning_effort: "${CODEX_FAST.reasoning_effort}"\`.`,
    portable: (worker) => `Fast: \`${worker}\` (portable build: Fast unavailable, Quality only).`,
  };
  for (const [tool, bounds] of Object.entries(ADOPTED_RENDERED_PHASES)) {
    for (const [target, render] of Object.entries(expected)) {
      const where = `${target} ${tool}`;
      const text = readFileSync(join(distRoot, target, `effective-flow/tools/${tool}.md`), 'utf8');
      const from = text.indexOf(bounds.start);
      const to = text.indexOf(bounds.end, from + 1);
      assert.ok(from >= 0 && to > from, `${where}: the adopted phase must render`);
      const phase = text.slice(from, to);
      for (const agent of agents) {
        const worker = `effective-flow-${agent}`;
        const quality = `\`Use the \`${worker}\` skill for this phase.\``;
        const lines = phase.split('\n').filter((line) => line.includes(quality));
        assert.equal(lines.length, 1, `${where} ${agent}: one selector line`);
        assert.match(lines[0], /^ {3}- /, `${where} ${agent}: the selector is a step 1 item`);
        assert.ok(lines[0].endsWith(render(worker)), `${where} ${agent}: ${lines[0]}`);
      }
      // Whole-file counts: no Fast rendering exists outside the five selector lines.
      const fastReferences = text.match(/effective-flow-[a-z-]+-fast\b/g) ?? [];
      assert.equal(fastReferences.length, target === 'claude' ? 5 : 0, `${where} Fast sidecars`);
      const overrides = text.match(/reasoning_effort: "[a-z]+"/g) ?? [];
      assert.equal(overrides.length, target === 'codex' ? 5 : 0, `${where} per-spawn overrides`);
      assert.equal(
        (text.match(/\(portable build: Fast unavailable, Quality only\)/g) ?? []).length,
        target === 'portable' ? 5 : 0,
        `${where} portable Quality-only notices`,
      );
      assert.doesNotMatch(
        text,
        /select Quality with `profile-unavailable`/,
        `${where}: no selector line may read like an instruction to record a gate reason`,
      );
    }
  }
});

// Invariant: a portable skill can run on a Claude Code or Codex host, so the pilot fragments must
// not infer portability from the host. Each target renders its own name into both fragments, and
// the portable rendering tells the run to call no pilot operation and the setup block to offer no
// generation action.
test('the pilot fragments render their own build target and keep portable runs unmeasured', () => {
  for (const target of ['claude', 'codex', 'portable']) {
    const shared = join(distRoot, target, 'effective-flow/shared');
    const workflow = readFileSync(join(shared, 'pilot-measurement-workflow.md'), 'utf8');
    const setup = readFileSync(join(shared, 'setup-execution-profiles.md'), 'utf8');
    for (const [name, text] of [
      ['pilot-measurement-workflow', workflow],
      ['setup-execution-profiles', setup],
    ]) {
      const declared = [...text.matchAll(/This installation is the `([a-z]+)` build/g)];
      assert.deepEqual(
        declared.map(([, value]) => value),
        [target],
        `${target} ${name} must declare its own build target exactly once`,
      );
      assert.doesNotMatch(text, /\{\{BUILD_TARGET\}\}/, `${target} ${name} kept the placeholder`);
    }
    const flatWorkflow = workflow.replace(/\s+/g, ' ');
    assert.match(
      flatWorkflow,
      /A `portable` build is an unmeasured run whatever host executes it: it calls no pilot operation, reads no inventory, and records nothing\./,
    );
    assert.match(
      setup.replace(/\s+/g, ' '),
      /A `portable` build offers none and calls no pilot operation/,
    );
  }
});

// Invariant: against release 6055c94 every native worker sidecar, base and Fast, is byte-identical
// apart from the declared deltas of per-spawn model tiers (the `deep` workers' Claude effort and
// Codex model, the mandate body) and of the lean-orchestrator mandate sentence, so any other
// configuration change or any other body change fails.
// The pinned stdout names each delta and exactly the workers showing it.
test('the executable baseline proof preserves every Quality native configuration and source-unchanged artifact', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/compare-native-agent-baseline.mjs', '--base', '6055c94'],
    { cwd: ROOT_DIR, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    'Native agents match 6055c94\n' +
      'Expected delta claude-deep-tier-effort: effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-product-implementer, effective-flow-generic-product-reviewer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-reviewer, effective-flow-ui-implementer\n' +
      'Expected delta codex-deep-tier-model: effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-product-implementer, effective-flow-generic-product-reviewer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-reviewer, effective-flow-ui-implementer\n' +
      'Expected delta delegation-mandate-model-tiers: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-lean-orchestrator: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n',
  );
});

test('route policy, authorization, eligibility, and generated-name errors fail before swap', () => {
  assertMutatedBuildFails(
    'duplicate-route-id',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "  Object.freeze(['documentation', 'quality-only-implementation']),",
        "  Object.freeze(['excluded-generated-vendored', 'quality-only-implementation']),",
      ),
    /Duplicate execution-profile route classification for "excluded-generated-vendored"/,
  );
  assertMutatedBuildFails(
    'unclassified-route',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "  Object.freeze(['generic-product', 'fast-capable']),\n",
        '',
      ),
    /route classification must cover every project route exactly once/,
  );
  assertMutatedBuildFails(
    'invalid-classification',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "  Object.freeze(['documentation', 'quality-only-implementation']),",
        "  Object.freeze(['documentation', 'unsupported']),",
      ),
    /Unsupported execution-profile classification for route "documentation"/,
  );
  assertMutatedBuildFails(
    'incomplete-fast-route-set',
    (checkout) => replaceOnce(join(checkout, 'build.mjs'), "  'generic-product',\n]);", ']);'),
    /Execution-profile Fast-capable routes must be exactly/,
  );
  assertMutatedBuildFails(
    'invalid-native-mapping',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "  fast: Object.freeze({\n    claude: Object.freeze({ model: 'sonnet', effort: 'medium' }),\n    codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' }),",
        "  fast: Object.freeze({\n    claude: Object.freeze({ model: 'sonnet', effort: 'medium' }),\n    codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'ultra' }),",
      ),
    /Unsupported Codex model\/reasoning combination for Fast profile/,
  );
  assertMutatedBuildFails(
    'duplicate-eligible-worker',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        '      return match[1];',
        "      return routeId === 'generic-product' ? 'nodejs-implementer' : match[1];",
      ),
    /Fast-capable routes must resolve to unique implementation workers/,
  );
  assertMutatedBuildFails(
    'generated-name-collision',
    (checkout) => {
      const fastAgent = join(checkout, 'src/agents/nodejs-implementer-fast.md');
      cpSync(join(checkout, 'src/agents/nodejs-implementer.md'), fastAgent);
      writeFileSync(
        fastAgent,
        readFileSync(fastAgent, 'utf8').replace(/\n## Recommended skills\n[\s\S]*?(?=\n## )/, ''),
      );
      replaceOnce(
        join(checkout, 'build.mjs'),
        "  'merge-conflict-resolver',\n]);",
        "  'merge-conflict-resolver',\n  'nodejs-implementer-fast',\n]);",
      );
    },
    /Generated Fast worker name collides/,
  );
  assertMutatedBuildFails(
    'unauthorized-profile-token',
    (checkout) =>
      appendFileSync(
        join(checkout, 'src/shared/goal-completion.md'),
        '\n{{AGENT_PROFILE:nodejs-implementer:fast}}\n',
      ),
    /Fast-profile references are allowed only in tools\/build\.md and tools\/refactor\.md/,
  );
});

test('profile tokens are accepted only in the initial implementation sections', () => {
  const token = '{{AGENT_PROFILE:nodejs-implementer:fast}}';
  // The probe adds two fixture lines, not a measured tool change: give it room in the line budget
  // so the case tests token acceptance rather than the tool's current headroom.
  assertMutatedBuildSucceeds('build-phase-2-profile-token', (checkout) => {
    replaceOnce(
      join(checkout, 'src/tools/build.md'),
      '### Phase 2: Implementation\n',
      `### Phase 2: Implementation\n\n${token}\n`,
    );
    raiseBudget(checkout, 'build');
  });
  assertMutatedBuildSucceeds('refactor-phase-3-profile-token', (checkout) => {
    replaceOnce(
      join(checkout, 'src/tools/refactor.md'),
      '### Phase 3: Refactoring\n',
      `### Phase 3: Refactoring\n\n${token}\n`,
    );
    raiseBudget(checkout, 'refactor');
  });

  assertMutatedBuildFails(
    'build-frontmatter-profile-token',
    (checkout) => {
      const path = join(checkout, 'src/tools/build.md');
      const source = readFileSync(path, 'utf8');
      const mutated = source.replace(/^(description: "[^"]+)(")$/m, `$1 ${token}$2`);
      assert.notEqual(mutated, source, 'frontmatter mutation anchor must occur');
      writeFileSync(path, mutated);
    },
    /Fast-profile references.*(?:frontmatter|initial implementation|Phase 2)/i,
  );
  assertMutatedBuildFails(
    'build-validation-profile-token',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/tools/build.md'),
        '### Phase 5: Validation\n',
        `### Phase 5: Validation\n\n${token}\n`,
      ),
    /Fast-profile references.*(?:initial implementation|Phase 2)/i,
  );
  assertMutatedBuildFails(
    'refactor-review-profile-token',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/tools/refactor.md'),
        '### Phase 4: Review\n',
        `### Phase 4: Review\n\n${token}\n`,
      ),
    /Fast-profile references.*(?:initial implementation|Phase 3)/i,
  );
});

// Invariant: MODEL_TIER_MAPPINGS and each agent's `tier:` are the single sources of native model
// metadata, and every spawn-site marker resolves through exactly one model-tiers table row; each
// broken case fails the build before the output swap.
const PROBE_ROWS = [
  '| `version/probe` | Probe sub-agent | `standard` | `no` |',
  '| `version/mixed` | Probe implementer and validator | `role:nodejs-implementer,code-validator` | `yes` |',
];
const PROBE_TOOL_TEXT = [
  '',
  'Spawn an Explore sub-agent.',
  '<!-- spawn-site:version/probe -->',
  '',
  '1. Spawn {{AGENT:nodejs-implementer}}, then {{AGENT:code-validator}}.',
  '   <!-- spawn-site:version/mixed -->',
  '',
  '```lazy-include',
  'model-tiers',
  'when: a probe spawns',
  '```',
  '',
].join('\n');

function addProbeRows(checkout, rows = PROBE_ROWS) {
  appendFileSync(join(checkout, 'src/shared/model-tiers.md'), `${rows.join('\n')}\n`);
}

test('model-tier mapping, agent tier and spawn-site errors fail before swap', () => {
  assertMutatedBuildFails(
    'unsupported-tier-claude-model',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "claude: Object.freeze({ model: 'opus', effort: 'high' }),",
        "claude: Object.freeze({ model: 'claude-opus', effort: 'high' }),",
      ),
    /Unsupported Claude model "claude-opus" for model tier "deep"/,
  );
  assertMutatedBuildFails(
    'missing-agent-tier',
    (checkout) => replaceOnce(join(checkout, 'src/agents/rust-reviewer.md'), 'tier: deep\n', ''),
    /Missing required field "tier" for agent "rust-reviewer"/,
  );
  assertMutatedBuildFails(
    'legacy-agent-model-field',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/agents/rust-reviewer.md'),
        'claude:\n',
        'claude:\n  effort: max\n',
      ),
    /Agent "rust-reviewer" declares legacy field "claude\.effort"/,
  );
  assertMutatedBuildFails(
    'unknown-spawn-site',
    (checkout) => appendFileSync(join(checkout, 'src/tools/version.md'), PROBE_TOOL_TEXT),
    /Unknown spawn-site "version\/probe" \(in tools\/version\.md:\d+\)/,
  );
  assertMutatedBuildFails(
    'duplicate-spawn-site-marker',
    (checkout) => {
      addProbeRows(checkout);
      appendFileSync(
        join(checkout, 'src/tools/version.md'),
        `${PROBE_TOOL_TEXT}\n<!-- spawn-site:version/probe -->\n`,
      );
    },
    /Duplicate spawn-site marker "version\/probe"/,
  );
  assertMutatedBuildFails(
    'spawn-site-row-without-marker',
    (checkout) => addProbeRows(checkout),
    /Spawn-site table row "version\/probe" has no marker/,
  );
  assertMutatedBuildFails(
    'malformed-spawn-site-row',
    (checkout) => addProbeRows(checkout, ['| `version/probe` | Probe | `fast` | `no` |']),
    /Unknown spawn-site tier "fast" for "version\/probe"/,
  );
  assertMutatedBuildFails(
    'spawn-site-marker-in-worker',
    (checkout) =>
      appendFileSync(
        join(checkout, 'src/agents/rust-reviewer.md'),
        '\n<!-- spawn-site:rust-reviewer/x -->\n',
      ),
    /Spawn-site markers belong in src\/tools or src\/shared only; found one in agents\/rust-reviewer\.md/,
  );
  assertMutatedBuildFails(
    'foreign-provider-model-name',
    (checkout) => appendFileSync(join(checkout, 'src/tools/version.md'), '\nPrefer sonnet.\n'),
    /foreign provider-model guard: codex file effective-flow\/tools\/version\.md names sonnet/,
  );
});

// Invariant: the pilot protocol binds the Quality identity of the Fast-capable implementers to
// MODEL_TIER_MAPPINGS.deep, so a Fast-capable implementer on another tier fails before swap.
test('a Fast-capable implementer that does not resolve to the deep tier fails before swap', () => {
  assertMutatedBuildFails(
    'fast-capable-implementer-not-deep',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/agents/nodejs-implementer.md'),
        'tier: deep\n',
        'tier: standard\n',
      ),
    /Fast-capable implementer "nodejs-implementer" resolves to tier "standard"; the pilot protocol's Quality-mapping identity binds MODEL_TIER_MAPPINGS\.deep/,
  );
});

// Invariant: workers spawn nothing, so neither a marked fragment in an agent's eager includes nor a
// tier line in any rendered worker body reaches a build.
test('a spawn-site tier line in a worker fails before swap', () => {
  assertMutatedBuildFails(
    'marked-fragment-in-worker-includes',
    (checkout) => {
      appendFileSync(
        join(checkout, 'src/shared/model-tiers.md'),
        '| `skill-discovery/probe` | Probe sub-agent | `standard` | `no` |\n',
      );
      appendFileSync(
        join(checkout, 'src/shared/skill-discovery.md'),
        '\nSpawn a probe.\n<!-- spawn-site:skill-discovery/probe -->\n',
      );
    },
    /agents\/[a-z-]+\.md eagerly includes shared\/skill-discovery\.md, which carries a spawn-site marker/,
  );
  assertMutatedBuildFails(
    'hand-written-tier-line-in-worker',
    (checkout) =>
      appendFileSync(
        join(checkout, 'src/agents/rust-reviewer.md'),
        '\nTier `standard`: pass `model: sonnet` and `effort: medium` on the Agent tool (rules: `model-tiers`).\n',
      ),
    /Worker tier-line guard: agents\/rust-reviewer\.md \((?:claude|codex|portable)\) renders a spawn-site tier line/,
  );
});

// Invariant: the copied pilot protocol's Quality-mapping identity equals MODEL_TIER_MAPPINGS.deep,
// whichever side drifts, so no protocol generation can span a Quality-mapping change.
test('a pilot Quality-mapping identity that differs from the deep tier fails before swap', () => {
  const expected =
    /Pilot protocol Quality-mapping identity .* differs from MODEL_TIER_MAPPINGS\.deep/;
  assertMutatedBuildFails(
    'pilot-quality-mapping-drift',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/scripts/pilot-measurement-protocol.mjs'),
        `'${PILOT_MEASUREMENT_QUALITY_MAPPING_IDENTITY}'`,
        `'sha256:${'0'.repeat(64)}'`,
      ),
    expected,
  );
  assertMutatedBuildFails(
    'deep-tier-without-pilot-identity',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "codex: Object.freeze({ model: 'gpt-6.1-sol', reasoning_effort: 'high' }),",
        "codex: Object.freeze({ model: 'gpt-6.1-sol', reasoning_effort: 'xhigh' }),",
      ),
    expected,
  );
});

// Invariant: a spawn-site marker renders as one tier line in the target's own form (Claude values
// only, Codex values only, both for portable), the shipped model-tiers fragment carries the generated
// role defaults and harness table for its target, and the portable guards accept exactly that
// generated text.
test('spawn-site markers and the model-tiers fragment render per target', () => {
  const caseRoot = join(sandbox, 'valid-spawn-sites');
  const checkout = join(caseRoot, 'checkout');
  const destination = join(caseRoot, 'output');
  copyRepository(ROOT_DIR, checkout);
  addProbeRows(checkout);
  appendFileSync(join(checkout, 'src/tools/version.md'), PROBE_TOOL_TEXT);
  // The probe is fixture text, not a measured tool change; give it room in the line budget.
  replaceOnce(join(checkout, 'build.mjs'), '    version: 38,', '    version: 60,');
  const result = runBuild(checkout, destination);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const expected = {
    claude: [
      'Tier `standard`: pass `model: sonnet` and `effort: medium` on the Agent tool (rules: `model-tiers`, no downward move).',
      '   Tier `deep` for `effective-flow-nodejs-implementer`: pass `model: opus` and `effort: high` on the Agent tool. ' +
        'Tier `standard` for `effective-flow-code-validator`: pass `model: sonnet` and `effort: medium` on the Agent tool (rules: `model-tiers`).',
    ],
    codex: [
      'Tier `standard`: pass `model: gpt-5.6-luna` and `reasoning_effort: medium` on the spawn (rules: `model-tiers`, no downward move).',
      '   Tier `deep` for `effective-flow-nodejs-implementer`: pass `model: gpt-6.1-sol` and `reasoning_effort: high` on the spawn. ' +
        'Tier `standard` for `effective-flow-code-validator`: pass `model: gpt-5.6-luna` and `reasoning_effort: medium` on the spawn (rules: `model-tiers`).',
    ],
    portable: [
      'Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).',
      '   Tier `deep` for `effective-flow-nodejs-implementer`: Claude Code Agent tool `model: opus`, `effort: high`; Codex spawn `model: gpt-6.1-sol`, `reasoning_effort: high`. ' +
        'Tier `standard` for `effective-flow-code-validator`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`).',
    ],
  };
  const headers = {
    claude: '| Tier | Claude Code Agent tool |',
    codex: '| Tier | Codex spawn |',
    portable: '| Tier | Claude Code Agent tool | Codex spawn |',
  };
  for (const [target, lines] of Object.entries(expected)) {
    const skill = join(destination, 'dist', target, 'effective-flow');
    const tool = readFileSync(join(skill, 'tools/version.md'), 'utf8');
    for (const line of lines) assert.ok(tool.split('\n').includes(line), `${target}: ${line}`);
    assert.doesNotMatch(tool, /<!-- spawn-site:/, `${target}: marker survived`);

    const tiers = readFileSync(join(skill, 'shared/model-tiers.md'), 'utf8');
    assert.ok(tiers.includes(headers[target]), `${target}: harness table header`);
    assert.doesNotMatch(tiers, /\{\{MODEL_TIER_/, `${target}: generated parts rendered`);
    assert.equal(
      (tiers.match(/^\| `[a-z0-9-]+` \| `(?:standard|deep)` \|$/gm) ?? []).length,
      sourceAgentNames().length,
      `${target}: one role-default row per agent`,
    );
    if (target === 'claude') assert.doesNotMatch(tiers, /gpt-5\.6/, target);
    if (target === 'codex') assert.doesNotMatch(tiers, /\b(?:haiku|sonnet|opus)\b/, target);
    if (target === 'portable') {
      assert.match(
        tiers,
        /`model: haiku`, `effort: low` \| `model: gpt-5\.6-luna`, `reasoning_effort: low`/,
      );
    }
  }
});
