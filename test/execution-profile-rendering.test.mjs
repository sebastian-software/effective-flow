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
  getNestedArray,
  parseNativeAgentInventory,
  readContextBudget,
  reconcileNativeAgentInventories,
  resolveAgentTier,
} from '../build-lib.mjs';
import { builtSkillIdentity } from '../evals/_scaffold/build-identity.mjs';
import { PILOT_MEASUREMENT_QUALITY_MAPPING_IDENTITY } from '../src/scripts/pilot-measurement-protocol.mjs';
import {
  AGENT_PROFILE_MAPPINGS,
  MODEL_TIER_MAPPINGS,
  PANEL_MODEL_ALLOWLIST,
} from './support/native-profile-config.mjs';
import { copyRepository } from './support/repository-copy.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
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
const STANDARD_WORKERS = readdirSync(join(ROOT_DIR, 'src/agents'))
  .filter(
    (name) =>
      name.endsWith('.md') &&
      getField(
        extractFrontmatter(readFileSync(join(ROOT_DIR, 'src/agents', name), 'utf8')),
        'tier',
      ) === 'standard',
  )
  .map((name) => `effective-flow-${name.slice(0, -3)}`)
  .sort();
const TIER_WORKERS = STANDARD_WORKERS.flatMap((role) => [
  `${role}-tier-mechanical`,
  `${role}-tier-deep`,
]).sort();

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

// Raise the copied tool's own `contextBudget` frontmatter line (#99), by ten lines unless a probe
// needs more room.
function raiseBudget(checkout, tool, lines = 10) {
  const path = join(checkout, 'src/tools', `${tool}.md`);
  const source = readFileSync(path, 'utf8');
  const budget = readContextBudget(extractFrontmatter(source), { context: path });
  assert.ok(budget, `src/tools/${tool}.md must declare a contextBudget frontmatter line`);
  replaceOnce(
    path,
    `\ncontextBudget: ${budget}\n---\n`,
    `\ncontextBudget: ${budget + lines}\n---\n`,
  );
}

// Each mutated case removes its own checkout copy and output when it ends, pass or fail, so the
// suite's temporary-directory peak stays at a few concurrent copies instead of every case's copy
// until the after() hook.
function withCaseRoot(name, run) {
  const caseRoot = join(sandbox, name);
  try {
    return run(caseRoot);
  } finally {
    rmSync(caseRoot, { recursive: true, force: true });
  }
}

function assertMutatedBuildFails(name, mutate, expected) {
  withCaseRoot(`invalid-${name}`, (caseRoot) => {
    const checkout = join(caseRoot, 'checkout');
    const destination = join(caseRoot, 'output');
    copyRepository(ROOT_DIR, checkout);
    mutate(checkout);
    const result = runBuild(checkout, destination);
    assert.notEqual(result.status, 0, `${name}: build unexpectedly succeeded`);
    assert.match(`${result.stdout}\n${result.stderr}`, expected, name);
    assert.equal(
      existsSync(join(destination, 'dist')),
      false,
      `${name}: output swapped on failure`,
    );
  });
}

