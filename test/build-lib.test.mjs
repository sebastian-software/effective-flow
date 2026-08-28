import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeRegex,
  extractFrontmatter,
  extractBody,
  normalizeLineEndings,
  getField,
  getNested,
  getNestedArray,
  getNestedList,
  cleanDescription,
  firstSentence,
  normalizeCodexSandboxMode,
  normalizeClaudeEffort,
  validateRefs,
  assertQuotedDescription,
  transformRefs,
  parseAskBlock,
  renderBody,
  missingCategoryReadmes,
  findSelfReferentialContractPhrases,
  ASK_MAX_HEADER_LENGTH,
  renderLazyPointer,
  resolveLazyIncludes,
  resolveEagerIncludes,
  findUnresolvedEagerIncludes,
  assertNoUnresolvedEagerIncludes,
  findUnresolvedLazyIncludes,
  assertNoUnresolvedLazyIncludes,
  collectIncludeNames,
  assertNoEagerLazyOverlap,
  renderDeprecatedAliasClause,
  DOCUMENTATION_SYNC_CONSUMERS,
  findDocumentationSyncViolations,
  findRuntimeStateSafetyViolations,
  findRuntimeDirMigrationViolations,
  findMemoryStateContractViolations,
  developerGuideBaseUrl,
  rewriteDeveloperGuideLinks,
  appendDeliveryFooter,
  deliveryFooter,
  DELIVERY_FOOTER_MARKER,
  PORTABLE_WORKER_DELEGATION,
  collectRenderedWorkerRefs,
  HARNESS_TOOL_PARAMETER_OWNERSHIP,
  findForeignHarnessToolParameters,
  findProhibitedConsumerScriptCommands,
  findRemoteTrackerRecipeViolations,
  findRetiredConfigDocViolations,
  findStaleAdrContractClaims,
  parseProjectRoutingTable,
  assertProjectRoutingContract,
  classifyProjectRoutingScope,
  PROJECT_ROUTING_REQUIRED_ROUTES,
  parseNextStepsTable,
  assertNextStepsContract,
  findNextStepsDocViolations,
  NEXT_STEPS_TABLE_START,
  NEXT_STEPS_TABLE_END,
  parseSkillOwnershipManifest,
  parseSkillOwnershipTable,
  collectRecommendedSkillChains,
  parseSkillOwnershipRelevanceGateOwners,
  assertSkillOwnershipContract,
} from '../build-lib.mjs';
import { auditSkillOwnership } from '../scripts/audit-skill-ownership.mjs';

const DELIVERY = { repo: 'sebastian-software/effective-flow', sourceBranch: 'develop' };

const refConfig = {
  exposedTools: ['build', 'fix', 'apply'],
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: new Set(['build', 'fix', 'apply', 'apply-plan']),
  knownAgents: new Set(['nodejs-implementer', 'code-validator']),
};

// --- Frontmatter extraction ---

test('extractFrontmatter / extractBody split on the fence', () => {
  const src = '---\ndescription: "x"\n---\nbody line\n';
  assert.equal(extractFrontmatter(src), 'description: "x"');
  assert.equal(extractBody(src), 'body line\n');
});

// --- getField ---

test('getField parses quoted and bare scalars', () => {
  assert.equal(getField('description: "hello"', 'description'), 'hello');
  assert.equal(getField('name: firmo', 'name'), 'firmo');
});

test('getField keeps a value ending in an inner quote (no last-char loss)', () => {
  assert.equal(getField('description: "a"b"', 'description'), 'a"b');
});

test('getField returns "" for a missing optional field', () => {
  assert.equal(getField('name: firmo', 'description'), '');
});

test('getField throws with context for a missing required field', () => {
  assert.throws(
    () => getField('name: firmo', 'description', { required: true, context: 'x.md' }),
    /Missing required field "description".*x\.md/,
  );
});

test('getField rejects an unterminated quoted value', () => {
  assert.throws(() => getField('description: "oops', 'description'), /Unterminated quoted value/);
});

// --- getNested / getNestedArray / getNestedList ---

const agentFm =
  'description: "d"\nclaude:\n  model: opus\n  tools: [Read, Write, Edit]\n  skills: [frontend-design]\ncodex:\n  model: gpt\n';

test('getNested reads a nested scalar', () => {
  assert.equal(getNested(agentFm, 'claude', 'model'), 'opus');
  assert.equal(getNested(agentFm, 'codex', 'model'), 'gpt');
  assert.equal(getNested(agentFm, 'claude', 'color'), '');
});

test('getNestedArray parses an inline array', () => {
  assert.equal(getNestedArray(agentFm, 'claude', 'tools'), 'Read,Write,Edit');
});

test('getNestedArray throws on a non-inline array', () => {
  const fm = 'claude:\n  tools:\n    - Read\n    - Write\n';
  assert.throws(
    () => getNestedArray(fm, 'claude', 'tools', { context: 'a.md' }),
    /Expected inline array.*a\.md/,
  );
});

test('getNestedList parses an inline list', () => {
  assert.equal(getNestedList(agentFm, 'claude', 'skills'), '  - frontend-design');
});

test('getNestedList does not bleed past a blank line or dedent', () => {
  const fm = 'claude:\n  skills:\n    - one\n    - two\n\n  model: opus\n';
  assert.equal(getNestedList(fm, 'claude', 'skills'), '  - one\n  - two');
});

// --- cleanDescription / firstSentence ---

test('cleanDescription strips SKILL/AGENT refs', () => {
  assert.equal(
    cleanDescription('use {{SKILL:fix}} and {{AGENT:test-writer}}'),
    'use fix and test-writer',
  );
});

test('firstSentence returns the first sentence only', () => {
  assert.equal(firstSentence('First. Second.'), 'First.');
});

// --- normalizeCodexSandboxMode ---

test('normalizeCodexSandboxMode maps and rejects', () => {
  assert.equal(normalizeCodexSandboxMode('full', 'a'), 'danger-full-access');
  assert.equal(normalizeCodexSandboxMode('', 'a'), '');
  assert.throws(() => normalizeCodexSandboxMode('bogus', 'a'), /Unsupported codex sandbox_mode/);
});

// --- normalizeClaudeEffort ---

test('normalizeClaudeEffort accepts every supported exact value', () => {
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.equal(normalizeClaudeEffort(effort, 'test-writer', 'src/agents/test-writer.md'), effort);
  }
});

test('normalizeClaudeEffort rejects missing values with agent and source context', () => {
  for (const effort of [undefined, null, '']) {
    assert.throws(
      () => normalizeClaudeEffort(effort, 'test-writer', 'src/agents/test-writer.md'),
      /Missing required claude effort for test-writer.*src\/agents\/test-writer\.md/,
    );
  }
});

test('normalizeClaudeEffort rejects unsupported, whitespace, and case-variant values', () => {
  for (const effort of ['bogus', ' ', ' medium ', 'Medium', 'XHIGH']) {
    assert.throws(
      () => normalizeClaudeEffort(effort, 'nodejs-implementer', 'src/agents/nodejs-implementer.md'),
      /Unsupported claude effort .* for nodejs-implementer.*src\/agents\/nodejs-implementer\.md.*expected one of: low, medium, high, xhigh, max/,
    );
  }
});

// --- validateRefs (dead-reference guard) ---

test('validateRefs accepts known refs', () => {
  assert.doesNotThrow(() =>
    validateRefs('{{SKILL:fix}} {{SKILL:apply-plan}} {{AGENT:code-validator}}', {
      knownTools: refConfig.knownTools,
      knownAgents: refConfig.knownAgents,
    }),
  );
});

test('validateRefs throws on an unknown tool ref with context', () => {
  assert.throws(
    () =>
      validateRefs('{{SKILL:aply}}', {
        knownTools: refConfig.knownTools,
        knownAgents: refConfig.knownAgents,
        context: 'x.md',
      }),
    /Unknown tool reference \{\{SKILL:aply\}\}.*x\.md/,
  );
});

test('validateRefs throws on an unknown agent ref', () => {
  assert.throws(
    () =>
      validateRefs('{{AGENT:code-validater}}', {
        knownTools: refConfig.knownTools,
        knownAgents: refConfig.knownAgents,
      }),
    /Unknown agent reference/,
  );
});

// Legacy `sf-`-prefixed placeholders are rejected with a migration message
// rather than the generic unknown-reference error (issue #106).
test('validateRefs rejects a legacy sf- tool ref with a migration message', () => {
  assert.throws(
    () =>
      validateRefs('{{SKILL:sf-fix}}', {
        knownTools: refConfig.knownTools,
        knownAgents: refConfig.knownAgents,
        context: 'x.md',
      }),
    /Legacy placeholder \{\{SKILL:sf-fix\}\} is no longer supported.*drop the "sf-" prefix.*x\.md/,
  );
});

test('validateRefs rejects a legacy sf- agent ref with a migration message', () => {
  assert.throws(
    () =>
      validateRefs('{{AGENT:sf-test-writer}}', {
        knownTools: refConfig.knownTools,
        knownAgents: refConfig.knownAgents,
      }),
    /Legacy placeholder \{\{AGENT:sf-test-writer\}\} is no longer supported/,
  );
});

test('validateRefs prefers the legacy message even when the sf- name is unknown', () => {
  // An internal tool name with the legacy prefix still reports migration, not
  // "unknown tool reference".
  assert.throws(
    () =>
      validateRefs('{{SKILL:sf-apply-plan}}', {
        knownTools: refConfig.knownTools,
        knownAgents: refConfig.knownAgents,
      }),
    /Legacy placeholder \{\{SKILL:sf-apply-plan\}\} is no longer supported/,
  );
});

// --- Central-skill ownership contract (#168) ---

function skillOwnershipManifest(overrides = {}) {
  return parseSkillOwnershipManifest(
    JSON.stringify({
      schemaVersion: 1,
      relationships: [
        {
          skill: 'effective-web',
          consumers: [{ consumer: 'test-writer', classification: 'route-when-relevant' }],
        },
      ],
      relevanceGateOwners: [],
      externalRecommendationAllowlist: ['impeccable', 'frontend-design'],
      ...overrides,
    }),
    { context: 'skill-ownership.json' },
  );
}

function skillOwnershipTable(skills = ['effective-web']) {
  const rows = skills.map(
    (skill) => `| \`${skill}\` | \`test-writer\` | route-when-relevant | Test coverage |`,
  );
  return parseSkillOwnershipTable(
    [
      '<!-- skill-ownership-table:start -->',
      '| Central skill | Effective-Flow consumer(s) | Classification | Domain coverage |',
      '| --- | --- | --- | --- |',
      ...rows,
      '<!-- skill-ownership-table:end -->',
    ].join('\n'),
    { context: 'skill-ownership.md' },
  );
}

function assertSyntheticSkillOwnershipContract({
  manifest = skillOwnershipManifest(),
  inventoryRows = skillOwnershipTable(),
  recommendation = '- `effective-web › impeccable › frontend-design`',
  relevanceGateOwners = [],
  knownConsumers = new Set(['test-writer', 'ui-implementer']),
} = {}) {
  const recommendationChains = collectRecommendedSkillChains([
    {
      consumer: 'test-writer',
      context: 'agents/test-writer.md',
      text: `## Recommended skills\n\n${recommendation}\n`,
    },
  ]);
  assertSkillOwnershipContract(
    { manifest, inventoryRows, recommendationChains, relevanceGateOwners, knownConsumers },
    { context: 'synthetic ownership contract' },
  );
  return recommendationChains;
}

test('skill-ownership helpers accept a valid relationship with external fallback skills', () => {
  const recommendationChains = assertSyntheticSkillOwnershipContract();

  assert.deepEqual(recommendationChains, [
    {
      consumer: 'test-writer',
      context: 'agents/test-writer.md',
      skills: ['effective-web', 'impeccable', 'frontend-design'],
    },
  ]);
});

test('parseSkillOwnershipManifest rejects duplicate relationships', () => {
  const relationship = {
    skill: 'effective-web',
    consumers: [{ consumer: 'test-writer', classification: 'route-when-relevant' }],
  };

  assert.throws(
    () => skillOwnershipManifest({ relationships: [relationship, relationship] }),
    /Duplicate skill-ownership relationship for "effective-web".*skill-ownership\.json/,
  );
});

test('parseSkillOwnershipManifest rejects unsupported coupling fields and malformed consumers', () => {
  assert.throws(
    () => skillOwnershipManifest({ requiredUpstreamRevision: 'abc123' }),
    /unsupported field\(s\): requiredUpstreamRevision.*skill-ownership\.json/,
  );
  assert.throws(
    () =>
      skillOwnershipManifest({
        relationships: [
          {
            skill: 'effective-web',
            consumers: [
              { consumer: 'not a real source !!!', classification: 'route-when-relevant' },
            ],
          },
        ],
      }),
    /must be a kebab-case skill name.*skill-ownership\.json/,
  );
});

test('parseSkillOwnershipManifest rejects an invalid classification', () => {
  assert.throws(
    () =>
      skillOwnershipManifest({
        relationships: [
          {
            skill: 'effective-web',
            consumers: [{ consumer: 'test-writer', classification: 'advisory' }],
          },
        ],
      }),
    /invalid or missing classification "advisory".*skill-ownership\.json/,
  );
});

test('parseSkillOwnershipManifest rejects a missing classification', () => {
  assert.throws(
    () =>
      skillOwnershipManifest({
        relationships: [
          {
            skill: 'effective-web',
            consumers: [{ consumer: 'test-writer' }],
          },
        ],
      }),
    /invalid or missing classification "".*skill-ownership\.json/,
  );
});

test('assertSkillOwnershipContract rejects a stale Markdown inventory row', () => {
  assert.throws(
    () =>
      assertSyntheticSkillOwnershipContract({
        inventoryRows: skillOwnershipTable(['effective-web', 'stale-skill']),
      }),
    /stale or extra Markdown row\(s\): stale-skill.*synthetic ownership contract/,
  );
});

test('assertSkillOwnershipContract rejects an unowned recommendation', () => {
  const manifest = skillOwnershipManifest({
    relationships: [
      {
        skill: 'effective-web',
        consumers: [{ consumer: 'ui-implementer', classification: 'delegate' }],
      },
    ],
  });

  assert.throws(
    () => assertSyntheticSkillOwnershipContract({ manifest, recommendation: '- `effective-web`' }),
    /Unowned recommendation "effective-web" for consumer "test-writer".*agents\/test-writer\.md/,
  );
});

