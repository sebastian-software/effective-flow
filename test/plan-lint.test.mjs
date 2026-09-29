import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import nodeFs, {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  PLAN_CONTRACT_MAPPING,
  PLAN_PLACEHOLDERS,
  classifyPlanText,
  executeOperation,
  exitCodeFor,
  lintPlans,
} from '../src/scripts/plan-lint-core.mjs';
import { main } from '../src/scripts/plan-lint.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/plan-lint.mjs', import.meta.url));

const ENGLISH_PLAN = `# Add the widget

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (\`effective-flow build\`)

## Requirement

Ship the widget.

## Acceptance criteria

- [ ] The widget renders.

## Assumptions and open points

- The widget stays small.

## Plan review

**Result:** Approved

### Summary

### Findings

- No findings.

## Open points

- No open points.
`;

const GERMAN_PLAN = `# 0042: Widget ergänzen

**Planungsstatus:** Umgesetzt
**Quelle:** effective-flow plan
**Empfohlener Workflow:** Documentation (\`effective-flow docs\`)
**Doku-Kategorie:** user-guide
**Ziel-Pfad:** docs/user-guide/widget.md

## Anforderung

Das Widget ausliefern.

## Akzeptanzkriterien

- [x] Das Widget wird angezeigt.

## Annahmen und offene Punkte

- Keine.

## Plan-Review

**Ergebnis:** Freigegeben

## Offene Punkte

- Keine offenen Punkte.
`;

function withTempDir(run) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'plan-lint-test-')));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function withTempDirAsync(run) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'plan-lint-test-')));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function write(root, relative, content) {
  const target = join(root, relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function runCli(args, input) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    input,
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `expected exactly one stdout line, got: ${result.stdout}`);
  return { status: result.status, envelope: JSON.parse(lines[0]), stdout: result.stdout };
}

// --- Owned constants ---------------------------------------------------------------------------

test('the owned mapping and placeholder constants are deeply frozen', () => {
  assert.ok(Object.isFrozen(PLAN_CONTRACT_MAPPING));
  assert.ok(
    PLAN_CONTRACT_MAPPING.every(
      (row) => Object.isFrozen(row) && Object.isFrozen(row.de) && Object.isFrozen(row.en),
    ),
  );
  assert.ok(Object.isFrozen(PLAN_PLACEHOLDERS));
  assert.ok(PLAN_PLACEHOLDERS.every((row) => Object.isFrozen(row)));
  const reviewResult = PLAN_CONTRACT_MAPPING.find((row) => row.meaning === 'Review result');
  assert.deepEqual(reviewResult.de, ['**Ergebnis:** Freigegeben', 'Überarbeitung nötig']);
  assert.deepEqual(reviewResult.en, ['**Result:** Approved', 'Revision required']);
});

// --- Status ------------------------------------------------------------------------------------

test('status classifies the canonical values of both languages', () => {
  assert.deepEqual(
    {
      status: classifyPlanText(ENGLISH_PLAN).status,
      reason: classifyPlanText(ENGLISH_PLAN).statusReason,
    },
    { status: 'open', reason: null },
  );
  assert.equal(classifyPlanText(GERMAN_PLAN).status, 'implemented');
  assert.equal(classifyPlanText('**Planungsstatus:** Nicht umgesetzt\n').status, 'open');
  assert.equal(classifyPlanText('**Plan status:** Implemented  \n').status, 'implemented');
});

test('a plan without a status line is unclear/missing', () => {
  const result = classifyPlanText('# Title\n\n## Requirement\n\nText.\n');
  assert.equal(result.status, 'unclear');
  assert.equal(result.statusReason, 'missing');
});

test('a status line duplicated in the same language is unclear/duplicate', () => {
  const result = classifyPlanText(
    '**Plan status:** Not implemented\n\n**Plan status:** Implemented\n',
  );
  assert.equal(result.status, 'unclear');
  assert.equal(result.statusReason, 'duplicate');
});

test('status lines in both languages are unclear/duplicate and mixed', () => {
  const result = classifyPlanText('**Planungsstatus:** Umgesetzt\n**Plan status:** Implemented\n');
  assert.equal(result.status, 'unclear');
  assert.equal(result.statusReason, 'duplicate');
  assert.equal(result.language, 'mixed');
});

test('a key of one language with a value of the other is unclear/mixed-key-value', () => {
  assert.equal(classifyPlanText('**Plan status:** Umgesetzt\n').statusReason, 'mixed-key-value');
  assert.equal(
    classifyPlanText('**Planungsstatus:** Not implemented\n').statusReason,
    'mixed-key-value',
  );
});

test('a non-canonical value is unclear/invalid-value', () => {
  const result = classifyPlanText('**Plan status:** Open\n');
  assert.equal(result.status, 'unclear');
  assert.equal(result.statusReason, 'invalid-value');
});