function assertMutatedBuildSucceeds(name, mutate) {
  withCaseRoot(`valid-${name}`, (caseRoot) => {
    const checkout = join(caseRoot, 'checkout');
    const destination = join(caseRoot, 'output');
    copyRepository(ROOT_DIR, checkout);
    mutate(checkout);
    const result = runBuild(checkout, destination);
    assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(join(destination, 'dist')), true, `${name}: output was not swapped`);
  });
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
    schemaVersion: 2,
    harness: 'claude',
    baseWorkers,
    fastWorkers: FAST_WORKERS,
    tierWorkers: [],
    standardWorkers: STANDARD_WORKERS,
  });
  assert.deepEqual(codexInventory, {
    schemaVersion: 2,
    harness: 'codex',
    baseWorkers,
    fastWorkers: FAST_WORKERS,
    tierWorkers: TIER_WORKERS,
    standardWorkers: STANDARD_WORKERS,
  });
  assert.deepEqual(
    reconcileNativeAgentInventories(claudeInventory, codexInventory, {
      claudeArtifacts: readdirSync(join(distRoot, 'claude/agents')),
      codexArtifacts: readdirSync(join(distRoot, 'codex/agents')),
    }),
    {
      baseWorkers,
      claudeFastWorkers: FAST_WORKERS,
      codexFastWorkers: FAST_WORKERS,
      codexTierWorkers: TIER_WORKERS,
    },
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
    const sourceTools = getNestedArray(extractFrontmatter(source), 'claude', 'tools', {
      context: worker,
    });
    assert.equal(
      getField(extractFrontmatter(claude), 'tools').replace(/ /g, ''),
      sourceTools,
      `${worker}: approved tools derive from base source`,
    );
    const tools = sourceTools.replace(/[\[\] ]/g, '').split(',');
    assert.equal(
      tools.filter((tool) => tool === 'SendMessage').length,
      1,
      `${worker}: exactly one reviewed parent messaging capability`,
    );
    assert.equal(
      tools.some((tool) => /^(Agent|Task)(\(|$)/.test(tool)),
      false,
      `${worker}: enforced leaf boundary`,
    );
    for (const artifact of [claude, codex])
      assert.match(
        artifact,
        /PROGRESS\/1 <dispatch>: <checkpoint>/,
        `${worker}: generated compact checkpoint contract`,
      );

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
    readdirSync(codexAgents)
      .filter((name) => name.endsWith('-fast.toml'))
      .sort(),
    FAST_WORKERS.map((name) => `${name}.toml`),
  );
});

// Invariant: portable output names only base workers and never a native profile; its one Fast
// representation is the build-generated Fast tier line and the portable contract's `fast` block.
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
    if (path === join(portable, 'scripts/model-selection-core.mjs')) {
      // Executable object properties are not native profile metadata. Their copied source must
      // remain byte-identical, and the provider-name check below still forbids hardcoded models.
      assert.equal(
        content,
        readFileSync(join(ROOT_DIR, 'src/scripts/model-selection-core.mjs'), 'utf8'),
      );
    } else {
      assert.doesNotMatch(
        content,
        /^\s*(?:model|effort|model_reasoning_effort|reasoning_effort)\s*[:=]/m,
        path,
      );
    }
    // The generated executable contract carries exactly the canonical mapping and panel allowlist,
    // without allowing provider names anywhere else in its policy or in portable prompt text.
    let providerContent = content;
    if (path === join(portable, 'scripts/model-selection-contract.json')) {
      const contract = JSON.parse(content);
      assert.deepEqual(
        Object.keys(contract).sort(),
        ['schemaVersion', 'target', 'mappings', 'panelModels', 'roles', 'sites', 'fast'].sort(),
      );
      assert.equal(contract.schemaVersion, 1);
      assert.equal(contract.target, 'portable');
      assert.deepEqual(contract.mappings, MODEL_TIER_MAPPINGS);
      assert.deepEqual(contract.panelModels, PANEL_MODEL_ALLOWLIST);
      assert.deepEqual(contract.fast, {
        mappings: AGENT_PROFILE_MAPPINGS.fast,
        sites: [
          'build-delegated-run/initial-implementation',
          'fix/initial-implementation',
          'refactor/initial-implementation',
        ],
      });
      providerContent = JSON.stringify({ ...contract, mappings: {}, panelModels: {}, fast: {} });
    }
    assert.deepEqual(
      findProviderModelNames(providerContent, {
        modelNames: PROVIDER_MODEL_NAMES,
        allowGenerated: true,
        mappings: MODEL_TIER_MAPPINGS,
        profileMappings: AGENT_PROFILE_MAPPINGS,
      }),
      [],
      path,
    );
    assert.doesNotMatch(content, /<!-- spawn-site:/, path);
    for (const worker of FAST_WORKERS) assert.doesNotMatch(content, new RegExp(worker), path);
  }
});

