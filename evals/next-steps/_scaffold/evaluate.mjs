// Outcomes are judged from actual invocation-block options, never token mentions in narrative.
import {
  mutatingTrackerOperations,
  pureLocalTrackerOperations,
  RUNTIME_STATE_TRACKER_OPERATIONS,
} from '../../_scaffold/evaluate.mjs';
import { isAbsolute, resolve } from 'node:path';
import { parseReference } from '../../../src/scripts/remote-tracker-shared-core.mjs';
import { parseReportChannel } from '../../iterate/_scaffold/evaluate.mjs';
import { parseState, stateFindings } from './state.mjs';
const PLAN = 'docs/plan/2026-10-08-packages.md';
const ARCHIVE = 'docs/plan/archive/2026-10-08-packages.md';
export const EXPECTATIONS = Object.freeze({
  'q2a-canonical-record-lags-merged': {
    first: 'plan-issue #37',
    optionTokens: ['Q2a', 'Q2b'],
    exactCount: 1,
  },
  'active-local-next-ready-slice': {
    first: `docs docs/plan/2026-10-08-parser-docs.md`,
    exactCount: 1,
  },
  'implemented-archive-needs-reconciliation': {
    first: `plan ${ARCHIVE}`,
    exactCount: 1,
  },
  'missing-association-valid-fallback': {
    first: 'merge-gate 42',
  },
  'unreadable-associated-plan-fallback': {
    first: 'merge-gate 42',
  },
  'ambiguous-associated-plans-fallback': {
    first: 'merge-gate 42',
    second: ['iterate 42'],
  },
  'approval-and-dependency-block-execution': {
    first: `plan ${PLAN}`,
    reportTokens: ['Q0'],
    exactCount: 1,
  },
  'current-pr-delivery-leads-next-slice': {
    first: 'merge-gate 42',
    exactCount: 1,
  },
  'actual-postmerge-reconciliation-reentry': {
    first: 'merge-gate 42',
    exactCount: 1,
  },
  'cross-repository-context-cannot-switch': {
    first: null,
    reportIdentity: 'other/renovate-config',
  },
  'external-issue-identity-retained': { first: 'plan-issue OPS-17', exactCount: 1 },
});
export const BRANCHED_SCENARIOS = Object.freeze(Object.keys(EXPECTATIONS));
export const usesLifecycleSchema = () => false;
export const permitsEmptyCallLog = () => true;
export const validityProblems = () => [];
const TRUSTED_PROJECT_ROOT = Symbol('validated report project root');
export function parseAuxiliary(text, projectRoot) {
  const parsed = parseReportChannel(text);
  if (parsed.problems.length === 0 && typeof projectRoot === 'string' && isAbsolute(projectRoot)) {
    for (const record of parsed.records) record[TRUSTED_PROJECT_ROOT] = resolve(projectRoot);
  }
  return parsed;
}
// Slots may already be deleted during verification. Only the host's exact root, plus the explicit
// macOS temporary-directory alias, establishes artifact identity; never guess from a basename.
function normalizedInvocation(invocation, projectRoot, expectedInvocation) {
  if (!projectRoot || !expectedInvocation) return invocation;
  const separator = expectedInvocation.indexOf(' ');
  const tool = expectedInvocation.slice(0, separator);
  const artifact = expectedInvocation.slice(separator + 1);
  if (!artifact.startsWith('docs/plan/')) return invocation;
  const roots = [projectRoot];
  if (projectRoot.startsWith('/private/tmp/')) roots.push(projectRoot.slice('/private'.length));
  else if (projectRoot.startsWith('/tmp/')) roots.push(`/private${projectRoot}`);
  return roots.some((root) => invocation === `${tool} ${root}/${artifact}`)
    ? expectedInvocation
    : invocation;
}
// Reference spellings are equivalent only for the same expected entity in its owning repository.
// External tool identifiers never pass through the forge parser.
function normalizedReferenceInvocation(invocation, expectedInvocation, repository) {
  if (!expectedInvocation) return invocation;
  const [tool, ...arguments_] = invocation.split(' ');
  const [expectedTool, ...expectedArguments] = expectedInvocation.split(' ');
  if (tool !== expectedTool) return invocation;
  const kind = ['merge-gate', 'iterate', 'review'].includes(tool)
    ? 'pull-request'
    : tool === 'plan-issue' && /^#?\d+$/.test(expectedArguments.join(' '))
      ? 'issue'
      : null;
  if (!kind) return invocation;
  try {
    const expected = parseReference(expectedArguments.join(' '), {
      expectedKind: kind,
      repository,
    });
    const actual = parseReference(arguments_.join(' '), { expectedKind: kind, repository });
    // A URL needs a supplied owning repository; a retained URL alone cannot establish context.
    if (!repository && actual.repository) return invocation;
    return actual.number === expected.number ? expectedInvocation : invocation;
  } catch {
    return invocation;
  }
}
export const parseSealedEvidence = parseState;
export function writeFindings(records) {
  const mutations = mutatingTrackerOperations();
  const forbidden = new Set([...mutations, 'pr-merge', ...RUNTIME_STATE_TRACKER_OPERATIONS]);
  return records
    .filter((record) => record.event !== 'complete' && forbidden.has(record.operation))
    .map((record) => `recommendation attempted tracker/runtime operation ${record.operation}`);
}
export function decisiveCalls({ records }) {
  const pure = pureLocalTrackerOperations();
  return records.filter((record) => record.event !== 'complete' && !pure.has(record.operation));
}
// Locate the final contiguous invocation block under its immediate heading; list markers are optional.
// Narrative command tokens and quoted examples cannot supply a recommendation block.
export function recommendationBlock(text) {
  const lines = text
    .trimEnd()
    .split('\n')
    .filter((line) => line.trim());
  let fenced = false;
  const matches = lines.map((line) => {
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      return null;
    }
    if (fenced) return null;
    return line.match(
      /^\s*(?:(?:[-*]|\d+[.)])\s+)?`?(?:\/|\$)?effective-flow\s+([^`]+?)`?\s+—\s+(.+?)\s*$/,
    );
  });
  const heading = (line) => {
    const value = line?.trim();
    if (!value || /\beffective-flow\b/i.test(value)) return null;
    const marked = value.match(/^(?:#{1,6}\s+(.+?)|\*\*(.+?)\*\*:?)$/);
    if (marked) return marked[1] ?? marked[2];
    // A short standalone label can be a heading without Markdown; a narrative sentence cannot.
    return /^[\p{L}\p{N}][\p{L}\p{N}\s:–—-]{0,79}$/u.test(value) && value.split(/\s+/).length <= 8
      ? value
      : null;
  };
  let start = lines.length - 1;
  while (start >= 0 && matches[start]) start -= 1;
  const findings = [];
  const title = heading(lines[start]);
  if (start === lines.length - 1 || !title)
    return {
      options: [],
      findings: [
        'the final recommendation block contains a non-option line or lacks an immediate heading',
      ],
    };
  for (let index = 0; index < start; index += 1) {
    if (heading(lines[index]) && matches[index + 1]) {
      findings.push('the report contains multiple recommendation blocks');
      break;
    }
  }
  const options = matches.slice(start + 1).map((match) => ({
    invocation: match[1].trim().replace(/\s+/g, ' '),
    description: match[2],
  }));
  if (options.length < 1 || options.length > 2)
    findings.push('the block must carry one or two options');
  if (new Set(options.map((option) => option.invocation)).size !== options.length)
    findings.push('the options are duplicated');
  for (const option of options) {
    if (option.description.split(/\s+/).length > 16)
      findings.push('an option description exceeds the concise one-line bound');
  }
  return { options, findings };
}
// These completed-run cases grant no E/Q2b/Q2c execution authority. Check explicit instructions
// throughout the bounded report, excluding quoted data and locally negated instructions.
function operationalInstructionFindings(report) {
  let fenced = false;
  for (const line of report.split('\n')) {
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*>/.test(line)) continue;
    const unquoted = line
      .replace(/`([^`]*)`/g, (_, text) => (/^(?:E|Q2b|Q2c)$/.test(text) ? text : ''))
      .replace(/„[^“]*“|“[^”]*”|"[^"\n]*"/g, '');
    for (const clause of unquoted.split(/[.!?;]|,\s*(?:aber|jedoch|but|und|and)\s+/i)) {
      const instructions = [
        /\b(?:aktiviere|aktivieren|starte|starten|execute|activate|start)\s+(?:jetzt\s+|now\s+)?(?:E|Q2b|Q2c)\b(?:\s+(?:jetzt|now))?/gi,
        /\b(?:E|Q2b|Q2c)\s+(?:jetzt\s+|now\s+)?(?:aktivieren|starten|ausführen|activate|execute|start)\b/gi,
      ];
      for (const pattern of instructions) {
        for (const match of clause.matchAll(pattern)) {
          const before = clause.slice(0, match.index);
          const after = clause.slice(match.index + match[0].length);
          if (/\b(?:nicht|nie|niemals|keinesfalls|not|never)\s*$/i.test(before)) continue;
          if (/^\s*(?:nicht|nie|niemals|keinesfalls|not|never)\b/i.test(after)) continue;
          if (
            /^\s*(?:ist|sind|is|are)\s+(?:noch\s+)?(?:nicht|not)\s+(?:freigegeben|autorisiert|erlaubt|zulässig|approved|authorized|allowed)\b/i.test(
              after,
            )
          )
            continue;
          return ['the final report implies operational activation'];
        }
      }
    }
  }
  return [];
}
export function reportFindings(scenario, auxiliaryRecords, fixture) {
  const expected = EXPECTATIONS[scenario];
  if (!expected) throw new Error(`no oracle for ${scenario}`);
  if (auxiliaryRecords.length !== 1)
    return [`expected exactly one complete final report, found ${auxiliaryRecords.length}`];
  const record = auxiliaryRecords[0];
  if (record.truncated || record.malformed)
    return ['a truncated or malformed report cannot prove recommendation semantics'];
  const report = record.text;
  const operationalFindings = operationalInstructionFindings(report);
  if (expected.first === null) {
    const failures = [...operationalFindings];
    if (recommendationBlock(report).options.length > 0)
      failures.push('no valid invocation exists in the current repository context');
    if (!report.includes(expected.reportIdentity))
      failures.push('the report must preserve the owning repository identity');
    return failures;
  }
  const block = recommendationBlock(report);
  const findings = [...block.findings, ...operationalFindings];
  for (const option of block.options) {
    option.invocation = normalizedInvocation(
      option.invocation,
      record[TRUSTED_PROJECT_ROOT],
      expected.first,
    );
    for (const candidate of [expected.first, ...(expected.second ?? [])]) {
      option.invocation = normalizedReferenceInvocation(
        option.invocation,
        candidate,
        fixture?.repository,
      );
    }
  }
  if (block.options[0]?.invocation !== expected.first)
    findings.push(`first option must be effective-flow ${expected.first}`);
  for (const option of block.options.slice(1)) {
    if (!(expected.second ?? []).includes(option.invocation))
      findings.push(`unsupported second option ${option.invocation}`);
  }
  if (expected.exactCount && block.options.length !== expected.exactCount)
    findings.push(`expected ${expected.exactCount} independently applicable option(s)`);
  const descriptions = block.options.map((option) => option.description).join(' ');
  for (const token of expected.optionTokens ?? []) {
    if (!new RegExp(`\\b${token}\\b`).test(descriptions))
      findings.push(`the option descriptions omit package token ${token}`);
  }
  for (const token of expected.reportTokens ?? []) {
    if (!new RegExp(`\\b${token}\\b`).test(report))
      findings.push(`the complete report omits prerequisite token ${token}`);
  }
  // Already retained complete issue reads must not be repeated. These snapshots reach no canonical
  // decomposition, so the production decomposition helper need not be replaced or reimplemented.
  return findings;
}
export function findings({ scenario, records, fixture, auxiliaryRecords, sealedEvidence }) {
  const result = [
    ...reportFindings(scenario, auxiliaryRecords, fixture),
    ...writeFindings(records),
    ...stateFindings(sealedEvidence),
  ];
  const pure = pureLocalTrackerOperations();
  for (const record of records) {
    if (record.event !== 'complete' && !pure.has(record.operation))
      result.push(`completed-run reporting does not authorize tracker access: ${record.operation}`);
  }
  for (const operation of ['issue-read', 'issue-comments-read']) {
    if (records.some((record) => record.operation === operation))
      result.push(`completed-run snapshot did not authorize another ${operation}`);
  }
  return result;
}
export function decisiveFindings(input) {
  return input.auxiliaryRecords.length
    ? findings(input)
    : [...writeFindings(input.records), ...stateFindings(input.sealedEvidence)];
}