test('review-finding prose and a fenced status line never count as the plan status', () => {
  const text = `# Plan

**Plan status:** Implemented

## Review findings

- Status: Not implemented — the reviewer noted the prior Plan status: Not implemented.
  **Plan status:** Not implemented

\`\`\`markdown
**Plan status:** Not implemented
\`\`\`

~~~
**Planungsstatus:** Nicht umgesetzt
~~~
`;
  const result = classifyPlanText(text);
  assert.equal(result.status, 'implemented');
  assert.equal(result.statusReason, null);
});

test('a status line in a blockquote or indented code never counts as the plan status', () => {
  const quotedOnly = classifyPlanText(
    '# Plan\n\n> **Plan status:** Not implemented\n\n    **Plan status:** Implemented\n',
  );
  assert.equal(quotedOnly.status, 'unclear');
  assert.equal(quotedOnly.statusReason, 'missing');
  const withCanonical = classifyPlanText(
    '**Plan status:** Implemented\n\n> **Plan status:** Not implemented\n\n    **Planungsstatus:** Nicht umgesetzt\n',
  );
  assert.equal(withCanonical.status, 'implemented');
  assert.equal(withCanonical.statusReason, null);
  assert.equal(withCanonical.language, 'en');
});

// --- Language ----------------------------------------------------------------------------------

test('language detects German, English, mixed, and unknown plans', () => {
  assert.equal(classifyPlanText(GERMAN_PLAN).language, 'de');
  assert.equal(classifyPlanText(ENGLISH_PLAN).language, 'en');
  assert.equal(classifyPlanText(`${GERMAN_PLAN}\n### Findings\n`).language, 'mixed');
  const unknown = classifyPlanText('# Notes\n\nSome prose.\n\n## Background\n');
  assert.equal(unknown.language, 'unknown');
  assert.equal(unknown.status, 'unclear');
  assert.equal(unknown.statusReason, 'missing');
});

test('labels inside fenced code do not decide the language', () => {
  const text = `${GERMAN_PLAN}\n\`\`\`\n## Requirement\n**Plan status:** Implemented\n\`\`\`\n`;
  assert.equal(classifyPlanText(text).language, 'de');
});

test('a review-result label of one language with a value of the other is mixed', () => {
  assert.equal(classifyPlanText('**Result:** Freigegeben\n').language, 'mixed');
  assert.equal(classifyPlanText('**Result:** Überarbeitung nötig\n').language, 'mixed');
  assert.equal(classifyPlanText('**Ergebnis:** Approved\n').language, 'mixed');
  assert.equal(classifyPlanText('**Ergebnis:** Revision required\n').language, 'mixed');
  const crossedEnglish = ENGLISH_PLAN.replace('**Result:** Approved', '**Result:** Freigegeben');
  assert.notEqual(crossedEnglish, ENGLISH_PLAN);
  assert.equal(classifyPlanText(crossedEnglish).language, 'mixed');
  const crossedGerman = GERMAN_PLAN.replace('**Ergebnis:** Freigegeben', '**Ergebnis:** Approved');
  assert.notEqual(crossedGerman, GERMAN_PLAN);
  assert.equal(classifyPlanText(crossedGerman).language, 'mixed');
});

test('a canonical review-result pair keeps its own language', () => {
  assert.equal(classifyPlanText('**Ergebnis:** Freigegeben\n').language, 'de');
  assert.equal(classifyPlanText('**Ergebnis:** Überarbeitung nötig\n').language, 'de');
  assert.equal(classifyPlanText('**Result:** Approved\n').language, 'en');
  assert.equal(classifyPlanText('**Result:** Revision required\n').language, 'en');
  const revisedGerman = GERMAN_PLAN.replace(
    '**Ergebnis:** Freigegeben',
    '**Ergebnis:** Überarbeitung nötig',
  );
  assert.notEqual(revisedGerman, GERMAN_PLAN);
  assert.equal(classifyPlanText(revisedGerman).language, 'de');
  const revisedEnglish = ENGLISH_PLAN.replace(
    '**Result:** Approved',
    '**Result:** Revision required',
  );
  assert.notEqual(revisedEnglish, ENGLISH_PLAN);
  assert.equal(classifyPlanText(revisedEnglish).language, 'en');
});

test('a status label of one language with a value of the other is mixed', () => {
  const crossedEnglish = classifyPlanText('**Plan status:** Umgesetzt\n');
  assert.equal(crossedEnglish.language, 'mixed');
  assert.equal(crossedEnglish.statusReason, 'mixed-key-value');
  const crossedGerman = classifyPlanText('**Planungsstatus:** Not implemented\n');
  assert.equal(crossedGerman.language, 'mixed');
  assert.equal(crossedGerman.statusReason, 'mixed-key-value');
  assert.equal(classifyPlanText('**Planungsstatus:** Nicht umgesetzt\n').language, 'de');
  assert.equal(classifyPlanText('**Plan status:** Implemented\n').language, 'en');
});

