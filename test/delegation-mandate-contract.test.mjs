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
  'deliver',
  'build',
  'fix',
  'refactor',
  'docs',
  'maintain',
  'review',
  'iterate',
  'merge-gate',
  'apply-review',
  'apply-issues',
  'plan',
  'plan-issue',
  'investigate',
  'plan-review',
  'concept-review',
]);

const SUB_AGENT_TOOLS = ['Agent', 'Task'];

// Enumerate src/agents/ rather than hard-coding the roster, so a newly added agent is in scope
// without a test edit and a future re-grant on an observation role fails here.
function readAgentSources() {
  const agentFiles = readdirSync(AGENTS_DIR).filter((name) => name.endsWith('.md'));
  assert.ok(agentFiles.length > 0, 'expected at least one agent source under src/agents/');

  return agentFiles.map((file) => {
    const body = readSource('agents', file);
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
    // Drop a parenthesised argument list so a hypothetical `Edit(src/**)` still counts as `Edit`
    // here; the raw string is kept so the dedicated guard below can still see the form it bans.
    const tools = rawTools.split(',').map((tool) => tool.replace(/\(.*$/, ''));
    return { body, file, rawTools, tools };
  });
}

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

function assertLeafWorkerHandoff(text, context) {
  assertClauses(text, [
    [
      /only the (?:workflow\/tool )?orchestrator (?:may )?(?:start|starts) worker(?: roles|s) or analysis fan-out/i,
      `${context} must reserve worker starts and analysis fan-out for the orchestrator`,
    ],
    [
      /worker(?: is|s are) (?:a )?(?:\*\*)?leaf executor/i,
      `${context} must classify every worker as a leaf executor`,
    ],
    [
      /(?:starts no (?:sub-agent|child)|never delegate(?:s)? further)/i,
      `${context} must prohibit a worker from starting a child`,
    ],
    [
      /return(?:s)? missing essential context to the orchestrator/i,
      `${context} must send missing essential context back to the orchestrator`,
    ],
    [
      /zero inherited turns(?:\*\*)? when supported/i,
      `${context} must prefer zero inherited turns for a worker`,
    ],
    [
      /otherwise (?:its|the) smallest (?:host-)?supported history/i,
      `${context} must fall back to the smallest supported history`,
    ],
    [
      /compact,? self-contained handoff/i,
      `${context} must require a compact, self-contained worker handoff`,
    ],
  ]);

  for (const [pattern, field] of [
    [/objective/i, 'objective'],
    [/relevant artifact paths/i, 'relevant artifact paths'],
    [/scoped paths and ownership/i, 'scoped paths and ownership'],
    [
      /execution and runtime-state roots when writes are allowed/i,
      'execution and runtime-state roots when writes are allowed',
    ],
    [/resolved language/i, 'resolved language'],
    [/authority and write limits/i, 'authority and write limits'],
    [/completion protocol/i, 'completion protocol'],
  ]) {
    assert.match(text, pattern, `${context} worker handoff must include ${field}`);
  }
}

function findProseBlock(body, trigger, context) {
  const block = body.split(/\n\s*\n/).find((candidate) => trigger.test(candidate));
  assert.ok(block, `${context} must retain the missing/ambiguous-context decision point`);
  return block;
}

function assertDelegatedQuestionBoundary(body, trigger, context) {
  const block = findProseBlock(body, trigger, context);

  assert.match(
    block,
    /only\s+(?:on\s+)?a\s+direct invocation[^\n]{0,100}\b(?:asks?|requests?)\b/i,
    `${context} must allow a user question only on direct invocation`,
  );
  assert.match(
    block,
    /delegated worker[\s\S]{0,100}\breturns?\b[\s\S]{0,40}\bABORT\b[\s\S]{0,120}\b(?:missing context|prerequisite)\b[\s\S]{0,80}\borchestrator\b/i,
    `${context} must return ABORT with the missing context or prerequisite to the orchestrator ` +
      'instead of asking the user when delegated',
  );
}

test('delegation-mandate.md exists and stays within the always-loaded context budget', () => {
  const lineCount = delegationMandate.split('\n').length;
  assert.ok(
    lineCount <= 16,
    `src/shared/delegation-mandate.md has ${lineCount} lines but must stay at 16 or fewer. ` +
      'It is eagerly included by every delegating tool, and build.mjs budgets every one of ' +
      'them individually in CONTEXT_BUDGET_LINES. Most of those entries are a measured size ' +
      'plus a few lines of headroom, so a line added here is paid against each of them at ' +
      'once; `review` is the tightest of the tools sharing the 700-line budget, at 692.',
  );
});

test('delegation-mandate.md preserves tool-level delegation and workflow handoff boundaries', () => {
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
    [
      /declined at runtime[\s\S]{0,100}orchestrator works inline and says so/i,
      'missing: disclosed orchestrator-level inline fallback that is never silent',
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

test('delegation-mandate.md defines the self-contained leaf-worker handoff', () => {
  assertLeafWorkerHandoff(delegationMandate, 'src/shared/delegation-mandate.md');
});

test('SKILL.md keeps delegation at the router and repeats the leaf-worker handoff', () => {
  assert.match(
    skill,
    /Invoking a tool is the user['’]s standing request for exactly that internal delegation/,
    'SKILL.md must state that invoking a tool is the standing request for exactly that internal ' +
      'delegation; without it the worker-resolution section reads as an optional offer',
  );
  assertLeafWorkerHandoff(skill, 'src/SKILL.md');
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
      'A tool belongs on the list when it delegates to a named worker role or runs analysis — ' +
      'merge-gate does, through the merge-conflict resolver and the code-validator that verifies ' +
      "its result. It stays off the list when it only hands off to another workflow, the mandate's " +
      'own carve-out, which is why apply-plan is absent and merge-gate → iterate earns the gate ' +
      'no include of its own.',
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

test('every agent source carries the eager mandate and prohibits all sub-agent grants', () => {
  const agents = readAgentSources();
  const violations = [];

  for (const { file, body, tools } of agents) {
    assert.ok(
      collectIncludeNames(body).eager.has('delegation-mandate'),
      `src/agents/${file} must eagerly include delegation-mandate`,
    );

    const subAgent = SUB_AGENT_TOOLS.filter((tool) => tools.includes(tool));
    if (subAgent.length > 0) {
      violations.push(
        `src/agents/${file} lists prohibited ${subAgent.join(' and ')} in claude.tools — ` +
          `tools: [${tools.join(', ')}]`,
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    'named workers are leaf executors, but claude.tools grants them sub-agent tools:\n' +
      `${violations.join('\n')}\n\n` +
      'Every src/agents role must omit Agent and Task regardless of its read/write authority. ' +
      'Only the workflow/tool orchestrator may start workers or analysis fan-out.',
  );
});

test('generic fallback workers return missing context upstream and ask only when invoked directly', () => {
  for (const { file, decision, trigger } of [
    {
      file: 'generic-product-implementer.md',
      decision: 'reduced-depth routing ambiguity',
      trigger: /role or a safe native command remains ambiguous/i,
    },
    {
      file: 'generic-product-implementer.md',
      decision: 'repository-native discovery gap',
      trigger: /evidence does not establish the product\/tooling role/i,
    },
    {
      file: 'generic-product-implementer.md',
      decision: 'missing dependency or toolchain approval',
      trigger: /introduce a dependency, test framework, task runner/i,
    },
    {
      file: 'generic-product-implementer.md',
      decision: 'missing command prerequisite or approval',
      trigger: /command requires a missing runtime, network access, secrets/i,
    },
    {
      file: 'generic-implementer.md',
      decision: 'product/tooling boundary ambiguity',
      trigger: /product\/tooling boundary remains ambiguous/i,
    },
    {
      file: 'marketing-writer.md',
      decision: 'essential missing marketing context',
      trigger: /missing context is essential/i,
    },
  ]) {
    assertDelegatedQuestionBoundary(
      readSource('agents', file),
      trigger,
      `src/agents/${file} (${decision})`,
    );
  }
});

test('no agent narrows a sub-agent grant with the disproven Agent(<type>) form', () => {
  for (const { file, rawTools } of readAgentSources()) {
    assert.doesNotMatch(
      rawTools,
      /(?:Agent|Task)\(/,
      `src/agents/${file} claude.tools must not use the parenthesised Agent(<type>)/Task(<type>) ` +
        `form (found: ${rawTools}). It was empirically disproven as a restriction: a probe agent ` +
        'declared with `tools: Read, Glob, Grep, Agent(Explore)` still spawned a general-purpose ' +
        'subagent. The harness reads the parenthesised form as a plain grant and applies no type ' +
        'restriction, so every named worker must omit Agent and Task entirely.',
    );
  }
});