test('assertSkillOwnershipContract rejects a stale relevance-gate owner', () => {
  const manifest = skillOwnershipManifest({ relevanceGateOwners: ['effective-web'] });

  assert.throws(
    () => assertSyntheticSkillOwnershipContract({ manifest, relevanceGateOwners: [] }),
    /stale manifest owner\(s\): effective-web.*synthetic ownership contract/,
  );
});

test('assertSkillOwnershipContract rejects an unknown fallback token', () => {
  assert.throws(
    () =>
      assertSyntheticSkillOwnershipContract({
        recommendation: '- `effective-web › impeccable › frontend-desgin`',
      }),
    /Unknown external fallback skill "frontend-desgin".*agents\/test-writer\.md/,
  );
});

test('collectRecommendedSkillChains rejects unquoted or split fallback syntax', () => {
  for (const recommendation of ['- effective-web', '- `effective-web` › typo-skill']) {
    assert.throws(
      () =>
        assertSyntheticSkillOwnershipContract({
          recommendation,
        }),
      /must start with exactly one backticked skill or fallback chain.*agents\/test-writer\.md/,
    );
  }
});

test('assertSkillOwnershipContract rejects a relationship with an unknown consumer', () => {
  const manifest = skillOwnershipManifest({
    relationships: [
      {
        skill: 'effective-web',
        consumers: [{ consumer: 'ghost-worker', classification: 'delegate' }],
      },
    ],
  });

  assert.throws(
    () =>
      assertSyntheticSkillOwnershipContract({
        manifest,
        recommendation: '- `impeccable`',
        knownConsumers: new Set(['test-writer']),
      }),
    /Unknown Effective Flow consumer "ghost-worker" for skill "effective-web"/,
  );
});

const checkedInSkillOwnershipManifest = parseSkillOwnershipManifest(
  readFileSync(new URL('../docs/developer-guide/skill-ownership.json', import.meta.url), 'utf8'),
  { context: 'docs/developer-guide/skill-ownership.json' },
);
const checkedInSkillOwnershipRows = parseSkillOwnershipTable(
  readFileSync(new URL('../docs/developer-guide/skill-ownership.md', import.meta.url), 'utf8'),
  { context: 'docs/developer-guide/skill-ownership.md' },
);
const checkedInRecommendationSources = ['tools', 'agents'].flatMap((directory) => {
  const sourceDirectory = new URL(`../src/${directory}/`, import.meta.url);
  return readdirSync(sourceDirectory)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({
      consumer: file.slice(0, -'.md'.length),
      context: `${directory}/${file}`,
      text: readFileSync(new URL(file, sourceDirectory), 'utf8'),
    }));
});
const checkedInRecommendationChains = collectRecommendedSkillChains(checkedInRecommendationSources);
const checkedInKnownOwnershipConsumers = new Set(
  ['tools', 'agents', 'shared'].flatMap((directory) => {
    const sourceDirectory = new URL(`../src/${directory}/`, import.meta.url);
    return readdirSync(sourceDirectory)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -'.md'.length));
  }),
);
const checkedInRelevanceGateOwners = parseSkillOwnershipRelevanceGateOwners(
  readFileSync(new URL('../src/shared/central-reasoning-delegation.md', import.meta.url), 'utf8'),
  { context: 'src/shared/central-reasoning-delegation.md' },
);

test('checked-in skill-ownership manifest, table, recommendations, and marker stay reconciled', () => {
  assert.doesNotThrow(() =>
    assertSkillOwnershipContract(
      {
        manifest: checkedInSkillOwnershipManifest,
        inventoryRows: checkedInSkillOwnershipRows,
        recommendationChains: checkedInRecommendationChains,
        relevanceGateOwners: checkedInRelevanceGateOwners,
        knownConsumers: checkedInKnownOwnershipConsumers,
      },
      { context: 'checked-in skill-ownership contract' },
    ),
  );
});

test('checked-in skill-ownership diagnostics name a deliberately removed skill', () => {
  const manifestWithoutEffectiveWeb = {
    ...checkedInSkillOwnershipManifest,
    relationships: checkedInSkillOwnershipManifest.relationships.filter(
      ({ skill }) => skill !== 'effective-web',
    ),
    relevanceGateOwners: checkedInSkillOwnershipManifest.relevanceGateOwners.filter(
      (skill) => skill !== 'effective-web',
    ),
  };

  assert.throws(
    () =>
      assertSkillOwnershipContract(
        {
          manifest: manifestWithoutEffectiveWeb,
          inventoryRows: checkedInSkillOwnershipRows,
          recommendationChains: checkedInRecommendationChains,
          relevanceGateOwners: checkedInRelevanceGateOwners.filter(
            (skill) => skill !== 'effective-web',
          ),
          knownConsumers: checkedInKnownOwnershipConsumers,
        },
        { context: 'checked-in skill-ownership contract' },
      ),
    /stale or extra Markdown row\(s\): effective-web.*checked-in skill-ownership contract/,
  );
});

test('checked-in skill-ownership diagnostics name a deliberately removed Markdown row', () => {
  const rowsWithoutEffectiveWeb = checkedInSkillOwnershipRows.filter(
    ({ skill }) => skill !== 'effective-web',
  );

  assert.throws(
    () =>
      assertSkillOwnershipContract(
        {
          manifest: checkedInSkillOwnershipManifest,
          inventoryRows: rowsWithoutEffectiveWeb,
          recommendationChains: checkedInRecommendationChains,
          relevanceGateOwners: checkedInRelevanceGateOwners,
          knownConsumers: checkedInKnownOwnershipConsumers,
        },
        { context: 'checked-in skill-ownership contract' },
      ),
    /missing Markdown row\(s\): effective-web.*checked-in skill-ownership contract/,
  );
});

test('advisory ownership audit accepts checkout, skills directory, and listing inputs', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'effective-flow-ownership-audit-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const skillsDirectory = join(fixture, 'skills');
  for (const skill of ['effective-web', 'review-candidate']) {
    const skillDirectory = join(skillsDirectory, skill);
    mkdirSync(skillDirectory, { recursive: true });
    writeFileSync(join(skillDirectory, 'SKILL.md'), `# ${skill}\n`);
  }
  const listing = join(fixture, 'skills.txt');
  writeFileSync(listing, 'skills/effective-web\nskills/review-candidate\n');
  const manifestPath = new URL('../docs/developer-guide/skill-ownership.json', import.meta.url);
  const manifestBefore = readFileSync(manifestPath, 'utf8');

  for (const input of [fixture, skillsDirectory, listing]) {
    const result = auditSkillOwnership(input);
    assert.deepEqual(result.candidates, ['review-candidate']);
  }
  assert.equal(readFileSync(manifestPath, 'utf8'), manifestBefore);
  assert.throws(
    () => auditSkillOwnership(join(fixture, 'missing')),
    /Skills directory or listing not found/,
  );

  const cli = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../scripts/audit-skill-ownership.mjs', import.meta.url)), fixture],
    { encoding: 'utf8' },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /review-candidate/);
  assert.match(cli.stdout, /Audit output is advisory/);
});

// --- Shared project-routing contract (#164) ---

const projectRoutingSource = readFileSync(
  new URL('../src/shared/project-routing.md', import.meta.url),
  'utf8',
);
const projectRoutes = parseProjectRoutingTable(projectRoutingSource, {
  context: 'src/shared/project-routing.md',
});

test('parseProjectRoutingTable reads the ordered machine-readable table', () => {
  assert.deepEqual(
    projectRoutes.map(({ priority, route, matcher, decision }) => ({
      priority,
      route,
      matcher,
      decision,
    })),
    [
      {
        priority: 10,
        route: 'excluded-generated-vendored',
        matcher: 'excluded',
        decision: 'exclude',
      },
      {
        priority: 20,
        route: 'documentation',
        matcher: 'documentation',
        decision: 'route',
      },
      { priority: 30, route: 'tooling', matcher: 'tooling', decision: 'route' },
      {
        priority: 40,
        route: 'frontend-js-ts',
        matcher: 'frontend-js-ts',
        decision: 'route',
      },
      {
        priority: 50,
        route: 'node-backend-cli',
        matcher: 'node-backend-cli',
        decision: 'route',
      },
      { priority: 60, route: 'rust', matcher: 'rust-product', decision: 'route' },
      {
        priority: 70,
        route: 'generic-product',
        matcher: 'generic-product',
        decision: 'route-degraded',
      },
      { priority: 80, route: 'ambiguous', matcher: 'otherwise', decision: 'clarify' },
    ],
  );
});

test('assertProjectRoutingContract locks required routes, order, fallbacks, and live agent names', () => {
  assert.doesNotThrow(() =>
    assertProjectRoutingContract(projectRoutes, { context: 'src/shared/project-routing.md' }),
  );
  assert.deepEqual(
    PROJECT_ROUTING_REQUIRED_ROUTES.map(({ route }) => route),
    projectRoutes.map(({ route }) => route),
  );
  const generic = projectRoutes.find(({ route }) => route === 'generic-product');
  assert.equal(generic.implementer, '{{AGENT:generic-product-implementer}}');
  assert.equal(generic.reviewer, '{{AGENT:generic-product-reviewer}}');
  assert.ok(
    projectRoutes.findIndex(({ route }) => route === 'tooling') <
      projectRoutes.findIndex(({ route }) => route === 'generic-product'),
  );
  assert.equal(projectRoutes.at(-1).route, 'ambiguous');
});

test('parseProjectRoutingTable rejects malformed and non-deterministic tables', () => {
  assert.throws(() => parseProjectRoutingTable('| Priority | Route |\n'), /exactly one start/);
  assert.throws(
    () =>
      parseProjectRoutingTable(
        projectRoutingSource.replace(
          /(\|\s*)20(\s*\|\s*`documentation`)/,
          (_, before, after) => `${before}10${after}`,
        ),
      ),
    /strictly ascending/,
  );
  assert.throws(
    () =>
      assertProjectRoutingContract(
        projectRoutes.map((route) =>
          route.route === 'generic-product'
            ? { ...route, implementer: '{{AGENT:generic-implementer}}' }
            : route,
        ),
      ),
    /generic-product-implementer/,
  );
});

const projectRoutingFixtures = [
  'python-product.json',
  'go-product.json',
  'unknown-product.json',
  'tooling-only.json',
  'frontend-js-ts.json',
  'node-backend-cli.json',
  'rust-product.json',
  'mixed-repository.json',
  'ambiguous-role.json',
];

for (const fixtureFile of projectRoutingFixtures) {
  const fixture = JSON.parse(
    readFileSync(new URL(`fixtures/project-routing/${fixtureFile}`, import.meta.url), 'utf8'),
  );
  test(`project routing fixture: ${fixture.name}`, () => {
    const result = classifyProjectRoutingScope(projectRoutes, fixture.scope, {
      context: fixtureFile,
    });
    assert.deepEqual(
      result.files.map(({ route }) => route),
      fixture.expectedRoutes,
    );
    assert.equal(result.clarificationRequired, fixture.clarificationRequired);
  });
}

test('mixed project routing retains every specialist and fallback bucket in table order', () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('fixtures/project-routing/mixed-repository.json', import.meta.url),
      'utf8',
    ),
  );
  const result = classifyProjectRoutingScope(projectRoutes, fixture.scope);
  assert.deepEqual(
    result.buckets.map(({ route }) => route),
    [
      'excluded-generated-vendored',
      'documentation',
      'tooling',
      'frontend-js-ts',
      'node-backend-cli',
      'rust',
      'generic-product',
    ],
  );
});

// --- Shared next-steps contract ---

// A synthetic table keeps the malformed-input cases independent of the live
// fragment: a broken table there must fail its own test, not every case below.
function nextStepsTable(...rows) {
  return [
    'prose above the contract',
    '',
    NEXT_STEPS_TABLE_START,
    '',
    '| Tool | Condition | Then | Or |',
    '| ---- | --------- | ---- | --- |',
    ...rows,
    '',
    NEXT_STEPS_TABLE_END,
    '',
    'prose below the contract',
  ].join('\n');
}

const NEXT_STEPS_ROWS = [
  '| concept | deep review declined | {{SKILL:review}} <concept-file> | — |',
  '| plan | deep review done | {{SKILL:apply}} <plan-file> | {{SKILL:plan}} <plan-file> |',
  '| review | local report written | {{SKILL:apply}} <report> | — |',
  '| apply | plan clarity gate failed | {{SKILL:plan}} <plan-file> | — |',
];
const nextStepsFixture = nextStepsTable(...NEXT_STEPS_ROWS);
const nextStepsEmitting = new Set(['concept', 'plan', 'review', 'apply']);

const NEXT_STEPS_DOC_HEAD = [
  '# Tool flow',
  '',
  'What each tool proposes next.',
  '',
  '| Tool | Condition | Then | Or |',
  '| ---- | --------- | ---- | --- |',
];
const NEXT_STEPS_DOC_ROWS = [
  '| `concept` | deep review declined | `/effective-flow review <concept-file>` | — |',
  '| `plan` | deep review done | `/effective-flow apply <plan-file>` | `/effective-flow plan <plan-file>` |',
  '| `review` | local report written | `/effective-flow apply <report>` | — |',
  '| `apply` | plan clarity gate failed | `/effective-flow plan <plan-file>` | — |',
];

function nextStepsDoc(mutate = (rows) => rows) {
  return [...NEXT_STEPS_DOC_HEAD, ...mutate([...NEXT_STEPS_DOC_ROWS])].join('\n');
}

function replaceDocRow(index, row) {
  return (rows) => {
    rows[index] = row;
    return rows;
  };
}

test('parseNextStepsTable reads the live shared next-steps table', () => {
  const source = readFileSync(new URL('../src/shared/next-steps.md', import.meta.url), 'utf8');
  const edges = parseNextStepsTable(source, { context: 'src/shared/next-steps.md' });

  assert.ok(edges.length > 0, 'the live table must carry rows');
  for (const edge of edges) {
    assert.ok(edge.tool, `every row names a tool: ${JSON.stringify(edge)}`);
    assert.ok(edge.then, `every row carries a first edge: ${JSON.stringify(edge)}`);
  }
  // The requirement's core fix: planning hands the user `apply <plan-file>`
  // instead of a guessed implementation tool.
  assert.ok(
    edges.some((edge) => edge.tool === 'plan' && edge.then.startsWith('{{SKILL:apply}}')),
    'the live table must route a finished plan to apply',
  );
  // Every edge target is itself a tool with rows, so no edge leads into a
  // terminal that recommends nothing.
  assert.doesNotThrow(() =>
    assertNextStepsContract(edges, {
      emittingTools: new Set(edges.map((edge) => edge.tool)),
      context: 'src/shared/next-steps.md',
    }),
  );
});