test('the legacy open-points heading counts as an English label', () => {
  assert.equal(classifyPlanText('## Open Points\n\n- No open points.\n').language, 'en');
});

// --- Open points -------------------------------------------------------------------------------

test('open points count the canonical empty state as zero in both languages', () => {
  assert.equal(classifyPlanText(ENGLISH_PLAN).openPoints, 0);
  assert.equal(classifyPlanText(GERMAN_PLAN).openPoints, 0);
});

test('open points count one and three filled entries', () => {
  assert.equal(classifyPlanText('## Open points\n\n- Decide the color.\n').openPoints, 1);
  assert.equal(
    classifyPlanText(
      '## Offene Punkte\n\n- Farbe festlegen.\n- Größe festlegen.\n\nEin Absatz ohne Liste.\n\n## Testergebnisse\n\n- ok\n',
    ).openPoints,
    3,
  );
});

test('the legacy open-points spelling is recognized', () => {
  assert.equal(classifyPlanText('## Open Points\n\n- Decide later.\n').openPoints, 1);
  assert.equal(classifyPlanText('## Open Points\n\n- No open points.\n').openPoints, 0);
});

test('a plan without an open-points section yields null', () => {
  assert.equal(classifyPlanText('# Plan\n\n**Plan status:** Implemented\n').openPoints, null);
});

test('the assumptions section is not mistaken for the open-points section', () => {
  const text =
    '## Assumptions and open points\n\n- One.\n- Two.\n\n## Annahmen und offene Punkte\n\n- Drei.\n';
  assert.equal(classifyPlanText(text).openPoints, null);
});

test('several open-points sections are summed and fenced lines fail closed', () => {
  const text =
    '## Open points\n\n- One.\n\n## Other\n\n## Open points\n\n```\n- Decide later.\n```\n';
  // One entry, plus three non-blank lines of a fence (delimiters included) in the second section.
  assert.equal(classifyPlanText(text).openPoints, 4);
});

test('a fenced canonical empty item counts zero and a level-3 heading stays in the section', () => {
  // The two fence delimiters count; the canonical empty item between them does not.
  assert.equal(classifyPlanText('## Open points\n\n```\n- No open points.\n```\n').openPoints, 2);
  assert.equal(
    classifyPlanText('## Offene Punkte\n\n~~~\n- Keine offenen Punkte.\n~~~\n').openPoints,
    2,
  );
  // A level-3 heading neither ends the section nor is skipped; the level-2 heading ends it.
  assert.equal(
    classifyPlanText('## Open points\n\n### Detail\n\n- One.\n\n## Next\n\n- Two.\n').openPoints,
    2,
  );
});

// --- Acceptance criteria -----------------------------------------------------------------------

test('acceptance criteria are missing, empty, placeholder-only, or present', () => {
  assert.equal(classifyPlanText('# Plan\n\n## Requirement\n').acceptanceCriteria, 'missing');
  assert.equal(
    classifyPlanText('## Acceptance criteria\n\n## Validation plan\n\n- Run it.\n')
      .acceptanceCriteria,
    'empty',
  );
  assert.equal(
    classifyPlanText('## Acceptance criteria\n\n- [ ]\n### Sub\n').acceptanceCriteria,
    'empty',
  );
  const placeholderOnly = classifyPlanText(
    '## Acceptance criteria\n\n- [ ] [measurable criterion]\n\n## Akzeptanzkriterien\n\n- [ ] [messbares Kriterium]\n',
  );
  assert.equal(placeholderOnly.acceptanceCriteria, 'empty');
  assert.deepEqual(placeholderOnly.placeholders, [
    { token: '[measurable criterion]', line: 3 },
    { token: '[messbares Kriterium]', line: 7 },
  ]);
  assert.equal(classifyPlanText(ENGLISH_PLAN).acceptanceCriteria, 'present');
  assert.equal(classifyPlanText(GERMAN_PLAN).acceptanceCriteria, 'present');
  assert.equal(
    classifyPlanText('## Acceptance criteria\n\n1. `pnpm test` exits 0.\n').acceptanceCriteria,
    'present',
  );
});

test('fenced content alone does not make acceptance criteria present', () => {
  assert.equal(
    classifyPlanText('## Acceptance criteria\n\n```\npnpm test\n```\n').acceptanceCriteria,
    'empty',
  );
});

// --- Placeholders ------------------------------------------------------------------------------

