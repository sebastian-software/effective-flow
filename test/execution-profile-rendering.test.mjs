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
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  extractBody,
  extractFrontmatter,
  getField,
  parseNativeAgentInventory,
  reconcileNativeAgentInventories,
} from '../build-lib.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
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

function copyRepository(destination) {
  cpSync(ROOT_DIR, destination, {
    recursive: true,
    filter(source) {
      const first = relative(ROOT_DIR, source).split('/')[0];
      return !['.git', '.effective-flow', 'dist', 'node_modules'].includes(first);
    },
  });
}

function replaceOnce(path, beforeText, afterText) {
  const source = readFileSync(path, 'utf8');
  const occurrences = source.split(beforeText).length - 1;
  assert.equal(occurrences, 1, `mutation anchor must occur once in ${path}`);
  writeFileSync(path, source.replace(beforeText, afterText));
}

function assertMutatedBuildFails(name, mutate, expected) {
  const caseRoot = join(sandbox, `invalid-${name}`);
  const checkout = join(caseRoot, 'checkout');
  const destination = join(caseRoot, 'output');
  copyRepository(checkout);
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
  copyRepository(checkout);
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
    assert.doesNotMatch(content, /\b(?:sonnet|gpt-5\.6-luna)\b/, path);
    for (const worker of FAST_WORKERS) assert.doesNotMatch(content, new RegExp(worker), path);
  }
});

test('the executable baseline proof preserves every Quality native artifact', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/compare-native-agent-baseline.mjs', '--base', '7d1dcd5'],
    { cwd: ROOT_DIR, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Native base agents match 7d1dcd5\n');
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
        "codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' }),",
        "codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'ultra' }),",
      ),
    /Unsupported Codex model\/reasoning combination/,
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
  assertMutatedBuildSucceeds('build-phase-2-profile-token', (checkout) =>
    replaceOnce(
      join(checkout, 'src/tools/build.md'),
      '### Phase 2: Implementation\n',
      `### Phase 2: Implementation\n\n${token}\n`,
    ),
  );
  assertMutatedBuildSucceeds('refactor-phase-3-profile-token', (checkout) =>
    replaceOnce(
      join(checkout, 'src/tools/refactor.md'),
      '### Phase 3: Refactoring\n',
      `### Phase 3: Refactoring\n\n${token}\n`,
    ),
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
