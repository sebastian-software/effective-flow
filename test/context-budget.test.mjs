import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import {
  CONTEXT_BUDGET_FIELD,
  CONTEXT_BUDGET_NON_TOOL_SOURCES,
  declaresContextBudget,
  extractFrontmatter,
  normalizeLineEndings,
  readContextBudget,
  resolveContextBudgetNonToolSources,
} from '../build-lib.mjs';
import { copyRepository } from './support/repository-copy.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS_DIR = join(ROOT_DIR, 'src/tools');
const TOOL_FILES = readdirSync(TOOLS_DIR)
  .filter((name) => name.endsWith('.md'))
  .sort();
const TOOL_NAMES = TOOL_FILES.map((name) => name.slice(0, -3));
const CTX = 'src/tools/fixture.md';

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readSource(path) {
  return normalizeLineEndings(readFileSync(join(ROOT_DIR, path), 'utf8'));
}

function assertBudgetError(frontmatter, reason) {
  assert.throws(
    () => readContextBudget(frontmatter, { context: CTX }),
    (error) =>
      error instanceof Error &&
      error.message.includes('context budget (#99)') &&
      error.message.includes(CTX) &&
      reason.test(error.message),
    `${JSON.stringify(frontmatter)} must fail with ${reason}`,
  );
}

// Invariant: every tool owns exactly one well-formed budget line, and it is the last frontmatter
// line, so a budget change touches only that tool's file.
test('every src/tools file declares exactly one valid contextBudget as its last frontmatter line', () => {
  assert.ok(TOOL_FILES.length > 0, 'src/tools must contain tools');
  for (const file of TOOL_FILES) {
    const frontmatter = extractFrontmatter(readSource(`src/tools/${file}`));
    const lines = frontmatter.split('\n');
    const declared = lines.filter((line) => /^contextBudget[ \t]*:/.test(line));
    assert.equal(declared.length, 1, `${file}: exactly one contextBudget line`);
    assert.match(lines[lines.length - 1], /^contextBudget: [1-9][0-9]*$/, `${file}: last line`);
    const budget = readContextBudget(frontmatter, { context: `src/tools/${file}` });
    assert.equal(typeof budget, 'number', `${file}: readContextBudget returns a number`);
    assert.ok(Number.isSafeInteger(budget) && budget > 0, `${file}: positive integer`);
  }
});

// Invariant: the budget map is gone from the build sources; frontmatter is the only source, so no
// tool-to-number table may creep back into build.mjs or build-lib.mjs.
test('build.mjs and build-lib.mjs carry no CONTEXT_BUDGET_LINES map or per-tool budget entries', () => {
  const alternation = TOOL_NAMES.map(escapeRegExp).join('|');
  const entryRe = new RegExp(`^\\s*['"]?(${alternation})['"]?\\s*[:,]\\s*\\d+`);
  for (const file of ['build.mjs', 'build-lib.mjs']) {
    const source = readSource(file);
    assert.equal(source.includes('CONTEXT_BUDGET_LINES'), false, `${file}: map name`);
    for (const line of source.split('\n')) {
      assert.doesNotMatch(line, entryRe, `${file}: tool budget entry`);
    }
  }
});

// Invariant: only tools carry a budget; the router, workers and shared fragments (the exported
// scan set the build also uses) never declare one in their frontmatter.
test('no non-tool source declares contextBudget in its frontmatter', () => {
  const sources = resolveContextBudgetNonToolSources(ROOT_DIR);
  assert.ok(sources.length > 0, 'scan set must not be empty');
  assert.ok(sources.includes('src/SKILL.md'), 'scan set includes the router');
  assert.ok(CONTEXT_BUDGET_NON_TOOL_SOURCES.length > 0);
  for (const path of sources) {
    assert.equal(
      declaresContextBudget(extractFrontmatter(readSource(path))),
      false,
      `${path} must not declare contextBudget`,
    );
  }
});

