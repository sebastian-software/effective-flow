// Deterministic plan-file linter: the mechanical half of the plan-file contract.
//
// The prose in `shared/plan-status.md` and `shared/plan-contract.md` stays normative. This module
// evaluates only what that prose makes mechanical — status lines, exact bilingual labels,
// open-point entries, acceptance-criteria presence, leftover template placeholders, and same-name
// files at the top level and in the archive — so a reader never has to count by eye. Judgment
// (measurable criteria, relevant assumptions) stays with the model.
//
// The bilingual mapping and the placeholder list are owned here and projected into marked tables
// in `shared/plan-contract.md`; a build guard fails on any drift between the two.

import nodeFs from 'node:fs';
import path from 'node:path';

export const PLAN_LINT_OPERATIONS = Object.freeze(['lint']);

const EXIT_CODES = Object.freeze({
  INVALID_PAYLOAD: 2,
  INVALID_CWD: 2,
  UNSAFE_PATH: 3,
});

const PAYLOAD_KEYS = Object.freeze(['cwd', 'planDir', 'files']);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// One row per line of the canonical bilingual plan contract, in table order. Each language cell
// holds the code-span contents of that table cell: one element normally, two for the review
// result, whose cell lists the approved value and the alternative separated by ` / `.
export const PLAN_CONTRACT_MAPPING = deepFreeze([
  {
    meaning: 'Status, open',
    de: ['**Planungsstatus:** Nicht umgesetzt'],
    en: ['**Plan status:** Not implemented'],
  },
  {
    meaning: 'Status, completed',
    de: ['**Planungsstatus:** Umgesetzt'],
    en: ['**Plan status:** Implemented'],
  },
  { meaning: 'Source', de: ['**Quelle:**'], en: ['**Source:**'] },
  { meaning: 'Workflow', de: ['**Empfohlener Workflow:**'], en: ['**Recommended workflow:**'] },
  { meaning: 'Doc category', de: ['**Doku-Kategorie:**'], en: ['**Doc category:**'] },
  { meaning: 'Target path', de: ['**Ziel-Pfad:**'], en: ['**Target path:**'] },
  { meaning: 'Requirement', de: ['## Anforderung'], en: ['## Requirement'] },
  {
    meaning: 'Architecture',
    de: ['## Architekturentscheidungen'],
    en: ['## Architecture decisions'],
  },
  { meaning: 'Affected files', de: ['## Betroffene Dateien'], en: ['## Affected files'] },
  {
    meaning: 'Implementation',
    de: ['## Implementierungsdetails'],
    en: ['## Implementation details'],
  },
  { meaning: 'Approach', de: ['### Vorgehen'], en: ['### Approach'] },
  {
    meaning: 'Component structure',
    de: ['### Komponentenstruktur'],
    en: ['### Component structure'],
  },
  { meaning: 'State management', de: ['### Zustandsverwaltung'], en: ['### State management'] },
  { meaning: 'API integration', de: ['### API-Integration'], en: ['### API integration'] },
  { meaning: 'Styling approach', de: ['### Styling-Ansatz'], en: ['### Styling approach'] },
  { meaning: 'Accessibility', de: ['### Barrierefreiheit'], en: ['### Accessibility'] },
  { meaning: 'Edge cases', de: ['### Randfälle'], en: ['### Edge cases'] },
  { meaning: 'Acceptance criteria', de: ['## Akzeptanzkriterien'], en: ['## Acceptance criteria'] },
  { meaning: 'Validation plan', de: ['## Validierungsplan'], en: ['## Validation plan'] },
  {
    meaning: 'Assumptions',
    de: ['## Annahmen und offene Punkte'],
    en: ['## Assumptions and open points'],
  },
  { meaning: 'Plan review', de: ['## Plan-Review'], en: ['## Plan review'] },
  {
    meaning: 'Review result',
    de: ['**Ergebnis:** Freigegeben', 'Überarbeitung nötig'],
    en: ['**Result:** Approved', 'Revision required'],
  },
  { meaning: 'Review summary', de: ['### Zusammenfassung'], en: ['### Summary'] },
  { meaning: 'Plan-review findings', de: ['### Befunde'], en: ['### Findings'] },
  { meaning: 'Open points', de: ['## Offene Punkte'], en: ['## Open points'] },
  { meaning: 'Empty open points', de: ['- Keine offenen Punkte.'], en: ['- No open points.'] },
  { meaning: 'Test results', de: ['## Testergebnisse'], en: ['## Test results'] },
  { meaning: 'Review findings', de: ['## Review-Befunde'], en: ['## Review findings'] },
]);

