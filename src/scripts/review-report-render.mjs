// The pure renderer of `review write-report`: the content of a local review report, validated and
// sanitised, in; the report Markdown and its chat summary out. It reads no file, spawns nothing and
// imports no script.
//
// The format is owned by `src/shared/review-report-format.md`; this module implements exactly that
// format in its two complete forms, `en` and `de`. The labels, displayed values and line texts in
// LABELS below must equal the fragment's lists, which `test/review-report-render.test.mjs` pins.
// Machine tokens stay unchanged in both forms: finding IDs, paths, the `external`/`internal`/`none`
// exposure tokens, the admission reason values, and the action invocations.
//
// Report content (the keys of `review write-report` besides `cwd`, `owner` and `waitSeconds`):
//
//   language          `en` | `de`
//   invocationPrefix  `/effective-flow` | `$effective-flow` | `effective-flow` (the rendered
//                     `{{FLOW}}`; an action value is `<invocationPrefix> <action>`)
//   scope, projectType                   single-line strings
//   findings          1 or more findings, in report order
//   skipped?          [{finding, designDecision, source}]  (the design-decision table)
//   closedObservations?  [{title, reason}]  (the standalone-audit appendix)
//   notesFiltered?, validationSkipped?   booleans that render their line
//
// A finding has the required keys of REQUIRED_FINDING_KEYS, among them `security` (`external`,
// `internal` or `none`), and the optional `promptSuggestion` and `developerNote`. The constants `Admission outcome: admitted` and
// `Admission gate: v1` are filled here and are no input. `developerNote` is the developer's field:
// a generated report always leaves it empty, so only an empty string is accepted.
//
// Sanitising: finding text never forges report structure. A single-line field and every table cell
// refuses a line break or control character, and a table cell escapes `|`. A multi-line field keeps
// its lines, indents every continuation line under its list item, and prefixes `\` to any line
// that reads as structure (STRUCTURE_LINE): a heading, a quote, an HTML comment, an apply-review
// status marker (`✅`, `🔓`), or a field label in `**…**`/`__…__` with the colon inside or outside
// the emphasis; each of them bare or after a bullet or ordered-list marker. Lines inside a fenced
// code block stay verbatim; a fence the field leaves open is closed at the field's end, so it
// cannot swallow the report structure after it. A closed-observation title, rendered at a list
// item's start, is neutralised the same way.

export const REPORT_LANGUAGES = Object.freeze(['en', 'de']);
export const INVOCATION_PREFIXES = Object.freeze([
  '/effective-flow',
  '$effective-flow',
  'effective-flow',
]);
export const SEVERITIES = Object.freeze(['Critical', 'Important', 'Note']);
export const COMPLEXITIES = Object.freeze(['Low', 'Medium', 'High']);
export const ACTIONS = Object.freeze(['fix', 'refactor', 'build', 'docs']);
export const SECURITY_VALUES = Object.freeze(['external', 'internal', 'none']);
// The exposure values that make a finding `local-only`: withheld from chat locations, and the
// reason for the disclosure banner.
export const LOCAL_ONLY_SECURITY_VALUES = Object.freeze(['external', 'internal']);
export const ADMISSION_REASONS = Object.freeze(['material-harm', 'irreversible-commitment']);
export const ADMISSION_OUTCOME = 'admitted';
export const ADMISSION_GATE = 'v1';

export const REPORT_CONTENT_KEYS = Object.freeze([
  'language',
  'invocationPrefix',
  'scope',
  'projectType',
  'findings',
  'skipped',
  'closedObservations',
  'notesFiltered',
  'validationSkipped',
]);
export const REQUIRED_FINDING_KEYS = Object.freeze([
  'title',
  'severity',
  'complexity',
  'area',
  'file',
  'problem',
  'recommendation',
  'action',
  'admissionReason',
  'evidence',
  'evidenceDigest',
  'currentReachability',
  'rootCauseSignature',
  'scopeAndContainment',
  'whyNow',
  'completionCondition',
  'security',
]);
export const OPTIONAL_FINDING_KEYS = Object.freeze(['promptSuggestion', 'developerNote']);
const FINDING_KEYS = Object.freeze([...REQUIRED_FINDING_KEYS, ...OPTIONAL_FINDING_KEYS]);
const SKIPPED_KEYS = Object.freeze(['finding', 'designDecision', 'source']);
const CLOSED_KEYS = Object.freeze(['title', 'reason']);