// `build` Phase 2, `refactor` Phase 3 and `fix` Phase 3 are the adopted Fast surfaces. Each of their five
// implementer selector lines keeps the Quality reference and appends exactly one target-native Fast
// rendering; portable output keeps the base worker at the one rendered Fast tier line of that
// phase, without naming a native profile or a gate reason to record. A selector line is found by its Quality
// reference, so the invariant does not depend on each tool's bucket labels.
const ADOPTED_RENDERED_PHASES = {
  build: { start: '\n### Phase 2: Implementation\n', end: '\n### Phase 3: Documentation\n' },
  refactor: { start: '\n### Phase 3: Refactoring\n', end: '\n### Phase 3.5: Documentation sync\n' },
  fix: { start: '\n### Phase 3: Fix\n', end: '\n### Phase 3.5: Documentation sync\n' },
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
    codex: (worker) => `Fast: \`${worker}-fast\`.`,
    portable: (worker) => `Fast: \`${worker}\` at the Fast tier.`,
  };
  for (const [tool, bounds] of Object.entries(ADOPTED_RENDERED_PHASES)) {
    for (const [target, render] of Object.entries(expected)) {
      const where = `${target} ${tool}`;
      const text = readFileSync(
        join(
          distRoot,
          target,
          `effective-flow/${tool === 'build' ? 'shared/build-delegated-run.md' : `tools/${tool}.md`}`,
        ),
        'utf8',
      );
      const from = text.indexOf(bounds.start);
      const to = text.indexOf(bounds.end, from + 1);
      assert.ok(from >= 0 && to > from, `${where}: the adopted phase must render`);
      const phase = text.slice(from, to);
      for (const agent of agents) {
        const worker = `effective-flow-${agent}`;
        // One valid code span: the worker name renders bare inside it (plan decision 7).
        const quality = `\`Use the ${worker} skill for this phase.\``;
        const lines = phase.split('\n').filter((line) => line.includes(quality));
        assert.equal(lines.length, 1, `${where} ${agent}: one selector line`);
        assert.match(
          lines[0],
          /^ {3}- /,
          `${where} ${agent}: the selector is a numbered-step item`,
        );
        assert.ok(lines[0].endsWith(render(worker)), `${where} ${agent}: ${lines[0]}`);
      }
      // Whole-file counts: no Fast rendering exists outside the five selector lines.
      const fastReferences = text.match(/effective-flow-[a-z-]+-fast\b/g) ?? [];
      assert.equal(fastReferences.length, target !== 'portable' ? 5 : 0, `${where} Fast sidecars`);
      const overrides = text.match(/reasoning_effort: "[a-z]+"/g) ?? [];
      assert.equal(overrides.length, 0, `${where} per-spawn overrides`);
      assert.equal(
        (text.match(/ at the Fast tier\./g) ?? []).length,
        target === 'portable' ? 5 : 0,
        `${where} portable Fast-tier references`,
      );
      assert.equal(
        (phase.match(/^ {3}Fast tier: .* \(rules: `execution-profiles`\)\.$/gm) ?? []).length,
        target === 'portable' ? 1 : 0,
        `${where} Fast tier lines`,
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
// not infer portability from the host. Each target renders its own name into both fragments, the
// workflow derives `installKind` from it, and no target excludes portable runs from measurement.
test('the pilot fragments render their own build target and measure portable runs', () => {
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
      /`installKind` is `portable` for a `portable` build and `native` otherwise/,
    );
    assert.doesNotMatch(flatWorkflow, /unmeasured run whatever host executes it/);
    assert.doesNotMatch(setup.replace(/\s+/g, ' '), /offers none and calls no pilot operation/);
  }
});

// Invariant: against release 6055c94 every native worker sidecar, base and Fast, is byte-identical
// apart from the declared deltas of per-spawn model tiers (the `deep` workers' Claude effort and
// Codex model, the mandate body), the lean-orchestrator sentence, conditional progress pointer and compact checkpoint replacement,
// the generic-product reviewer's tooling and bounded implementation full-pass wording, and the
// merge gate's conflict-commit scope and validation-mode wording in the code validator and the
// merge-conflict resolver, and the unsupported-environment pointers and forbidden substitutes in the
// code validator, test writer and merge-conflict resolver, and build's targeted scope, the shared
// environment-signature classes and the failure-attribution pointer in the code validator and the
// merge-conflict resolver, their capacity-refusal classification and reporting, and the
// project-routing skill-source paragraph in every worker embedding it, and the worker-git-history
// ban in every write-capable worker except the merge-conflict resolver;
// any other configuration change or body change fails; the one declared added worker has no
// base sidecar and any other base-worker membership change fails.
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
      'Expected added workers: effective-flow-acceptance-reviewer\n' +
      'Expected delta claude-deep-tier-effort: effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-product-implementer, effective-flow-generic-product-reviewer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-reviewer, effective-flow-ui-implementer\n' +
      'Expected delta codex-deep-tier-model: effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-product-implementer, effective-flow-generic-product-reviewer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-reviewer, effective-flow-ui-implementer\n' +
      'Expected delta claude-parent-messaging-1: effective-flow-code-validator\n' +
      'Expected delta claude-parent-messaging-2: effective-flow-frontend-reviewer, effective-flow-generic-product-reviewer, effective-flow-nodejs-reviewer, effective-flow-rust-reviewer\n' +
      'Expected delta claude-parent-messaging-3: effective-flow-code-documenter\n' +
      'Expected delta claude-parent-messaging-4: effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-model-tiers: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-lean-orchestrator: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-subagent-progress: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-compact-checkpoint: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-model-selection: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-parent-chain-progress: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-conditional-checkpoint: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta delegation-mandate-triviality-scope: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-frontend-reviewer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-marketing-writer, effective-flow-merge-conflict-resolver, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-nodejs-reviewer, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-rust-reviewer, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta generic-product-reviewer-tooling-assignment: effective-flow-generic-product-reviewer\n' +
      'Expected delta generic-product-reviewer-implementation-full-pass: effective-flow-generic-product-reviewer\n' +
      'Expected delta code-validator-conflict-commit-scope: effective-flow-code-validator\n' +
      'Expected delta merge-conflict-resolver-validation-mode: effective-flow-merge-conflict-resolver\n' +
      'Expected delta code-validator-validation-environment: effective-flow-code-validator\n' +
      'Expected delta test-writer-validation-environment: effective-flow-test-writer\n' +
      'Expected delta merge-conflict-resolver-forbidden-substitutes: effective-flow-merge-conflict-resolver\n' +
      'Expected delta code-validator-build-validation-budget: effective-flow-code-validator\n' +
      'Expected delta merge-conflict-resolver-environment-signature-classes: effective-flow-merge-conflict-resolver\n' +
      'Expected delta code-validator-capacity-refusal: effective-flow-code-validator\n' +
      'Expected delta merge-conflict-resolver-capacity-refusal: effective-flow-merge-conflict-resolver\n' +
      'Expected delta project-routing-skill-sources: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-merge-conflict-resolver, effective-flow-test-writer\n' +
      'Expected delta worker-git-history: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-e2e-tester, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-marketing-writer, effective-flow-nodejs-implementer, effective-flow-nodejs-implementer-fast, effective-flow-rust-implementer, effective-flow-rust-implementer-fast, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n' +
      'Expected delta code-span-placeholder-pairs: effective-flow-code-documenter, effective-flow-code-validator, effective-flow-docs-writer, effective-flow-generic-implementer, effective-flow-generic-implementer-fast, effective-flow-generic-product-implementer, effective-flow-generic-product-implementer-fast, effective-flow-generic-product-reviewer, effective-flow-merge-conflict-resolver, effective-flow-test-writer, effective-flow-ui-implementer, effective-flow-ui-implementer-fast\n',
  );
});