test('English and German template placeholders are reported with their line', () => {
  const english = classifyPlanText(
    '# [Title]\n\n## Requirement\n\n[Requirement, goal, and rationale for the workflow recommendation]\n\n## Plan review\n\n**Result:** Approved / Revision required\n',
  );
  assert.deepEqual(english.placeholders, [
    { token: '[Title]', line: 1 },
    { token: '[Requirement, goal, and rationale for the workflow recommendation]', line: 5 },
    { token: 'Approved / Revision required', line: 9 },
  ]);
  const german = classifyPlanText(
    '# [Titel]\n\n- [Nur falls relevant] und [Nur falls relevant]\n\n**Ergebnis:** Freigegeben / Überarbeitung nötig\n',
  );
  assert.deepEqual(german.placeholders, [
    { token: '[Titel]', line: 1 },
    { token: '[Nur falls relevant]', line: 3 },
    { token: '[Nur falls relevant]', line: 3 },
    { token: 'Freigegeben / Überarbeitung nötig', line: 5 },
  ]);
});

test('checkboxes, finding IDs, fenced tokens, and a decided review result are not flagged', () => {
  const text = `# Real title

## Acceptance criteria

- [ ] Real criterion.
- [x] Done criterion.

## Review findings

- [R-0000001] Fixed the widget.
- The result was Approved / Revision required in an earlier draft.

**Result:** Approved

\`\`\`markdown
# [Title]
- [ ] [measurable criterion]
\`\`\`
`;
  assert.deepEqual(classifyPlanText(text).placeholders, []);
});

test('the review-result alternatives count only as the complete result value', () => {
  assert.deepEqual(
    classifyPlanText('**Result:** Approved / Revision required (pending)\n').placeholders,
    [],
  );
  assert.deepEqual(classifyPlanText('Result: Approved / Revision required\n').placeholders, []);
  assert.deepEqual(
    classifyPlanText('**Ergebnis:** Freigegeben / Überarbeitung nötig  \n').placeholders,
    [{ token: 'Freigegeben / Überarbeitung nötig', line: 1 }],
  );
});

// --- Header fields -----------------------------------------------------------------------------

test('header fields are extracted in both languages', () => {
  const english = classifyPlanText(
    '# Document the widget\n\n**Plan status:** Not implemented\n**Recommended workflow:** Documentation (`effective-flow docs`)\n**Doc category:** developer-guide\n**Target path:** docs/developer-guide/widget.md\n',
  );
  assert.deepEqual(
    [english.title, english.workflow, english.docCategory, english.targetPath],
    [
      'Document the widget',
      'Documentation (`effective-flow docs`)',
      'developer-guide',
      'docs/developer-guide/widget.md',
    ],
  );
  const german = classifyPlanText(GERMAN_PLAN);
  assert.deepEqual(
    [german.title, german.workflow, german.docCategory, german.targetPath],
    [
      '0042: Widget ergänzen',
      'Documentation (`effective-flow docs`)',
      'user-guide',
      'docs/user-guide/widget.md',
    ],
  );
  const bare = classifyPlanText('Prose only.\n');
  assert.deepEqual(
    [bare.title, bare.workflow, bare.docCategory, bare.targetPath],
    [null, null, null, null],
  );
});

test('an empty header value is null and a fenced H1 is never the title', () => {
  const empty = classifyPlanText(
    '# \n\n**Plan status:** Not implemented\n**Recommended workflow:**\n**Doc category:**   \n**Ziel-Pfad:** \n',
  );
  assert.deepEqual(
    [empty.title, empty.workflow, empty.docCategory, empty.targetPath],
    [null, null, null, null],
  );
  const fenced = classifyPlanText('```markdown\n# [Title]\n```\n\n# Real title\n');
  assert.equal(fenced.title, 'Real title');
  assert.deepEqual(fenced.placeholders, []);
});

// --- Encoding ----------------------------------------------------------------------------------

test('a CRLF and BOM file classifies exactly as its LF twin', () => {
  for (const plan of [ENGLISH_PLAN, GERMAN_PLAN]) {
    const crlf = `\uFEFF${plan.replace(/\n/g, '\r\n')}`;
    assert.deepEqual(classifyPlanText(crlf), classifyPlanText(plan));
  }
});

// --- Directory linting and duplicates -----------------------------------------------------------

test('lintPlans lints top-level plans in name order and reports archive duplicates', () => {
  withTempDir((root) => {
    write(root, 'docs/plan/b-plan.md', ENGLISH_PLAN);
    write(root, 'docs/plan/a-plan.md', GERMAN_PLAN);
    write(root, 'docs/plan/README.txt', 'not a plan');
    write(root, 'docs/plan/archive/a-plan.md', GERMAN_PLAN);
    write(root, 'docs/plan/archive/c-plan.md', GERMAN_PLAN);
    const { files } = lintPlans({ cwd: root, planDir: 'docs/plan' });
    assert.deepEqual(
      files.map((file) => [file.path, file.duplicates]),
      [
        ['docs/plan/a-plan.md', ['docs/plan/archive/a-plan.md']],
        ['docs/plan/b-plan.md', []],
      ],
    );
    assert.deepEqual(Object.keys(files[0]), [
      'path',
      'status',
      'statusReason',
      'language',
      'openPoints',
      'acceptanceCriteria',
      'placeholders',
      'duplicates',
      'title',
      'workflow',
      'docCategory',
      'targetPath',
    ]);
    const archived = lintPlans({
      cwd: root,
      planDir: 'docs/plan',
      files: ['docs/plan/archive/c-plan.md', 'docs/plan/archive/a-plan.md'],
    });
    assert.deepEqual(
      archived.files.map((file) => [file.path, file.duplicates]),
      [
        ['docs/plan/archive/c-plan.md', []],
        ['docs/plan/archive/a-plan.md', ['docs/plan/a-plan.md']],
      ],
    );
  });
});

