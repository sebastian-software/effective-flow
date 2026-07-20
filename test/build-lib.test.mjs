import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  developerGuideBaseUrl,
  rewriteDeveloperGuideLinks,
  appendDeliveryFooter,
  deliveryFooter,
  DELIVERY_FOOTER_MARKER,
  PORTABLE_WORKER_DELEGATION,
  collectRenderedWorkerRefs,
} from '../build-lib.mjs';

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
