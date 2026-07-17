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
  ASK_MAX_HEADER_LENGTH,
} from '../build-lib.mjs';

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
    '`nodejs-implementer`',
  );
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
    'Intro $effective-flow fix and `code-validator`.\n',
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