// Invariant: every write-capable worker carries the history-rewrite ban in its own built contract
// on all three targets, Fast and tier variants included, because orchestrator-side fragments do not
// reach a leaf worker (issue #825). The merge-conflict resolver keeps its own, stricter ban and does
// not embed the fragment. Variants come from the built native inventories, so a new one is covered.
test('the worker-git-history ban renders exactly once in every write-capable worker contract', () => {
  const GIT_HISTORY_WORKERS = [
    'code-documenter',
    'code-validator',
    'docs-writer',
    'e2e-tester',
    'generic-implementer',
    'generic-product-implementer',
    'marketing-writer',
    'nodejs-implementer',
    'rust-implementer',
    'test-writer',
    'ui-implementer',
  ].map((name) => `effective-flow-${name}`);
  const paragraph = readFileSync(join(ROOT_DIR, 'src/shared/worker-git-history.md'), 'utf8').trim();
  assert.match(paragraph, /^\*\*Git history\.\*\* /);
  const count = (text) => text.split(paragraph).length - 1;
  const codexBody = (path) => {
    const content = readFileSync(path, 'utf8');
    const match = /developer_instructions = '''([\s\S]*?)'''/.exec(content);
    assert.ok(match, `${path} must carry a developer_instructions body`);
    return match[1];
  };
  const inventory = (harness) =>
    parseNativeAgentInventory(
      readFileSync(join(distRoot, harness, 'effective-flow/native-agent-inventory.json'), 'utf8'),
    );
  const variantsOf = (base, { fastWorkers, tierWorkers }) =>
    [...fastWorkers, ...tierWorkers].filter(
      (name) => name === `${base}-fast` || new RegExp(`^${base}-tier-[a-z]+$`).test(name),
    );
  const claudeInventory = inventory('claude');
  const codexInventory = inventory('codex');
  const contracts = (base) => [
    ...[base, ...variantsOf(base, claudeInventory)].map((name) => {
      const path = join(distRoot, 'claude/agents', `${name}.md`);
      return [path, readFileSync(path, 'utf8')];
    }),
    ...[base, ...variantsOf(base, codexInventory)].map((name) => {
      const path = join(distRoot, 'codex/agents', `${name}.toml`);
      return [path, codexBody(path)];
    }),
    [
      join(distRoot, 'portable/effective-flow/workers', `${base}.md`),
      readFileSync(join(distRoot, 'portable/effective-flow/workers', `${base}.md`), 'utf8'),
    ],
  ];

  for (const base of GIT_HISTORY_WORKERS) {
    for (const [path, text] of contracts(base)) {
      assert.equal(count(text), 1, `${path} must carry the worker-git-history paragraph once`);
    }
  }
  for (const [path, text] of contracts('effective-flow-merge-conflict-resolver')) {
    assert.equal(count(text), 0, `${path} must not embed the worker-git-history paragraph`);
  }
});

