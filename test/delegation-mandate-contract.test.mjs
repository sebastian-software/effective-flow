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
  'merge-gate',
  'apply-review',
  'apply-issues',
  'plan',
  'plan-issue',
  'investigate',
  'plan-review',
  'concept-review',
]);

// A tool whose whole purpose is to produce changes. Holding one of these marks the agent as a
// producing role, which is what earns the sub-agent grant; an agent holding neither is an
// observation role whose output is judgment, and it withholds the grant. `Bash` is deliberately
// not on this list: it is not harmless, it just does not make an agent a producing role.
const CHANGE_PRODUCING_TOOLS = ['Write', 'Edit'];
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
      /A worker that \*\*has\*\* a sub-agent tool may fan out \*\*read-only\*\* analysis sub-agents/,
      'missing: a worker that has a sub-agent tool may fan out read-only analysis sub-agents',
    ],
    [
      /never\s+re-delegates\s+its\s+own\s+assignment/i,
      'missing: a worker never re-delegates its own assignment',
    ],
    [/never\s+delegates\s+a\s+write/i, 'missing: a worker never delegates a write'],
    [
      /never\s+selects\s+or\s+sequences\s+another\s+worker\s+role/i,
      'missing: a worker never selects or sequences another worker role — role selection and ' +
        'sequencing stay with the orchestrating tool',
    ],
    [
      /A worker whose tool list carries no sub-agent tool does not delegate at all/i,
      'missing: a worker whose tool list carries no sub-agent tool does not delegate at all. ' +
        'This is the only statement of where the read-only guarantee actually lives — the ' +
        'withheld tool grant, not prose.',
    ],
  ]);
  // The fragment used to promise that a worker "never starts a general-purpose or otherwise
  // write-capable agent". That promise was empirically disproven: an agent granted the sub-agent
  // tool can start a general-purpose child regardless of what the prose says, so restating it
  // would advertise an enforcement that does not exist.
  assert.doesNotMatch(
    delegationMandate,
    /never\s+starts\s+a\s+general-purpose/i,
    'delegation-mandate.md must not promise that a worker never starts a general-purpose agent: ' +
      'nothing enforces that at runtime. A worker granted Agent/Task can start any agent type, ' +
      'which is why the read-only guarantee is now carried by withholding the grant instead.',
  );
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

test('every agent source carries the eager include and pairs the sub-agent grant with the producing roles', () => {
  const agents = readAgentSources();
  const producingAgents = [];
  const observationAgents = [];
  // Collected instead of asserted per file, so one offender cannot mask another: the roster is
  // edited by several hands and a failure report that stops at the first file hides the rest.
  const violations = [];

  for (const { file, body, tools } of agents) {
    assert.ok(
      collectIncludeNames(body).eager.has('delegation-mandate'),
      `src/agents/${file} must eagerly include delegation-mandate`,
    );

    const producing = CHANGE_PRODUCING_TOOLS.filter((tool) => tools.includes(tool));
    // This reads the `Agent` and `Task` strings out of the source; it does not prove the grant
    // works at runtime. A mistyped tool name is silently dropped by the harness, and only the
    // manual smoke check can catch that.
    const subAgent = SUB_AGENT_TOOLS.filter((tool) => tools.includes(tool));

    if (producing.length > 0) {
      producingAgents.push(file);
      const missing = SUB_AGENT_TOOLS.filter((tool) => !subAgent.includes(tool));
      if (missing.length > 0) {
        violations.push(
          `src/agents/${file} is a producing role (lists ${producing.join(', ')}) but does not ` +
            `list ${missing.join(' and ')} — tools: [${tools.join(', ')}]`,
        );
      }
    } else {
      observationAgents.push(file);
      if (subAgent.length > 0) {
        violations.push(
          `src/agents/${file} is an observation role (lists neither ` +
            `${CHANGE_PRODUCING_TOOLS.join(' nor ')}) but lists ${subAgent.join(' and ')} — ` +
            `tools: [${tools.join(', ')}]`,
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    'claude.tools drifted from the grant pairing:\n' +
      `${violations.join('\n')}\n\n` +
      `An agent that lists ${CHANGE_PRODUCING_TOOLS.join(' or ')} produces changes and must list ` +
      'both Agent and Task, because the delegation mandate makes read-only analysis fan-out its ' +
      'default. An agent that lists neither is an observation role and must list neither, ' +
      'regardless of Bash. It withholds the grant because its output is judgment rather than ' +
      'changes, and withholding keeps the easy path to a write-capable child closed: a sub-agent ' +
      "tool starts a child with the child's own tool set, which neither prose nor the " +
      'Agent(<type>) form constrains. For the reviewers that grant is the entire read-only ' +
      'guarantee; for an observation role that also holds Bash — which is not harmless and can ' +
      'reach a write on its own — it is defence in depth rather than a guarantee.',
  );

  // Without these, a bug that made every agent land on one side of the branch — an empty
  // CHANGE_PRODUCING_TOOLS match, a broken tool split — would satisfy the rule vacuously.
  assert.ok(
    producingAgents.length > 0,
    'expected at least one producing agent under src/agents/ carrying the Agent/Task grant; ' +
      'finding none means the tool lists are no longer being read',
  );
  assert.ok(
    observationAgents.length > 0,
    'expected at least one observation agent under src/agents/ with the Agent/Task grant ' +
      'withheld; finding none means the boundary this contract pins has been dropped everywhere',
  );
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
        'restriction, so using it on an observation role silently reopens the path it was meant ' +
        'to close. An observation role must omit Agent and Task entirely.',
    );
  }
});