test('parseNextStepsTable normalizes cells and keeps source order', () => {
  const edges = parseNextStepsTable(nextStepsFixture, { context: 'fixture' });
  assert.deepEqual(edges, [
    {
      tool: 'concept',
      condition: 'deep review declined',
      then: '{{SKILL:review}} <concept-file>',
      or: '',
    },
    {
      tool: 'plan',
      condition: 'deep review done',
      then: '{{SKILL:apply}} <plan-file>',
      or: '{{SKILL:plan}} <plan-file>',
    },
    {
      tool: 'review',
      condition: 'local report written',
      then: '{{SKILL:apply}} <report>',
      or: '',
    },
    {
      tool: 'apply',
      condition: 'plan clarity gate failed',
      then: '{{SKILL:plan}} <plan-file>',
      or: '',
    },
  ]);
  // oxfmt pads every column, so the parser must not depend on the cell width.
  assert.deepEqual(
    parseNextStepsTable(nextStepsFixture.replace(/\| concept /, '|  concept   ')),
    edges,
  );
});

test('parseNextStepsTable rejects a missing or duplicated marker pair', () => {
  assert.throws(
    () => parseNextStepsTable('| Tool | Condition | Then | Or |\n'),
    /exactly one start and end marker/,
  );
  assert.throws(
    () => parseNextStepsTable(`${nextStepsFixture}\n${NEXT_STEPS_TABLE_START}\n`),
    /exactly one start and end marker/,
  );
  assert.throws(
    () =>
      parseNextStepsTable(
        [NEXT_STEPS_TABLE_END, '', ...NEXT_STEPS_ROWS, '', NEXT_STEPS_TABLE_START].join('\n'),
      ),
    /markers are out of order/,
  );
});

test('parseNextStepsTable rejects a malformed table body', () => {
  assert.throws(
    () => parseNextStepsTable([NEXT_STEPS_TABLE_START, '', NEXT_STEPS_TABLE_END].join('\n')),
    /has no data rows/,
  );
  assert.throws(
    () => parseNextStepsTable(nextStepsFixture.replace('| Or |', '| Otherwise |')),
    /headers must be: Tool, Condition, Then, Or/,
  );
  assert.throws(
    () => parseNextStepsTable(nextStepsFixture.replace('| --------- |', '| ~~~~~~~~~ |')),
    /invalid separator row/,
  );
  // The cell count alone is unusable against a table of dozens of rows, so the
  // offending row has to be part of the message.
  assert.throws(
    () => parseNextStepsTable(nextStepsTable('| plan | deep review done | {{SKILL:apply}} |')),
    /row has 3 cells; expected 4: "\| plan \| deep review done \| \{\{SKILL:apply\}\} \|"/,
  );
});

test('parseNextStepsTable rejects an empty tool, condition or first edge, and a duplicate row key', () => {
  assert.throws(
    () => parseNextStepsTable(nextStepsTable('|  | deep review done | {{SKILL:apply}} | — |')),
    /require a tool, a condition, and a first edge/,
  );
  // The condition is the end state a run matches its row on; an empty one makes
  // the row unaddressable instead of merely undocumented.
  assert.throws(
    () => parseNextStepsTable(nextStepsTable('| plan |  | {{SKILL:apply}} <plan-file> | — |')),
    /require a tool, a condition, and a first edge/,
  );
  assert.throws(
    () => parseNextStepsTable(nextStepsTable('| plan | deep review done | — | — |')),
    /require a tool, a condition, and a first edge/,
  );
  assert.throws(
    () => parseNextStepsTable(nextStepsTable(NEXT_STEPS_ROWS[1], NEXT_STEPS_ROWS[1])),
    /Duplicate next-steps row "plan \| deep review done"/,
  );
  // Two distinct rows whose fields concatenate to the same string are not a
  // duplicate: the key is encoded, so the field boundary survives it.
  assert.doesNotThrow(() =>
    parseNextStepsTable(
      nextStepsTable(
        '| plan | deep review done | {{SKILL:apply}} <plan-file> | — |',
        '| plan deep | review done | {{SKILL:plan}} <plan-file> | — |',
      ),
    ),
  );
});

test('assertNextStepsContract accepts a table that covers its emitting set exactly', () => {
  assert.doesNotThrow(() =>
    assertNextStepsContract(parseNextStepsTable(nextStepsFixture), {
      emittingTools: nextStepsEmitting,
      context: 'fixture',
    }),
  );
});

test('assertNextStepsContract rejects a third edge and an unresolvable edge cell', () => {
  const threeEdges = parseNextStepsTable(
    nextStepsTable(
      ...NEXT_STEPS_ROWS.slice(0, 1),
      '| plan | deep review done | {{SKILL:apply}} <plan-file> | {{SKILL:review}} <plan-file> {{SKILL:plan}} <plan-file> |',
      ...NEXT_STEPS_ROWS.slice(2),
    ),
  );
  assert.throws(
    () => assertNextStepsContract(threeEdges, { emittingTools: nextStepsEmitting }),
    /carries 3 edges; at most two are allowed/,
  );

  const handWritten = parseNextStepsTable(
    nextStepsTable(
      ...NEXT_STEPS_ROWS.slice(0, 3),
      '| apply | gate failed | plan <plan-file> | — |',
    ),
  );
  assert.throws(
    () => assertNextStepsContract(handWritten, { emittingTools: nextStepsEmitting }),
    /invalid Then cell "plan <plan-file>"/,
  );
});

test('assertNextStepsContract rejects a second reference hidden in one edge cell', () => {
  // The argument tail of the cell shape matches anything, so a second reference
  // rides along inside it: the shape check reports the first target only, and
  // the row-level count stays at two because the `Or` cell is empty. Without the
  // per-cell count the smuggled target reaches no check at all and ships as the
  // raw `tools/apply-plan.md` path the renderer produces for it.
  const smuggled = parseNextStepsTable(
    nextStepsTable(
      ...NEXT_STEPS_ROWS.slice(0, 3),
      '| apply | plan clarity gate failed | {{SKILL:apply}} <plan-file> {{SKILL:apply-plan}} | — |',
    ),
  );
  assert.throws(
    () => assertNextStepsContract(smuggled, { emittingTools: nextStepsEmitting }),
    /has a Then cell with 2 references .*; expected exactly one/,
  );
});

test('assertNextStepsContract rejects an edge target the user cannot invoke', () => {
  // Emitting and invocable are different questions: a tool may own rows while
  // the renderer still writes it as `tools/<name>.md`, which nobody can type.
  const edges = parseNextStepsTable(nextStepsFixture);
  assert.throws(
    () =>
      assertNextStepsContract(edges, {
        emittingTools: nextStepsEmitting,
        invocableTools: new Set([...nextStepsEmitting].filter((name) => name !== 'apply')),
      }),
    /recommends "apply", which is not a user-invocable tool/,
  );
  assert.throws(
    () =>
      assertNextStepsContract(edges, {
        emittingTools: nextStepsEmitting,
        invocableTools: [],
      }),
    /non-empty invocable tool set/,
  );
  // Omitted, the emitting set stays the fallback, so the check can never be
  // silently skipped by a caller that forgets the argument.
  assert.doesNotThrow(() =>
    assertNextStepsContract(edges, {
      emittingTools: nextStepsEmitting,
      invocableTools: nextStepsEmitting,
    }),
  );
});

test('assertNextStepsContract rejects an edge target outside the emitting set', () => {
  const deadTarget = parseNextStepsTable(
    nextStepsTable(
      ...NEXT_STEPS_ROWS.slice(0, 3),
      '| apply | plan clarity gate failed | {{SKILL:apply-plan}} <plan-file> | — |',
    ),
  );
  assert.throws(
    () => assertNextStepsContract(deadTarget, { emittingTools: nextStepsEmitting }),
    /recommends "apply-plan", which is not an emitting tool/,
  );
});

test('assertNextStepsContract enforces two-way coverage between the table and the emitting set', () => {
  const edges = parseNextStepsTable(nextStepsFixture);
  assert.throws(
    () =>
      assertNextStepsContract(edges, {
        emittingTools: new Set([...nextStepsEmitting, 'commit', 'pr']),
      }),
    /emitting tool\(s\) without a row: commit, pr/,
  );
  assert.throws(
    () =>
      assertNextStepsContract(edges, {
        emittingTools: new Set([...nextStepsEmitting].filter((name) => name !== 'concept')),
      }),
    /row\(s\) for a non-emitting tool: concept/,
  );
  assert.throws(() => assertNextStepsContract(edges, {}), /non-empty emitting tool set/);
});

test('findNextStepsDocViolations accepts a documentation page in the rendered invocation form', () => {
  assert.deepEqual(
    findNextStepsDocViolations(nextStepsDoc(), parseNextStepsTable(nextStepsFixture), {
      context: 'docs/user-guide/tool-flow.md',
    }),
    [],
  );
});

test('findNextStepsDocViolations flags one mismatching row per column', () => {
  const edges = parseNextStepsTable(nextStepsFixture);
  const context = 'docs/user-guide/tool-flow.md';
  const cases = [
    {
      column: 'Tool',
      row: 1,
      expected: 'concept',
      actual: 'concept-review',
      mutation: replaceDocRow(
        0,
        '| `concept-review` | deep review declined | `/effective-flow review <concept-file>` | — |',
      ),
    },
    {
      column: 'Condition',
      row: 1,
      expected: 'deep review declined',
      actual: 'deep review skipped',
      mutation: replaceDocRow(
        0,
        '| `concept` | deep review skipped | `/effective-flow review <concept-file>` | — |',
      ),
    },
    {
      column: 'Then',
      row: 3,
      expected: '/effective-flow apply <report>',
      actual: '/effective-flow apply',
      mutation: replaceDocRow(
        2,
        '| `review` | local report written | `/effective-flow apply` | — |',
      ),
    },
    {
      column: 'Or',
      row: 2,
      expected: '/effective-flow plan <plan-file>',
      actual: '',
      mutation: replaceDocRow(
        1,
        '| `plan` | deep review done | `/effective-flow apply <plan-file>` | — |',
      ),
    },
  ];

  for (const { column, row, expected, actual, mutation } of cases) {
    assert.deepEqual(
      findNextStepsDocViolations(nextStepsDoc(mutation), edges, { context }),
      [{ row, column, expected, actual, context }],
      `mismatching ${column} column must be reported once`,
    );
  }
});

test('findNextStepsDocViolations reports a missing table, a missing row, and a surplus row', () => {
  const edges = parseNextStepsTable(nextStepsFixture);
  const context = 'docs/user-guide/tool-flow.md';

  assert.deepEqual(
    findNextStepsDocViolations('# Tool flow\n\nNo table here.\n', edges, { context }),
    [
      {
        row: 0,
        column: 'table',
        expected: 'Tool | Condition | Then | Or',
        actual: 'missing',
        context,
      },
    ],
  );

  assert.deepEqual(
    findNextStepsDocViolations(
      nextStepsDoc((rows) => rows.slice(0, 3)),
      edges,
      { context },
    ),
    [
      {
        row: 4,
        column: 'row',
        expected: 'apply | plan clarity gate failed | /effective-flow plan <plan-file> | ',
        actual: 'missing',
        context,
      },
    ],
  );

  assert.deepEqual(
    findNextStepsDocViolations(
      nextStepsDoc((rows) => [...rows, '| `commit` | always | `/effective-flow pr` | — |']),
      edges,
      { context },
    ),
    [
      {
        row: 5,
        column: 'row',
        expected: 'no further row',
        actual: 'commit | always | /effective-flow pr | ',
        context,
      },
    ],
  );
});

test('findNextStepsDocViolations reports a documentation table without a separator row', () => {
  const edges = parseNextStepsTable(nextStepsFixture);
  const context = 'docs/user-guide/tool-flow.md';
  const violation = { row: 0, column: 'separator', expected: '--- | --- | --- | ---', context };

  // Skipping the alignment row blindly would swallow the first data row and
  // report every following row as shifted — a cascade in place of the one real
  // defect.
  assert.deepEqual(
    findNextStepsDocViolations(
      [...NEXT_STEPS_DOC_HEAD.slice(0, -1), ...NEXT_STEPS_DOC_ROWS].join('\n'),
      edges,
      { context },
    ),
    [{ ...violation, actual: NEXT_STEPS_DOC_ROWS[0] }],
  );

  assert.deepEqual(
    findNextStepsDocViolations(NEXT_STEPS_DOC_HEAD.slice(0, -1).join('\n'), edges, { context }),
    [{ ...violation, actual: 'missing' }],
  );
});

// --- assertQuotedDescription (quoting guard) ---

test('assertQuotedDescription accepts a strictly quoted description', () => {
  assert.doesNotThrow(() => assertQuotedDescription('description: "ok"'));
});

test('assertQuotedDescription rejects an unquoted description', () => {
  assert.throws(
    () => assertQuotedDescription('description: nope', { context: 'x.md' }),
    /strictly double-quoted.*x\.md/,
  );
});

test('assertQuotedDescription rejects a missing description', () => {
  assert.throws(() => assertQuotedDescription('name: firmo'), /Missing description field/);
});

// --- transformRefs ---

test('transformRefs maps exposed vs internal tools and agents per harness', () => {
  assert.equal(transformRefs('{{SKILL:fix}}', 'claude', refConfig), '/effective-flow fix');
  assert.equal(transformRefs('{{SKILL:fix}}', 'codex', refConfig), '$effective-flow fix');
  assert.equal(
    transformRefs('{{FIRMO}} plan #118', 'claude', refConfig),
    '/effective-flow plan #118',
  );
  assert.equal(
    transformRefs('{{FIRMO}} plan #118', 'codex', refConfig),
    '$effective-flow plan #118',
  );
  assert.equal(transformRefs('{{SKILL:apply-plan}}', 'claude', refConfig), '`tools/apply-plan.md`');
  assert.equal(transformRefs('{{SKILL:apply-plan}}', 'codex', refConfig), '`tools/apply-plan.md`');
  assert.equal(
    transformRefs('{{AGENT:nodejs-implementer}}', 'claude', refConfig),
    '`effective-flow-nodejs-implementer`',
  );
  assert.equal(
    transformRefs('{{AGENT:nodejs-implementer}}', 'codex', refConfig),
    '`effective-flow-nodejs-implementer`',
  );
  assert.equal(
    transformRefs('{{AGENT:nodejs-implementer}}', 'portable', refConfig),
    '`effective-flow-nodejs-implementer`',
  );
});