// Free-text finding fields that may span lines; every other text field is single-line.
const MULTI_LINE_FINDING_KEYS = Object.freeze([
  'problem',
  'recommendation',
  'promptSuggestion',
  'evidence',
  'currentReachability',
  'scopeAndContainment',
  'whyNow',
  'completionCondition',
]);
const SINGLE_LINE_FINDING_KEYS = Object.freeze([
  'title',
  'area',
  'file',
  'evidenceDigest',
  'rootCauseSignature',
]);

// The field order of one finding block, as in the fragment's template.
export const FINDING_FIELD_ORDER = Object.freeze([
  'severity',
  'complexity',
  'area',
  'file',
  'security',
  'admissionOutcome',
  'admissionReason',
  'admissionGate',
  'evidence',
  'evidenceDigest',
  'currentReachability',
  'rootCauseSignature',
  'scopeAndContainment',
  'whyNow',
  'completionCondition',
  'problem',
  'recommendation',
  'action',
  'promptSuggestion',
  'developerNote',
]);

export const LABELS = Object.freeze({
  en: Object.freeze({
    title: 'Code review report',
    date: 'Date',
    scope: 'Scope',
    projectType: 'Project type',
    summary: 'Summary',
    count: 'Count',
    findings: 'Findings',
    fields: Object.freeze({
      severity: 'Severity',
      complexity: 'Complexity',
      area: 'Area',
      file: 'File',
      security: 'Security',
      admissionOutcome: 'Admission outcome',
      admissionReason: 'Admission reason',
      admissionGate: 'Admission gate',
      evidence: 'Evidence',
      evidenceDigest: 'Evidence digest',
      currentReachability: 'Current reachability',
      rootCauseSignature: 'Root-cause signature',
      scopeAndContainment: 'Scope and containment',
      whyNow: 'Why now',
      completionCondition: 'Completion condition',
      problem: 'Problem',
      recommendation: 'Recommendation',
      action: 'Action',
      promptSuggestion: 'Prompt suggestion',
      developerNote: 'Developer note',
    }),
    severities: Object.freeze({ Critical: 'Critical', Important: 'Important', Note: 'Note' }),
    complexities: Object.freeze({ Low: 'Low', Medium: 'Medium', High: 'High' }),
    skippedFindings: 'Skipped findings (design decisions)',
    skippedColumns: Object.freeze(['Finding', 'Design decision', 'Source']),
    closedObservations: 'Closed observations',
    banner:
      '> **Security notice:** This report contains unpublished security findings. Do not paste it into public issues, pull requests, or chats.',
    notesFiltered:
      'Notes were filtered out by the default finding scope; a comprehensive review including notes is available on request.',
    validationSkipped: 'Technical validation was skipped: review.validation is off.',
    dash: '—',
    summaryFindings: 'Review findings',
    summaryReport: 'Report',
    withheld: 'location withheld (unpublished security finding)',
  }),
  de: Object.freeze({
    title: 'Code-Review-Bericht',
    date: 'Datum',
    scope: 'Umfang',
    projectType: 'Projekttyp',
    summary: 'Zusammenfassung',
    count: 'Anzahl',
    findings: 'Befunde',
    fields: Object.freeze({
      severity: 'Schweregrad',
      complexity: 'Komplexität',
      area: 'Bereich',
      file: 'Datei',
      security: 'Sicherheit',
      admissionOutcome: 'Zulassungsergebnis',
      admissionReason: 'Zulassungsgrund',
      admissionGate: 'Zulassungsprüfung',
      evidence: 'Beleg',
      evidenceDigest: 'Beleg-Digest',
      currentReachability: 'Aktuelle Erreichbarkeit',
      rootCauseSignature: 'Ursachensignatur',
      scopeAndContainment: 'Umfang und Eindämmung',
      whyNow: 'Warum jetzt',
      completionCondition: 'Abschlussbedingung',
      problem: 'Problem',
      recommendation: 'Empfehlung',
      action: 'Aktion',
      promptSuggestion: 'Prompt-Vorschlag',
      developerNote: 'Entwicklernotiz',
    }),
    severities: Object.freeze({ Critical: 'Kritisch', Important: 'Wichtig', Note: 'Hinweis' }),
    complexities: Object.freeze({ Low: 'Niedrig', Medium: 'Mittel', High: 'Hoch' }),
    skippedFindings: 'Übersprungene Befunde (Architekturentscheidungen)',
    skippedColumns: Object.freeze(['Befund', 'Architekturentscheidung', 'Quelle']),
    closedObservations: 'Geschlossene Beobachtungen',
    banner:
      '> **Sicherheitshinweis:** Dieser Bericht enthält unveröffentlichte Sicherheitsbefunde. Nicht in öffentliche Issues, Pull Requests oder Chats einfügen.',
    notesFiltered:
      'Hinweise wurden durch den Standard-Befundumfang herausgefiltert; ein umfassendes Review einschließlich Hinweisen ist auf Anfrage möglich.',
    validationSkipped: 'Die technische Validierung wurde übersprungen: review.validation ist off.',
    dash: '–',
    summaryFindings: 'Review-Befunde',
    summaryReport: 'Bericht',
    withheld: 'Fundort zurückgehalten (unveröffentlichter Sicherheitsbefund)',
  }),
});