// The former English spelling of the open-points heading. Readers keep recognizing it; writers
// never produce it, so it stays script-owned and outside the guarded mapping table.
export const LEGACY_OPEN_POINTS_HEADING = '## Open Points';

// The former title-case spelling of the English acceptance-criteria heading, kept on the same
// terms: recognized when reading, never written, and outside the guarded mapping table.
export const LEGACY_ACCEPTANCE_CRITERIA_HEADING = '## Acceptance Criteria';

// Template placeholder tokens of the `plan` Phase 3 template, in table order. A bracketed token
// is flagged wherever it occurs outside fenced code; the review-result alternatives value is not
// bracketed and is flagged only as the complete value of a review-result line.
export const PLAN_PLACEHOLDERS = deepFreeze([
  { placeholder: 'Title', de: '[Titel]', en: '[Title]' },
  {
    placeholder: 'Requirement',
    de: '[Anforderung, Ziel und Begründung der Workflow-Empfehlung]',
    en: '[Requirement, goal, and rationale for the workflow recommendation]',
  },
  {
    placeholder: 'Architecture decision',
    de: '[Entscheidung mit Begründung]',
    en: '[Decision with rationale]',
  },
  { placeholder: 'Affected file change', de: '[geplante Änderung]', en: '[planned change]' },
  {
    placeholder: 'Implementation step',
    de: '[konkreter Implementierungsschritt]',
    en: '[concrete implementation step]',
  },
  { placeholder: 'Optional subsection', de: '[Nur falls relevant]', en: '[Only if relevant]' },
  {
    placeholder: 'Edge case',
    de: '[Randfall und erwartetes Verhalten]',
    en: '[Edge case and expected behavior]',
  },
  {
    placeholder: 'Acceptance criterion',
    de: '[messbares Kriterium]',
    en: '[measurable criterion]',
  },
  {
    placeholder: 'Validation step',
    de: '[geplanter Test, geplante Prüfung oder manuelle Verifikation]',
    en: '[planned test, check, or manual verification]',
  },
  {
    placeholder: 'Assumption',
    de: '[Annahme oder bewusst dokumentierter offener Punkt]',
    en: '[Assumption or deliberately documented remaining point]',
  },
  {
    placeholder: 'Plan-review finding',
    de: '[Befund mit Bereich, Schweregrad, Problem und Anpassung]',
    en: '[Finding with area, severity, problem, and adjustment]',
  },
  {
    placeholder: 'Review result',
    de: 'Freigegeben / Überarbeitung nötig',
    en: 'Approved / Revision required',
  },
]);

export class PlanLintError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlanLintError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PlanLintError(code, message);
}

// ---------------------------------------------------------------------------------------------
// Contract vocabulary derived from the owned constants

const FIELD_CELL = /^(\*\*[^*\n]+:\*\*)(?:\s+(.*))?$/;
// An ATX heading may be indented up to three spaces; four make it indented code.
const HEADING_LINE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

function mappingRow(meaning) {
  const row = PLAN_CONTRACT_MAPPING.find((entry) => entry.meaning === meaning);
  if (!row) throw new Error(`plan-lint mapping lacks the row "${meaning}"`);
  return row;
}

