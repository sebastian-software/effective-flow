import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractFrontmatter,
  extractBody,
  getField,
  getNested,
  getNestedArray,
  getNestedList,
  cleanDescription,
  firstSentence,
  normalizeCodexSandboxMode,
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
  collectIncludeNames,
  assertNoEagerLazyOverlap,
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
  assert.deepEqual(r.options, [
    { label: 'A', description: 'erste' },
    { label: 'B', description: 'zweite' },
  ]);
});

test('parseAskBlock handles an approval block', () => {
  const r = parseAskBlock('header: Freigabe\nquestion: Ok?\ntype: approval\n');
  assert.equal(r.type, 'approval');
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

// --- renderBody end-to-end ---

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

test('code-validator renders a harness-neutral concurrent validation contract for every target', () => {
  const source = readFileSync(new URL('../src/agents/code-validator.md', import.meta.url), 'utf8');
  const body = extractBody(source);
  assert.doesNotMatch(source, /\brun_in_background\b/);

  for (const target of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(body, target, {
      ...refConfig,
      context: `src/agents/code-validator.md (${target})`,
    });

    assert.doesNotMatch(rendered, /\brun_in_background\b/, target);
    assert.doesNotMatch(rendered, /background Bash invocation/, target);
    assert.doesNotMatch(rendered, /in parallel, never sequentially/, target);
    assert.match(
      rendered,
      /Start every applicable check through a separate command invocation/,
      target,
    );
    assert.match(
      rendered,
      /Start all applicable independent checks before waiting for any of them/,
      target,
    );
    assert.match(
      rendered,
      /actively wait or poll every retained handle until it reaches a terminal state/,
      target,
    );
    assert.match(rendered, /each started check its own \*\*120-second\*\* timeout/, target);
    assert.match(
      rendered,
      /A failure or timeout in one check must never cancel another check/,
      target,
    );
    assert.match(rendered, /TypeScript → Linting → Build/, target);
    assert.match(rendered, /repeat the planned checks sequentially/, target);
    assert.match(
      rendered,
      /use sequential execution only when that mechanism is unavailable or the documented race fallback applies/,
      target,
    );
    assert.match(rendered, /reference the TypeScript error in the build section/, target);
    assert.match(rendered, /SKIPPED \(no script found\)/, target);
    assert.match(
      rendered,
      /a single combined fast script is not additionally started in parallel/,
      target,
    );
    assert.match(rendered, /`off`: run no checks/, target);
  }
});

// --- Fixture-based end-to-end snapshot ---

test('end-to-end: fixture source renders to the expected skill body', () => {
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
    'header: Freigabe',
    'question: Weiter?',
    'type: approval',
    '```',
    '',
  ].join('\n');

  const fm = extractFrontmatter(fixture);
  const body = extractBody(fixture);
  assert.doesNotThrow(() => assertQuotedDescription(fm));
  validateRefs(`${fm}\n${body}`, refConfig);

  const claude = renderBody(body, 'claude', { ...refConfig, context: 'fixture.md' });
  const expected = [
    '',
    '# Fixture',
    '',
    'Ruft /effective-flow fix und `effective-flow-nodejs-implementer` auf.',
    '',
    'Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:',
    '- header: "Freigabe"',
    '- question: "Weiter?"',
    '- multiSelect: false',
    '- options:',
    '  - label: "Ja", description: "Freigabe erteilt"',
    '  - label: "Anpassen", description: "Feedback als Freitext eingeben"',
    '',
  ].join('\n');
  assert.equal(claude, expected);
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

// --- ADR ownership-contract consistency ---

test('findStaleAdrContractClaims rejects a deliberate divergence claim', () => {
  assert.deepEqual(
    findStaleAdrContractClaims(
      'The living ADR model is a deliberate divergence from the host `decision-records` skill.',
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
    findStaleAdrContractClaims('Effective Flow diverges deliberately from decision-records.'),
    [{ line: 1, kind: 'stale-divergence', claim: 'diverges deliberately' }],
  );
});

test('findStaleAdrContractClaims supports intentional divergence wording', () => {
  assert.deepEqual(
    findStaleAdrContractClaims('Effective Flow intentionally diverges from decision-records.'),
    [{ line: 1, kind: 'stale-divergence', claim: 'intentionally diverges' }],
  );
});

test('findStaleAdrContractClaims allows locally negated divergence wording', () => {
  assert.deepEqual(
    findStaleAdrContractClaims('This is not a deliberate divergence from decision-records.'),
    [],
  );
  assert.deepEqual(
    findStaleAdrContractClaims(
      'Effective Flow no longer deliberately diverges from decision-records.',
    ),
    [],
  );
});

test('findStaleAdrContractClaims rejects immutable and numbered skill-contract variants', () => {
  const markdown = [
    '# ADR guidance',
    '',
    'The `decision-records` skill requires immutable ADRs.',
    '',
    'Numbered records are mandatory under `decision-records`.',
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
    'The authoritative `decision-records` skill discovers and follows this repository’s living, mutable, numberless, slug-named ADR convention.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims allows explicitly corrected historical context', () => {
  const markdown = [
    'Earlier versions described the slug model as a deliberate divergence from an allegedly',
    'immutable/numbered `decision-records` skill. That premise is outdated: `decision-records`',
    'now supports the declared living model, so this is no longer a divergence.',
  ].join('\n');
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims rejects historical wording without an explicit correction', () => {
  const markdown =
    'Earlier guidance called `decision-records` immutable and numbered, and this remains our contract.';
  assert.equal(findStaleAdrContractClaims(markdown).length, 2);
});

test('findStaleAdrContractClaims does not let corrected history waive a later current claim', () => {
  const markdown =
    'Earlier guidance described a deliberate divergence from `decision-records`, but that premise is outdated; Effective Flow now deliberately diverges from `decision-records`.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'stale-divergence', claim: 'deliberately diverges' },
  ]);
});

test('findStaleAdrContractClaims evaluates later immutable claims independently', () => {
  const markdown =
    'Earlier guidance said decision-records is immutable and numbered. That premise is outdated. Current guidance says decision-records is immutable.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'immutable' },
  ]);
});

test('findStaleAdrContractClaims associates an immediate skill-contract continuation', () => {
  const markdown =
    'The decision-records skill defines the contract. It requires immutable, numbered ADRs.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'immutable' },
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'numbered' },
  ]);
});

test('findStaleAdrContractClaims allows locally negated immutable and numbered wording', () => {
  const markdown = 'The decision-records skill does not require immutable or numbered ADRs.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims does not associate an unrelated divergence sentence', () => {
  const markdown =
    'Effective Flow deliberately diverges from another policy. The decision-records skill follows the repository convention.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
});

test('findStaleAdrContractClaims does not use unrelated old and support prose as a waiver', () => {
  const markdown =
    'The old ADR directory remains readable. The decision-records skill requires immutable ADRs. The parser now supports tables.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'immutable-numbered-skill-contract', claim: 'immutable' },
  ]);
});

test('findStaleAdrContractClaims requires history in the stale candidate sentence', () => {
  const markdown =
    'Earlier releases used Markdown. Effective Flow deliberately diverges from decision-records. The build now supports Windows.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), [
    { line: 1, kind: 'stale-divergence', claim: 'deliberately diverges' },
  ]);
});

test('findStaleAdrContractClaims ignores numbered legacy compatibility without a skill claim', () => {
  const markdown =
    'Existing numbered legacy ADRs remain readable; new records use the numberless slug convention.';
  assert.deepEqual(findStaleAdrContractClaims(markdown), []);
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