// A refused report input: `key` names the failing field (`findings[2].evidence`, `language`, …),
// `findingIndex` the finding when the field belongs to one.
export class ReportInputError extends Error {
  constructor(key, message, findingIndex) {
    super(`${key} ${message}`);
    this.name = 'ReportInputError';
    this.key = key;
    if (findingIndex !== undefined) this.findingIndex = findingIndex;
  }
}

// ---------------------------------------------------------------------------------------------
// Validation and sanitising

const LINE_BREAK = /[\r\n\u0085\u2028\u2029]/;
// C0 and C1 controls besides tab, line feed and carriage return.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f]/;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, key, allowed, findingIndex) {
  if (!isObject(value)) throw new ReportInputError(key, 'must be a JSON object', findingIndex);
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) {
      throw new ReportInputError(`${key}.${field}`, 'is not a known field', findingIndex);
    }
  }
  return value;
}

function requireText(value, key, findingIndex) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReportInputError(key, 'must be a non-empty string', findingIndex);
  }
  if (typeof value.isWellFormed === 'function' && !value.isWellFormed()) {
    throw new ReportInputError(key, 'must be well-formed Unicode', findingIndex);
  }
  if (CONTROL.test(value)) {
    throw new ReportInputError(key, 'must not contain a control character', findingIndex);
  }
  return value;
}

function singleLine(value, key, findingIndex) {
  requireText(value, key, findingIndex);
  if (LINE_BREAK.test(value)) {
    throw new ReportInputError(key, 'must be a single line', findingIndex);
  }
  return value.trim();
}

// A line that would read as a heading, a quote, an HTML comment, an apply-review status marker, or
// a field label of the report (`**Label**:`, `**Label:**`, `__Label__:` or `__Label:__`), each
// bare or after a bullet (`-`, `*`, `+`) or ordered-list marker (`1.`, `1)`).
const STRUCTURE_LINE =
  /^(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(?:#|>|<!--|✅|🔓|\*\*.*?(?::\*\*|\*\*[ \t]*:)|__.*?(?::__|__[ \t]*:))/u;

export function neutraliseLine(line) {
  const indent = /^[ \t]*/.exec(line)[0];
  const rest = line.slice(indent.length);
  return STRUCTURE_LINE.test(rest) ? `${indent}\\${rest}` : line;
}

// The opening fence of a fenced code block (at most three spaces of indentation; a backtick fence's
// info string holds no backtick), or null.
export function fenceOpener(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return match[1];
}

function closesFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return Boolean(match) && match[1][0] === fence[0] && match[1].length >= fence.length;
}

// Neutralises every line outside a fenced code block, keeps the lines inside one verbatim, and
// closes a fence the lines leave open.
export function neutraliseLines(lines) {
  const result = [];
  let fence = null;
  for (const line of lines) {
    if (fence) {
      result.push(line);
      if (closesFence(line, fence)) fence = null;
    } else {
      fence = fenceOpener(line);
      result.push(fence ? line : neutraliseLine(line));
    }
  }
  if (fence) result.push(fence);
  return result;
}

// A multi-line value as its lines: line endings normalised, outer blank lines dropped, the lines
// neutralised outside fenced code.
function multiLine(value, key, findingIndex) {
  requireText(value, key, findingIndex);
  const lines = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0085\u2028\u2029]/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  return neutraliseLines(lines);
}

export function escapeCell(value) {
  return value.replace(/\|/g, '\\|');
}

function requireEnum(value, key, allowed, findingIndex) {
  if (!allowed.includes(value)) {
    throw new ReportInputError(key, `must be one of ${allowed.join(', ')}`, findingIndex);
  }
  return value;
}

function optionalBoolean(value, key) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new ReportInputError(key, 'must be a boolean');
  return value;
}

function optionalList(value, key) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ReportInputError(key, 'must be an array');
  return value;
}

