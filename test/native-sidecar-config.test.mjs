import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NATIVE_SIDECAR_CONFIG_PARSERS,
  NATIVE_SIDECAR_PROMPT_BODY_KEY,
  assertBaselineWorkerMembership,
  assertSameNativeSidecarConfiguration,
  parseClaudeSidecarConfig,
  parseCodexSidecarConfig,
} from '../build-lib.mjs';

const CLAUDE_FILE = 'effective-flow-alpha.md';
const CODEX_FILE = 'effective-flow-alpha.toml';

function claudeSidecar({
  frontmatter = [
    'name: effective-flow-alpha',
    'description: "Alpha worker: reviews the \\"assigned\\" scope."',
    'model: opus',
    'effort: high',
    'tools: Read, Grep',
  ],
  body = '# Effective Flow Alpha\n\nReview the assigned scope.\n',
} = {}) {
  return `---\n${frontmatter.join('\n')}\n---\n\n${body}`;
}

function codexSidecar({
  settings = [
    'name = "effective-flow-alpha"',
    'description = "Alpha worker: reviews the \\"assigned\\" scope."',
    'model = "gpt-5.6-luna"',
    'model_reasoning_effort = "high"',
    "sandbox_mode = 'read-only'",
    'some_flag = true',
  ],
  body = '\n# Effective Flow Alpha\n\nReview the assigned scope.\n',
} = {}) {
  return `${settings.join('\n')}\ndeveloper_instructions = '''\n${body}'''\n`;
}

function compare(harness, baselineContent, workingContent, file = CLAUDE_FILE) {
  assertSameNativeSidecarConfiguration(
    harness,
    file,
    { path: `/baseline/dist/${harness}/agents/${file}`, content: baselineContent },
    { path: `/working/dist/${harness}/agents/${file}`, content: workingContent },
  );
}

function parseClaude(content) {
  return parseClaudeSidecarConfig(content, CLAUDE_FILE);
}

function parseCodex(content) {
  return parseCodexSidecarConfig(content, CODEX_FILE);
}

test('the parser registry is frozen and maps each harness to its parser', () => {
  assert.equal(Object.isFrozen(NATIVE_SIDECAR_CONFIG_PARSERS), true);
  assert.deepEqual(Object.keys(NATIVE_SIDECAR_CONFIG_PARSERS), ['claude', 'codex']);
  assert.equal(NATIVE_SIDECAR_CONFIG_PARSERS.claude, parseClaudeSidecarConfig);
  assert.equal(NATIVE_SIDECAR_CONFIG_PARSERS.codex, parseCodexSidecarConfig);
  assert.equal(NATIVE_SIDECAR_PROMPT_BODY_KEY, 'developer_instructions');
});

test('a Claude sidecar parses to its frontmatter configuration without the body', () => {
  const config = parseClaude(
    claudeSidecar({
      frontmatter: [
        'name: effective-flow-alpha',
        'description: "Alpha worker: reviews the \\"assigned\\" scope."',
        'model: opus',
        'effort: high',
        'color:',
        'tools: Read, Grep',
      ],
    }),
  );
  assert.equal(Object.getPrototypeOf(config), null);
  assert.deepEqual(
    { ...config },
    {
      name: 'effective-flow-alpha',
      description: 'Alpha worker: reviews the "assigned" scope.',
      model: 'opus',
      effort: 'high',
      color: '',
      tools: 'Read, Grep',
    },
  );
});

test('a Codex sidecar parses to its settings with the prompt body replaced by a marker', () => {
  const config = parseCodex(
    codexSidecar({
      settings: [
        'name = "effective-flow-alpha"',
        'description = "Alpha worker: reviews the \\"assigned\\" scope."',
        'model = "gpt-5.6-luna"',
        'model_reasoning_effort = "high"',
        "sandbox_mode = 'read-only'",
        '',
        'some_flag = true',
        'max_turns = 12',
      ],
    }),
  );
  assert.equal(Object.getPrototypeOf(config), null);
  assert.deepEqual(
    { ...config },
    {
      name: 'effective-flow-alpha',
      description: 'Alpha worker: reviews the "assigned" scope.',
      model: 'gpt-5.6-luna',
      model_reasoning_effort: 'high',
      sandbox_mode: 'read-only',
      some_flag: 'true',
      max_turns: '12',
      developer_instructions: '<prompt body excluded>',
    },
  );
});