function fieldParts(cell) {
  const match = cell.match(FIELD_CELL);
  if (!match) throw new Error(`plan-lint mapping cell is not a field: ${cell}`);
  return { label: match[1], value: match[2] ?? '' };
}

// Every label a language contributes to detection: a field prefix, an exact heading, or an exact
// list item. Only the first code span of a cell carries a label; a second one is a value, which
// FIELD_VALUE_MATCHERS covers.
function languageMatchers(language) {
  const fields = new Set();
  const lines = new Set();
  for (const row of PLAN_CONTRACT_MAPPING) {
    const cell = row[language][0];
    if (FIELD_CELL.test(cell)) fields.add(fieldParts(cell).label);
    else lines.add(cell);
  }
  if (language === 'en') {
    lines.add(LEGACY_OPEN_POINTS_HEADING);
    lines.add(LEGACY_ACCEPTANCE_CRITERIA_HEADING);
  }
  return { fields: [...fields], lines };
}

const LANGUAGE_MATCHERS = Object.freeze({ de: languageMatchers('de'), en: languageMatchers('en') });

// Every canonical field value a language contributes to detection, bound to the labels of its own
// row: the value half of a field cell plus each further code span of that cell. A value counts
// under either language's label, so a label of one language with a value of the other is mixed.
const FIELD_VALUE_MATCHERS = Object.freeze(
  PLAN_CONTRACT_MAPPING.flatMap((row) => {
    if (!FIELD_CELL.test(row.de[0]) || !FIELD_CELL.test(row.en[0])) return [];
    const valuesOf = ([cell, ...alternatives]) =>
      [fieldParts(cell).value, ...alternatives].filter((value) => value !== '');
    const values = { de: valuesOf(row.de), en: valuesOf(row.en) };
    if (values.de.length === 0 && values.en.length === 0) return [];
    return [{ labels: [fieldParts(row.de[0]).label, fieldParts(row.en[0]).label], values }];
  }),
);

// Per language: the status field label and its canonical values mapped to a status.
const STATUS_VALUES = (() => {
  const values = { de: { label: null, values: new Map() }, en: { label: null, values: new Map() } };
  for (const [meaning, status] of [
    ['Status, open', 'open'],
    ['Status, completed', 'implemented'],
  ]) {
    const row = mappingRow(meaning);
    for (const language of ['de', 'en']) {
      const { label, value } = fieldParts(row[language][0]);
      values[language].label = label;
      values[language].values.set(value, status);
    }
  }
  return values;
})();

const OPEN_POINTS_HEADINGS = new Set([
  ...mappingRow('Open points').de,
  ...mappingRow('Open points').en,
  LEGACY_OPEN_POINTS_HEADING,
]);
const EMPTY_OPEN_POINTS = new Set([
  ...mappingRow('Empty open points').de,
  ...mappingRow('Empty open points').en,
]);
const ACCEPTANCE_HEADINGS = new Set([
  ...mappingRow('Acceptance criteria').de,
  ...mappingRow('Acceptance criteria').en,
  LEGACY_ACCEPTANCE_CRITERIA_HEADING,
]);
const REVIEW_RESULT_LABELS = [
  fieldParts(mappingRow('Review result').de[0]).label,
  fieldParts(mappingRow('Review result').en[0]).label,
];
const HEADER_FIELD_LABELS = Object.freeze({
  workflow: mappingRow('Workflow'),
  docCategory: mappingRow('Doc category'),
  targetPath: mappingRow('Target path'),
});

const isBracketToken = (token) => token.startsWith('[') && token.endsWith(']');
const BRACKET_PLACEHOLDERS = PLAN_PLACEHOLDERS.flatMap(({ de, en }) => [de, en]).filter(
  isBracketToken,
);
const VALUE_PLACEHOLDERS = PLAN_PLACEHOLDERS.flatMap(({ de, en }) => [de, en]).filter(
  (token) => !isBracketToken(token),
);

// ---------------------------------------------------------------------------------------------
// Markdown line inventory