function normaliseFinding(value, index) {
  const key = `findings[${index}]`;
  const finding = requireRecord(value, key, FINDING_KEYS, index);
  for (const field of REQUIRED_FINDING_KEYS) {
    if (finding[field] === undefined) {
      throw new ReportInputError(`${key}.${field}`, 'is required', index);
    }
  }
  const at = (field) => `${key}.${field}`;
  const normalised = {
    severity: requireEnum(finding.severity, at('severity'), SEVERITIES, index),
    complexity: requireEnum(finding.complexity, at('complexity'), COMPLEXITIES, index),
    action: requireEnum(finding.action, at('action'), ACTIONS, index),
    admissionReason: requireEnum(
      finding.admissionReason,
      at('admissionReason'),
      ADMISSION_REASONS,
      index,
    ),
  };
  for (const field of SINGLE_LINE_FINDING_KEYS) {
    normalised[field] = singleLine(finding[field], at(field), index);
  }
  for (const field of MULTI_LINE_FINDING_KEYS) {
    if (finding[field] === undefined && OPTIONAL_FINDING_KEYS.includes(field)) continue;
    normalised[field] = multiLine(finding[field], at(field), index);
  }
  normalised.security = requireEnum(finding.security, at('security'), SECURITY_VALUES, index);
  if (finding.developerNote !== undefined && finding.developerNote !== '') {
    throw new ReportInputError(
      at('developerNote'),
      'must be empty: only the developer fills it, never a generated report',
      index,
    );
  }
  return normalised;
}

// Validates and sanitises the report content of `input` (the other keys are the caller's) and
// returns it normalised. Throws ReportInputError at the first refused field. `maxFindings` bounds
// the number of findings.
export function normaliseReportInput(input, { maxFindings = Infinity } = {}) {
  if (!isObject(input)) throw new ReportInputError('input', 'must be a JSON object');
  const language = requireEnum(input.language, 'language', REPORT_LANGUAGES);
  const invocationPrefix = requireEnum(
    input.invocationPrefix,
    'invocationPrefix',
    INVOCATION_PREFIXES,
  );
  const scope = singleLine(input.scope, 'scope');
  const projectType = singleLine(input.projectType, 'projectType');
  if (!Array.isArray(input.findings) || input.findings.length === 0) {
    throw new ReportInputError('findings', 'must be a non-empty array');
  }
  if (input.findings.length > maxFindings) {
    throw new ReportInputError('findings', `must hold at most ${maxFindings} findings`);
  }
  const findings = input.findings.map((finding, index) => normaliseFinding(finding, index));
  const skipped = optionalList(input.skipped, 'skipped').map((entry, index) => {
    const key = `skipped[${index}]`;
    requireRecord(entry, key, SKIPPED_KEYS);
    return SKIPPED_KEYS.map((field) => escapeCell(singleLine(entry[field], `${key}.${field}`)));
  });
  const closedObservations = optionalList(input.closedObservations, 'closedObservations').map(
    (entry, index) => {
      const key = `closedObservations[${index}]`;
      requireRecord(entry, key, CLOSED_KEYS);
      return {
        title: neutraliseLine(singleLine(entry.title, `${key}.title`)),
        reason: singleLine(entry.reason, `${key}.reason`),
      };
    },
  );
  return {
    language,
    invocationPrefix,
    scope,
    projectType,
    findings,
    skipped,
    closedObservations,
    notesFiltered: optionalBoolean(input.notesFiltered, 'notesFiltered'),
    validationSkipped: optionalBoolean(input.validationSkipped, 'validationSkipped'),
  };
}

// ---------------------------------------------------------------------------------------------
// Rendering

export function isLocalOnly(finding) {
  return LOCAL_ONLY_SECURITY_VALUES.includes(finding.security);
}