test('no archive directory yields no duplicates and a missing planDir yields no files', () => {
  withTempDir((root) => {
    assert.deepEqual(lintPlans({ cwd: root, planDir: 'docs/plan' }), { files: [] });
    write(root, 'docs/plan/a-plan.md', ENGLISH_PLAN);
    const { files } = lintPlans({ cwd: root, planDir: 'docs/plan' });
    assert.deepEqual(files[0].duplicates, []);
  });
});

test('directory mode lints a legacy-numbered plan and a non-plan README like any file', () => {
  withTempDir((root) => {
    write(root, 'docs/plan/0042-widget.md', GERMAN_PLAN);
    write(root, 'docs/plan/README.md', '# Plans\n\nThis directory holds the plans.\n');
    const { files } = lintPlans({ cwd: root, planDir: 'docs/plan' });
    assert.deepEqual(
      files.map((file) => file.path),
      ['docs/plan/0042-widget.md', 'docs/plan/README.md'],
    );
    assert.equal(files[0].status, 'implemented');
    assert.equal(files[0].title, '0042: Widget ergänzen');
    assert.deepEqual(files[1], {
      path: 'docs/plan/README.md',
      status: 'unclear',
      statusReason: 'missing',
      language: 'unknown',
      openPoints: null,
      acceptanceCriteria: 'missing',
      placeholders: [],
      duplicates: [],
      title: 'Plans',
      workflow: null,
      docCategory: null,
      targetPath: null,
    });
  });
});

test('a files entry that does not exist fails with NOT_FOUND and exit 1', () => {
  withTempDir((root) => {
    mkdirSync(join(root, 'docs/plan'), { recursive: true });
    const envelope = executeOperation('lint', {
      cwd: root,
      planDir: 'docs/plan',
      files: ['docs/plan/missing.md'],
    });
    assert.equal(envelope.error.code, 'NOT_FOUND');
    assert.equal(exitCodeFor(envelope), 1);
  });
});

// --- CLI ---------------------------------------------------------------------------------------

test('the CLI writes one success envelope for a valid input', () => {
  withTempDir((root) => {
    write(root, 'docs/plan/a-plan.md', ENGLISH_PLAN);
    const { status, envelope, stdout } = runCli(
      ['lint'],
      JSON.stringify({ cwd: root, planDir: 'docs/plan' }),
    );
    assert.equal(status, 0);
    assert.ok(stdout.endsWith('}\n'));
    assert.deepEqual(Object.keys(envelope), ['ok', 'operation', 'data']);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.operation, 'lint');
    assert.equal(envelope.data.files.length, 1);
    assert.equal(envelope.data.files[0].status, 'open');
  });
});

test('the CLI refuses invalid payloads with INVALID_PAYLOAD and exit 2', () => {
  withTempDir((root) => {
    const cases = [
      [['lint'], 'not json'],
      [['lint'], '[]'],
      [['lint'], '"text"'],
      [['bogus'], JSON.stringify({ cwd: root, planDir: 'docs/plan' })],
      [['lint'], JSON.stringify({ cwd: root })],
      [['lint'], JSON.stringify({ cwd: root, planDir: 'docs/plan', extra: true })],
    ];
    for (const [args, input] of cases) {
      const { status, envelope } = runCli(args, input);
      assert.equal(status, 2, `${args} ${input}`);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.error.code, 'INVALID_PAYLOAD', `${args} ${input}`);
      assert.equal(typeof envelope.error.message, 'string');
    }
  });
});

test('the CLI answers an unknown or absent operation with a null operation and exit 2', () => {
  withTempDir((root) => {
    for (const args of [['bogus'], []]) {
      const { status, envelope } = runCli(
        args,
        JSON.stringify({ cwd: root, planDir: 'docs/plan' }),
      );
      assert.equal(status, 2, `${args}`);
      assert.deepEqual(Object.keys(envelope), ['ok', 'operation', 'error']);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.operation, null, `${args}`);
      assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
    }
  });
});

test('the CLI refuses a relative or nonexistent cwd with INVALID_CWD and exit 2', () => {
  withTempDir((root) => {
    for (const cwd of ['relative/dir', join(root, 'does-not-exist')]) {
      const { status, envelope } = runCli(['lint'], JSON.stringify({ cwd, planDir: 'docs/plan' }));
      assert.equal(status, 2);
      assert.equal(envelope.operation, 'lint');
      assert.equal(envelope.error.code, 'INVALID_CWD');
    }
  });
});