export function normalizePlanText(text) {
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

function fenceOpening(line) {
  const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!opening || (opening[1][0] === '`' && opening[2].includes('`'))) return null;
  return { char: opening[1][0], length: opening[1].length };
}

function closesFence(line, fence) {
  const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return Boolean(closing && closing[1][0] === fence.char && closing[1].length >= fence.length);
}

// Splits a document into lines and marks every line that belongs to a fenced code block,
// delimiters included. An opener without a closing fence is ordinary content rather than a fence
// to the end of the document: an unclosed fence must not hide a later status line or section.
export function inventoryLines(text) {
  const lines = normalizePlanText(text).split('\n');
  const inventory = [];
  let index = 0;
  while (index < lines.length) {
    const fence = fenceOpening(lines[index]);
    const close = fence
      ? lines.findIndex((line, cursor) => cursor > index && closesFence(line, fence))
      : -1;
    if (close === -1) {
      inventory.push({ text: lines[index], number: index + 1, inFence: false });
      index += 1;
      continue;
    }
    for (; index <= close; index += 1) {
      inventory.push({ text: lines[index], number: index + 1, inFence: true });
    }
  }
  return inventory;
}

function headingLevel(entry) {
  if (entry.inFence) return null;
  const match = entry.text.match(HEADING_LINE);
  return match ? match[1].length : null;
}

// The comparable form of a line: a heading loses its up-to-three-space indent, and trailing
// whitespace is ignored.
function lineKey(entry) {
  const text = headingLevel(entry) === null ? entry.text : entry.text.replace(/^ {0,3}/, '');
  return text.trimEnd();
}