test('portable refs use harness-neutral tool notation', () => {
  assert.equal(transformRefs('{{FIRMO}} fix', 'portable', refConfig), 'effective-flow fix');
  assert.equal(transformRefs('{{SKILL:fix}}', 'portable', refConfig), 'effective-flow fix');
});

// Rendering must apply the same guard as validation: the known-name sets are
// required, so transformRefs can never render an unvalidated reference (#106).
test('transformRefs requires the known-name sets', () => {
  for (const harness of ['claude', 'codex']) {
    assert.throws(
      () =>
        transformRefs('{{SKILL:fix}}', harness, {
          exposedTools: refConfig.exposedTools,
          agentPrefix: refConfig.agentPrefix,
          skillName: refConfig.skillName,
          context: 'x.md',
        }),
      /transformRefs requires knownTools and knownAgents.*x\.md/,
    );
  }
});

// No accepted placeholder can render a non-existent target: legacy sf- refs are
// rejected for exposed tools, internal tools, and agents, on both harnesses.
test('transformRefs rejects legacy sf- refs for exposed, internal, and agent names on both harnesses', () => {
  const legacyRefs = [
    '{{SKILL:sf-fix}}', // exposed tool
    '{{SKILL:sf-apply-plan}}', // internal tool
    '{{AGENT:sf-test-writer}}', // agent
  ];
  for (const harness of ['claude', 'codex']) {
    for (const ref of legacyRefs) {
      assert.throws(
        () => transformRefs(ref, harness, refConfig),
        /Legacy placeholder .* is no longer supported/,
        `${ref} on ${harness}`,
      );
    }
  }
});

// --- renderDeprecatedAliasClause ---

// Mirror the three per-harness invocation spellings build.mjs's own
// skillInvocation(harness, name) produces, so a drift in either place would
// show up as a mismatch here rather than being masked by a shared helper.
const HARNESS_INVOCATIONS = {
  claude: (name) => `/effective-flow ${name}`,
  codex: (name) => `$effective-flow ${name}`,
  portable: (name) => `effective-flow ${name}`,
};

test('renderDeprecatedAliasClause renders one bullet per alias, using the caller invocation syntax', () => {
  const aliases = [{ alias: 'pr-review', replacement: 'merge-gate' }];
  for (const [harness, skillInvocation] of Object.entries(HARNESS_INVOCATIONS)) {
    const clause = renderDeprecatedAliasClause(aliases, skillInvocation);
    // Every harness must name the alias's own invocation and the replacement's invocation in
    // that harness's exact spelling — a hard-coded `/effective-flow` here would pass on Claude
    // and silently mis-render on Codex/portable.
    assert.match(
      clause,
      new RegExp(`\`${escapeRegex(skillInvocation('pr-review'))}\``),
      `${harness}: must render the alias invocation`,
    );
    assert.match(
      clause,
      new RegExp(`\`${escapeRegex(skillInvocation('merge-gate'))}\``),
      `${harness}: must render the replacement invocation`,
    );
  }
});

test('renderDeprecatedAliasClause names both the alias file and the replacement file', () => {
  const clause = renderDeprecatedAliasClause(
    [{ alias: 'pr-review', replacement: 'merge-gate' }],
    HARNESS_INVOCATIONS.claude,
  );
  // The dispatch rule only routes an unlisted name if the clause tells the reader which two
  // tool files are involved; naming just the alias (or just the replacement) would leave the
  // "read tools/merge-gate.md" step unstated.
  assert.match(clause, /`tools\/pr-review\.md`/, 'must name the alias tool file');
  assert.match(clause, /`tools\/merge-gate\.md`/, 'must name the replacement tool file');
});

test('renderDeprecatedAliasClause returns an empty string for an empty alias list', () => {
  assert.equal(renderDeprecatedAliasClause([], HARNESS_INVOCATIONS.claude), '');
});

test('renderDeprecatedAliasClause throws on a non-array alias list', () => {
  assert.throws(
    () => renderDeprecatedAliasClause('pr-review', HARNESS_INVOCATIONS.claude),
    /must be an array/,
  );
});

test('renderDeprecatedAliasClause throws when skillInvocation is not a function', () => {
  assert.throws(
    () =>
      renderDeprecatedAliasClause([{ alias: 'pr-review', replacement: 'merge-gate' }], undefined),
    /requires a skillInvocation\(name\) function/,
  );
});

test('renderDeprecatedAliasClause throws on an entry with a blank alias', () => {
  assert.throws(
    () =>
      renderDeprecatedAliasClause(
        [{ alias: '', replacement: 'merge-gate' }],
        HARNESS_INVOCATIONS.claude,
      ),
    /requires an alias name/,
  );
});

test('renderDeprecatedAliasClause throws on an entry with a blank replacement', () => {
  assert.throws(
    () =>
      renderDeprecatedAliasClause(
        [{ alias: 'pr-review', replacement: '' }],
        HARNESS_INVOCATIONS.claude,
      ),
    /requires a replacement tool name/,
  );
});

test('renderBody rejects a legacy sf- ref on both harnesses', () => {
  for (const harness of ['claude', 'codex']) {
    assert.throws(
      () => renderBody('Ruft {{SKILL:sf-fix}} auf.\n', harness, { ...refConfig, context: 't.md' }),
      /Legacy placeholder \{\{SKILL:sf-fix\}\} is no longer supported.*t\.md/,
    );
  }
});

// --- parseAskBlock ---

test('parseAskBlock parses an options block', () => {
  const block =
    'header: Commits\nquestion: Welche?\noptions:\n  - label: A\n    description: erste\n  - label: B\n    description: zweite\n';
  const r = parseAskBlock(block);
  assert.equal(r.header, 'Commits');
  assert.equal(r.question, 'Welche?');
  assert.equal(r.language, 'en');
  assert.deepEqual(r.options, [
    { label: 'A', description: 'erste' },
    { label: 'B', description: 'zweite' },
  ]);
});

test('parseAskBlock handles an approval block', () => {
  const r = parseAskBlock('header: Freigabe\nquestion: Ok?\ntype: approval\nlanguage: de\n');
  assert.equal(r.type, 'approval');
  assert.equal(r.language, 'de');
  assert.deepEqual(r.options, []);
});

test('parseAskBlock throws with context on a missing header', () => {
  assert.throws(
    () => parseAskBlock('question: Q\n', { context: 'x.md' }),
    /missing header field.*x\.md/,
  );
});

test('parseAskBlock enforces the header length limit', () => {
  const long = 'x'.repeat(ASK_MAX_HEADER_LENGTH + 1);
  assert.throws(
    () => parseAskBlock(`header: ${long}\nquestion: Q\ntype: approval\n`, { context: 'x.md' }),
    /exceeds 12 characters.*x\.md/,
  );
});

test('parseAskBlock rejects an unknown type', () => {
  assert.throws(
    () => parseAskBlock('header: H\nquestion: Q\ntype: aproval\n', { context: 'x.md' }),
    /unknown type "aproval".*x\.md/,
  );
});

test('parseAskBlock rejects invalid and empty language values with source context', () => {
  for (const [languageLine, expectedValue] of [
    ['language: fr', 'fr'],
    ['language: EN', 'EN'],
    ['language:', ''],
  ]) {
    assert.throws(
      () =>
        parseAskBlock(`header: H\nquestion: Q\ntype: approval\n${languageLine}\n`, {
          context: 'workflow.md',
        }),
      new RegExp(`unknown language "${expectedValue}".*allowed: en, de.*workflow\\.md`),
    );
  }
});

test('parseAskBlock rejects duplicate language fields with source context', () => {
  for (const languageLines of ['language: en\nlanguage: de', 'language: de\nlanguage: de']) {
    assert.throws(
      () =>
        parseAskBlock(`header: H\nquestion: Q\ntype: approval\n${languageLines}\n`, {
          context: 'duplicate.md',
        }),
      /duplicate language fields.*duplicate\.md/,
    );
  }
});

test('renderBody localizes only generated ask scaffolding for both harnesses', () => {
  const optionsBlock = (language) =>
    [
      '```ask',
      'when: die Freigabe fehlt',
      'header: Freigabe',
      'question: Weiter?',
      ...(language ? [`language: ${language}`] : []),
      'options:',
      '  - label: Ja',
      '    description: Die Quelle bleibt unverändert',
      '```',
    ].join('\n');
  const approvalBlock = (language) =>
    [
      '```ask',
      'when: approval is required',
      'header: Approval',
      'question: Continue?',
      'type: approval',
      ...(language ? [`language: ${language}`] : []),
      '```',
    ].join('\n');

  assert.equal(
    renderBody(optionsBlock(), 'claude', { ...refConfig, context: 'default-options.md' }),
    [
      'If die Freigabe fehlt:',
      '',
      'Use the `AskUserQuestion` tool with the following parameters:',
      '- header: "Freigabe"',
      '- question: "Weiter?"',
      '- multiSelect: false',
      '- options:',
      '  - label: "Ja", description: "Die Quelle bleibt unverändert"',
    ].join('\n'),
  );
  assert.equal(
    renderBody(optionsBlock(), 'codex', { ...refConfig, context: 'default-options.md' }),
    [
      'If die Freigabe fehlt: Ask the user: **Weiter?**',
      '- Ja -- Die Quelle bleibt unverändert',
    ].join('\n'),
  );
  assert.equal(
    renderBody(optionsBlock('de'), 'claude', { ...refConfig, context: 'german-options.md' }),
    [
      'Wenn die Freigabe fehlt:',
      '',
      'Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:',
      '- header: "Freigabe"',
      '- question: "Weiter?"',
      '- multiSelect: false',
      '- options:',
      '  - label: "Ja", description: "Die Quelle bleibt unverändert"',
    ].join('\n'),
  );
  assert.equal(
    renderBody(optionsBlock('de'), 'codex', { ...refConfig, context: 'german-options.md' }),
    [
      'Wenn die Freigabe fehlt: Frage den User: **Weiter?**',
      '- Ja -- Die Quelle bleibt unverändert',
    ].join('\n'),
  );
  assert.equal(
    renderBody(approvalBlock(), 'claude', { ...refConfig, context: 'default-approval.md' }),
    [
      'If approval is required:',
      '',
      'Use the `AskUserQuestion` tool with the following parameters:',
      '- header: "Approval"',
      '- question: "Continue?"',
      '- multiSelect: false',
      '- options:',
      '  - label: "Yes", description: "Approval granted"',
      '  - label: "Adjust", description: "Enter feedback as free text"',
    ].join('\n'),
  );
  assert.equal(
    renderBody(approvalBlock(), 'codex', { ...refConfig, context: 'default-approval.md' }),
    'If approval is required: Ask the user: **Continue?** Answer with "Yes" or enter feedback as free text.',
  );
  assert.equal(
    renderBody(approvalBlock('de'), 'claude', { ...refConfig, context: 'german-approval.md' }),
    [
      'Wenn approval is required:',
      '',
      'Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:',
      '- header: "Approval"',
      '- question: "Continue?"',
      '- multiSelect: false',
      '- options:',
      '  - label: "Ja", description: "Freigabe erteilt"',
      '  - label: "Anpassen", description: "Feedback als Freitext eingeben"',
    ].join('\n'),
  );
  assert.equal(
    renderBody(approvalBlock('de'), 'codex', { ...refConfig, context: 'german-approval.md' }),
    'Wenn approval is required: Frage den User: **Continue?** Antworte mit "Ja" oder gib Feedback als Freitext.',
  );
});

test('portable ask rendering uses the Codex-equivalent English default', () => {
  const body = [
    '```ask',
    'when: approval is required',
    'header: Approval',
    'question: Continue?',
    'type: approval',
    '```',
  ].join('\n');
  const expected =
    'If approval is required: Ask the user: **Continue?** Answer with "Yes" or enter feedback as free text.';

  assert.equal(renderBody(body, 'codex', { ...refConfig, context: 'ask.md' }), expected);
  assert.equal(renderBody(body, 'portable', { ...refConfig, context: 'ask.md' }), expected);
});

test('plan.markerLanguage does not influence the block-local ask language default', () => {
  const body = ['```ask', 'header: Approval', 'question: Continue?', 'type: approval', '```'].join(
    '\n',
  );
  const rendered = renderBody(body, 'claude', {
    ...refConfig,
    context: 'marker-config.md',
    plan: { markerLanguage: 'de' },
  });

  assert.match(rendered, /Use the `AskUserQuestion` tool/);
  assert.match(rendered, /label: "Yes", description: "Approval granted"/);
  assert.doesNotMatch(rendered, /Verwende|Freigabe erteilt/);
});

// --- Retired goal mode ---

const sourceToolsUrl = new URL('../src/tools/', import.meta.url);
const sourceAgentsUrl = new URL('../src/agents/', import.meta.url);
const sourceSharedUrl = new URL('../src/shared/', import.meta.url);
const sourceToolNames = readdirSync(sourceToolsUrl)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.slice(0, -3));
const sourceAgentNames = readdirSync(sourceAgentsUrl)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.slice(0, -3));
// Deliberately marker-only: this config lists every tool as exposed, although
// apply-plan, apply-issues and apply-review are internal in the real build and
// therefore render as `tools/<name>.md`. Use it for presence/absence markers only;
// never add invocation-shape assertions on top of it.
const sourceRenderConfig = {
  exposedTools: sourceToolNames,
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: new Set(sourceToolNames),
  knownAgents: new Set(sourceAgentNames),
};

// Resolve a tool body once — eager-include resolution is harness-independent.
// Line endings are normalized exactly as build.mjs does before extractBody, so a
// CRLF or BOM checkout cannot silently reduce the body to an empty string.
function resolveSourceToolBody(name) {
  const context = `tools/${name}.md`;
  const source = normalizeLineEndings(readFileSync(new URL(`${name}.md`, sourceToolsUrl), 'utf8'));
  const body = resolveEagerIncludes(extractBody(source), {
    context,
    readFragment: (fragment) =>
      normalizeLineEndings(readFileSync(new URL(`${fragment}.md`, sourceSharedUrl), 'utf8')),
  });
  return { context, body };
}