test('a Codex setting after the multiline prompt body is still parsed', () => {
  const content = `${codexSidecar()}trailing_flag = false\n`;
  assert.equal(parseCodex(content).trailing_flag, 'false');
});

test('identical sidecars compare equal for both harnesses', () => {
  assert.doesNotThrow(() => compare('claude', claudeSidecar(), claudeSidecar()));
  assert.doesNotThrow(() => compare('codex', codexSidecar(), codexSidecar(), CODEX_FILE));
});

test('the prompt body is excluded from the comparison', () => {
  assert.doesNotThrow(() =>
    compare('claude', claudeSidecar(), claudeSidecar({ body: 'Entirely different prose.\n' })),
  );
  assert.doesNotThrow(() =>
    compare(
      'codex',
      codexSidecar(),
      codexSidecar({ body: '\nEntirely different\ndeveloper instructions.\n' }),
      CODEX_FILE,
    ),
  );
});

test('a Claude value change is reported as configuration drift', () => {
  const working = claudeSidecar({
    frontmatter: ['name: effective-flow-alpha', 'model: sonnet', 'effort: high'],
  });
  const baseline = claudeSidecar({
    frontmatter: ['name: effective-flow-alpha', 'model: opus', 'effort: high'],
  });
  assert.throws(
    () => compare('claude', baseline, working),
    /^Error: Base native configuration drift: claude effective-flow-alpha\.md key "model": "opus" -> "sonnet"$/,
  );
});

test('a Claude key added or removed is reported with <absent>', () => {
  const plain = claudeSidecar({ frontmatter: ['name: effective-flow-alpha', 'model: opus'] });
  const colored = claudeSidecar({
    frontmatter: ['name: effective-flow-alpha', 'model: opus', 'color: blue'],
  });
  assert.throws(
    () => compare('claude', plain, colored),
    /^Error: Base native configuration drift: claude effective-flow-alpha\.md key "color": <absent> -> "blue"$/,
  );
  assert.throws(
    () => compare('claude', colored, plain),
    /^Error: Base native configuration drift: claude effective-flow-alpha\.md key "color": "blue" -> <absent>$/,
  );
});

test('a Codex value change is reported as configuration drift', () => {
  const baseline = codexSidecar({ settings: ['name = "a"', 'model_reasoning_effort = "high"'] });
  const working = codexSidecar({ settings: ['name = "a"', 'model_reasoning_effort = "low"'] });
  assert.throws(
    () => compare('codex', baseline, working, CODEX_FILE),
    /^Error: Base native configuration drift: codex effective-flow-alpha\.toml key "model_reasoning_effort": "high" -> "low"$/,
  );
});

test('a Codex key added or removed is reported with <absent>', () => {
  const plain = codexSidecar({ settings: ['name = "a"'] });
  const flagged = codexSidecar({ settings: ['name = "a"', 'some_flag = true'] });
  assert.throws(
    () => compare('codex', plain, flagged, CODEX_FILE),
    /^Error: Base native configuration drift: codex effective-flow-alpha\.toml key "some_flag": <absent> -> "true"$/,
  );
  assert.throws(
    () => compare('codex', flagged, plain, CODEX_FILE),
    /^Error: Base native configuration drift: codex effective-flow-alpha\.toml key "some_flag": "true" -> <absent>$/,
  );
});

test('the first drifting key in sorted order is the one reported', () => {
  const baseline = claudeSidecar({ frontmatter: ['name: a', 'model: opus', 'effort: high'] });
  const working = claudeSidecar({ frontmatter: ['name: a', 'model: sonnet', 'effort: low'] });
  assert.throws(() => compare('claude', baseline, working), /key "effort": "high" -> "low"$/);
});