// An inline code span that holds `value` whatever backticks it contains.
export function codeSpan(value) {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

function invocation(report, action) {
  return `${report.invocationPrefix} ${action}`;
}

function countTable(header, count, rows) {
  return [
    `| ${header} | ${count} |`,
    '|---|---|',
    ...rows.map(([name, n]) => `| ${name} | ${n} |`),
  ];
}

function tally(findings, field, values) {
  return values.map((value) => [value, findings.filter((entry) => entry[field] === value).length]);
}

function fieldLine(label, value) {
  return value === '' ? `- **${label}**:` : `- **${label}**: ${value}`;
}

// A field whose first line opens a fence starts its value on the next line: a fence after the label
// opens no code block, while its closing line, indented under the list item, would open one.
function multiLineField(label, lines) {
  const [first, ...rest] = fenceOpener(lines[0]) ? ['', ...lines] : lines;
  return [fieldLine(label, first), ...rest.map((line) => (line === '' ? '' : `  ${line}`))];
}

function findingBlock(report, labels, finding, id) {
  const lines = [`### [${id}] ${finding.title}`];
  const value = {
    severity: labels.severities[finding.severity],
    complexity: labels.complexities[finding.complexity],
    area: finding.area,
    file: finding.file,
    security: finding.security,
    admissionOutcome: ADMISSION_OUTCOME,
    admissionReason: finding.admissionReason,
    admissionGate: ADMISSION_GATE,
    evidenceDigest: finding.evidenceDigest,
    rootCauseSignature: finding.rootCauseSignature,
    action: `\`${invocation(report, finding.action)}\``,
    developerNote: '',
  };
  for (const field of FINDING_FIELD_ORDER) {
    const label = labels.fields[field];
    if (MULTI_LINE_FINDING_KEYS.includes(field)) {
      if (finding[field] !== undefined) lines.push(...multiLineField(label, finding[field]));
    } else if (value[field] !== undefined) {
      lines.push(fieldLine(label, value[field]));
    }
  }
  return lines;
}

function requireIds(report, ids) {
  if (!Array.isArray(ids) || ids.length !== report.findings.length) {
    throw new TypeError('ids must hold exactly one ID per finding');
  }
}

// The complete report Markdown. `ids` holds one finding ID per finding, in order; `date` is the
// report date (YYYY-MM-DD).
export function renderReport(report, { ids, date }) {
  requireIds(report, ids);
  const labels = LABELS[report.language];
  const lines = [
    `# ${labels.title}`,
    '',
    `**${labels.date}:** ${date}`,
    `**${labels.scope}:** ${report.scope}`,
    `**${labels.projectType}:** ${report.projectType}`,
  ];
  if (report.findings.some(isLocalOnly)) lines.push('', labels.banner);

  lines.push('', `## ${labels.summary}`, '');
  lines.push(
    ...countTable(
      labels.fields.severity,
      labels.count,
      tally(report.findings, 'severity', SEVERITIES).map(([v, n]) => [labels.severities[v], n]),
    ),
    '',
    ...countTable(
      labels.fields.complexity,
      labels.count,
      tally(report.findings, 'complexity', COMPLEXITIES).map(([v, n]) => [
        labels.complexities[v],
        n,
      ]),
    ),
    '',
    ...countTable(
      labels.fields.action,
      labels.count,
      tally(report.findings, 'action', ACTIONS).map(([v, n]) => [invocation(report, v), n]),
    ),
  );
  // The summary section ends with the notes-filtered and validation-skipped lines.
  if (report.notesFiltered) lines.push('', labels.notesFiltered);
  if (report.validationSkipped) lines.push('', labels.validationSkipped);

  lines.push('', `## ${labels.findings}`);
  report.findings.forEach((finding, index) => {
    lines.push('', ...findingBlock(report, labels, finding, ids[index]));
  });

  if (report.skipped.length > 0) {
    lines.push(
      '',
      `## ${labels.skippedFindings}`,
      '',
      `| ${labels.skippedColumns.join(' | ')} |`,
      '|---|---|---|',
      ...report.skipped.map((cells) => `| ${cells.join(' | ')} |`),
    );
  }
  if (report.closedObservations.length > 0) {
    lines.push(
      '',
      `## ${labels.closedObservations}`,
      '',
      ...report.closedObservations.map(
        (entry) => `- ${entry.title} ${labels.dash} ${entry.reason}`,
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}

// The chat summary in the report language: the severity counts, one line per finding with its ID,
// severity, title and file (a `local-only` finding's location withheld), the report path, and the
// notes-filtered and validation-skipped lines.
export function renderSummary(report, { ids, reportPath }) {
  requireIds(report, ids);
  const labels = LABELS[report.language];
  const counts = tally(report.findings, 'severity', SEVERITIES)
    .map(([value, n]) => `${labels.severities[value]} ${n}`)
    .join(' · ');
  const lines = [
    `**${labels.summaryFindings}:** ${report.findings.length} (${counts})`,
    '',
    ...report.findings.map((finding, index) => {
      const location = isLocalOnly(finding) ? labels.withheld : codeSpan(finding.file);
      return `- [${ids[index]}] ${labels.severities[finding.severity]}: ${finding.title} ${labels.dash} ${location}`;
    }),
    '',
    `**${labels.summaryReport}:** ${codeSpan(reportPath)}`,
  ];
  if (report.notesFiltered) lines.push('', labels.notesFiltered);
  if (report.validationSkipped) lines.push('', labels.validationSkipped);
  return lines.join('\n');
}