describe('contextBudget validator', () => {
  const EMPTY = /the value is empty; block scalars and continuation lines are not supported/;
  const BLOCK = /block scalars are not supported/;
  const QUOTED = /quoted values are not supported/;
  const SPACING = /the key must be followed directly by a colon and exactly one space/;
  const INTEGER = /the value must be a positive integer without sign, leading zero, decimal point/;
  const NOT_LAST = /must be the last frontmatter line, directly before the closing ---/;

  // Each malformed form maps to the frontmatter and the specific reason it must be rejected for.
  const malformed = {
    'repeated key': ['description: x\ncontextBudget: 5\ncontextBudget: 6', /is declared 2 times/],
    'double quoted': ['description: x\ncontextBudget: "922"', QUOTED],
    'single quoted': ["description: x\ncontextBudget: '922'", QUOTED],
    'block scalar |': ['description: x\ncontextBudget: |\n  922', BLOCK],
    'block scalar >': ['description: x\ncontextBudget: >\n  922', BLOCK],
    'empty value with continuation': ['description: x\ncontextBudget:\n  922', EMPTY],
    'empty value': ['description: x\ncontextBudget:', EMPTY],
    zero: ['description: x\ncontextBudget: 0', INTEGER],
    negative: ['description: x\ncontextBudget: -5', INTEGER],
    'leading zero': ['description: x\ncontextBudget: 0922', INTEGER],
    'plus sign': ['description: x\ncontextBudget: +922', INTEGER],
    decimal: ['description: x\ncontextBudget: 922.0', INTEGER],
    exponent: ['description: x\ncontextBudget: 1e3', INTEGER],
    comment: ['description: x\ncontextBudget: 922 # note', INTEGER],
    'trailing text': ['description: x\ncontextBudget: 922 lines', INTEGER],
    'trailing whitespace': ['description: x\ncontextBudget: 922 ', INTEGER],
    'no space after colon': ['description: x\ncontextBudget:922', SPACING],
    'space before colon': ['description: x\ncontextBudget : 922', SPACING],
    'not the last line': ['contextBudget: 922\ndescription: x', NOT_LAST],
  };

  // Invariant: every malformed form fails loudly with the #99 prefix, the file context and the
  // reason that matches its defect, instead of being read as a different number or as absent.
  for (const [label, [frontmatter, reason]] of Object.entries(malformed)) {
    test(`rejects ${label}`, () => {
      assertBudgetError(frontmatter, reason);
    });
  }

  // Invariant: the declaration guard treats misspelled top-level forms as declared, so they
  // cannot pass as "no budget".
  test('declaresContextBudget is true for every malformed form', () => {
    for (const [label, [frontmatter]] of Object.entries(malformed)) {
      assert.equal(declaresContextBudget(frontmatter), true, label);
    }
  });

  // Invariant: a valid last line is the budget; extractFrontmatter() ends the frontmatter at the
  // budget line itself, so a real file with the budget directly before --- is accepted.
  test('accepts a valid last line directly before the closing ---', () => {
    assert.equal(readContextBudget('description: x\ncontextBudget: 922', { context: CTX }), 922);
    assert.equal(readContextBudget('contextBudget: 7', { context: CTX }), 7);
    const content = '---\ndescription: x\ncontextBudget: 922\n---\n\n# Title\n';
    assert.equal(readContextBudget(extractFrontmatter(content), { context: CTX }), 922);
  });

  // Invariant: "directly before the closing ---" is literal; a blank or whitespace-only line the
  // author writes between the budget and --- displaces it from the last frontmatter line.
  test('rejects a blank or whitespace-only line between the budget and the closing ---', () => {
    for (const gap of ['', '  ', '\t']) {
      const content = `---\ndescription: x\ncontextBudget: 922\n${gap}\n---\n\n# Title\n`;
      const frontmatter = extractFrontmatter(content);
      assert.equal(frontmatter, `description: x\ncontextBudget: 922\n${gap}`);
      assertBudgetError(frontmatter, NOT_LAST);
    }
  });

  // Invariant: absence is reported as null (the build then names the tool), and nested
  // indented keys are not top-level declarations.
  test('returns null when absent or only nested', () => {
    assert.equal(readContextBudget('description: x', { context: CTX }), null);
    assert.equal(
      readContextBudget('description: x\nsection:\n  contextBudget: 5', { context: CTX }),
      null,
    );
    assert.equal(declaresContextBudget('section:\n  contextBudget: 5'), false);
    assert.equal(declaresContextBudget('description: x'), false);
  });

  // Invariant: only the frontmatter counts; a budget-looking line in the body is prose.
  test('ignores a contextBudget line in the body', () => {
    const content =
      '---\ndescription: x\n---\n\n# Title\n\n```yaml\ncontextBudget: 5\n```\n\ncontextBudget: 9\n';
    const frontmatter = extractFrontmatter(content);
    assert.equal(readContextBudget(frontmatter, { context: CTX }), null);
    assert.equal(declaresContextBudget(frontmatter), false);
    assert.equal(CONTEXT_BUDGET_FIELD, 'contextBudget');
  });
});