// The worker contract and review tool carry the mandate but no goal-completion include.
// Their canonical parent-only pointer keeps the contract in the derived identity; static
// reachability protects evidence invalidation and does not instruct workers to load it.
test('ordinary progress remains in worker-only and tool load sets without goal-completion', () => {
  const skillRoot = join(distRoot, 'portable', 'effective-flow');
  for (const seed of ['workers/effective-flow-generic-implementer.md', 'tools/review.md']) {
    const { files } = builtSkillIdentity(skillRoot, ['SKILL.md', seed]);
    assert.ok(
      Object.hasOwn(files, 'shared/subagent-progress.md'),
      `${seed} lost progress reachability`,
    );
  }
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
    /Fast-profile references are allowed only in the initial implementation phases of shared\/build-delegated-run\.md, tools\/refactor\.md and tools\/fix\.md/,
  );
});

// Invariant: a Fast token is legal only inside an adopted initial implementation phase and only
// after that phase's one Fast spawn-site marker, which alone renders the portable Fast tier line.
test('profile tokens are accepted only in the initial implementation sections', () => {
  const token = '{{AGENT_PROFILE:nodejs-implementer:fast}}';
  // The probe adds two fixture lines, not a measured tool change: give it room in the line budget
  // so the case tests token acceptance rather than the tool's current headroom.
  assertMutatedBuildSucceeds('build-phase-2-profile-token', (checkout) => {
    replaceOnce(
      join(checkout, 'src/shared/build-delegated-run.md'),
      '   - Fullstack: both in parallel',
      `   - ${token}\n   - Fullstack: both in parallel`,
    );
    raiseBudget(checkout, 'build');
  });
  assertMutatedBuildSucceeds('refactor-phase-3-profile-token', (checkout) => {
    replaceOnce(
      join(checkout, 'src/tools/refactor.md'),
      '   - Use every bucket selected by project routing',
      `   - ${token}\n   - Use every bucket selected by project routing`,
    );
    raiseBudget(checkout, 'refactor');
  });
  assertMutatedBuildSucceeds('fix-phase-3-profile-token', (checkout) => {
    replaceOnce(
      join(checkout, 'src/tools/fix.md'),
      '   - Never send product code to the tooling-only generic implementer.',
      `   - ${token}\n   - Never send product code to the tooling-only generic implementer.`,
    );
    raiseBudget(checkout, 'fix');
  });
  assertMutatedBuildFails(
    'build-phase-2-token-before-marker',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/shared/build-delegated-run.md'),
        '### Phase 2: Implementation\n',
        `### Phase 2: Implementation\n\n${token}\n`,
      ),
    /Fast-profile references in shared\/build-delegated-run\.md must all follow one spawn-site marker/,
  );

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
        join(checkout, 'src/shared/build-delegated-run.md'),
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
  // `fix` authorizes only Phase 3: its failing-test step before the marker and its Phase 4
  // verification stay Fast-free.
  assertMutatedBuildFails(
    'fix-failing-test-token-before-marker',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/tools/fix.md'),
        '### Phase 3: Fix\n',
        `### Phase 3: Fix\n\n${token}\n`,
      ),
    /Fast-profile references in tools\/fix\.md must all follow one spawn-site marker inside Fix Phase 3/,
  );
  assertMutatedBuildFails(
    'fix-verification-profile-token',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/tools/fix.md'),
        '### Phase 4: Verification\n',
        `### Phase 4: Verification\n\n${token}\n`,
      ),
    /Fast-profile references in tools\/fix\.md are allowed only inside Fix Phase 3/,
  );
});

