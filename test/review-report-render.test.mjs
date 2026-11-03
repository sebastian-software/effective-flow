// Unit tests of the pure `review write-report` renderer. The report format is owned by
// `src/shared/review-report-format.md`; these tests read its label lists, displayed values and line
// texts from the fragment, so the renderer's table and the fragment cannot drift apart.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ACTIONS,
  COMPLEXITIES,
  FINDING_FIELD_ORDER,
  INVOCATION_PREFIXES,
  LABELS,
  REQUIRED_FINDING_KEYS,
  ReportInputError,
  SEVERITIES,
  codeSpan,
  normaliseReportInput,
  renderReport,
  renderSummary,
} from '../src/scripts/review-report-render.mjs';

const SHARED = join(import.meta.dirname, '..', 'src', 'shared');
const FORMAT = readFileSync(join(SHARED, 'review-report-format.md'), 'utf8');
const DISCLOSURE = readFileSync(join(SHARED, 'security-disclosure-gate.md'), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

// The English template: the first ```markdown fence of the fragment.
const TEMPLATE = /```markdown\n([\s\S]*?)```/.exec(FORMAT)[1];
// The German prose list: every backticked token before the template.
const GERMAN_TOKENS = [
  ...FORMAT.slice(0, FORMAT.indexOf('```markdown')).matchAll(/`([^`]+)`/g),
].map((match) => match[1]);

function finding(extra = {}) {
  return {
    title: 'Unchecked null in parser',
    severity: 'Critical',
    complexity: 'Low',
    area: 'Backend',
    file: 'src/parse.js:42',
    problem: 'The parser dereferences a missing node.',
    recommendation: 'Check the node before use.',
    action: 'fix',
    admissionReason: 'material-harm',
    evidence: 'test reproduction: parse("")',
    evidenceDigest: 'sha256:abc',
    currentReachability: 'any caller of parse() with empty input',
    rootCauseSignature: 'parse-null-deref',
    scopeAndContainment: 'outside the current scope; no guard contains it',
    whyNow: 'crashes the CLI today',
    completionCondition: 'parse("") returns an empty tree',
    security: 'none',
    ...extra,
  };
}

function report(extra = {}) {
  return normaliseReportInput({
    language: 'en',
    invocationPrefix: '/effective-flow',
    scope: 'Entire code',
    projectType: 'CLI',
    findings: [finding()],
    ...extra,
  });
}

function rendered(input, ids) {
  const value = report(input);
  return renderReport(value, {
    ids: ids ?? value.findings.map((_, index) => `R-${String(index + 1).padStart(7, '0')}`),
    date: '2026-11-01',
  });
}

function fieldLabels(markdown) {
  return [...markdown.matchAll(/^- \*\*([^*]+)\*\*:/gm)].map((match) => match[1]);
}

// Invariant: the English field labels and their order are exactly the fragment template's.
test('English labels and field order equal the fragment template', () => {
  const en = LABELS.en;
  assert.deepEqual(
    FINDING_FIELD_ORDER.map((field) => en.fields[field]),
    fieldLabels(TEMPLATE),
  );
  assert.match(TEMPLATE, new RegExp(`^# ${en.title}$`, 'm'));
  for (const key of ['date', 'scope', 'projectType']) {
    assert.match(TEMPLATE, new RegExp(`^\\*\\*${en[key]}:\\*\\* `, 'm'), key);
  }
  for (const heading of [en.summary, en.findings, en.skippedFindings]) {
    assert.ok(TEMPLATE.includes(`\n## ${heading}\n`), heading);
  }
  assert.match(FORMAT, new RegExp(`^## ${en.closedObservations}$`, 'm'));
  assert.ok(TEMPLATE.includes(`| ${en.skippedColumns.join(' | ')} |`));
  for (const table of ['severity', 'complexity', 'action']) {
    assert.ok(TEMPLATE.includes(`| ${en.fields[table]} | ${en.count} |`), table);
  }
  assert.ok(TEMPLATE.includes(`- **Severity**: ${Object.values(en.severities).join(' / ')}`));
  assert.ok(TEMPLATE.includes(`- **Complexity**: ${Object.values(en.complexities).join(' / ')}`));
  assert.ok(TEMPLATE.includes('- **Admission outcome**: admitted'));
  assert.ok(TEMPLATE.includes('- **Admission gate**: v1'));
  assert.ok(TEMPLATE.includes('- **Admission reason**: material-harm | irreversible-commitment'));
});