// The build placeholder, the Codex direct-start capability, the option label in
// either project language, and any residual `/goal` invocation.
const RETIRED_GOAL_MARKERS = [
  /\{\{GOAL_START\}\}/,
  /create_goal/,
  /Autonom(?:ous)? via `?\/goal/i,
  /\/goal\b/,
];

const FORMER_GOAL_GATE_TOOLS = [
  'build',
  'fix',
  'refactor',
  'docs',
  'iterate',
  'maintain',
  'apply-plan',
  'apply-issues',
  'apply-review',
];

test('no Markdown source under src/ reintroduces goal-mode wiring', () => {
  const sources = [
    {
      context: 'SKILL.md',
      text: readFileSync(new URL('../src/SKILL.md', import.meta.url), 'utf8'),
    },
    ...['tools', 'shared', 'agents'].flatMap((directory) =>
      readdirSync(new URL(`../src/${directory}/`, import.meta.url))
        .filter((file) => file.endsWith('.md'))
        .sort()
        .map((file) => ({
          context: `${directory}/${file}`,
          text: readFileSync(new URL(`../src/${directory}/${file}`, import.meta.url), 'utf8'),
        })),
    ),
  ];
  const scanned = new Set(sources.map(({ context }) => context));

  for (const required of ['SKILL.md', 'tools/build.md', 'shared/goal-completion.md']) {
    assert.ok(scanned.has(required), `scan missed ${required}`);
  }
  assert.ok(
    sources.some(({ context }) => context.startsWith('agents/')),
    'scan collected no agent source',
  );

  for (const { context, text } of sources) {
    assert.ok(text.length > 0, `${context}: empty source`);
    for (const marker of RETIRED_GOAL_MARKERS) {
      assert.doesNotMatch(text, marker, `${context}: ${marker}`);
    }
  }
});

test('no former goal gate revives goal-mode wiring in any harness render', () => {
  for (const tool of FORMER_GOAL_GATE_TOOLS) {
    const { context, body } = resolveSourceToolBody(tool);

    for (const harness of ['claude', 'codex', 'portable']) {
      const rendered = renderBody(body, harness, { ...sourceRenderConfig, context });

      // Non-vacuity plus retained half: the completion control that outlived the
      // goal mode must survive the render, without the goal-run wording.
      assert.match(rendered, /Goal-driven completion control/, `${tool}: ${harness} retained half`);
      assert.doesNotMatch(
        rendered,
        /once the native goal is active/i,
        `${tool}: ${harness} goal-run wording`,
      );

      for (const marker of RETIRED_GOAL_MARKERS) {
        assert.doesNotMatch(rendered, marker, `${tool}: ${harness} ${marker}`);
      }
    }
  }
});

// --- renderBody end-to-end ---

test('renderBody resolves ask and reference syntax for Codex', () => {
  const body = [
    '```ask',
    'header: Start',
    'question: Start now?',
    'type: approval',
    '```',
    '',
    'Continue with {{SKILL:fix}}.',
  ].join('\n');
  const rendered = renderBody(body, 'codex', { ...refConfig, context: 'ask-refs.md' });

  assert.match(rendered, /Ask the user: \*\*Start now\?\*\*/);
  assert.match(rendered, /Continue with \$effective-flow fix\./);
  assert.doesNotMatch(rendered, /```ask|\{\{SKILL:/);
});

test('renderBody runs ask + ref transforms for claude', () => {
  const body = 'Intro {{SKILL:fix}} and {{AGENT:code-validator}}.\n';
  assert.equal(
    renderBody(body, 'claude', { ...refConfig, context: 't.md' }),
    'Intro /effective-flow fix and `effective-flow-code-validator`.\n',
  );
});

test('renderBody uses Codex skill invocation syntax for exposed tool refs', () => {
  const body = 'Intro {{SKILL:fix}} and {{AGENT:code-validator}}.\n';
  assert.equal(
    renderBody(body, 'codex', { ...refConfig, context: 't.md' }),
    'Intro $effective-flow fix and `effective-flow-code-validator`.\n',
  );
});

test('renderBody gives portable worker refs an explicit one-contract delegation protocol', () => {
  const body = 'Start {{AGENT:code-validator}}.\n';
  const rendered = renderBody(body, 'portable', { ...refConfig, context: 't.md' });
  assert.ok(rendered.startsWith(PORTABLE_WORKER_DELEGATION));
  assert.match(rendered, /read only its matching `workers\/effective-flow-<worker>\.md` file/);
  assert.match(rendered, /built-in general-purpose subagent mechanism/);
  assert.match(rendered, /Start `effective-flow-code-validator`\./);
  assert.equal(rendered.match(/## Portable worker delegation/g)?.length, 1);
});

test('renderBody does not add portable worker instructions when no worker is referenced', () => {
  const rendered = renderBody('Run {{SKILL:fix}}.\n', 'portable', {
    ...refConfig,
    context: 't.md',
  });
  assert.doesNotMatch(rendered, /Portable worker delegation/);
  assert.equal(rendered, 'Run effective-flow fix.\n');
});

test('collectRenderedWorkerRefs filters exact known namespaced worker identifiers', () => {
  const known = new Set(['effective-flow-code-validator']);
  assert.deepEqual(
    collectRenderedWorkerRefs(
      '`effective-flow-code-validator` `effective-flow-project-setup` `code-validator`',
      'effective-flow-',
      known,
    ),
    ['effective-flow-code-validator'],
  );
});

// --- Harness-specific command-tool parameter guard (#163) ---

test('HARNESS_TOOL_PARAMETER_OWNERSHIP defines the explicit native ownership matrix', () => {
  assert.deepEqual(HARNESS_TOOL_PARAMETER_OWNERSHIP, {
    run_in_background: ['claude'],
    'yield-time_ms': ['codex'],
    sandbox_permissions: ['codex'],
  });
});

test('findForeignHarnessToolParameters allows native parameters only on their owning target', () => {
  const text = [
    'run_in_background: true',
    'yield-time_ms: 10000',
    'sandbox_permissions: require_escalated',
  ].join('\n');

  assert.deepEqual(findForeignHarnessToolParameters(text, 'claude'), [
    { line: 2, parameter: 'yield-time_ms', owners: ['codex'] },
    { line: 3, parameter: 'sandbox_permissions', owners: ['codex'] },
  ]);
  assert.deepEqual(findForeignHarnessToolParameters(text, 'codex'), [
    { line: 1, parameter: 'run_in_background', owners: ['claude'] },
  ]);
  assert.deepEqual(findForeignHarnessToolParameters(text, 'portable'), [
    { line: 1, parameter: 'run_in_background', owners: ['claude'] },
    { line: 2, parameter: 'yield-time_ms', owners: ['codex'] },
    { line: 3, parameter: 'sandbox_permissions', owners: ['codex'] },
  ]);
});

test('findForeignHarnessToolParameters matches exact identifiers and reports source lines', () => {
  const text = [
    'prefixed_run_in_background: ignored',
    'run_in_background_suffix: ignored',
    '`run_in_background`: true',
    'yield-time-ms: ignored',
    'sandbox_permissions.extra: detected',
  ].join('\n');

  assert.deepEqual(findForeignHarnessToolParameters(text, 'portable'), [
    { line: 3, parameter: 'run_in_background', owners: ['claude'] },
    { line: 5, parameter: 'sandbox_permissions', owners: ['codex'] },
  ]);
});

test('findForeignHarnessToolParameters rejects unknown rendered targets', () => {
  assert.throws(
    () => findForeignHarnessToolParameters('run_in_background: true', 'unknown'),
    /Unknown rendered target "unknown"/,
  );
});

test('code-validator remains a harness-neutral adapter to central validation', () => {
  const source = readFileSync(new URL('../src/agents/code-validator.md', import.meta.url), 'utf8');
  const body = extractBody(source);
  assert.doesNotMatch(source, /\brun_in_background\b/);

  for (const target of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(body, target, {
      ...refConfig,
      context: `src/agents/code-validator.md (${target})`,
    });

    assert.deepEqual(findForeignHarnessToolParameters(rendered, target), [], target);
    assert.match(rendered, /`effective-delivery` is the declared domain owner/, target);
    assert.match(rendered, /do not keep\s+a second ecosystem command matrix/is, target);
    assert.match(rendered, /`full`.*`quick`.*`off`/s, target);
    assert.match(rendered, /`PASSED`, `FAILED`, `SKIPPED \(<reason>\)`, or `TIMEOUT`/, target);
    assert.match(rendered, /each bucket and exact assigned scope/, target);
    assert.doesNotMatch(rendered, /120-second/, target);
    assert.doesNotMatch(rendered, /TypeScript → Linting → Build/, target);
    assert.doesNotMatch(rendered, /Cargo check or Cargo build → Clippy/, target);
  }
});

test('central-skill adapters retain Effective Flow ownership without duplicate handbooks', () => {
  const readSource = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const adapters = {
    'agents/docs-writer.md': 'effective-delivery',
    'agents/code-documenter.md': 'effective-delivery',
    'agents/test-writer.md': 'effective-engineering',
    'agents/e2e-tester.md': 'effective-web',
    'agents/code-validator.md': 'effective-delivery',
  };

  for (const [path, owner] of Object.entries(adapters)) {
    const source = readSource(path);
    assert.match(source, new RegExp(`\\b${owner}\\b`), path);
    assert.match(source, /## Minimal fallback/, path);
    assert.match(source, /Effective Flow (?:retains|constraints)/i, path);
  }

  const iterate = readSource('tools/iterate.md');
  assert.match(iterate, /pr-review-handoff\/v1/);
  assert.match(iterate, /performs no discovery,\s+implementation, Git/);
  assert.match(iterate, /Effective Flow remains the caller and owns freshness, approval/);

  const discovery = readSource('shared/skill-discovery.md');
  assert.match(discovery, /Never load the `effective-flow` router recursively/);

  const dependencyPolicy = readSource('shared/dependency-version-policy.md');
  assert.match(dependencyPolicy, /`effective-delivery` is the declared domain owner/);
  assert.doesNotMatch(dependencyPolicy, /pnpm view|cargo search|stable major tag/);

  // The docs tool delegates documentation craft to effective-delivery. Anchor each
  // removal beside the positive delegation assertion so a rewritten section cannot
  // pass the negative greps vacuously.
  const docs = readSource('tools/docs.md');
  assert.match(docs, /`effective-delivery` is the declared domain owner/);
  assert.doesNotMatch(docs, /Do not invent substantive statements/);
  assert.doesNotMatch(docs, /Keep examples runnable/);

  const codeDocumenter = readSource('agents/code-documenter.md');
  assert.match(codeDocumenter, /`effective-delivery` is the declared domain owner/);
  assert.doesNotMatch(codeDocumenter, /Prefer self-documenting code/);

  // An established repository documentation structure outranks the prescribed
  // standard structure; Effective Flow defines no local test for "established".
  const docCategories = readSource('shared/doc-categories.md');
  assert.match(docCategories, /takes precedence over the prescribed standard structure/);
  assert.match(docCategories, /local test for what counts as/);

  // The marketing writer restates the root README's follow-up targets, so it must
  // resolve them from the effective structure rather than the standard paths.
  const marketingWriter = readSource('agents/marketing-writer.md');
  assert.match(
    marketingWriter,
    /resolve the two documentation targets from the \*\*effective\s+structure\*\*/,
  );
  assert.match(marketingWriter, /do not fall back\s+to the standard paths/);

  // The documentation sync gate routes documentation work and is therefore an
  // adapter surface where a second craft handbook could grow unnoticed.
  const syncContract = readSource('shared/documentation-sync-contract.md').replace(/\s+/g, ' ');
  assert.match(syncContract, /`effective-delivery` is the declared domain owner/);
  assert.match(syncContract, /minimal repository-led fallback declared in/);
  assert.doesNotMatch(syncContract, /audience|reading order|runnable example/i);
});

// --- Fixture-based end-to-end snapshot ---

test('end-to-end: fixture asks render in English by default and German by opt-in', () => {
  const fixture = [
    '---',
    'description: "A fixture tool that delegates to {{SKILL:fix}}."',
    '---',
    '',
    '# Fixture',
    '',
    'Ruft {{SKILL:fix}} und {{AGENT:nodejs-implementer}} auf.',
    '',
    '```ask',
    'when: Freigabe erforderlich',
    'header: Freigabe',
    'question: Weiter?',
    'options:',
    '  - label: Ja',
    '    description: Direkt fortfahren',
    '  - label: Anpassen',
    '    description: Quelldetails ändern',
    '```',
    '',
    '```ask',
    'header: Approval',
    'question: Continue?',
    'type: approval',
    'language: de',
    '```',
    '',
  ].join('\n');

  const fm = extractFrontmatter(fixture);
  const body = extractBody(fixture);
  assert.doesNotThrow(() => assertQuotedDescription(fm));
  validateRefs(`${fm}\n${body}`, refConfig);

  const expectedClaude = [
    '',
    '# Fixture',
    '',
    'Ruft /effective-flow fix und `effective-flow-nodejs-implementer` auf.',
    '',
    'If Freigabe erforderlich:',
    '',
    'Use the `AskUserQuestion` tool with the following parameters:',
    '- header: "Freigabe"',
    '- question: "Weiter?"',
    '- multiSelect: false',
    '- options:',
    '  - label: "Ja", description: "Direkt fortfahren"',
    '  - label: "Anpassen", description: "Quelldetails ändern"',
    '',
    'Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:',
    '- header: "Approval"',
    '- question: "Continue?"',
    '- multiSelect: false',
    '- options:',
    '  - label: "Ja", description: "Freigabe erteilt"',
    '  - label: "Anpassen", description: "Feedback als Freitext eingeben"',
    '',
  ].join('\n');
  assert.equal(renderBody(body, 'claude', { ...refConfig, context: 'fixture.md' }), expectedClaude);

  const expectedCodex = [
    '',
    '# Fixture',
    '',
    'Ruft $effective-flow fix und `effective-flow-nodejs-implementer` auf.',
    '',
    'If Freigabe erforderlich: Ask the user: **Weiter?**',
    '- Ja -- Direkt fortfahren',
    '- Anpassen -- Quelldetails ändern',
    '',
    'Frage den User: **Continue?** Antworte mit "Ja" oder gib Feedback als Freitext.',
    '',
  ].join('\n');
  assert.equal(renderBody(body, 'codex', { ...refConfig, context: 'fixture.md' }), expectedCodex);
});

test('end-to-end: fixture rejects an invalid ask language with source context', () => {
  const body = [
    '```ask',
    'header: Approval',
    'question: Continue?',
    'type: approval',
    'language: fr',
    '```',
  ].join('\n');

  for (const harness of ['claude', 'codex']) {
    assert.throws(
      () => renderBody(body, harness, { ...refConfig, context: 'invalid-fixture.md' }),
      /unknown language "fr".*invalid-fixture\.md/,
    );
  }
});

