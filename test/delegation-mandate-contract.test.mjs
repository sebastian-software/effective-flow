import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { collectIncludeNames, extractFrontmatter, getNestedArray } from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');

const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');

const delegationMandate = readSource('shared', 'delegation-mandate.md');
const skill = readSource('SKILL.md');
const planReview = readSource('tools', 'plan-review.md');
const conceptReview = readSource('tools', 'concept-review.md');
const investigationMethod = readSource('shared', 'investigation-method.md');
const initialStateDocumentation = readSource('shared', 'initial-state-documentation.md');
const planTool = readSource('tools', 'plan.md');
const planIssueTool = readSource('tools', 'plan-issue.md');

const EXPECTED_EAGER_INCLUDE_TOOLS = new Set([
  'build',
  'fix',
  'refactor',
  'docs',
  'maintain',
  'review',
  'iterate',
  'apply-review',
  'apply-issues',
  'plan',
  'plan-issue',
  'investigate',
  'plan-review',
  'concept-review',
]);

// Split a markdown body at a top-level heading so an assertion can name which
// section carries the fact: everything before the heading, and the heading's own
// section up to the next `## `.
function splitAtSection(body, heading, context) {
  const start = body.indexOf(heading);
  assert.notEqual(start, -1, `${context} must have a \`${heading}\` section`);
  const rest = body.slice(start + heading.length);
  const end = rest.search(/^## /m);
  return { before: body.slice(0, start), section: end === -1 ? rest : rest.slice(0, end) };
}

function assertClauses(text, clauses) {
  for (const [pattern, message] of clauses) {
    assert.match(text, pattern, message);
  }
}

test('delegation-mandate.md exists and stays within the always-loaded context budget', () => {
  const lineCount = delegationMandate.split('\n').length;
  assert.ok(
    lineCount <= 16,
    `src/shared/delegation-mandate.md has ${lineCount} lines but must stay at 16 or fewer. ` +
      'It is eagerly included by every delegating tool, and build.mjs enforces a 700-line ' +
      'always-loaded context budget (CONTEXT_BUDGET_MAX_LINES) for build, fix, docs, review, ' +
      'and plan; those tools already sit close to the budget, so growing this fragment risks ' +
      'tripping the build guard.',
  );
});

test('delegation-mandate.md states all six mandate points and carries no unresolved placeholder', () => {
  assertClauses(delegationMandate, [
    [
      /standing request/i,
      'missing: invoking a tool is the standing request for internal delegation',
    ],
    [
      /host default[^\n]*not apply/i,
      'missing: a host default discouraging unrequested sub-agents does not apply inside a tool run',
    ],
    [
      /names a worker role[\s\S]{0,80}mandatory/i,
      'missing: delegating to a named worker role is mandatory',
    ],
    [
      /analysis[^\n]{0,80}delegation is the \*\*default\*\*/i,
      'missing: for analysis, delegation is the DEFAULT. A phrasing that makes delegation optional, ' +
        'or that makes working inline the default, is a reversal of the mandate and must fail here.',
    ],
    [
      /[Ww]ork inline only under (?:this|the)[^\n]{0,40}triviality exception/,
      'missing: the triviality exception is the only carve-out that permits inline work',
    ],
    [
      /triviality exception[^\n]{0,140}(?:a single known file|one lookup)/i,
      'missing: the definition of the triviality exception itself (a single known file, one lookup)',
    ],
    [
      /exception mean(?:s)? exactly this definition/i,
      'missing: the binding that every site naming the triviality exception means exactly this ' +
        'definition — the four delegation sites reference the term instead of restating it',
    ],
    [/fan out\s+\*\*read-only\*\*/i, 'missing: a worker may fan out read-only analysis sub-agents'],
    [
      /never re-delegates[\s\S]{0,80}never delegates a write/i,
      'missing: no re-delegation of the assignment and no delegated write',
    ],
    [
      /declined at runtime[\s\S]{0,80}work inline and say so/i,
      'missing: disclosed inline fallback that is never silent',
    ],
    [/never silently/i, 'missing: the fallback must never be silent'],
    [
      /workflow[\s\S]{0,40}another[\s\S]{0,120}keeps that tool['’]s own mechanics/i,
      'missing: the workflow-to-workflow carve-out',
    ],
  ]);
  assert.doesNotMatch(
    delegationMandate,
    /\{\{WORKER_RESOLUTION\}\}/,
    'delegation-mandate.md must not contain the {{WORKER_RESOLUTION}} placeholder; ' +
      'that placeholder is only substituted in SKILL.md and would trip the unresolved-placeholder guard elsewhere',
  );
});

test('delegation-mandate.md bounds what a worker may itself start', () => {
  assertClauses(delegationMandate, [
    [
      /never\s+starts\s+a\s+general-purpose[^\n]{0,40}write-capable\s+agent/i,
      'missing: a worker may start read-only analysis sub-agents only and never a general-purpose ' +
        'or otherwise write-capable agent type',
    ],
    [
      /never\s+selects\s+or\s+sequences\s+another\s+worker\s+role/i,
      'missing: a worker never selects or sequences another worker role — role selection and ' +
        'sequencing stay with the orchestrating tool',
    ],
  ]);
});

test('SKILL.md states invoking a tool is the standing request for internal delegation', () => {
  assert.match(
    skill,
    /Invoking a tool is the user['’]s standing request for exactly that internal delegation/,
    'SKILL.md must state that invoking a tool is the standing request for exactly that internal ' +
      'delegation; without it the worker-resolution section reads as an optional offer',
  );
});

test('exactly the expected tool sources carry the eager delegation-mandate include', () => {
  const toolFiles = readdirSync(TOOLS_DIR).filter((name) => name.endsWith('.md'));
  const actualEager = new Set();
  const actualLazy = new Set();

  for (const file of toolFiles) {
    const toolName = file.slice(0, -3);
    const { eager, lazy } = collectIncludeNames(readSource('tools', file));
    if (eager.has('delegation-mandate')) actualEager.add(toolName);
    if (lazy.has('delegation-mandate')) actualLazy.add(toolName);
  }

  assert.deepEqual(
    [...actualEager].sort(),
    [...EXPECTED_EAGER_INCLUDE_TOOLS].sort(),
    'the set of tools eagerly including delegation-mandate drifted from the expected set. ' +
      'Add a tool to EXPECTED_EAGER_INCLUDE_TOOLS when it delegates to worker roles or runs ' +
      'analysis; leave it out for non-delegating tools and for the workflow-to-workflow tools ' +
      "apply-plan and pr-review, which the mandate's own carve-out excludes. Note that " +
      'src/tools/ also holds two non-tool fragments (apply-review-commit-mechanics.md, ' +
      'apply-review-remote.md).',
  );
  assert.equal(
    actualLazy.size,
    0,
    'delegation-mandate must never be lazy-included: a lazy pointer would defeat the mandate ' +
      `(found lazy include in: ${[...actualLazy].join(', ') || 'none'})`,
  );
});

test('plan-review and concept-review restate read-only fan-out authorization and keep the hard scope boundary', () => {
  for (const [name, body] of [
    ['plan-review.md', planReview],
    ['concept-review.md', conceptReview],
  ]) {
    const { before, section } = splitAtSection(body, '## Hard scope boundary', `src/tools/${name}`);

    assertClauses(before, [
      [
        /authorizes\s+\*\*read-only\*\*\s+analysis fan-out only/i,
        `${name} must restate, above its hard scope boundary, that only read-only analysis fan-out is authorized`,
      ],
      [
        /Hard scope boundary[^\n]*unaffected/i,
        `${name} must restate, above its hard scope boundary, that the boundary itself is unaffected`,
      ],
      [
        /never start an implementer,\s+test writer,\s+validator,[^\n]{0,40}code reviewer/i,
        `${name} must restate, above its hard scope boundary, that no implementer, test writer, validator or code reviewer may be started`,
      ],
    ]);

    // The pre-existing ban lives in the boundary section itself; the restatement above must not
    // be able to satisfy this assertion, otherwise deleting the boundary line stays green.
    assert.match(
      section,
      /Do not start any implementer,\s+test,\s+validator,\s+code-review,\s+or\s+documentation specialists\./i,
      `the \`Hard scope boundary\` section of ${name} must still ban starting implementer, test, validator, code-review and documentation specialists`,
    );
  }
});

test('the four analysis-delegation sites state delegation as the default with only the triviality exception', () => {
  const DELEGATION_DEFAULT =
    /[Dd]elegate the read-only (?:investigation|examination) of[^;.]{0,120}to an\s+internal[^;.]{0,40}sub-agent/;
  const TRIVIAL_EXCEPTION =
    /inline only under the delegation mandate['’]s\s+triviality\s+exception/i;

  for (const [name, body] of [
    ['src/shared/investigation-method.md', investigationMethod],
    ['src/shared/initial-state-documentation.md', initialStateDocumentation],
    ['src/tools/plan.md', planTool],
    ['src/tools/plan-issue.md', planIssueTool],
  ]) {
    assertClauses(body, [
      [
        DELEGATION_DEFAULT,
        `${name} must instruct delegating the read-only investigation/examination to an internal ` +
          'sub-agent, not offer it as one of two equal options',
      ],
      [
        TRIVIAL_EXCEPTION,
        `${name} must name the delegation mandate's triviality exception as the only case that ` +
          'permits inline work; the criteria themselves live in src/shared/delegation-mandate.md',
      ],
    ]);
  }
});

test('the old optional-delegation phrasing does not regress anywhere under src/', () => {
  function collectMarkdownFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...collectMarkdownFiles(fullPath));
      else if (entry.name.endsWith('.md')) files.push(fullPath);
    }
    return files;
  }

  const forbidden = [
    'locally or with an internal sub-agent',
    'locally or via an internal Explore sub-agent',
  ];
  // Generalization of both literals, so a reworded revert to optionality is caught too.
  const forbiddenPattern =
    /(?:locally|inline)\s+or\s+(?:with|via)\s+an\s+internal[^\n]{0,40}sub-agent/i;

  for (const filePath of collectMarkdownFiles(SOURCE_DIR)) {
    const body = readFileSync(filePath, 'utf8');
    for (const phrase of forbidden) {
      assert.ok(
        !body.includes(phrase),
        `${filePath} must not contain the regressed phrasing "${phrase}"`,
      );
    }
    assert.doesNotMatch(
      body,
      forbiddenPattern,
      `${filePath} must not present inline work and sub-agent delegation as two equal options`,
    );
  }
});

test('every agent source carries the eager include and pairs Agent with Task in claude.tools', () => {
  const agentFiles = readdirSync(AGENTS_DIR).filter((name) => name.endsWith('.md'));
  assert.ok(agentFiles.length > 0, 'expected at least one agent source under src/agents/');

  for (const file of agentFiles) {
    const body = readSource('agents', file);

    assert.ok(
      collectIncludeNames(body).eager.has('delegation-mandate'),
      `src/agents/${file} must eagerly include delegation-mandate`,
    );

    const frontmatter = extractFrontmatter(body);
    assert.notEqual(frontmatter, '', `src/agents/${file} must have a YAML frontmatter block`);
    // Same accessor the build uses, so `tools:` is read from inside the `claude:` block only and
    // a sibling block's `tools:` cannot stand in for a missing one.
    const rawTools = getNestedArray(frontmatter, 'claude', 'tools', {
      context: `src/agents/${file}`,
    });
    assert.notEqual(
      rawTools,
      '',
      `src/agents/${file} must declare a claude.tools array in its frontmatter`,
    );
    const tools = rawTools.split(',');
    // This proves the `Agent` and `Task` strings are present in the source, not that the grant
    // works at runtime: a mistyped tool name is silently dropped by the harness, and only the
    // manual smoke check can catch that.
    assert.ok(
      tools.includes('Agent'),
      `src/agents/${file} claude.tools must list Agent (found: ${tools.join(', ')})`,
    );
    assert.ok(
      tools.includes('Task'),
      `src/agents/${file} claude.tools must list Task (found: ${tools.join(', ')})`,
    );
  }
});