test('Claude parsing fails closed on frontmatter it does not recognize', async (t) => {
  const cases = [
    ['missing frontmatter', '# Effective Flow Alpha\n', /missing or unterminated frontmatter$/],
    [
      'unterminated frontmatter',
      '---\nname: effective-flow-alpha\nmodel: opus\n',
      /missing or unterminated frontmatter$/,
    ],
    [
      'CRLF line endings',
      '---\r\nname: effective-flow-alpha\r\n---\r\nbody\r\n',
      /missing or unterminated frontmatter$/,
    ],
    [
      'a YAML list item',
      claudeSidecar({ frontmatter: ['name: effective-flow-alpha', 'tools:', '  - Read'] }),
      /unrecognized frontmatter line "  - Read"$/,
    ],
    [
      'an unrecognized line',
      claudeSidecar({ frontmatter: ['name: effective-flow-alpha', 'model=opus'] }),
      /unrecognized frontmatter line "model=opus"$/,
    ],
    [
      'a key without the separating space',
      claudeSidecar({ frontmatter: ['name:effective-flow-alpha'] }),
      /unrecognized frontmatter line "name:effective-flow-alpha"$/,
    ],
    [
      'a duplicate key',
      claudeSidecar({ frontmatter: ['name: effective-flow-alpha', 'model: opus', 'model: opus'] }),
      /duplicate key "model"$/,
    ],
    [
      'an unterminated quoted value',
      claudeSidecar({ frontmatter: ['name: effective-flow-alpha', 'description: "Alpha'] }),
      /unterminated quoted value for "description"$/,
    ],
    [
      'a lone opening quote',
      claudeSidecar({ frontmatter: ['name: effective-flow-alpha', 'description: "'] }),
      /unterminated quoted value for "description"$/,
    ],
    // An empty frontmatter block never reaches the parser's "empty frontmatter" branch: the one
    // blank line it contains is rejected as unrecognized, and adjacent delimiters do not match
    // the frontmatter pattern at all.
    ['a blank frontmatter block', '---\n\n---\nbody\n', /unrecognized frontmatter line ""$/],
    ['adjacent delimiters', '---\n---\nbody\n', /missing or unterminated frontmatter$/],
  ];
  for (const [name, content, message] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => parseClaude(content),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /^Unparseable native sidecar effective-flow-alpha\.md: /);
          assert.match(error.message, message);
          return true;
        },
      );
    });
  }
});

test('Codex parsing fails closed on TOML it does not recognize', async (t) => {
  const cases = [
    [
      'a table header',
      codexSidecar({ settings: ['name = "a"', '[mcp_servers.alpha]'] }),
      /unrecognized line "\[mcp_servers\.alpha\]"$/,
    ],
    [
      'an array value',
      codexSidecar({ settings: ['name = "a"', 'tools = ["Read", "Grep"]'] }),
      /unrecognized value for "tools"$/,
    ],
    [
      'an inline table',
      codexSidecar({ settings: ['name = "a"', 'limits = { turns = 1 }'] }),
      /unrecognized value for "limits"$/,
    ],
    [
      'an unquoted value',
      codexSidecar({ settings: ['name = "a"', 'model = gpt-5.6-luna'] }),
      /unrecognized value for "model"$/,
    ],
    [
      'a key without spaces around the equals sign',
      codexSidecar({ settings: ['name="a"'] }),
      /unrecognized line "name=\\"a\\""$/,
    ],
    [
      'an unterminated multiline string',
      "name = \"a\"\ndeveloper_instructions = '''\nbody\n",
      /unterminated multiline string for "developer_instructions"$/,
    ],
    [
      'text after the closing multiline delimiter',
      "name = \"a\"\ndeveloper_instructions = '''\nbody\n''' trailing\n",
      /unexpected text after multiline string for "developer_instructions"$/,
    ],
    [
      'an invalid basic string',
      codexSidecar({ settings: ['name = "effective-flow-alpha'] }),
      /invalid basic string for "name"$/,
    ],
    [
      'a duplicate key',
      codexSidecar({ settings: ['name = "a"', 'model = "x"', "model = 'x'"] }),
      /duplicate key "model"$/,
    ],
    [
      'a duplicate prompt body',
      `${codexSidecar()}developer_instructions = '''\nsecond\n'''\n`,
      /duplicate key "developer_instructions"$/,
    ],
    [
      'a missing prompt body',
      'name = "a"\nmodel = "gpt-5.6-luna"\n',
      /missing "developer_instructions"$/,
    ],
  ];
  for (const [name, content, message] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => parseCodex(content),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /^Unparseable native sidecar effective-flow-alpha\.toml: /);
          assert.match(error.message, message);
          return true;
        },
      );
    });
  }
});