test('the CLI refuses unsafe files entries with UNSAFE_PATH and exit 3', () => {
  withTempDir((root) => {
    const repo = join(root, 'repo');
    write(repo, 'docs/plan/a-plan.md', ENGLISH_PLAN);
    write(repo, 'docs/other/b-plan.md', ENGLISH_PLAN);
    write(repo, 'docs/plan/nested/c-plan.md', ENGLISH_PLAN);
    write(root, 'outside/escape.md', ENGLISH_PLAN);
    symlinkSync(join(root, 'outside/escape.md'), join(repo, 'docs/plan/escape.md'));
    const cases = [
      'docs/other/b-plan.md',
      'docs/plan/nested/c-plan.md',
      'docs/plan/../plan/a-plan.md',
      '../outside/escape.md',
      'docs/plan/escape.md',
      join(repo, 'docs/plan/a-plan.md'),
    ];
    for (const entry of cases) {
      const { status, envelope } = runCli(
        ['lint'],
        JSON.stringify({ cwd: repo, planDir: 'docs/plan', files: [entry] }),
      );
      assert.equal(status, 3, entry);
      assert.equal(envelope.error.code, 'UNSAFE_PATH', entry);
    }
  });
});

test('the CLI refuses a planDir that escapes cwd with UNSAFE_PATH', () => {
  withTempDir((root) => {
    const repo = join(root, 'repo');
    write(root, 'outside/plans/a-plan.md', ENGLISH_PLAN);
    mkdirSync(join(repo, 'docs'), { recursive: true });
    symlinkSync(join(root, 'outside/plans'), join(repo, 'docs/plan'));
    for (const planDir of ['docs/plan', '../outside/plans', join(root, 'outside/plans')]) {
      const { status, envelope } = runCli(['lint'], JSON.stringify({ cwd: repo, planDir }));
      assert.equal(status, 3, planDir);
      assert.equal(envelope.error.code, 'UNSAFE_PATH', planDir);
    }
  });
});

test('a top-level symlink is not linted in directory mode', () => {
  withTempDir((root) => {
    const repo = join(root, 'repo');
    write(repo, 'docs/plan/a-plan.md', ENGLISH_PLAN);
    write(root, 'outside/escape.md', ENGLISH_PLAN);
    symlinkSync(join(root, 'outside/escape.md'), join(repo, 'docs/plan/escape.md'));
    const { files } = lintPlans({ cwd: repo, planDir: 'docs/plan' });
    assert.deepEqual(
      files.map((file) => file.path),
      ['docs/plan/a-plan.md'],
    );
  });
});

// --- Review incorporation: parsing -------------------------------------------------------------

test('an unclosed fence opener is content and does not hide later sections', () => {
  const text = `# Plan

**Plan status:** Not implemented

## Validation plan

\`\`\`sh
pnpm test

## Open points

- Decide the DB.
`;
  const result = classifyPlanText(text);
  assert.equal(result.openPoints, 1);
  assert.equal(result.status, 'open');
  // After an unclosed opener, a later closed fence still hides its content.
  assert.equal(
    classifyPlanText(
      '```sh\nunclosed\n\n~~~\n**Plan status:** Implemented\n~~~\n**Plan status:** Not implemented\n',
    ).status,
    'open',
  );
});

test('headings indented up to three spaces start and end sections and give the title', () => {
  assert.equal(
    classifyPlanText('## Acceptance criteria\n\n ## Next\n\n- Not a criterion.\n')
      .acceptanceCriteria,
    'empty',
  );
  assert.equal(classifyPlanText('# Plan\n\n ## Open points\n\n- Decide.\n').openPoints, 1);
  assert.equal(classifyPlanText('   ## Offene Punkte\n\n- Keine offenen Punkte.\n').openPoints, 0);
  assert.equal(classifyPlanText('  # Indented title\n').title, 'Indented title');
  // Four spaces make indented code, which is no heading.
  assert.equal(classifyPlanText('    ## Open points\n\n- Decide.\n').openPoints, null);
  // Status lines keep the column-0 rule.
  assert.equal(classifyPlanText(' **Plan status:** Implemented\n').statusReason, 'missing');
});

test('the status label takes exactly one space before its value', () => {
  for (const line of ['**Plan status:**Implemented', '**Plan status:**  Implemented']) {
    const result = classifyPlanText(`${line}\n`);
    assert.deepEqual([result.status, result.statusReason], ['unclear', 'invalid-value'], line);
  }
  assert.equal(classifyPlanText('**Planungsstatus:**\tUmgesetzt\n').statusReason, 'invalid-value');
  assert.equal(classifyPlanText('**Plan status:**\n').statusReason, 'invalid-value');
  assert.equal(classifyPlanText('**Plan status:** Implemented \t\n').status, 'implemented');
});