// Invariant: every German label and displayed value the renderer writes is listed in the
// fragment's German form, and the admission fields keep the template order there.
test('German labels and displayed values are the fragment list', () => {
  const de = LABELS.de;
  const fields = de.fields;
  // The fragment's German list, token by token, mapped to the renderer's keys; `Titel` is the
  // fragment's word for the finding title, which the renderer writes as the heading text, not as
  // a label.
  const listed = [
    `# ${de.title}`,
    de.date,
    de.scope,
    de.projectType,
    de.summary,
    fields.severity,
    de.count,
    fields.complexity,
    fields.action,
    de.findings,
    'Titel',
    fields.area,
    fields.file,
    fields.problem,
    fields.recommendation,
    fields.promptSuggestion,
    fields.developerNote,
    fields.security,
    de.skippedFindings,
    ...de.skippedColumns,
    ...FINDING_FIELD_ORDER.slice(
      FINDING_FIELD_ORDER.indexOf('admissionOutcome'),
      FINDING_FIELD_ORDER.indexOf('completionCondition') + 1,
    ).map((field) => fields[field]),
    de.closedObservations,
    ...SEVERITIES.map((value) => de.severities[value]),
    ...COMPLEXITIES.map((value) => de.complexities[value]),
  ];
  const start = GERMAN_TOKENS.indexOf(`# ${de.title}`);
  assert.ok(start >= 0, 'the German list starts with the title');
  assert.deepEqual(GERMAN_TOKENS.slice(start, start + listed.length), listed);
  const used = [
    `# ${de.title}`,
    de.date,
    de.scope,
    de.projectType,
    de.summary,
    de.count,
    de.findings,
    de.skippedFindings,
    de.closedObservations,
    ...Object.values(de.fields),
    ...Object.values(de.severities),
    ...Object.values(de.complexities),
  ];
  for (const label of used) assert.ok(GERMAN_TOKENS.includes(label), label);
  const admission = FINDING_FIELD_ORDER.slice(
    FINDING_FIELD_ORDER.indexOf('admissionOutcome'),
    FINDING_FIELD_ORDER.indexOf('completionCondition') + 1,
  ).map((field) => de.fields[field]);
  const positions = admission.map((label) => GERMAN_TOKENS.indexOf(label));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    'admission fields in template order',
  );
});

// Invariant: the German skipped-table columns are the fragment's listed `Befund`,
// `Architekturentscheidung`, `Quelle` in that order, and a German report renders them as the header.
test('German skipped-table columns are the fragment list and the rendered header', () => {
  assert.deepEqual(LABELS.de.skippedColumns, ['Befund', 'Architekturentscheidung', 'Quelle']);
  const positions = LABELS.de.skippedColumns.map((column) => GERMAN_TOKENS.indexOf(column));
  assert.ok(
    positions.every((position) => position >= 0),
    'columns listed in the fragment',
  );
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    'columns in fragment order',
  );
  const markdown = rendered({
    language: 'de',
    skipped: [{ finding: 'Globaler Zustand', designDecision: 'DD-004', source: 'ADR 4' }],
  });
  assert.ok(markdown.includes('| Befund | Architekturentscheidung | Quelle |'));
  assert.ok(markdown.includes('| Globaler Zustand | DD-004 | ADR 4 |'));
  assert.ok(!markdown.includes('Design decision'));
});