// Invariant: MODEL_TIER_MAPPINGS and each agent's `tier:` are the single sources of native model
// metadata, and every spawn-site marker resolves through exactly one model-tiers table row; each
// broken case fails the build before the output swap.
const PROBE_ROWS = [
  '| `version/probe` | Probe sub-agent | `standard` | `no` | `no` |',
  '| `version/mixed` | Probe implementer and validator | `role:nodejs-implementer,code-validator` | `yes` | `no` |',
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
    (checkout) => addProbeRows(checkout, ['| `version/probe` | Probe | `fast` | `no` | `no` |']),
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
        '| `skill-discovery/probe` | Probe sub-agent | `standard` | `no` | `no` |\n',
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

// Invariant: the shipped harness-qualification record describes exactly the Fast mapping the build
// ships, so a changed Fast mapping, a drifted identity, or a missing harness record fails before
// swap and a changed mapping invalidates every probe until a new one is recorded.
test('a qualification record that differs from AGENT_PROFILE_MAPPINGS.fast fails before swap', () => {
  const expected =
    /Fast harness qualification: .*\(in src\/scripts\/fast-harness-qualification\.json\)/;
  assertMutatedBuildFails(
    'qualification-fast-mapping-changed',
    (checkout) =>
      replaceOnce(
        join(checkout, 'build.mjs'),
        "claude: Object.freeze({ model: 'sonnet', effort: 'medium' }),\n    codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' }),\n  }),\n});\n// Provider-neutral",
        "claude: Object.freeze({ model: 'sonnet', effort: 'low' }),\n    codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' }),\n  }),\n});\n// Provider-neutral",
      ),
    /claude fastMappingIdentity differs from the current Fast mapping/,
  );
  assertMutatedBuildFails(
    'qualification-identity-drift',
    (checkout) =>
      replaceOnce(
        join(checkout, 'src/scripts/fast-harness-qualification.json'),
        'c44bca229590200420783d89007d5f6b8f3b0898fa48dc091f655d1cbaeb9e8f',
        '0'.repeat(64),
      ),
    expected,
  );
  assertMutatedBuildFails(
    'qualification-record-missing',
    (checkout) =>
      writeFileSync(
        join(checkout, 'src/scripts/fast-harness-qualification.json'),
        '{"schemaVersion":1,"records":[]}\n',
      ),
    /missing the portable codex record/,
  );
});

// Invariant: a spawn-site marker renders as one tier line in the target's own form (Claude values
// only, Codex values only, both for portable), the shipped model-tiers fragment carries the generated
// role defaults and harness table for its target, and the portable guards accept exactly that
// generated text.
test('spawn-site markers and the model-tiers fragment render per target', (t) => {
  const caseRoot = join(sandbox, 'valid-spawn-sites');
  t.after(() => rmSync(caseRoot, { recursive: true, force: true }));
  const checkout = join(caseRoot, 'checkout');
  const destination = join(caseRoot, 'output');
  copyRepository(ROOT_DIR, checkout);
  addProbeRows(checkout);
  appendFileSync(join(checkout, 'src/tools/version.md'), PROBE_TOOL_TEXT);
  // The probe is fixture text, not a measured tool change; give it room in the line budget.
  raiseBudget(checkout, 'version', 22);
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
      '   Tier `deep` for `effective-flow-nodejs-implementer`: select the named role’s configured sidecar. ' +
        'Tier `standard` for `effective-flow-code-validator`: select the named role’s configured sidecar (rules: `model-tiers`).',
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

// Invariant: the developer coverage matrix names every actually generated role/variant,
// rather than freezing artifact counts or treating static generation as host activation.
test('documented role variants reconcile with all generated native and portable artifacts', () => {
  const coverage = readFileSync(
    join(ROOT_DIR, 'docs/developer-guide/subagent-progress-coverage.md'),
    'utf8',
  );
  const table = coverage
    .split('<!-- coverage-roles:start -->')[1]
    .split('<!-- coverage-roles:end -->')[0];
  const rows = table
    .split('\n')
    .filter((line) => /^\|\s*`/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  for (const [target, column, directory, extension] of [
    ['claude', 2, 'agents', '.md'],
    ['codex', 3, 'agents', '.toml'],
    ['portable', 4, 'effective-flow/workers', '.md'],
  ]) {
    const declared = rows
      .flatMap((row) => {
        const base = `effective-flow-${row[0].replaceAll('`', '')}`;
        return [
          base,
          ...(row[column].includes('fast') ? [`${base}-fast`] : []),
          ...(row[column].includes('mechanical/deep')
            ? [`${base}-tier-mechanical`, `${base}-tier-deep`]
            : []),
        ];
      })
      .sort();
    const actual = readdirSync(join(distRoot, target, directory))
      .filter((file) => file.endsWith(extension))
      .map((file) => basename(file, extension))
      .sort();
    assert.deepEqual(
      actual,
      declared,
      `${target}: coverage and generated role inventories agree exactly`,
    );
    for (const name of actual) {
      const artifact = readFileSync(
        join(distRoot, target, directory, `${name}${extension}`),
        'utf8',
      );
      assert.match(
        artifact,
        /PROGRESS\/1 <dispatch>: <checkpoint>/,
        `${target}/${name}: compact leaf context`,
      );
      assert.doesNotMatch(
        artifact,
        /^## Sparse subagent progress$/m,
        `${target}/${name}: leaf never eagerly loads orchestration owner`,
      );
    }
  }
});