test('missingCategoryReadmes flags mandatory categories that hold docs but no README', () => {
  // developer-guide has documents but no README -> flagged
  assert.deepEqual(
    missingCategoryReadmes({ 'developer-guide': ['architecture.md', 'build-system.md'] }),
    ['developer-guide'],
  );
  // README present -> not flagged
  assert.deepEqual(
    missingCategoryReadmes({ 'developer-guide': ['README.md', 'architecture.md'] }),
    [],
  );
  // empty or README-only category -> not flagged
  assert.deepEqual(missingCategoryReadmes({ 'user-guide': [] }), []);
  assert.deepEqual(missingCategoryReadmes({ 'user-guide': ['README.md'] }), []);
  // non-.md files do not count as documents
  assert.deepEqual(missingCategoryReadmes({ 'user-guide': ['.keep', 'logo.png'] }), []);
  // both mandatory categories are evaluated independently
  assert.deepEqual(
    missingCategoryReadmes({
      'user-guide': ['README.md', 'installation.md'],
      'developer-guide': ['architecture.md'],
    }),
    ['developer-guide'],
  );
});

// --- Self-contained agent-contract guard (#100) ---

test('findSelfReferentialContractPhrases flags historical "ursprüngliche(r) Agent" comparisons', () => {
  const hits = findSelfReferentialContractPhrases(
    'description: "Erstellt In-Code-Dokumentation mit derselben Tiefe wie der ursprüngliche Agent: JSDoc."',
  );
  assert.equal(hits.length, 1);
  assert.match(hits[0].label, /ursprüngliche/);
  assert.equal(hits[0].match, 'ursprüngliche Agent');
  // inflected forms are caught too
  assert.equal(
    findSelfReferentialContractPhrases('… wie der ursprünglichen Agent durch …').length,
    1,
  );
});

test('findSelfReferentialContractPhrases flags "original agent" and "same depth as the"', () => {
  assert.equal(findSelfReferentialContractPhrases('same depth as the original agent').length, 2);
});

test('findSelfReferentialContractPhrases flags relative-to-sibling scope', () => {
  const hits = findSelfReferentialContractPhrases(
    'description: "Implementiert Rust-Code mit derselben fachlichen Tiefe wie der Node.js-Implementer: Cargo."',
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].match, 'wie der Node.js-Implementer');
  assert.equal(
    findSelfReferentialContractPhrases('Rust-Review wie der Node.js-Reviewer durch').length,
    1,
  );
});

test('findSelfReferentialContractPhrases flags sibling contractions and the genitive', () => {
  // "beim"/"vom"/"im" (= bei/von/in dem) are as idiomatic as "wie der …".
  assert.equal(
    findSelfReferentialContractPhrases('… mit derselben Tiefe wie beim Node.js-Reviewer.').length,
    1,
  );
  assert.equal(
    findSelfReferentialContractPhrases('genauso wie vom Rust-Implementer erwartet').length,
    1,
  );
  // Genitive "-Reviewers" must not slip through a suffix word boundary.
  const gen = findSelfReferentialContractPhrases('Prüftiefe wie des Node.js-Reviewers ausgelegt');
  assert.equal(gen.length, 1);
  assert.equal(gen[0].match, 'wie des Node.js-Reviewers');
});

test('findSelfReferentialContractPhrases flags "Wie bei {{AGENT:…}}" contract substitute', () => {
  const hits = findSelfReferentialContractPhrases('Wie bei `{{AGENT:frontend-reviewer}}`.');
  assert.equal(hits.length, 1);
  assert.match(hits[0].label, /contract substitute/);
});

test('findSelfReferentialContractPhrases allows legitimate {{AGENT:X}} delegation', () => {
  // A bare delegation reference is not a contract substitute.
  assert.deepEqual(
    findSelfReferentialContractPhrases('An `{{AGENT:code-validator}}` delegieren.'),
    [],
  );
  // "Wie bei" gates on {{AGENT:…}} only — a {{SKILL:…}} cross-reference is allowed.
  assert.deepEqual(
    findSelfReferentialContractPhrases('Wie bei `{{SKILL:review}}` beschrieben.'),
    [],
  );
  // Self-contained, concrete scope descriptions produce no hits.
  assert.deepEqual(
    findSelfReferentialContractPhrases(
      'description: "Führt spezialisiertes Backend- und CLI-Review durch: API Design, Security."',
    ),
    [],
  );
  // Legitimate prose using "ursprünglich" for a branch/plan/body — not "Agent".
  assert.deepEqual(
    findSelfReferentialContractPhrases(
      'Cherry-pick zurück in den ursprünglichen Branch; auch wenn der ursprüngliche Body dünn ist.',
    ),
    [],
  );
});

// --- Lazy-include directive (#99) ---

test('renderLazyPointer renders a load pointer with and without a trigger', () => {
  assert.equal(
    renderLazyPointer('worktree-integration', 'the delivery mode is determined'),
    '**Load on demand:** Read `shared/worktree-integration.md`, when the delivery mode is determined.',
  );
  // No trigger clause → just the load pointer, still ending in a period.
  assert.equal(
    renderLazyPointer('config-migration', ''),
    '**Load on demand:** Read `shared/config-migration.md`.',
  );
});

test('resolveLazyIncludes replaces fences with pointers and collects unique names', () => {
  const body = [
    'Before.',
    '```lazy-include',
    'config-migration',
    'when: the config is read',
    '```',
    'Middle.',
    '```lazy-include',
    'issue-tracker',
    'when: the tracker mode `remote` is active',
    '```',
    'After.',
  ].join('\n');
  const { body: out, names } = resolveLazyIncludes(body);
  assert.deepEqual(names, ['config-migration', 'issue-tracker']);
  assert.match(
    out,
    /\*\*Load on demand:\*\* Read `shared\/config-migration\.md`, when the config is read\./,
  );
  assert.match(out, /Read `shared\/issue-tracker\.md`, when the tracker mode `remote` is active\./);
  // The fence markers are gone; the surrounding prose is preserved.
  assert.doesNotMatch(out, /```lazy-include/);
  assert.match(out, /Before\.[\s\S]*Middle\.[\s\S]*After\./);
});

test('resolveLazyIncludes de-duplicates a fragment referenced twice', () => {
  const body = [
    '```lazy-include',
    'config-migration',
    'when: A',
    '```',
    '```lazy-include',
    'config-migration',
    'when: B',
    '```',
  ].join('\n');
  const { names } = resolveLazyIncludes(body);
  assert.deepEqual(names, ['config-migration']);
});

test('resolveLazyIncludes tolerates a fence without a when trigger', () => {
  const { body, names } = resolveLazyIncludes('```lazy-include\nplan-numbering\n```');
  assert.deepEqual(names, ['plan-numbering']);
  assert.equal(body, '**Load on demand:** Read `shared/plan-numbering.md`.');
});

test('collectIncludeNames separates eager and lazy includes', () => {
  const body = [
    '```include',
    'language-rules',
    '```',
    '```lazy-include',
    'config-migration',
    'when: X',
    '```',
    '```include',
    'task-tracking',
    '```',
  ].join('\n');
  const { eager, lazy } = collectIncludeNames(body);
  assert.deepEqual([...eager].sort(), ['language-rules', 'task-tracking']);
  assert.deepEqual([...lazy], ['config-migration']);
});

test('assertNoEagerLazyOverlap passes for disjoint sets and throws on overlap', () => {
  assert.doesNotThrow(() =>
    assertNoEagerLazyOverlap(new Set(['language-rules']), new Set(['config-migration'])),
  );
  assert.throws(
    () =>
      assertNoEagerLazyOverlap(new Set(['config-migration', 'x']), new Set(['config-migration']), {
        context: 'tools/build.md',
      }),
    /both eager- and lazy-included \(in tools\/build\.md\): config-migration/,
  );
});

test('documentation-sync consumer guard demands an eager include in every implementation tool', () => {
  const eagerBody = ['```include', 'documentation-sync', '```'].join('\n');
  const lazyBody = ['```lazy-include', 'documentation-sync', 'when: docs are due', '```'].join(
    '\n',
  );

  // Every consumer carries the eager core -> no violation.
  assert.deepEqual(
    findDocumentationSyncViolations(
      new Map(
        DOCUMENTATION_SYNC_CONSUMERS.map((context) => [context, collectIncludeNames(eagerBody)]),
      ),
    ),
    [],
  );

  // A missing include is a violation naming the offending consumer.
  const missing = findDocumentationSyncViolations(
    new Map([
      ['tools/build.md', collectIncludeNames(eagerBody)],
      ['tools/fix.md', collectIncludeNames('no includes here')],
      ['tools/refactor.md', collectIncludeNames(eagerBody)],
      ['tools/maintain.md', collectIncludeNames(eagerBody)],
    ]),
  );
  assert.deepEqual(
    missing.map((violation) => violation.context),
    ['tools/fix.md'],
  );
  assert.match(missing[0].reason, /eager/);

  // A lazy pointer does not satisfy the guard: a `when:` condition the model may
  // judge inapplicable is exactly the skip this gate removes.
  const lazyOnly = findDocumentationSyncViolations(
    new Map(
      DOCUMENTATION_SYNC_CONSUMERS.map((context) => [
        context,
        collectIncludeNames(context === 'tools/maintain.md' ? lazyBody : eagerBody),
      ]),
    ),
  );
  assert.deepEqual(
    lazyOnly.map((violation) => violation.context),
    ['tools/maintain.md'],
  );
  assert.match(lazyOnly[0].reason, /lazily/);

  // A consumer that was never read at all must not pass silently.
  const absent = findDocumentationSyncViolations(new Map());
  assert.deepEqual(
    absent.map((violation) => violation.context).sort(),
    [...DOCUMENTATION_SYNC_CONSUMERS].sort(),
  );
});

test('resolveEagerIncludes recursively expands nested fragments in deterministic order', () => {
  const fragments = new Map([
    ['outer', 'outer-start\n```include\ninner\n```\nouter-end\n'],
    ['inner', 'inner-body\n'],
  ]);

  assert.equal(
    resolveEagerIncludes('root-start\n```include\nouter\n```\nroot-end\n', {
      context: 'tools/example.md',
      readFragment: (name) => fragments.get(name),
    }),
    'root-start\nouter-start\ninner-body\nouter-end\nroot-end\n',
  );
});

test('resolveEagerIncludes rejects cycles and missing targets with the complete chain', () => {
  const cyclic = new Map([
    ['a', '```include\nb\n```\n'],
    ['b', '```include\na\n```\n'],
  ]);

  assert.throws(
    () =>
      resolveEagerIncludes('```include\na\n```\n', {
        context: 'tools/cycle.md',
        readFragment: (name) => cyclic.get(name),
      }),
    /eager include cycle \(in tools\/cycle\.md\): tools\/cycle\.md -> shared\/a\.md -> shared\/b\.md -> shared\/a\.md/,
  );
  assert.throws(
    () =>
      resolveEagerIncludes('```include\nmissing\n```\n', {
        context: 'tools/missing.md',
        readFragment: () => undefined,
      }),
    /cannot resolve eager include "missing" \(in tools\/missing\.md\)[\s\S]*fragment reader returned no text/,
  );
});

test('unresolved eager-include output is rejected with source line diagnostics', () => {
  const unresolved = 'before\n```include\nmemory-state\n```\nafter\n';
  assert.deepEqual(findUnresolvedEagerIncludes(unresolved), [{ line: 2, name: 'memory-state' }]);
  assert.throws(
    () => assertNoUnresolvedEagerIncludes(unresolved, { context: 'generated/tools/x.md' }),
    /unresolved eager include fence \(in generated\/tools\/x\.md\): line 2 \(memory-state\)/,
  );
});

test('unresolved lazy-include output is rejected with source line diagnostics', () => {
  const unresolved =
    'before\n```lazy-include\npr-review-integration\nwhen: a PR exists\n```\nafter\n';
  assert.deepEqual(findUnresolvedLazyIncludes(unresolved), [
    { line: 2, name: 'pr-review-integration' },
  ]);
  assert.throws(
    () => assertNoUnresolvedLazyIncludes(unresolved, { context: 'generated/shared/x.md' }),
    /unresolved lazy include fence \(in generated\/shared\/x\.md\): line 2 \(pr-review-integration\)/,
  );
  // A rendered pointer is the resolved form and must not trip the guard.
  assert.doesNotThrow(() =>
    assertNoUnresolvedLazyIncludes(resolveLazyIncludes(unresolved).body, { context: 'x' }),
  );
  // The eager guard must not fire on a lazy fence, nor the lazy guard on an eager one.
  assert.doesNotThrow(() => assertNoUnresolvedEagerIncludes(unresolved, { context: 'x' }));
  assert.doesNotThrow(() =>
    assertNoUnresolvedLazyIncludes('a\n```include\nmemory-state\n```\n', { context: 'x' }),
  );
});

// --- Runtime-state write-safety coverage guard (#165) ---

test('findRuntimeStateSafetyViolations rejects an unguarded runtime writer', () => {
  const violations = findRuntimeStateSafetyViolations({
    'tools/new-writer.md': 'Write `.effective-flow/new-state.json` now.\n',
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].context, 'tools/new-writer.md');
  assert.equal(violations[0].line, 1);
  assert.equal(
    violations[0].reason,
    'runtime mutation is not preceded by the canonical safety guard',
  );
});

test('findRuntimeStateSafetyViolations accepts an earlier canonical include', () => {
  const sources = {
    'tools/guarded-writer.md': [
      '```lazy-include',
      'runtime-state-safety',
      '```',
      'Write `.effective-flow/new-state.json` now.',
    ].join('\n'),
  };

  assert.deepEqual(findRuntimeStateSafetyViolations(sources), []);
});

test('findRuntimeStateSafetyViolations requires a lazy trigger that covers eager mutations', () => {
  const migration = 'Write `.effective-flow/memory.json` migration marker.\n';
  const narrow = {
    'tools/cleanup.md': [
      '```lazy-include',
      'runtime-state-safety',
      'when: confirmed legacy data is copied into `.effective-flow/`',
      '```',
      '```include',
      'effective-flow-dir-migration',
      '```',
    ].join('\n'),
    'shared/effective-flow-dir-migration.md': migration,
  };
  const complete = {
    ...narrow,
    'tools/cleanup.md': narrow['tools/cleanup.md'].replace(
      'when: confirmed legacy data is copied into `.effective-flow/`',
      'when: any confirmed legacy copy or removal, runtime migration, memory, or tracker-marker mutation is imminent',
    ),
  };

  assert.deepEqual(
    findRuntimeStateSafetyViolations(narrow).map(({ reason }) => reason),
    [
      'runtime-state-safety trigger does not cover this mutation: "confirmed legacy data is copied into `.effective-flow/`"',
    ],
  );
  assert.deepEqual(findRuntimeStateSafetyViolations(complete), []);
});