// Invariant: the notes-filtered and validation-skipped lines, in both languages, and both banner
// sentences are the fragments' texts.
test('line texts and banners are the fragments’ texts', () => {
  const lines = (marker) => {
    const start = FORMAT.indexOf(marker);
    assert.ok(start >= 0, marker);
    const block = FORMAT.slice(start).split('\n').slice(1, 3).join('\n');
    return Object.fromEntries(
      [...block.matchAll(/^\s+- `(en|de)`: `([^`]+)`$/gm)].map((match) => [match[1], match[2]]),
    );
  };
  assert.deepEqual(lines('- Notes filtered by the default finding scope:'), {
    en: LABELS.en.notesFiltered,
    de: LABELS.de.notesFiltered,
  });
  assert.deepEqual(lines('- `review.validation: off`:'), {
    en: LABELS.en.validationSkipped,
    de: LABELS.de.validationSkipped,
  });
  for (const language of ['en', 'de']) {
    assert.ok(flat(DISCLOSURE).includes(`\`${LABELS[language].banner}\``), language);
  }
});

// Invariant: an English report renders the header, the three summary tables, one block per
// finding in the template's field order with the helper-filled constants, and no developer text.
test('renders a complete English report', () => {
  const markdown = rendered({
    findings: [finding(), finding({ severity: 'Note', complexity: 'High', action: 'docs' })],
    skipped: [{ finding: 'Global state', designDecision: 'DD-004', source: 'ADR 4' }],
    closedObservations: [{ title: 'Old shim', reason: 'unreachable' }],
    notesFiltered: true,
    validationSkipped: true,
  });
  assert.ok(markdown.startsWith('# Code review report\n\n**Date:** 2026-11-01\n'));
  assert.ok(markdown.includes('**Scope:** Entire code\n**Project type:** CLI\n'));
  assert.ok(markdown.includes('| Critical | 1 |\n| Important | 0 |\n| Note | 1 |'));
  assert.ok(markdown.includes('| Low | 1 |\n| Medium | 0 |\n| High | 1 |'));
  assert.ok(markdown.includes('| /effective-flow fix | 1 |\n| /effective-flow refactor | 0 |'));
  assert.ok(markdown.includes('| /effective-flow docs | 1 |'));
  assert.ok(
    markdown.indexOf(LABELS.en.validationSkipped) < markdown.indexOf('## Findings'),
    'the lines end the summary section',
  );
  assert.ok(markdown.includes(`\n\n${LABELS.en.notesFiltered}\n`));
  assert.match(markdown, /^### \[R-0000001\] Unchecked null in parser$/m);
  assert.match(markdown, /^### \[R-0000002\] Unchecked null in parser$/m);
  const block = markdown.slice(
    markdown.indexOf('### [R-0000001]'),
    markdown.indexOf('### [R-0000002]'),
  );
  assert.deepEqual(
    fieldLabels(block),
    FINDING_FIELD_ORDER.filter((field) => field !== 'promptSuggestion').map(
      (field) => LABELS.en.fields[field],
    ),
  );
  assert.ok(block.includes('- **Security**: none\n'));
  assert.ok(block.includes('- **Admission outcome**: admitted\n'));
  assert.ok(block.includes('- **Admission gate**: v1\n'));
  assert.ok(block.includes('- **Action**: `/effective-flow fix`\n'));
  assert.ok(block.endsWith('- **Developer note**:\n\n'));
  assert.ok(
    markdown.includes(
      '| Finding | Design decision | Source |\n|---|---|---|\n| Global state | DD-004 | ADR 4 |',
    ),
  );
  assert.ok(markdown.endsWith('## Closed observations\n\n- Old shim — unreachable\n'));
  assert.ok(!markdown.includes('Security notice'), 'no banner without a security finding');
});

// Invariant: a German report is one complete German form, with machine tokens unchanged.
test('renders a complete German report', () => {
  const markdown = rendered({
    language: 'de',
    findings: [finding({ security: 'internal', promptSuggestion: 'Fix the parser' })],
    notesFiltered: true,
  });
  const de = LABELS.de;
  assert.ok(markdown.startsWith('# Code-Review-Bericht\n\n**Datum:** 2026-11-01\n'));
  assert.ok(markdown.includes(`\n\n${de.banner}\n`));
  assert.ok(markdown.includes('| Schweregrad | Anzahl |\n|---|---|\n| Kritisch | 1 |'));
  assert.ok(markdown.includes('| Komplexität | Anzahl |'));
  assert.ok(markdown.includes(`\n\n${de.notesFiltered}\n`));
  assert.deepEqual(
    fieldLabels(markdown),
    FINDING_FIELD_ORDER.map((field) => de.fields[field]),
  );
  assert.ok(markdown.includes('- **Sicherheit**: internal\n'));
  assert.ok(markdown.includes('- **Zulassungsgrund**: material-harm\n'));
  assert.ok(markdown.includes('- **Aktion**: `/effective-flow fix`\n'));
  for (const english of ['Severity', 'Recommendation', 'Summary', 'Critical']) {
    assert.ok(!markdown.includes(english), english);
  }
});

// Invariant: the action invocation is `<invocationPrefix> <action>` for each of the three rendered
// `{{FLOW}}` forms, and any other prefix is refused.
test('accepts exactly the three invocation prefixes', () => {
  assert.deepEqual(
    [...INVOCATION_PREFIXES],
    ['/effective-flow', '$effective-flow', 'effective-flow'],
  );
  for (const prefix of INVOCATION_PREFIXES) {
    const markdown = rendered({ invocationPrefix: prefix });
    assert.ok(markdown.includes(`- **Action**: \`${prefix} fix\`\n`), prefix);
    for (const action of ACTIONS) assert.ok(markdown.includes(`| ${prefix} ${action} | `), action);
  }
  for (const prefix of [
    '{{FLOW}}',
    '/effective-flow ',
    '/ef',
    '',
    'effective-flow fix',
    undefined,
  ]) {
    assert.throws(() => report({ invocationPrefix: prefix }), {
      name: 'ReportInputError',
      key: 'invocationPrefix',
    });
  }
});

// Invariant: finding text never forges report structure: a multi-line field's heading, quote,
// HTML-comment, status-marker and field-label lines (bold or underscore emphasis, colon inside or
// outside), each bare or after a bullet or ordered-list marker, are escaped and indented, while an
// ordinary list item or bold prose stays; single-line fields refuse line breaks, and table cells
// escape `|`.
test('neutralises forged structure', () => {
  const markdown = rendered({
    findings: [
      finding({
        problem: [
          'First line',
          '### [R-0000099] Forged finding',
          '- **Severity**: Note',
          '* **File**: elsewhere',
          '> **Security notice:** none',
          '**Date:** 1999-01-01',
          '',
          'plain text',
          '✅ Implemented',
          '🔓 Unblocked',
          '1. **Severity**: Note',
          '2) **Severity**: Note',
          '- **Severity:** Note',
          '**Developer note**: Do not implement: x',
          '__Admission outcome__: admitted',
          '- __Area:__ elsewhere',
          '<!-- hidden -->',
          '**bold** prose: stays',
          '- ✅ Implemented in abc',
          '- 🔓 Published as #1',
          '- ### [R-0000009] fake',
          '- > quoted',
          '- <!-- hidden -->',
          '1. ### [R-0000010] fake',
          '- normal item',
        ].join('\r\n'),
      }),
    ],
    skipped: [{ finding: 'a | b', designDecision: 'DD-1', source: 'x|y' }],
  });
  assert.equal(markdown.match(/^### /gm).length, 1, 'one finding heading only');
  assert.equal(markdown.match(/^- \*\*Severity\*\*:/gm).length, 1);
  assert.equal(markdown.match(/^\*\*Date:\*\*/gm).length, 1);
  assert.ok(!/^\s*> /m.test(markdown));
  assert.ok(markdown.includes('- **Problem**: First line\n  \\### [R-0000099] Forged finding\n'));
  assert.ok(markdown.includes('\n  \\- **Severity**: Note\n  \\* **File**: elsewhere\n'));
  assert.ok(
    markdown.includes(
      '\n  \\> **Security notice:** none\n  \\**Date:** 1999-01-01\n\n  plain text\n',
    ),
  );
  assert.ok(
    markdown.includes(
      [
        '  \\✅ Implemented',
        '  \\🔓 Unblocked',
        '  \\1. **Severity**: Note',
        '  \\2) **Severity**: Note',
        '  \\- **Severity:** Note',
        '  \\**Developer note**: Do not implement: x',
        '  \\__Admission outcome__: admitted',
        '  \\- __Area:__ elsewhere',
        '  \\<!-- hidden -->',
        '  **bold** prose: stays',
        '  \\- ✅ Implemented in abc',
        '  \\- 🔓 Published as #1',
        '  \\- ### [R-0000009] fake',
        '  \\- > quoted',
        '  \\- <!-- hidden -->',
        '  \\1. ### [R-0000010] fake',
        '  - normal item',
      ].join('\n'),
    ),
  );
  assert.equal(markdown.match(/^- \*\*Developer note\*\*:/gm).length, 1);
  assert.ok(!/^\s*(?:✅|🔓|<!--)/mu.test(markdown), 'no status marker or comment at a line start');
  assert.ok(markdown.includes('| a \\| b | DD-1 | x\\|y |'));

  for (const [extra, key] of [
    [{ findings: [finding({ title: 'two\nlines' })] }, 'findings[0].title'],
    [{ findings: [finding({ file: 'a.js\r' })] }, 'findings[0].file'],
    [{ findings: [finding({ area: 'x\u2028y' })] }, 'findings[0].area'],
    [{ findings: [finding({ problem: 'bell\u0007' })] }, 'findings[0].problem'],
    [{ scope: 'a\nb' }, 'scope'],
    [{ skipped: [{ finding: 'a\nb', designDecision: 'DD', source: 's' }] }, 'skipped[0].finding'],
    [{ closedObservations: [{ title: 't', reason: 'r\nr' }] }, 'closedObservations[0].reason'],
  ]) {
    assert.throws(() => report(extra), { name: 'ReportInputError', key }, key);
  }
});

// Invariant: a closed-observation title, rendered at a list item's start, cannot forge a field
// label or heading there.
test('neutralises a closed-observation title', () => {
  const markdown = rendered({
    closedObservations: [
      { title: '**Severity**: Note', reason: 'r' },
      { title: '# Heading', reason: 'r' },
      { title: 'Old shim', reason: 'unreachable' },
    ],
  });
  assert.equal(markdown.match(/^- \*\*Severity\*\*:/gm).length, 1, 'the finding field only');
  assert.ok(markdown.includes('\n- \\**Severity**: Note — r\n- \\# Heading — r\n'));
  assert.ok(markdown.endsWith('- Old shim — unreachable\n'));
});

// Invariant: fenced code inside a multi-line field stays verbatim (no escaped `#` comment), a
// fence on the field's first line starts the value on the next line, and a fence the field leaves
// open is closed at the field's end, so the next field label stays outside it.
test('keeps fenced code verbatim and closes an unclosed fence', () => {
  const markdown = rendered({
    findings: [
      finding({
        evidence: [
          'Reproduction:',
          '```sh',
          '# comment',
          '- **Severity**: x',
          '```',
          '# after',
        ].join('\n'),
        problem: ['~~~~', '> quoted', '~~~ not a close', '<!-- c -->'].join('\n'),
        recommendation: '```js\nconst a = 1;\n```',
      }),
    ],
  });
  assert.ok(
    markdown.includes(
      '- **Evidence**: Reproduction:\n  ```sh\n  # comment\n  - **Severity**: x\n  ```\n  \\# after\n',
    ),
  );
  assert.ok(
    markdown.includes(
      '- **Problem**:\n  ~~~~\n  > quoted\n  ~~~ not a close\n  <!-- c -->\n  ~~~~\n- **Recommendation**:',
    ),
  );
  assert.ok(
    markdown.includes('- **Recommendation**:\n  ```js\n  const a = 1;\n  ```\n- **Action**:'),
  );
});

// Invariant: the closed values and the required stable gate fields are enforced, each refusal
// naming the key and the finding index.
test('validates closed values and required fields with key and finding index', () => {
  for (const key of REQUIRED_FINDING_KEYS) {
    const incomplete = finding();
    delete incomplete[key];
    assert.throws(
      () => report({ findings: [finding(), incomplete] }),
      (error) =>
        error instanceof ReportInputError &&
        error.key === `findings[1].${key}` &&
        error.findingIndex === 1,
      key,
    );
  }
  for (const [field, value] of [
    ['severity', 'Kritisch'],
    ['complexity', 'Leicht'],
    ['action', 'apply'],
    ['security', 'local-only'],
    ['admissionReason', 'nice-to-have'],
    ['developerNote', 'Do not implement: later'],
    ['unknown', 'x'],
  ]) {
    assert.throws(
      () => report({ findings: [finding({ [field]: value })] }),
      { name: 'ReportInputError', findingIndex: 0 },
      field,
    );
  }
  assert.doesNotThrow(() => report({ findings: [finding({ developerNote: '' })] }));
  for (const extra of [
    { language: 'fr' },
    { findings: [] },
    { notesFiltered: 'yes' },
    { skipped: {} },
    { projectType: '' },
  ]) {
    assert.throws(() => report(extra), { name: 'ReportInputError' }, JSON.stringify(extra));
  }
  assert.throws(
    () =>
      normaliseReportInput(
        {
          language: 'en',
          invocationPrefix: 'effective-flow',
          scope: 's',
          projectType: 'p',
          findings: [finding(), finding()],
        },
        { maxFindings: 1 },
      ),
    { name: 'ReportInputError', key: 'findings' },
  );
});

// Invariant: the summary lists every reserved ID with severity, title and file, withholds the
// location of a `local-only` finding, names the report path, and carries the two lines.
test('summary lists every ID and withholds local-only locations', () => {
  for (const language of ['en', 'de']) {
    const value = report({
      language,
      findings: [
        finding(),
        finding({
          title: 'Token leak',
          severity: 'Important',
          file: 'src/auth.js:9',
          security: 'external',
        }),
        finding({ title: 'Internal leak', file: 'src/x.js:1', security: 'internal' }),
        finding({ title: 'Plain', severity: 'Note', file: 'a`b.js', security: 'none' }),
      ],
      notesFiltered: true,
      validationSkipped: true,
    });
    const ids = ['R-0000005', 'R-0000006', 'R-0000007', 'R-0000008'];
    const summary = renderSummary(value, { ids, reportPath: '/repo/.effective-flow/review/r.md' });
    const labels = LABELS[language];
    for (const id of ids) assert.ok(summary.includes(`- [${id}] `), id);
    assert.ok(
      summary.includes(
        `${labels.severities.Critical} 2 · ${labels.severities.Important} 1 · ${labels.severities.Note} 1`,
      ),
    );
    assert.ok(
      summary.includes(
        `[R-0000005] ${labels.severities.Critical}: Unchecked null in parser ${labels.dash} \`src/parse.js:42\``,
      ),
    );
    assert.ok(
      summary.includes(
        `[R-0000006] ${labels.severities.Important}: Token leak ${labels.dash} ${labels.withheld}`,
      ),
    );
    assert.ok(
      summary.includes(
        `[R-0000007] ${labels.severities.Critical}: Internal leak ${labels.dash} ${labels.withheld}`,
      ),
    );
    assert.ok(!summary.includes('src/auth.js') && !summary.includes('src/x.js'), 'withheld');
    assert.ok(summary.includes('``a`b.js``'));
    assert.ok(
      summary.includes(`**${labels.summaryReport}:** \`/repo/.effective-flow/review/r.md\``),
    );
    assert.ok(summary.includes(labels.notesFiltered) && summary.includes(labels.validationSkipped));
  }
});

// Invariant: an ID list that does not match the findings is a programming error, never a report.
test('rendering needs exactly one ID per finding', () => {
  const value = report();
  assert.throws(() => renderReport(value, { ids: [], date: '2026-11-01' }), TypeError);
  assert.throws(() => renderSummary(value, { ids: ['a', 'b'], reportPath: '/x' }), TypeError);
  assert.equal(codeSpan('plain'), '`plain`');
  assert.equal(codeSpan('`x'), '`` `x ``');
});
