import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { MODEL_TIER_MAPPINGS } from './support/native-profile-config.mjs';
import { copyRepository } from './support/repository-copy.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CODEX_AGENTS = ['codex', 'agents'];
const FAST_IMPLEMENTERS = [
  'effective-flow-generic-implementer',
  'effective-flow-generic-product-implementer',
  'effective-flow-nodejs-implementer',
  'effective-flow-rust-implementer',
  'effective-flow-ui-implementer',
];
const STANDARD_ROLES = [
  'effective-flow-code-documenter',
  'effective-flow-code-validator',
  'effective-flow-docs-writer',
  'effective-flow-e2e-tester',
  'effective-flow-marketing-writer',
  'effective-flow-test-writer',
];
const DEEP_ROLES = [
  'effective-flow-frontend-reviewer',
  'effective-flow-generic-implementer',
  'effective-flow-generic-product-implementer',
  'effective-flow-generic-product-reviewer',
  'effective-flow-merge-conflict-resolver',
  'effective-flow-nodejs-implementer',
  'effective-flow-nodejs-reviewer',
  'effective-flow-rust-implementer',
  'effective-flow-rust-reviewer',
  'effective-flow-ui-implementer',
];
let sandbox;
let distRoot;

function runBuild(cwd, destination) {
  return spawnSync(process.execPath, ['build.mjs'], {
    cwd,
    env: {
      ...process.env,
      EFFECTIVE_FLOW_BUILD_GIT_HASH: 'codex-native-profiles-test',
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: destination,
    },
    encoding: 'utf8',
  });
}

function codexAgentsPath(...parts) {
  return join(distRoot, ...CODEX_AGENTS, ...parts);
}

function readToml(name) {
  return readFileSync(codexAgentsPath(`${name}.toml`), 'utf8');
}

function tomlField(source, name) {
  return source.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, 'm'))?.[1] ?? '';
}

function developerInstructions(source) {
  const marker = "developer_instructions = '''\n";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'Codex sidecar must contain developer instructions');
  return source.slice(start + marker.length, source.lastIndexOf("\n'''"));
}

function phaseText(target, tool) {
  const path =
    tool === 'build'
      ? join(distRoot, target, 'effective-flow', 'shared', 'build-delegated-run.md')
      : join(distRoot, target, 'effective-flow', 'tools', `${tool}.md`);
  const text = readFileSync(path, 'utf8');
  const bounds =
    tool === 'build'
      ? ['\n### Phase 2: Implementation\n', '\n### Phase 3: Documentation\n']
      : ['\n### Phase 3: Refactoring\n', '\n### Phase 3.5: Documentation sync\n'];
  const from = text.indexOf(bounds[0]);
  const to = text.indexOf(bounds[1], from + 1);
  assert.ok(from >= 0 && to > from, `${target} ${tool}: implementation phase must render`);
  return text.slice(from, to);
}