test('findRuntimeStateSafetyViolations follows a guarded shared owner', () => {
  const sources = {
    'tools/owner.md': '```include\nruntime-writer\n```\n',
    'shared/runtime-writer.md': [
      '```lazy-include',
      'runtime-state-safety',
      '```',
      'Write `.effective-flow/cache.json` now.',
    ].join('\n'),
  };

  assert.deepEqual(findRuntimeStateSafetyViolations(sources), []);
});

test('findRuntimeStateSafetyViolations does not classify read-only config lookup as a writer', () => {
  const sources = {
    'tools/reader.md': 'Read `.effective-flow/config.json` as a transitional fallback.\n',
  };

  assert.deepEqual(findRuntimeStateSafetyViolations(sources), []);
});

test('findRuntimeStateSafetyViolations rejects adversarial mutation verbs', () => {
  const mutations = [
    ['persist', 'Persist state to'],
    ['save', 'Save state to'],
    ['append', 'Append data to'],
    ['edit', 'Edit'],
    ['touch', 'Touch'],
    ['move', 'Move data into'],
    ['unlink', 'Unlink'],
    ['symlink', 'Symlink an artifact at'],
    ['store', 'Store state in'],
    ['record', 'Record state in'],
    ['emit', 'Emit output to'],
    ['replace', 'Replace'],
  ];

  for (const [name, instruction] of mutations) {
    const violations = findRuntimeStateSafetyViolations({
      [`tools/${name}.md`]: `${instruction} \`.effective-flow/${name}.json\`.\n`,
    });
    assert.equal(violations.length, 1, `${name} must be classified as a runtime mutation`);
    assert.equal(
      violations[0].reason,
      'runtime mutation is not preceded by the canonical safety guard',
    );
  }
});

test('findRuntimeStateSafetyViolations ignores clear passive descriptions', () => {
  const sources = {
    'tools/descriptions.md': [
      'The historical report was created under `.effective-flow/review/` by a previous release.',
      'The existing `.effective-flow/cache.json` was saved by a previous release.',
      'The documentation says the report is stored at `.effective-flow/review/report.md`.',
      'The read-only `.effective-flow/memory.json` is not written by this lookup.',
    ].join('\n'),
  };

  assert.deepEqual(findRuntimeStateSafetyViolations(sources), []);
});

test('findRuntimeStateSafetyViolations preserves shared-consumer ordering', () => {
  const sharedWriter = 'Save state to `.effective-flow/shared-state.json`.\n';
  const lateGuardSources = {
    'tools/late-guard.md': [
      '```include',
      'runtime-writer',
      '```',
      '```lazy-include',
      'runtime-state-safety',
      '```',
    ].join('\n'),
    'shared/runtime-writer.md': sharedWriter,
  };
  const earlyGuardSources = {
    'tools/early-guard.md': [
      '```lazy-include',
      'runtime-state-safety',
      '```',
      '```include',
      'runtime-writer',
      '```',
    ].join('\n'),
    'shared/runtime-writer.md': sharedWriter,
  };

  const lateViolations = findRuntimeStateSafetyViolations(lateGuardSources);
  assert.equal(lateViolations.length, 1);
  assert.equal(lateViolations[0].context, 'shared/runtime-writer.md');
  assert.deepEqual(lateViolations[0].includeChain, [
    'tools/late-guard.md',
    'shared/runtime-writer.md',
  ]);
  assert.deepEqual(findRuntimeStateSafetyViolations(earlyGuardSources), []);
});

test('findRuntimeStateSafetyViolations accepts setup marker writes only after complete validation', () => {
  const guard = '```lazy-include\nruntime-state-safety\n```';
  const repair = 'Remove tracked `.effective-flow/config.json` with git rm --cached.';
  const sentinel = 'Run git check-ignore --no-index -- .effective-flow/config.json.';
  const target = 'Run git check-ignore --no-index -- .effective-flow/memory.json.';
  const tracked = 'Run git ls-files -- .effective-flow/.';
  const write = 'Write `.effective-flow/memory.json` migration marker.';
  const safe = [guard, repair, sentinel, target, tracked, write].join('\n');
  const unsafe = [guard, repair, sentinel, write, target, tracked].join('\n');

  assert.deepEqual(
    findRuntimeStateSafetyViolations({ 'tools/setup.md': safe }),
    [],
    'complete validation must permit the marker write',
  );
  assert.deepEqual(
    findRuntimeStateSafetyViolations({ 'tools/setup.md': unsafe }).map(({ reason }) => reason),
    ['setup runtime marker write is not preceded by complete target-state validation'],
    'partial validation must not permit the marker write',
  );
});

// --- Runtime-directory migration prerequisite coverage guard (#174) ---

test('findRuntimeDirMigrationViolations rejects an absent or late migration prerequisite', () => {
  const absent = {
    'tools/absent.md': 'Write `.effective-flow/memory.json` now.\n',
  };
  const late = {
    'tools/late.md': [
      'Write `.effective-flow/cache.json` now.',
      '```lazy-include',
      'effective-flow-dir-migration',
      '```',
    ].join('\n'),
  };

  assert.deepEqual(
    findRuntimeDirMigrationViolations(absent).map(({ context, line, reason }) => ({
      context,
      line,
      reason,
    })),
    [
      {
        context: 'tools/absent.md',
        line: 1,
        reason: 'runtime mutation is not preceded by the runtime-directory migration prerequisite',
      },
    ],
  );
  assert.equal(findRuntimeDirMigrationViolations(late).length, 1);
});

test('findRuntimeDirMigrationViolations preserves nested shared-writer ordering', () => {
  const sharedWriter = 'Save state to `.effective-flow/shared-state.json`.\n';
  const lateSources = {
    'tools/late-owner.md': [
      '```include',
      'runtime-writer',
      '```',
      '```lazy-include',
      'effective-flow-dir-migration',
      '```',
    ].join('\n'),
    'shared/runtime-writer.md': sharedWriter,
  };
  const earlySources = {
    'tools/early-owner.md': [
      '```lazy-include',
      'effective-flow-dir-migration',
      '```',
      '```include',
      'runtime-writer',
      '```',
    ].join('\n'),
    'shared/runtime-writer.md': sharedWriter,
  };

  const [violation] = findRuntimeDirMigrationViolations(lateSources);
  assert.equal(violation.context, 'shared/runtime-writer.md');
  assert.deepEqual(violation.includeChain, ['tools/late-owner.md', 'shared/runtime-writer.md']);
  assert.deepEqual(findRuntimeDirMigrationViolations(earlySources), []);
});

test('findRuntimeDirMigrationViolations exempts the migration fragment itself', () => {
  const sources = {
    'tools/writer.md': [
      '```lazy-include',
      'effective-flow-dir-migration',
      '```',
      'Write `.effective-flow/cache.json` now.',
    ].join('\n'),
    'shared/effective-flow-dir-migration.md':
      'Write `.effective-flow/memory.json` migration marker.\n',
  };

  assert.deepEqual(findRuntimeDirMigrationViolations(sources), []);
  assert.deepEqual(
    findRuntimeDirMigrationViolations(sources, {
      rootContexts: ['shared/effective-flow-dir-migration.md'],
    }),
    [],
  );
});

test('migration-fragment mutations still require the runtime-state safety guard', () => {
  const sources = {
    'tools/unguarded.md': '```include\neffective-flow-dir-migration\n```\n',
    'shared/effective-flow-dir-migration.md':
      'Write `.effective-flow/memory.json` migration marker.\n',
  };

  assert.deepEqual(
    findRuntimeStateSafetyViolations(sources).map(({ context, reason }) => ({ context, reason })),
    [
      {
        context: 'shared/effective-flow-dir-migration.md',
        reason: 'runtime mutation is not preceded by the canonical safety guard',
      },
    ],
  );
});

// --- Shared memory-state mutation coverage guard (#176) ---

test('findMemoryStateContractViolations rejects an absent or late memory contract', () => {
  const absent = {
    'tools/absent.md': 'Write `.effective-flow/memory.json` now.\n',
  };
  const late = {
    'tools/late.md': [
      'Write `.effective-flow/memory.json` now.',
      '```include',
      'memory-state',
      '```',
    ].join('\n'),
  };

  assert.deepEqual(
    findMemoryStateContractViolations(absent).map(({ context, line, reason }) => ({
      context,
      line,
      reason,
    })),
    [
      {
        context: 'tools/absent.md',
        line: 1,
        reason: 'memory mutation is not preceded by the shared memory-state contract',
      },
    ],
  );
  assert.equal(findMemoryStateContractViolations(late).length, 1);
});

test('findMemoryStateContractViolations follows a shared owner and preserves ordering', () => {
  const writer = 'Update `.effective-flow/memory.json` now.\n';
  const guarded = {
    'tools/guarded.md': '```include\nowner\n```\n',
    'shared/owner.md': ['```include', 'memory-state', '```', writer].join('\n'),
    'shared/memory-state.md': 'Canonical protocol.\n',
  };
  const late = {
    'tools/late.md': '```include\nowner\n```\n',
    'shared/owner.md': [writer, '```include', 'memory-state', '```'].join('\n'),
    'shared/memory-state.md': 'Canonical protocol.\n',
  };

  assert.deepEqual(findMemoryStateContractViolations(guarded), []);
  const [violation] = findMemoryStateContractViolations(late);
  assert.equal(violation.context, 'shared/owner.md');
  assert.deepEqual(violation.includeChain, ['tools/late.md', 'shared/owner.md']);
});

test('the memory-state contract may describe its own atomic writes', () => {
  assert.deepEqual(
    findMemoryStateContractViolations(
      {
        'shared/memory-state.md': 'Atomically replace `.effective-flow/memory.json`.\n',
      },
      { rootContexts: ['shared/memory-state.md'] },
    ),
    [],
  );
});

test('delivered memory coverage does not follow an unresolved eager include fence', () => {
  const unresolvedDelivery = {
    'tools/eager.md': [
      '```include',
      'memory-state',
      '```',
      'Write `.effective-flow/memory.json` now.',
    ].join('\n'),
    'shared/memory-state.md': '## Shared memory-state mutation\n',
  };
  const resolvedDelivery = {
    'tools/eager.md': [
      '## Shared memory-state mutation',
      'Write `.effective-flow/memory.json` now.',
    ].join('\n'),
  };

  assert.equal(
    findMemoryStateContractViolations(unresolvedDelivery, { delivered: true }).length,
    1,
  );
  assert.deepEqual(findMemoryStateContractViolations(resolvedDelivery, { delivered: true }), []);
});

// --- Consumer-document command guard (#160) ---

test('findProhibitedConsumerScriptCommands allows explanatory filename mentions', () => {
  const prose = [
    '`install-skill.sh` is a maintainer utility.',
    'The local-link.sh and local-common.sh files remain on the source branch.',
    'See https://github.com/example/project/blob/develop/install-skill.sh for its implementation.',
  ].join('\n');
  assert.deepEqual(findProhibitedConsumerScriptCommands(prose), []);
});

test('findProhibitedConsumerScriptCommands rejects direct local script invocations', () => {
  const markdown = [
    'Install it:',
    '```sh',
    './install-skill.sh',
    './local-link.sh',
    '```',
    'Do not suggest `./local-common.sh` inline either.',
  ].join('\n');
  assert.deepEqual(findProhibitedConsumerScriptCommands(markdown), [
    { line: 3, command: './install-skill.sh' },
    { line: 4, command: './local-link.sh' },
    { line: 6, command: './local-common.sh' },
  ]);
});

test('findProhibitedConsumerScriptCommands rejects shell-interpreter invocations', () => {
  const markdown = [
    'bash install-skill.sh',
    'sh ./local-link.sh',
    'source local-common.sh',
    'zsh ./install-skill.sh local',
  ].join('\n');
  assert.deepEqual(findProhibitedConsumerScriptCommands(markdown), [
    { line: 1, command: 'bash install-skill.sh' },
    { line: 2, command: 'sh ./local-link.sh' },
    { line: 3, command: 'source local-common.sh' },
    { line: 4, command: 'zsh ./install-skill.sh' },
  ]);
});

test('findRemoteTrackerRecipeViolations rejects prompt-encoded tracker recipes', () => {
  const markdown = [
    'Use `gh api repos/o/r/issues`.',
    'Run `tea issue edit 4`.',
    'Read `git remote get-url origin`.',
    'Assemble `mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) }`.',
  ].join('\n');
  assert.deepEqual(
    findRemoteTrackerRecipeViolations(markdown).map(({ kind }) => kind),
    ['direct-gh-command', 'direct-tea-command', 'manual-origin-parse', 'manual-graphql'],
  );
});

test('findRemoteTrackerRecipeViolations allows provider-neutral helper instructions', () => {
  assert.deepEqual(
    findRemoteTrackerRecipeViolations(
      'Invoke `node <skill-root>/scripts/remote-tracker.mjs issue-read` and handle its envelope.',
    ),
    [],
  );
});

test('remote-tracker recipe guard scans router, tools, shared fragments, and agents', () => {
  const buildSource = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.match(buildSource, /\[TOOLS_DIR, SHARED_DIR, AGENTS_DIR\]/);
  assert.match(
    buildSource,
    /findRemoteTrackerRecipeViolations\(readFileSync\(ROUTER_SRC, 'utf8'\)\)/,
  );
});

// --- Retired consumer-configuration references ---

test('findRetiredConfigDocViolations allows the retired path only in its migration section', () => {
  const markdown = [
    '# Configuration',
    '',
    '## Migrating a legacy JSON configuration',
    '',
    'Setup can import `.effective-flow/config.json` into the project-setup ADR.',
    '',
    '### What setup preserves',
    '',
    'The old `.effective-flow/config.json` remains on disk.',
  ].join('\n');

  assert.deepEqual(
    findRetiredConfigDocViolations('docs/user-guide/configuration.md', markdown),
    [],
  );
});