test('a parse error during comparison names the offending side by its full path', () => {
  const broken = '# no frontmatter\n';
  assert.throws(
    () => compare('claude', broken, claudeSidecar()),
    /^Error: Unparseable native sidecar \/baseline\/dist\/claude\/agents\/effective-flow-alpha\.md: missing or unterminated frontmatter$/,
  );
  assert.throws(
    () => compare('claude', claudeSidecar(), broken),
    /^Error: Unparseable native sidecar \/working\/dist\/claude\/agents\/effective-flow-alpha\.md: missing or unterminated frontmatter$/,
  );
  assert.throws(
    () => compare('codex', codexSidecar(), 'name = "a"\n', CODEX_FILE),
    /^Error: Unparseable native sidecar \/working\/dist\/codex\/agents\/effective-flow-alpha\.toml: missing "developer_instructions"$/,
  );
});

test('an unknown harness is rejected with a clear error', () => {
  for (const harness of ['portable', 'toString', '__proto__']) {
    assert.throws(
      () => compare(harness, claudeSidecar(), claudeSidecar()),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(!(error instanceof TypeError));
        assert.equal(error.message, `Unsupported native sidecar harness "${harness}"`);
        return true;
      },
    );
  }
});

test('current behavior: Codex scalars compare as strings, so 1 and "1" are equal', () => {
  // Pinned current behavior, not a requirement: numbers and booleans are kept as their raw text
  // and basic strings are unescaped, so a number and the same digits as a string compare equal.
  const number = codexSidecar({ settings: ['name = "a"', 'max_turns = 1'] });
  const string = codexSidecar({ settings: ['name = "a"', 'max_turns = "1"'] });
  assert.equal(parseCodex(number).max_turns, parseCodex(string).max_turns);
  assert.doesNotThrow(() => compare('codex', number, string, CODEX_FILE));
});

test('baseline worker membership accepts the same set in any order', () => {
  assert.doesNotThrow(() =>
    assertBaselineWorkerMembership(
      'claude',
      ['effective-flow-beta.md', 'effective-flow-alpha.md'],
      ['effective-flow-alpha', 'effective-flow-beta'],
      'md',
    ),
  );
  assert.doesNotThrow(() => assertBaselineWorkerMembership('codex', [], [], 'toml'));
});

test('baseline worker membership rejects an extra, missing, or wrongly named sidecar', async (t) => {
  const workers = ['effective-flow-alpha', 'effective-flow-beta'];
  const cases = [
    [
      'an extra baseline file',
      'claude',
      ['effective-flow-alpha.md', 'effective-flow-beta.md', 'effective-flow-gamma.md'],
      'md',
    ],
    ['a missing baseline file', 'claude', ['effective-flow-alpha.md'], 'md'],
    ['a wrong extension', 'codex', ['effective-flow-alpha.toml', 'effective-flow-beta.md'], 'toml'],
    [
      'a Fast sidecar in the baseline',
      'claude',
      ['effective-flow-alpha.md', 'effective-flow-alpha-fast.md', 'effective-flow-beta.md'],
      'md',
    ],
  ];
  for (const [name, harness, files, extension] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => assertBaselineWorkerMembership(harness, files, workers, extension),
        (error) => {
          assert.equal(
            error.message,
            `${harness} baseline worker membership differs from the working inventory`,
          );
          return true;
        },
      );
    });
  }
});

test('baseline worker membership does not mutate its inputs', () => {
  const files = Object.freeze(['effective-flow-beta.toml', 'effective-flow-alpha.toml']);
  const workers = Object.freeze(['effective-flow-beta', 'effective-flow-alpha']);
  assert.doesNotThrow(() => assertBaselineWorkerMembership('codex', files, workers, 'toml'));
  const mutableFiles = ['effective-flow-beta.toml', 'effective-flow-alpha.toml'];
  const mutableWorkers = ['effective-flow-beta', 'effective-flow-alpha'];
  assertBaselineWorkerMembership('codex', mutableFiles, mutableWorkers, 'toml');
  assert.deepEqual(mutableFiles, ['effective-flow-beta.toml', 'effective-flow-alpha.toml']);
  assert.deepEqual(mutableWorkers, ['effective-flow-beta', 'effective-flow-alpha']);
});