before(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-codex-native-profiles-'));
  const checkout = join(sandbox, 'checkout');
  const outputRoot = join(sandbox, 'output');
  copyRepository(ROOT_DIR, checkout);
  const result = runBuild(checkout, outputRoot);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  distRoot = join(outputRoot, 'dist');
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

test('Codex emits Fast implementer sidecars with the Fast mapping and unchanged worker bodies', () => {
  const artifacts = readdirSync(codexAgentsPath()).sort();
  const fastArtifacts = artifacts.filter((name) => name.endsWith('-fast.toml'));
  assert.deepEqual(fastArtifacts, FAST_IMPLEMENTERS.map((name) => `${name}-fast.toml`).sort());

  for (const worker of FAST_IMPLEMENTERS) {
    const base = readToml(worker);
    const fast = readToml(`${worker}-fast`);
    assert.equal(tomlField(fast, 'name'), `${worker}-fast`);
    assert.equal(tomlField(fast, 'model'), 'gpt-5.6-luna');
    assert.equal(tomlField(fast, 'model_reasoning_effort'), 'medium');
    assert.equal(
      developerInstructions(fast),
      developerInstructions(base),
      `${worker}: Fast instructions must remain identical to the base worker`,
    );
  }
});

test('Codex emits mechanical and deep variants only for standard roles', () => {
  const artifacts = new Set(readdirSync(codexAgentsPath()));
  for (const worker of STANDARD_ROLES) {
    for (const [suffix, model, effort] of [
      ['tier-mechanical', 'gpt-5.6-luna', 'low'],
      ['tier-deep', MODEL_TIER_MAPPINGS.deep.codex.model, 'high'],
    ]) {
      const variant = `${worker}-${suffix}`;
      assert.equal(artifacts.has(`${variant}.toml`), true, `${variant}: sidecar must be emitted`);
      const source = readToml(variant);
      assert.equal(tomlField(source, 'name'), variant);
      assert.equal(tomlField(source, 'model'), model);
      assert.equal(tomlField(source, 'model_reasoning_effort'), effort);
      assert.equal(
        developerInstructions(source),
        developerInstructions(readToml(worker)),
        `${variant}: tier selection must preserve worker instructions`,
      );
    }
  }
  for (const worker of DEEP_ROLES) {
    assert.equal(
      artifacts.has(`${worker}-tier-mechanical.toml`),
      false,
      `${worker}: deep role must not receive a mechanical variant`,
    );
    assert.equal(
      artifacts.has(`${worker}-tier-deep.toml`),
      false,
      `${worker}: deep role must not receive a duplicate deep variant`,
    );
  }
  assert.deepEqual(
    [...artifacts]
      .filter((name) => /-tier-(?:mechanical|deep)\.toml$/.test(name))
      .map((name) => basename(name, '.toml'))
      .sort(),
    STANDARD_ROLES.flatMap((worker) => [`${worker}-tier-mechanical`, `${worker}-tier-deep`]).sort(),
  );
});

test('base Codex sidecars retain role defaults while tier guidance names allowed variants', () => {
  for (const worker of STANDARD_ROLES) {
    const source = readToml(worker);
    assert.equal(tomlField(source, 'model'), 'gpt-5.6-luna', `${worker}: standard base model`);
    assert.equal(
      tomlField(source, 'model_reasoning_effort'),
      'medium',
      `${worker}: standard base reasoning effort`,
    );
  }
  for (const worker of DEEP_ROLES) {
    const source = readToml(worker);
    assert.equal(tomlField(source, 'model'), 'gpt-6.1-sol', `${worker}: deep base model`);
    assert.equal(
      tomlField(source, 'model_reasoning_effort'),
      'high',
      `${worker}: deep base reasoning effort`,
    );
  }
  const guidance = readFileSync(
    join(distRoot, 'codex', 'effective-flow', 'shared', 'model-tiers.md'),
    'utf8',
  );
  assert.match(guidance, /(?:role|worker).*(?:select|choose|use)/is);
  assert.match(guidance, /tier-mechanical/);
  assert.match(guidance, /tier-deep/);
});

test('Codex Fast selectors choose Fast sidecars without inline model overrides', () => {
  for (const tool of ['build', 'refactor']) {
    const phase = phaseText('codex', tool);
    for (const worker of FAST_IMPLEMENTERS) {
      const quality = `\`Use the \`${worker}\` skill for this phase.\``;
      const lines = phase.split('\n').filter((line) => line.includes(quality));
      assert.equal(lines.length, 1, `${tool} ${worker}: one selector line`);
      assert.ok(lines[0].includes(`Fast: \`${worker}-fast\`.`), `${tool} ${worker}: ${lines[0]}`);
      assert.doesNotMatch(lines[0], /model\s*[:=]|reasoning_effort\s*[:=]/);
    }
    assert.equal((phase.match(/effective-flow-[a-z-]+-fast\b/g) ?? []).length, 5);
    assert.doesNotMatch(phase, /reasoning_effort\s*:/);
    assert.doesNotMatch(phase, /model\s*:/);
  }
});

test('portable output has no native tier or Fast variant artifacts and no Fast selectors', () => {
  const portable = join(distRoot, 'portable', 'effective-flow');
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(portable);
  assert.equal(
    files.some((path) => /(?:-fast|-tier-(?:mechanical|deep))\.(?:toml|md)$/.test(path)),
    false,
  );
  for (const tool of ['build', 'refactor']) {
    const source = readFileSync(join(portable, 'tools', `${tool}.md`), 'utf8');
    assert.doesNotMatch(source, /effective-flow-[a-z-]+-fast\b/);
    assert.doesNotMatch(source, /tier-(?:mechanical|deep)\b/);
  }
  assert.equal(existsSync(join(portable, 'native-agent-inventory.json')), false);
});