test('findRetiredConfigDocViolations rejects operational retired-config prose', () => {
  const markdown = [
    '# Configuration',
    '',
    'Edit `.effective-flow/config.json` to choose remote mode.',
    '',
    '## Migrating a legacy JSON configuration',
    '',
    'Migration prose may name `.effective-flow/config.json`.',
  ].join('\n');

  assert.deepEqual(findRetiredConfigDocViolations('docs/user-guide/configuration.md', markdown), [
    {
      file: 'docs/user-guide/configuration.md',
      line: 3,
      kind: 'retired-config-outside-migration',
      reference: '.effective-flow/config.json',
    },
  ]);
});

test('findRetiredConfigDocViolations requires both an allowlisted file and section', () => {
  const markdown = [
    '# Troubleshooting',
    '',
    '## Migrating a legacy JSON configuration',
    '',
    'Read `.effective-flow/config.json`.',
  ].join('\n');

  assert.deepEqual(findRetiredConfigDocViolations('docs/user-guide/troubleshooting.md', markdown), [
    {
      file: 'docs/user-guide/troubleshooting.md',
      line: 5,
      kind: 'retired-config-outside-migration',
      reference: '.effective-flow/config.json',
    },
  ]);
});

test('findRetiredConfigDocViolations always rejects the retired negation with actionable diagnostics', () => {
  const markdown = [
    '# Configuration',
    '',
    '## Migrating a legacy JSON configuration',
    '',
    'Do not restore `!.effective-flow/config.json`.',
  ].join('\n');

  assert.deepEqual(findRetiredConfigDocViolations('./docs/user-guide/configuration.md', markdown), [
    {
      file: 'docs/user-guide/configuration.md',
      line: 5,
      kind: 'retired-negation',
      reference: '!.effective-flow/config.json',
    },
  ]);
});

// --- Target-project language contract ---

test('checked-in language configuration remains complete and migration-only', () => {
  const readSource = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const languageRules = readSource('shared/language-rules.md');

  for (const key of [
    'language.project',
    'language.source',
    'language.documentation.user',
    'language.documentation.technical',
    'language.workflow',
    'language.forge',
    'language.git',
  ]) {
    assert.match(languageRules, new RegExp(`\\b${key.replaceAll('.', '\\.')}\\b`));
  }
  assert.match(languageRules, /resolves every required surface once per run/i);
  assert.match(languageRules, /must not\s+independently re-read the project setup ADR/i);

  const agentDomains = {
    'marketing-writer': ['language.documentation.user'],
    'docs-writer': [
      'language.documentation.user',
      'language.documentation.technical',
      'language.git',
    ],
    'code-documenter': ['language.source'],
    'test-writer': ['language.source'],
    'e2e-tester': ['language.source'],
    'code-validator': ['language.source'],
  };
  for (const [agent, domains] of Object.entries(agentDomains)) {
    const source = readSource(`agents/${agent}.md`);
    for (const domain of domains) assert.match(source, new RegExp(domain.replaceAll('.', '\\.')));
    assert.match(source, /supplied by the\s+orchestrator/is);
    assert.match(source, /direct\s+invocation resolves the shared language rule itself/is);
  }

  const planStatus = readSource('shared/plan-status.md');
  for (const marker of [
    '**Planungsstatus:** Nicht umgesetzt',
    '**Planungsstatus:** Umgesetzt',
    '**Plan status:** Not implemented',
    '**Plan status:** Implemented',
  ]) {
    assert.ok(planStatus.includes(marker), `missing bilingual plan form: ${marker}`);
  }

  const setup = readSource('tools/setup.md');
  for (const form of [
    '# Effective Flow project setup',
    '# Effective-Flow-Projektsetup',
    '| Key | Value |',
    '| Schlüssel | Wert |',
  ]) {
    assert.ok(setup.includes(form), `missing bilingual setup form: ${form}`);
  }
  assert.doesNotMatch(
    setup,
    /\|\s*(?:review\.|worktree\.|language\.)[^|]*\|[^|]*(?:fokussiert|wahr|falsch|\(leer\))[^|]*\|/i,
  );

  const markerReferences = ['tools', 'shared', 'agents'].flatMap((directory) =>
    readdirSync(new URL(`../src/${directory}/`, import.meta.url))
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => ({ file: `${directory}/${file}`, source: readSource(`${directory}/${file}`) }))
      .filter(({ source }) => source.includes('plan.markerLanguage'))
      .map(({ file, source }) => [file, source.match(/plan\.markerLanguage/g).length]),
  );
  assert.deepEqual(markerReferences, [
    ['tools/setup.md', 4],
    ['shared/config-migration.md', 1],
    ['shared/language-rules.md', 2],
  ]);
});

test('workflow report consumers retain bilingual status and remote epic prose', () => {
  const readSource = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const localReviewStatusConsumers = [
    'shared/unresolved-review-report.md',
    'tools/build.md',
    'tools/fix.md',
    'tools/refactor.md',
    'tools/maintain.md',
  ];
  for (const file of localReviewStatusConsumers) {
    const source = readSource(file);
    assert.match(source, /Open.*Not implemented/s);
    assert.match(source, /Offen.*Nicht umgesetzt/s);
  }

  const workflowReport = readSource('shared/unresolved-review-report.md');
  assert.match(workflowReport, /English: `- \*\*Status\*\*: Fixed \| Open \| Not implemented`/);
  assert.match(workflowReport, /German: `- \*\*Status\*\*: Behoben \| Offen \| Nicht umgesetzt`/);

  const build = readSource('tools/build.md');
  assert.match(build, /status values \(`Behoben`, `Offen \/ Nicht umgesetzt`\)/);
  assert.doesNotMatch(build, /status tokens used by report readers remain unchanged/);

  const review = readSource('tools/review.md');
  for (const epicText of [
    'Code review YYYY-MM-DD[-N]',
    'Skipped (design decisions)',
    'Code-Review YYYY-MM-DD[-N]',
    'Übersprungen (Architekturentscheidungen)',
  ]) {
    assert.ok(review.includes(epicText), `review is missing localized epic prose: ${epicText}`);
  }
});

// --- ADR ownership-contract consistency ---

test('findStaleAdrContractClaims rejects a deliberate divergence claim', () => {
  assert.deepEqual(
    findStaleAdrContractClaims(
      'The living ADR model is a deliberate divergence from the host `effective-product` skill.',
    ),
    [
      {
        line: 1,
        kind: 'stale-divergence',
        claim: 'deliberate divergence',
      },
    ],
  );
});

test('findStaleAdrContractClaims supports verb-adverb divergence order', () => {
  assert.deepEqual(
    findStaleAdrContractClaims('Effective Flow diverges deliberately from effective-product.'),
    [{ line: 1, kind: 'stale-divergence', claim: 'diverges deliberately' }],
  );
});

test('findStaleAdrContractClaims supports intentional divergence wording', () => {
  assert.deepEqual(
    findStaleAdrContractClaims('Effective Flow intentionally diverges from effective-product.'),
    [{ line: 1, kind: 'stale-divergence', claim: 'intentionally diverges' }],
  );
});

test('findStaleAdrContractClaims allows locally negated divergence wording', () => {
  assert.deepEqual(
    findStaleAdrContractClaims('This is not a deliberate divergence from effective-product.'),
    [],
  );
  assert.deepEqual(
    findStaleAdrContractClaims(
      'Effective Flow no longer deliberately diverges from effective-product.',
    ),
    [],
  );
});

test('findStaleAdrContractClaims rejects immutable and numbered skill-contract variants', () => {
  const markdown = [
    '# ADR guidance',
    '',
    'The `effective-product` skill requires immutable ADRs.',
    '',
    'Numbered records are mandatory under `effective-product`.',
  ].join('\n');

  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    {
      line: 3,
      kind: 'immutable-numbered-skill-contract',
      claim: 'immutable',
    },
    {
      line: 5,
      kind: 'immutable-numbered-skill-contract',
      claim: 'Numbered',
    },
  ]);
});

test('findStaleAdrContractClaims accepts the aligned ownership wording', () => {
  const markdown =
    'The authoritative `effective-product` skill discovers and follows this repository’s living, mutable, numberless, slug-named ADR convention.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims allows explicitly corrected historical context', () => {
  const markdown = [
    'Earlier versions described the slug model as a deliberate divergence from an allegedly',
    'immutable/numbered `effective-product` skill. That premise is outdated: `effective-product`',
    'now supports the declared living model, so this is no longer a divergence.',
  ].join('\n');
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims rejects historical wording without an explicit correction', () => {
  const markdown =
    'Earlier guidance called `effective-product` immutable and numbered, and this remains our contract.';
  assert.equal(findStaleAdrContractClaims(markdown).length, 2);
});

test('findStaleAdrContractClaims does not let corrected history waive a later current claim', () => {
  const markdown =
    'Earlier guidance described a deliberate divergence from `effective-product`, but that premise is outdated; Effective Flow now deliberately diverges from `effective-product`.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'stale-divergence', claim: 'deliberately diverges' },
  ]);
});

test('findStaleAdrContractClaims evaluates later immutable claims independently', () => {
  const markdown =
    'Earlier guidance said effective-product is immutable and numbered. That premise is outdated. Current guidance says effective-product is immutable.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'immutable' },
  ]);
});

test('findStaleAdrContractClaims associates an immediate skill-contract continuation', () => {
  const markdown =
    'The effective-product skill defines the contract. It requires immutable, numbered ADRs.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'immutable' },
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'numbered' },
  ]);
});

test('findStaleAdrContractClaims allows locally negated immutable and numbered wording', () => {
  const markdown = 'The effective-product skill does not require immutable or numbered ADRs.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims does not associate an unrelated divergence sentence', () => {
  const markdown =
    'Effective Flow deliberately diverges from another policy. The effective-product skill follows the repository convention.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims does not use unrelated old and support prose as a waiver', () => {
  const markdown =
    'The old ADR directory remains readable. The effective-product skill requires immutable ADRs. The parser now supports tables.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'immutable' },
  ]);
});

test('findStaleAdrContractClaims requires history in the stale candidate sentence', () => {
  const markdown =
    'Earlier releases used Markdown. Effective Flow deliberately diverges from effective-product. The build now supports Windows.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'stale-divergence', claim: 'deliberately diverges' },
  ]);
});

test('findStaleAdrContractClaims ignores numbered legacy compatibility without a skill claim', () => {
  const markdown =
    'Existing numbered legacy ADRs remain readable; new records use the numberless slug convention.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

// The guard runs over this file in `node build.mjs`, and the reframing added prose about the
// living slug model being a default rather than the convention. `STALE_ADR_DESCRIPTOR_RE` is a
// bare word match, so a sentence phrased around "numbered" or "immutable" near the skill name
// would break the build rather than the suite.
test('findStaleAdrContractClaims reports no hit for the reframed adr-convention fragment', () => {
  const convention = readFileSync(
    new URL('../src/shared/adr-convention.md', import.meta.url),
    'utf8',
  );
  assert.deepEqual(findStaleAdrContractClaims(convention), []);
});

// --- Delivery-branch documentation transforms ---

test('rewriteDeveloperGuideLinks rewrites the root-README form to an absolute URL', () => {
  const out = rewriteDeveloperGuideLinks('siehe [Technik](docs/developer-guide/README.md).', {
    ...DELIVERY,
    fromRoot: true,
  });
  assert.equal(
    out,
    'siehe [Technik](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/README.md).',
  );
});

test('rewriteDeveloperGuideLinks rewrites the user-guide form to an absolute URL', () => {
  const out = rewriteDeveloperGuideLinks(
    'siehe [Skill-Ownership](../developer-guide/skill-ownership.md) dort.',
    { ...DELIVERY, fromRoot: false },
  );
  assert.equal(
    out,
    `siehe [Skill-Ownership](${developerGuideBaseUrl(DELIVERY.repo, DELIVERY.sourceBranch)}/skill-ownership.md) dort.`,
  );
});

test('rewriteDeveloperGuideLinks maps any user-guide nesting depth to the same base', () => {
  const base = developerGuideBaseUrl(DELIVERY.repo, DELIVERY.sourceBranch);
  assert.equal(
    rewriteDeveloperGuideLinks('[a](../developer-guide/a.md)', { ...DELIVERY, fromRoot: false }),
    `[a](${base}/a.md)`,
  );
  assert.equal(
    rewriteDeveloperGuideLinks('[a](../../developer-guide/a.md)', { ...DELIVERY, fromRoot: false }),
    `[a](${base}/a.md)`,
  );
});

test('rewriteDeveloperGuideLinks is idempotent (already-absolute link untouched)', () => {
  const once = rewriteDeveloperGuideLinks('[x](docs/developer-guide/a.md)', {
    ...DELIVERY,
    fromRoot: true,
  });
  const twice = rewriteDeveloperGuideLinks(once, { ...DELIVERY, fromRoot: true });
  assert.equal(twice, once);
});

test('rewriteDeveloperGuideLinks leaves other links untouched', () => {
  const src =
    '[user](docs/user-guide/README.md) und [ext](https://example.com/developer-guide/x.md)';
  assert.equal(rewriteDeveloperGuideLinks(src, { ...DELIVERY, fromRoot: true }), src);
});

test('rewriteDeveloperGuideLinks leaves a plain-text path mention (no link) alone', () => {
  const src = 'Kategorien sind `docs/developer-guide/` und `docs/user-guide/`.';
  assert.equal(rewriteDeveloperGuideLinks(src, { ...DELIVERY, fromRoot: true }), src);
});

test('rewriteDeveloperGuideLinks requires repo and sourceBranch', () => {
  assert.throws(
    () => rewriteDeveloperGuideLinks('x', { fromRoot: true }),
    /requires repo and sourceBranch/,
  );
});

test('appendDeliveryFooter appends the footer with the marker and source-branch link', () => {
  const out = appendDeliveryFooter('# Titel\n\nText.\n', DELIVERY);
  assert.ok(out.includes(DELIVERY_FOOTER_MARKER));
  assert.ok(out.includes('https://github.com/sebastian-software/effective-flow/tree/develop'));
  assert.ok(out.trimStart().startsWith('# Titel'));
  assert.ok(out.endsWith(deliveryFooter(DELIVERY.repo, DELIVERY.sourceBranch) + '\n'));
});

test('appendDeliveryFooter is idempotent (no second footer)', () => {
  const once = appendDeliveryFooter('# Titel\n', DELIVERY);
  const twice = appendDeliveryFooter(once, DELIVERY);
  assert.equal(twice, once);
  assert.equal(twice.split(DELIVERY_FOOTER_MARKER).length - 1, 1);
});

test('appendDeliveryFooter requires repo and sourceBranch', () => {
  assert.throws(() => appendDeliveryFooter('x', { repo: 'a/b' }), /requires repo and sourceBranch/);
});