test('placeholder tokens inside inline code spans are quoted, not leftovers', () => {
  const quoted = classifyPlanText('Replace the `[Title]` token and ``[planned change]`` too.\n');
  assert.deepEqual(quoted.placeholders, []);
  // Only the unquoted occurrence is flagged; an unmatched backtick opens no span.
  assert.deepEqual(classifyPlanText('`[Title]` and [Title] and ` [Title]\n').placeholders, [
    { token: '[Title]', line: 1 },
    { token: '[Title]', line: 1 },
  ]);
  const quotedCriterion = classifyPlanText(
    '## Acceptance criteria\n\n- [ ] `[measurable criterion]`\n',
  );
  assert.equal(quotedCriterion.acceptanceCriteria, 'present');
  assert.deepEqual(quotedCriterion.placeholders, []);
});

test('the legacy title-case acceptance-criteria heading is recognized as English', () => {
  const result = classifyPlanText('## Acceptance Criteria\n\n- [ ] It works.\n');
  assert.equal(result.acceptanceCriteria, 'present');
  assert.equal(result.language, 'en');
  assert.equal(
    classifyPlanText('## Acceptance Criteria\n\n- [ ] [measurable criterion]\n').acceptanceCriteria,
    'empty',
  );
});

// --- Review incorporation: paths and reads -----------------------------------------------------

test('a NUL byte in cwd, planDir, or a files entry is INVALID_PAYLOAD without echoing it', () => {
  withTempDir((root) => {
    const cases = [
      { cwd: `${root}/x\0y`, planDir: 'docs/plan' },
      { cwd: root, planDir: 'docs/\0plan' },
      { cwd: root, planDir: 'docs/plan', files: ['docs/plan/a.md', 'docs/plan/\0b.md'] },
    ];
    for (const input of cases) {
      const envelope = executeOperation('lint', input);
      assert.equal(envelope.error.code, 'INVALID_PAYLOAD', JSON.stringify(input));
      assert.equal(exitCodeFor(envelope), 2);
      assert.ok(!envelope.error.message.includes('\0'));
    }
  });
});

test('planDir resolution separates an absent directory from a broken one', () => {
  withTempDir((root) => {
    write(root, 'README.md', '# Readme\n');
    // Truly absent: no plans.
    assert.deepEqual(lintPlans({ cwd: root, planDir: 'docs/plan' }), { files: [] });
    const cases = [
      ['README.md/plan', 'a non-directory ancestor'],
      ['README.md', 'a regular file'],
      ['docs/dangling', 'a dangling symlink'],
      ['gone/plan', 'a dangling symlink ancestor'],
    ];
    mkdirSync(join(root, 'docs'), { recursive: true });
    symlinkSync(join(root, 'missing-target'), join(root, 'docs/dangling'));
    symlinkSync(join(root, 'missing-target'), join(root, 'gone'));
    for (const [planDir, label] of cases) {
      const envelope = executeOperation('lint', { cwd: root, planDir });
      assert.equal(envelope.error?.code, 'NOT_FOUND', label);
      assert.equal(exitCodeFor(envelope), 1, label);
    }
  });
});

test('a planDir symlink that resolves inside cwd is allowed', () => {
  withTempDir((root) => {
    write(root, 'real/plans/a-plan.md', ENGLISH_PLAN);
    write(root, 'real/plans/archive/a-plan.md', ENGLISH_PLAN);
    mkdirSync(join(root, 'docs'), { recursive: true });
    symlinkSync(join(root, 'real/plans'), join(root, 'docs/plan'));
    const { files } = lintPlans({ cwd: root, planDir: 'docs/plan' });
    assert.deepEqual(
      files.map((file) => [file.path, file.status, file.duplicates]),
      [['docs/plan/a-plan.md', 'open', ['docs/plan/archive/a-plan.md']]],
    );
    const explicit = lintPlans({
      cwd: root,
      planDir: 'docs/plan',
      files: ['docs/plan/archive/a-plan.md'],
    });
    assert.deepEqual(explicit.files[0].duplicates, ['docs/plan/a-plan.md']);
  });
});

function recordingFs(overrides = {}) {
  const calls = { open: [], read: [], readdir: [], close: 0 };
  const fs = {
    ...nodeFs,
    openSync: (target, flags) => {
      calls.open.push(target);
      return nodeFs.openSync(target, flags);
    },
    readFileSync: (target, options) => {
      calls.read.push(target);
      return nodeFs.readFileSync(target, options);
    },
    readdirSync: (target, options) => {
      calls.readdir.push(target);
      return nodeFs.readdirSync(target, options);
    },
    closeSync: (descriptor) => {
      calls.close += 1;
      return nodeFs.closeSync(descriptor);
    },
    ...overrides,
  };
  return { fs, calls };
}