describe('build guard end to end', () => {
  let sandbox;

  before(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-context-budget-'));
  });

  after(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function buildMutated(name, mutate) {
    const caseRoot = join(sandbox, name);
    try {
      const checkout = join(caseRoot, 'checkout');
      const destination = join(caseRoot, 'output');
      copyRepository(ROOT_DIR, checkout);
      mutate(checkout);
      const result = spawnSync(process.execPath, ['build.mjs'], {
        cwd: checkout,
        env: {
          ...process.env,
          EFFECTIVE_FLOW_BUILD_GIT_HASH: 'context-budget-test',
          EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: destination,
        },
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, `${name}: build unexpectedly succeeded`);
      assert.equal(existsSync(join(destination, 'dist')), false, `${name}: output swapped`);
      return `${result.stdout}\n${result.stderr}`;
    } finally {
      rmSync(caseRoot, { recursive: true, force: true });
    }
  }

  function rewrite(path, transform) {
    const before = readFileSync(path, 'utf8');
    const after = transform(before);
    assert.notEqual(after, before, `mutation must change ${path}`);
    writeFileSync(path, after);
  }

  // Invariant: a tool without its own budget line fails the build and the message names the
  // tool and tells how to measure it.
  test('a tool without a contextBudget line fails naming the tool', () => {
    const output = buildMutated('missing', (checkout) =>
      rewrite(join(checkout, 'src/tools/version.md'), (text) =>
        text.replace(/^contextBudget: \d+\n/m, ''),
      ),
    );
    assert.match(output, /context budget \(#99\): no contextBudget frontmatter line for version/);
    assert.match(output, /Always-loaded core \(lines\/budget\)/);
  });

  // Invariant: a non-tool source declaring a budget fails the build naming its path.
  test('a non-tool source declaring contextBudget fails naming the path', () => {
    const agent = readdirSync(join(ROOT_DIR, 'src/agents')).find((name) => name.endsWith('.md'));
    assert.ok(agent, 'src/agents must contain a worker');
    const output = buildMutated('non-tool', (checkout) =>
      rewrite(join(checkout, 'src/agents', agent), (text) =>
        text.replace(/^(---\n[\s\S]*?)\n---\n/, '$1\ncontextBudget: 10\n---\n'),
      ),
    );
    assert.match(output, /context budget \(#99\)/);
    assert.ok(output.includes(`src/agents/${agent}`), 'message names the agent path');
  });

  // Invariant: the frontmatter value is the only budget source; lowering it makes the tool exceed.
  test('lowering a tool contextBudget makes the build report it as exceeded', () => {
    const output = buildMutated('exceeded', (checkout) =>
      rewrite(join(checkout, 'src/tools/version.md'), (text) =>
        text.replace(/^contextBudget: \d+$/m, 'contextBudget: 5'),
      ),
    );
    assert.match(
      output,
      /context budget \(#99\): always-loaded tool core exceeds its line budget: .*version \(\d+ lines, budget 5\)/,
    );
  });
});