// Returns the entries after each matching level-2 heading up to the next heading of level <= 2.
function sections(inventory, headings) {
  const result = [];
  for (let index = 0; index < inventory.length; index += 1) {
    const entry = inventory[index];
    if (entry.inFence || !headings.has(lineKey(entry))) continue;
    const body = [];
    for (let cursor = index + 1; cursor < inventory.length; cursor += 1) {
      const level = headingLevel(inventory[cursor]);
      if (level !== null && level <= 2) break;
      body.push(inventory[cursor]);
    }
    result.push(body);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Classification

function classifyStatus(outside) {
  const statusLines = outside.filter(
    (entry) =>
      entry.text.startsWith(STATUS_VALUES.de.label) ||
      entry.text.startsWith(STATUS_VALUES.en.label),
  );
  if (statusLines.length === 0) return { status: 'unclear', statusReason: 'missing' };
  if (statusLines.length > 1) return { status: 'unclear', statusReason: 'duplicate' };
  const [line] = statusLines;
  const language = line.text.startsWith(STATUS_VALUES.de.label) ? 'de' : 'en';
  const other = language === 'de' ? 'en' : 'de';
  // The label is followed by exactly one space and the value; only trailing whitespace is slack.
  const rest = line.text.slice(STATUS_VALUES[language].label.length).trimEnd();
  if (!/^ \S/.test(rest)) return { status: 'unclear', statusReason: 'invalid-value' };
  const value = rest.slice(1);
  if (STATUS_VALUES[language].values.has(value)) {
    return { status: STATUS_VALUES[language].values.get(value), statusReason: null };
  }
  if (STATUS_VALUES[other].values.has(value)) {
    return { status: 'unclear', statusReason: 'mixed-key-value' };
  }
  return { status: 'unclear', statusReason: 'invalid-value' };
}

function fieldValueHit(entry, language) {
  return FIELD_VALUE_MATCHERS.some(({ labels, values }) => {
    const label = labels.find((candidate) => entry.text.startsWith(candidate));
    return label !== undefined && values[language].includes(entry.text.slice(label.length).trim());
  });
}

function languageHits(outside, language) {
  const { fields, lines } = LANGUAGE_MATCHERS[language];
  return outside.some(
    (entry) =>
      fields.some((label) => entry.text.startsWith(label)) ||
      lines.has(lineKey(entry)) ||
      fieldValueHit(entry, language),
  );
}

function classifyLanguage(outside) {
  const de = languageHits(outside, 'de');
  const en = languageHits(outside, 'en');
  if (de && en) return 'mixed';
  if (de) return 'de';
  if (en) return 'en';
  return 'unknown';
}

// Every non-blank line counts as one entry — including lines inside a fence, which fails closed —
// except the canonical empty item. No section at all yields null.
function countOpenPoints(inventory) {
  const found = sections(inventory, OPEN_POINTS_HEADINGS);
  if (found.length === 0) return null;
  let count = 0;
  for (const body of found) {
    for (const entry of body) {
      const trimmed = entry.text.trim();
      if (trimmed === '' || EMPTY_OPEN_POINTS.has(trimmed)) continue;
      count += 1;
    }
  }
  return count;
}

// The [start, end) ranges of the inline code spans on one line, backticks included. A backtick
// run opens a span that the next run of the same length closes; an unmatched run is literal text.
function codeSpanRanges(text) {
  const runs = [...text.matchAll(/`+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const ranges = [];
  for (let index = 0; index < runs.length; index += 1) {
    const length = runs[index].end - runs[index].start;
    const close = runs.findIndex((run, cursor) => cursor > index && run.end - run.start === length);
    if (close === -1) continue;
    ranges.push({ start: runs[index].start, end: runs[close].end });
    index = close;
  }
  return ranges;
}

// Removes every placeholder token outside inline code spans; a quoted token stays content.
function stripPlaceholders(text) {
  const spans = codeSpanRanges(text);
  const strip = (segment) => {
    let result = segment;
    for (const token of [...BRACKET_PLACEHOLDERS, ...VALUE_PLACEHOLDERS]) {
      result = result.split(token).join('');
    }
    return result;
  };
  let result = '';
  let cursor = 0;
  for (const span of spans) {
    result += strip(text.slice(cursor, span.start)) + text.slice(span.start, span.end);
    cursor = span.end;
  }
  return result + strip(text.slice(cursor));
}

function classifyAcceptanceCriteria(inventory) {
  const found = sections(inventory, ACCEPTANCE_HEADINGS);
  if (found.length === 0) return 'missing';
  for (const body of found) {
    for (const entry of body) {
      if (entry.inFence || headingLevel(entry) !== null) continue;
      const content = entry.text
        .trim()
        .replace(/^(?:[-*+]|\d+[.)])(?:\s+|$)/, '')
        .replace(/^\[[ xX]\](?:\s+|$)/, '');
      if (stripPlaceholders(content).trim() !== '') return 'present';
    }
  }
  return 'empty';
}

function findPlaceholders(outside) {
  const hits = [];
  for (const entry of outside) {
    const spans = codeSpanRanges(entry.text);
    const quoted = (start, end) => spans.some((span) => start < span.end && end > span.start);
    for (const token of BRACKET_PLACEHOLDERS) {
      let column = entry.text.indexOf(token);
      while (column !== -1) {
        if (!quoted(column, column + token.length)) {
          hits.push({ token, line: entry.number, column });
        }
        column = entry.text.indexOf(token, column + token.length);
      }
    }
    const label = REVIEW_RESULT_LABELS.find((candidate) => entry.text.startsWith(candidate));
    if (label) {
      const value = entry.text.slice(label.length).trim();
      if (VALUE_PLACEHOLDERS.includes(value)) {
        hits.push({ token: value, line: entry.number, column: label.length });
      }
    }
  }
  hits.sort((left, right) => left.line - right.line || left.column - right.column);
  return hits.map(({ token, line }) => ({ token, line }));
}

function headerField(outside, row) {
  const labels = [fieldParts(row.de[0]).label, fieldParts(row.en[0]).label];
  for (const entry of outside) {
    const label = labels.find((candidate) => entry.text.startsWith(candidate));
    if (label) {
      const value = entry.text.slice(label.length).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

function extractTitle(outside) {
  for (const entry of outside) {
    const match = entry.text.match(/^ {0,3}#[ \t]+(.*)$/);
    if (match) {
      const title = match[1].trim();
      return title === '' ? null : title;
    }
  }
  return null;
}

// Classifies one plan text. Pure: the result depends on the text only, so a CRLF or BOM file
// classifies exactly as its LF twin.
export function classifyPlanText(text) {
  const inventory = inventoryLines(text);
  const outside = inventory.filter((entry) => !entry.inFence);
  const { status, statusReason } = classifyStatus(outside);
  return {
    status,
    statusReason,
    language: classifyLanguage(outside),
    openPoints: countOpenPoints(inventory),
    acceptanceCriteria: classifyAcceptanceCriteria(inventory),
    placeholders: findPlaceholders(outside),
    title: extractTitle(outside),
    workflow: headerField(outside, HEADER_FIELD_LABELS.workflow),
    docCategory: headerField(outside, HEADER_FIELD_LABELS.docCategory),
    targetPath: headerField(outside, HEADER_FIELD_LABELS.targetPath),
  };
}

// ---------------------------------------------------------------------------------------------
// Payload validation and path containment

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function hasParentSegment(value) {
  return toPosix(value)
    .split('/')
    .some((segment) => segment === '..');
}

function isInside(root, candidate) {
  return (
    candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
  );
}

function validatePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_PAYLOAD', 'the lint input must be a JSON object');
  }
  const unknown = Object.keys(input).filter((key) => !PAYLOAD_KEYS.includes(key));
  if (unknown.length > 0) fail('INVALID_PAYLOAD', `unknown input keys: ${unknown.join(', ')}`);
  if (typeof input.cwd !== 'string' || input.cwd === '') {
    fail('INVALID_PAYLOAD', 'cwd must be a non-empty string');
  }
  if (typeof input.planDir !== 'string' || input.planDir === '') {
    fail('INVALID_PAYLOAD', 'planDir must be a non-empty string');
  }
  if (input.files !== undefined) {
    if (
      !Array.isArray(input.files) ||
      input.files.some((entry) => typeof entry !== 'string' || entry === '')
    ) {
      fail('INVALID_PAYLOAD', 'files must be an array of non-empty strings');
    }
  }
  // A NUL byte is no valid path on any supported platform; name the field, never echo the value.
  for (const key of ['cwd', 'planDir']) {
    if (input[key].includes('\0')) fail('INVALID_PAYLOAD', `${key} must not contain a NUL byte`);
  }
  const nul = (input.files ?? []).findIndex((entry) => entry.includes('\0'));
  if (nul !== -1) fail('INVALID_PAYLOAD', `files entry ${nul} must not contain a NUL byte`);
}

function statOrNull(fs, target, { follow = true } = {}) {
  try {
    return follow ? fs.statSync(target) : fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

// The lstat of a path, or the error code that made it unavailable.
function lstatOrCode(fs, target) {
  try {
    return { stat: fs.lstatSync(target), code: null };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code))
      return { stat: null, code: error.code };
    throw error;
  }
}

// Resolves an existing planDir entry or ancestor, possibly a symlink, to its real directory
// inside cwd.
function realPlanDir(fs, target, cwdReal, subject) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) {
      fail('NOT_FOUND', `${subject} is a symbolic link that does not resolve`);
    }
    throw error;
  }
  if (!stat.isDirectory()) fail('NOT_FOUND', `${subject} is not a directory`);
  const real = fs.realpathSync(target);
  if (!isInside(cwdReal, real)) fail('UNSAFE_PATH', 'planDir escapes cwd');
  return real;
}

// Only a planDir that is truly absent lints as empty. A dangling link, a non-directory ancestor,
// or an ancestor link that escapes cwd fails instead of passing as "no plans".
function missingPlanDir(fs, planDirAbs, cwdReal) {
  let ancestor = path.dirname(planDirAbs);
  while (isInside(cwdReal, ancestor) && ancestor !== cwdReal) {
    const { stat } = lstatOrCode(fs, ancestor);
    if (stat) break;
    ancestor = path.dirname(ancestor);
  }
  if (ancestor !== cwdReal) realPlanDir(fs, ancestor, cwdReal, 'a planDir ancestor');
  return null;
}

function resolveRoots(input, fs) {
  if (!path.isAbsolute(input.cwd)) fail('INVALID_CWD', 'cwd must be an absolute path');
  const cwdStat = statOrNull(fs, input.cwd);
  if (!cwdStat || !cwdStat.isDirectory()) fail('INVALID_CWD', 'cwd is not an existing directory');
  const cwdReal = fs.realpathSync(input.cwd);

  if (path.isAbsolute(input.planDir) || path.win32.isAbsolute(input.planDir)) {
    fail('UNSAFE_PATH', 'planDir must be relative to cwd');
  }
  if (hasParentSegment(input.planDir)) fail('UNSAFE_PATH', 'planDir must not contain ".."');
  const planDirPosix = path.posix.normalize(toPosix(input.planDir)).replace(/\/+$/, '') || '.';
  const planDirAbs = path.resolve(cwdReal, planDirPosix);

  const { stat: planLstat, code: planCode } = lstatOrCode(fs, planDirAbs);
  if (planCode === 'ENOTDIR') fail('NOT_FOUND', 'a planDir ancestor is not a directory');
  if (planCode === 'ELOOP') fail('NOT_FOUND', 'planDir is a symbolic link loop');
  const planDirReal = planLstat
    ? realPlanDir(fs, planDirAbs, cwdReal, 'planDir')
    : missingPlanDir(fs, planDirAbs, cwdReal);

  let archiveReal = null;
  if (planDirReal) {
    const archiveAbs = path.join(planDirReal, 'archive');
    const archiveStat = statOrNull(fs, archiveAbs);
    if (archiveStat?.isDirectory()) {
      const real = fs.realpathSync(archiveAbs);
      if (isInside(cwdReal, real)) archiveReal = real;
    }
  }
  return { cwdReal, planDirPosix, planDirReal, archiveReal };
}

function regularFileExists(fs, target) {
  const stat = statOrNull(fs, target, { follow: false });
  return Boolean(stat?.isFile());
}

// Resolves one caller-supplied `files` entry to its location and real path, or fails closed.
function resolveFileEntry(entry, roots, fs) {
  if (path.isAbsolute(entry) || path.win32.isAbsolute(entry)) {
    fail('UNSAFE_PATH', `files entry must be relative to cwd: ${entry}`);
  }
  if (hasParentSegment(entry)) fail('UNSAFE_PATH', `files entry must not contain "..": ${entry}`);
  const posix = path.posix.normalize(toPosix(entry));
  if (!posix.endsWith('.md')) fail('UNSAFE_PATH', `files entry is not a Markdown file: ${entry}`);
  const directory = path.posix.dirname(posix);
  const archiveDir = path.posix.join(roots.planDirPosix, 'archive');
  const location =
    directory === path.posix.normalize(roots.planDirPosix)
      ? 'top'
      : directory === archiveDir
        ? 'archive'
        : null;
  if (!location) {
    fail('UNSAFE_PATH', `files entry is not directly in planDir or its archive: ${entry}`);
  }
  const absolute = path.resolve(roots.cwdReal, posix);
  const stat = statOrNull(fs, absolute);
  if (!stat) fail('NOT_FOUND', `files entry does not exist: ${entry}`);
  // The target's identity is fixed here and re-checked on the descriptor that reads it.
  const real = fs.realpathSync(absolute);
  const expectedDir = location === 'top' ? roots.planDirReal : roots.archiveReal;
  if (
    !expectedDir ||
    !isInside(roots.cwdReal, real) ||
    path.dirname(real) !== expectedDir ||
    !real.endsWith('.md')
  ) {
    fail('UNSAFE_PATH', `files entry escapes its plan directory: ${entry}`);
  }
  if (!stat.isFile()) fail('UNSAFE_PATH', `files entry is not a regular file: ${entry}`);
  return { path: posix, real, location, name: path.posix.basename(posix), identity: stat };
}

// Every top-level `*.md` regular file (no symlink) in name order, with its identity at listing.
function listTopLevel(roots, fs) {
  if (!roots.planDirReal) return [];
  const files = [];
  const names = fs
    .readdirSync(roots.planDirReal)
    .filter((name) => name.endsWith('.md'))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  for (const name of names) {
    const real = path.join(roots.planDirReal, name);
    const identity = statOrNull(fs, real, { follow: false });
    if (!identity?.isFile()) continue;
    files.push({
      path: path.posix.join(roots.planDirPosix, name),
      real,
      location: 'top',
      name,
      identity,
    });
  }
  return files;
}

const READ_FLAGS =
  nodeFs.constants.O_RDONLY |
  (nodeFs.constants.O_NOFOLLOW ?? 0) |
  (nodeFs.constants.O_NONBLOCK ?? 0);

// Reads a plan through one descriptor that is proven to be the regular file the containment check
// saw: no symlink at the last component, same device and inode, so a swap in between fails closed.
function readPlanFile(file, fs) {
  let descriptor;
  try {
    descriptor = fs.openSync(file.real, READ_FLAGS);
  } catch (error) {
    if (error.code === 'ENOENT') fail('NOT_FOUND', `plan file disappeared: ${file.path}`);
    if (['ELOOP', 'EMLINK', 'ENOTDIR'].includes(error.code)) {
      fail('UNSAFE_PATH', `plan file changed after its containment check: ${file.path}`);
    }
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.dev !== file.identity.dev || stat.ino !== file.identity.ino) {
      fail('UNSAFE_PATH', `plan file changed after its containment check: ${file.path}`);
    }
    return fs.readFileSync(descriptor, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
}

function duplicatesFor(file, roots, fs) {
  if (file.location === 'top') {
    if (!roots.archiveReal) return [];
    return regularFileExists(fs, path.join(roots.archiveReal, file.name))
      ? [path.posix.join(roots.planDirPosix, 'archive', file.name)]
      : [];
  }
  return roots.planDirReal && regularFileExists(fs, path.join(roots.planDirReal, file.name))
    ? [path.posix.join(roots.planDirPosix, file.name)]
    : [];
}

// Lints the plan directory named by the payload. Synchronous and read-only; `fs` is injectable.
export function lintPlans(input, { fs = nodeFs } = {}) {
  validatePayload(input);
  const roots = resolveRoots(input, fs);
  const targets =
    input.files === undefined
      ? listTopLevel(roots, fs)
      : input.files.map((entry) => resolveFileEntry(entry, roots, fs));
  const files = targets.map((file) => {
    const classification = classifyPlanText(readPlanFile(file, fs));
    return {
      path: file.path,
      status: classification.status,
      statusReason: classification.statusReason,
      language: classification.language,
      openPoints: classification.openPoints,
      acceptanceCriteria: classification.acceptanceCriteria,
      placeholders: classification.placeholders,
      duplicates: duplicatesFor(file, roots, fs),
      title: classification.title,
      workflow: classification.workflow,
      docCategory: classification.docCategory,
      targetPath: classification.targetPath,
    };
  });
  return { files };
}

// ---------------------------------------------------------------------------------------------
// Envelope

export function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!PLAN_LINT_OPERATIONS.includes(operation)) {
      fail('INVALID_PAYLOAD', `unknown operation: ${operation}`);
    }
    return { ok: true, operation, data: lintPlans(input, deps) };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof PlanLintError
      ? error
      : new PlanLintError('INTERNAL', error?.message ?? 'unexpected plan-lint failure');
  return {
    ok: false,
    operation: PLAN_LINT_OPERATIONS.includes(operation) ? operation : null,
    error: { code: normalized.code, message: normalized.message },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