test('an archive symlink that escapes cwd yields no duplicate and no read outside', () => {
  withTempDir((root) => {
    const repo = join(root, 'repo');
    write(repo, 'docs/plan/a-plan.md', ENGLISH_PLAN);
    write(root, 'outside/archive/a-plan.md', ENGLISH_PLAN);
    symlinkSync(join(root, 'outside/archive'), join(repo, 'docs/plan/archive'));
    const { fs, calls } = recordingFs();
    const { files } = lintPlans({ cwd: repo, planDir: 'docs/plan' }, { fs });
    assert.deepEqual(files[0].duplicates, []);
    const outside = join(root, 'outside');
    for (const target of [...calls.open, ...calls.read, ...calls.readdir]) {
      assert.ok(typeof target !== 'string' || !target.startsWith(outside), String(target));
    }
    const envelope = executeOperation('lint', {
      cwd: repo,
      planDir: 'docs/plan',
      files: ['docs/plan/archive/a-plan.md'],
    });
    assert.equal(envelope.error.code, 'UNSAFE_PATH');
  });
});

test('each plan is read through one checked descriptor that is always closed', () => {
  withTempDir((root) => {
    write(root, 'docs/plan/a-plan.md', ENGLISH_PLAN);
    const { fs, calls } = recordingFs();
    const { files } = lintPlans({ cwd: root, planDir: 'docs/plan' }, { fs });
    assert.equal(files[0].status, 'open');
    assert.deepEqual(calls.open, [join(root, 'docs/plan/a-plan.md')]);
    assert.equal(calls.read.length, 1);
    assert.equal(typeof calls.read[0], 'number');
    assert.equal(calls.close, 1);

    const swaps = {
      'another inode': (stat) => ({ ...stat, isFile: () => true, ino: stat.ino + 1 }),
      'another device': (stat) => ({ ...stat, isFile: () => true, dev: stat.dev + 1 }),
      'a non-regular file': (stat) => ({ ...stat, isFile: () => false }),
    };
    for (const [label, swap] of Object.entries(swaps)) {
      for (const input of [
        { cwd: root, planDir: 'docs/plan' },
        { cwd: root, planDir: 'docs/plan', files: ['docs/plan/a-plan.md'] },
      ]) {
        const swapped = recordingFs({
          fstatSync: (descriptor) => swap(nodeFs.fstatSync(descriptor)),
        });
        const envelope = executeOperation('lint', input, { fs: swapped.fs });
        assert.equal(envelope.error?.code, 'UNSAFE_PATH', label);
        assert.equal(exitCodeFor(envelope), 3, label);
        assert.equal(swapped.calls.read.length, 0, label);
        assert.equal(swapped.calls.close, 1, label);
      }
    }

    const looped = recordingFs({
      openSync: () => {
        throw Object.assign(new Error('symlink at the last component'), { code: 'ELOOP' });
      },
    });
    const envelope = executeOperation('lint', { cwd: root, planDir: 'docs/plan' }, looped);
    assert.equal(envelope.error.code, 'UNSAFE_PATH');
  });
});

test('main() answers an unexpected failure with one INTERNAL envelope line and exit 1', async () => {
  await withTempDirAsync(async (root) => {
    mkdirSync(join(root, 'docs/plan'), { recursive: true });
    const stdout = [];
    const stderr = [];
    let exitCode;
    const envelope = await main(['lint'], {
      input: { cwd: root, planDir: 'docs/plan' },
      deps: {
        fs: {
          ...nodeFs,
          readdirSync: () => {
            throw new Error('disk on fire');
          },
        },
      },
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: (chunk) => stderr.push(chunk) },
      setExitCode: (code) => {
        exitCode = code;
      },
    });
    assert.equal(exitCode, 1);
    assert.equal(stdout.length, 1);
    assert.ok(stdout[0].endsWith('}\n'));
    assert.equal(stdout[0].split('\n').filter(Boolean).length, 1);
    assert.deepEqual(JSON.parse(stdout[0]), {
      ok: false,
      operation: 'lint',
      error: { code: 'INTERNAL', message: 'disk on fire' },
    });
    assert.deepEqual(envelope, JSON.parse(stdout[0]));
    assert.equal(stderr.join(''), 'INTERNAL: disk on fire\n');
  });
});

test('main() rejects an unknown operation without waiting on stdin', async () => {
  // Invariant: `plan-lint.mjs --help` from a terminal answers at once instead of blocking on an
  // open stdin, because the operation is validated before any input is read.
  const { PassThrough } = await import('node:stream');
  const neverEnding = new PassThrough();
  const stdout = [];
  let exitCode;
  const envelope = await main(['--help'], {
    stdin: neverEnding,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write: () => {} },
    setExitCode: (code) => {
      exitCode = code;
    },
  });
  neverEnding.destroy();
  assert.equal(exitCode, 2);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.equal(stdout.length, 1);
});
