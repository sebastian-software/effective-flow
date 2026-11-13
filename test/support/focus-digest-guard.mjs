// Shared test support: the pure decision logic of the focus digest guard. It turns the two T3
// observed gate-row states, the seven actual focus digests and the tracked digest file into one
// verdict and message, so every failure branch is testable without a build. This module declares
// no test.
import { createHash } from 'node:crypto';

export const FOCUS_DIGEST_FILE = 'test/fixtures/focus-digests.sha256';

// Digests are over exact bytes and assume LF checkouts (CI runs on Linux); a CRLF checkout differs.
// The four focus sources, then the three built portable focus files. Labels are paths relative to
// the repository root after `node build.mjs`, so `sha256sum -c` can check the file there.
export const FOCUS_SOURCE_PATHS = Object.freeze([
  'src/tools/focus.md',
  'src/shared/focus-session-contract.md',
  'src/shared/focus-follow-up.md',
  'src/shared/retro-native-sources.md',
]);
export const FOCUS_BUILT_PATHS = Object.freeze([
  'dist/portable/effective-flow/tools/focus.md',
  'dist/portable/effective-flow/shared/focus-follow-up.md',
  'dist/portable/effective-flow/shared/retro-native-sources.md',
]);
export const FOCUS_DIGEST_PATHS = Object.freeze([...FOCUS_SOURCE_PATHS, ...FOCUS_BUILT_PATHS]);

export const REPORT_ONLY_ROW = 'T3 observed, report-only';
export const FOLLOW_UP_ROW = 'T3 observed follow-up (schedule_task, T3/Codex)';

const GATE_HEADING = '## Current qualification gate';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Reads each gate-row state from the contract's gate section by exact first-cell match:
// 'disabled' when the second cell starts with `Disabled`, 'enabled' otherwise, 'missing' when no
// row carries that exact first cell.
export function gateRowStates(contract) {
  const start = contract.indexOf(GATE_HEADING);
  const section = start === -1 ? '' : contract.slice(start).split(/\n## /)[0];
  const cells = new Map();
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const [, first, second] = line.split('|').map((cell) => cell.trim());
    if (first !== undefined && second !== undefined && !cells.has(first)) cells.set(first, second);
  }
  const state = (name) =>
    !cells.has(name) ? 'missing' : cells.get(name).startsWith('Disabled') ? 'disabled' : 'enabled';
  return { reportOnly: state(REPORT_ONLY_ROW), followUp: state(FOLLOW_UP_ROW) };
}

// The digest file's exact format: one `<sha256>  <path>` line per entry in FOCUS_DIGEST_PATHS
// order, newline-terminated (the format `sha256sum` writes and `sha256sum -c` reads).
export function formatDigests(digests) {
  return FOCUS_DIGEST_PATHS.map((path) => `${digests[path]}  ${path}\n`).join('');
}

// Returns the entries keyed by path, or null when the text is not exactly that format.
export function parseDigests(text) {
  const lines = text.split('\n');
  if (lines.pop() !== '' || lines.length !== FOCUS_DIGEST_PATHS.length) return null;
  const digests = {};
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^([0-9a-f]{64}) {2}(\S+)$/);
    if (!match || match[2] !== FOCUS_DIGEST_PATHS[index]) return null;
    digests[match[2]] = match[1];
  }
  return digests;
}

const ADR_STRICT_PATHS = [
  '(1) bring a passing record on the focus host acceptance page for a candidate whose seven digests equal this merge head, and update the digest file;',
  '(2) return both T3 observed gate rows to `Disabled` in src/shared/focus-session-contract.md.',
];
const NONBEHAVIORAL_PATH =
  '(3) document the difference as demonstrably nonbehavioral on the focus host acceptance page (record relied on, changed files, cause) and update the digest file in the same pull request.';

function failure(verdict, lines, actual) {
  const output = actual
    ? ['', `Actual digests (copy into ${FOCUS_DIGEST_FILE}):`, formatDigests(actual)]
    : [];
  return { pass: false, verdict, message: [...lines, ...output].join('\n') };
}

// rows: gateRowStates() result; actual: digests keyed by FOCUS_DIGEST_PATHS; expectedText: the
// digest file's text, or null when the file is missing.
export function decideFocusDigestGuard({ rows, actual, expectedText }) {
  const missing = [
    [REPORT_ONLY_ROW, rows.reportOnly],
    [FOLLOW_UP_ROW, rows.followUp],
  ].filter(([, state]) => state === 'missing');
  if (missing.length > 0) {
    return failure('missing-row', [
      `Focus digest guard: gate row missing or renamed: ${missing.map(([name]) => `"${name}"`).join(', ')}. The guard fails closed until both rows exist with their exact first cell.`,
    ]);
  }
  const disabled = [rows.reportOnly, rows.followUp].filter((state) => state === 'disabled').length;
  if (disabled === 2) {
    return { pass: true, verdict: 'inert', message: 'Both T3 observed gate rows are disabled.' };
  }
  if (disabled === 1) {
    const which = rows.reportOnly === 'disabled' ? REPORT_ONLY_ROW : FOLLOW_UP_ROW;
    return failure('one-disabled', [
      `Focus digest guard: only "${which}" is disabled. Both T3 observed rows are enabled or disabled together; disable both or enable both under a passing candidate record.`,
    ]);
  }
  if (expectedText === null) {
    return failure(
      'missing-digest-file',
      [
        `Focus digest guard: ${FOCUS_DIGEST_FILE} is missing while the T3 observed rows are enabled.`,
      ],
      actual,
    );
  }
  const expected = parseDigests(expectedText);
  if (expected === null) {
    return failure(
      'invalid-digest-file',
      [`Focus digest guard: ${FOCUS_DIGEST_FILE} does not hold exactly the seven focus digests.`],
      actual,
    );
  }
  const changed = FOCUS_DIGEST_PATHS.filter((path) => actual[path] !== expected[path]);
  if (changed.length === 0) {
    return { pass: true, verdict: 'match', message: 'All seven focus digests match.' };
  }
  const sourceChanged = changed.some((path) => FOCUS_SOURCE_PATHS.includes(path));
  const head = `Focus digest guard: enabled T3 observed rows, but these focus digests differ from ${FOCUS_DIGEST_FILE}: ${changed.join(', ')}.`;
  if (sourceChanged) {
    return failure(
      'source-mismatch',
      [head, 'A focus-source change is never exempt. Before merging, either:', ...ADR_STRICT_PATHS],
      actual,
    );
  }
  return failure(
    'built-mismatch',
    [
      head,
      'Only built focus files changed. Before merging, either:',
      ...ADR_STRICT_PATHS,
      NONBEHAVIORAL_PATH,
    ],
    actual,
  );
}
