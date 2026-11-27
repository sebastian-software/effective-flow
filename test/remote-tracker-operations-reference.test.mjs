// The operation reference `src/shared/remote-tracker-operations.md` is a hand-written table with no
// generator, so these tests tie it to the helper: the operation set, order and class come from the
// core exports and the `localOperation` case labels, and every row's top-level required keys are
// probed against the real validators (an omission probe on GitHub, a positive check on GitHub and
// Forgejo, and a positive check without each documented optional key a fixture carries). Optional
// keys no fixture carries, result fields, nested schemas of `structured` rows and a Forgejo-only
// addition the code no longer requires stay hand-curated and are not machine-checked.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { after, test } from 'node:test';

import {
  LOCAL_WRITE_OPERATIONS,
  MUTATION_OPERATIONS,
  REMOTE_TRACKER_OPERATIONS,
  executeOperation,
} from '../src/scripts/remote-tracker-core.mjs';

const FRAGMENT = 'src/shared/remote-tracker-operations.md';
const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const CLASSES = ['forge read', 'forge mutation', 'local', 'local write'];
const VALIDATION_CODES = ['INVALID_PAYLOAD', 'INVALID_REFERENCE'];
const GITHUB = { host: 'github.com', owner: 'o', repository: 'r', provider: 'github' };
const FORGEJO = {
  host: 'code.example.test',
  owner: 'o',
  repository: 'r',
  provider: 'forgejo',
  login: 'l',
};
const LEDGER_REPOSITORY = { host: 'github.com', owner: 'o', repository: 'r' };
// The capabilities the helper checks with `=== true` on Forgejo.
const ALL_FORGEJO_CAPABILITIES = {
  reviewThreadReplies: true,
  reviewThreadResolution: true,
  pullRequestDraftCreate: true,
};
// A conditional key cell names a capability; this is the only condition form the grammar admits.
const CONDITION_VALUES = {
  conditionalWrites: { executable: 'gh', capabilities: { conditionalWrites: true } },
};
const CONDITIONAL_KEY_VALUES = { expectedVersion: 'v1' };
const COMMON_KEYS = ['cwd'];

// Forge reads that return `ok: true` with no runner call, because the `repository` override and
// `skipProbe` leave them nothing to run.
const ZERO_RUNNER_READS = ['repository-resolve', 'probe'];
// Local operations that may return a non-validation failure under the sentinel runner.
const LOCAL_FAILURE_CODES = { 'merge-proof-local': ['COMMAND_FAILED'] };
// Operations that read `input.X ?? input` with a multi-field schema: the container key is listed.
const STRUCTURED_ROWS = {
  'finding-build': 'finding',
  'follow-up-admission-build': 'receipt',
  'epic-build': 'epic',
  'decomposition-records-build': 'decomposition',
  'decomposition-key-build': 'decomposition',
  'decomposition-key-parse': 'context',
  'decomposition-container-compare': 'container',
  'decomposition-child-workflow-parse': 'workflow',
  'marker-patch': 'patch',
  'checklist-patch': 'patch',
  'issue-lifecycle-receipt-build': 'receipt',
  'issue-lifecycle-receipt-parse': 'context',
};
const STATIC_FORGEJO_UNSUPPORTED = [
  'issue-sub-issue-create',
  'issue-sub-issues-read',
  'review-create',
];
const FORGEJO_CAPABILITY_GATED = {
  'review-thread-reply': 'reviewThreadReplies',
  'review-thread-resolve': 'reviewThreadResolution',
};
// Forgejo-only additions to the minimal payload, each of which the row's Notes must state in the
// fixed form `Forgejo: \`<key>\`` or `Forgejo: \`<key>\` <type>`.
const FORGEJO_ADDITIONS = {
  'pr-mark-ready': {
    notes: ['payload.title'],
    apply(input) {
      input.payload = { ...input.payload, title: 'x' };
    },
  },
  'review-thread-resolve': {
    notes: ['threadId integer'],
    apply(input) {
      input.threadId = 7;
    },
  },
};

// The validator `details.field` is mapped to the documented key path or group member it stands
// for. Only the field a validator names appears here; no message pattern is kept.
const FIELD_ALIASES = {
  '*': { 'issue number': 'number', 'pull-request number': 'number' },
  'label-create': { name: 'payload.name' },
  'decomposition-records-parse': { 'planning comment body': 'body' },
  'decomposition-key-parse': {
    'issue body': 'body',
    'decomposition key context.target': 'context',
  },
  'decomposition-child-workflow-parse': { 'decomposition child workflow body': 'workflow' },
};

const FINDING = {
  id: 'R-0000001',
  title: 't',
  area: 'a',
  file: 'f',
  problem: 'p',
  recommendation: 'r',
  promptSuggestion: 's',
  severity: 'Note',
  complexity: 'Low',
  action: 'effective-flow-fix',
  admission: {
    outcome: 'admitted',
    reason: 'material-harm',
    gateVersion: 'v1',
    evidenceType: 'e',
    evidenceReference: 'e',
    evidenceDigest: HASH,
    reachability: 'r',
    reachabilityAnchor: 'r',
    rootCauseSignature: 's',
    scopeAndContainment: 's',
    whyNow: 'w',
    completionCondition: 'c',
  },
};
const CLOSURE = {
  outcome: 'closed',
  reason: 'r',
  gateVersion: 'v1',
  signature: 's',
  evidenceDigest: HASH,
  reachabilityAnchor: 'a',
  date: '2026-01-01',
};
const SUPERSEDABLE = `<!-- effective-flow-follow-up-admission:v1 -->\n<!-- effective-flow-follow-up-admission-data:v1 ${JSON.stringify(CLOSURE)} -->`;
const COMMENT = { body: 'x' };
const DECOMPOSITION_REPOSITORY = {
  host: 'github.com',
  owner: 'o',
  repository: 'r',
  slug: 'o/r',
  provider: 'github',
};

// One valid input per operation, values only. Every top-level key path must be documented in the
// row (checked below), so a fixture cannot silently supply a key the row leaves out.
const FIXTURES = {
  'repository-resolve': {},
  probe: {},
  'viewer-read': {},
  'collaborator-permission-read': { login: 'octo' },
  'repository-visibility-read': {},
  'label-list': {},
  'label-create': { payload: { name: 'x' } },
  'issue-read': { number: 1 },
  'issue-state-wait': { number: 1 },
  'issue-comments-read': { number: 1 },
  'issue-list': {},
  'issue-create': { payload: { title: 'x', body: 'x' } },
  'issue-sub-issues-read': { parent: 1 },
  'issue-sub-issue-create': {
    parent: 1,
    payload: { title: 'x', body: 'x', decompositionKey: 'k' },
  },
  'issue-update-body': { number: 1, expectedBodyHash: HASH, payload: { body: 'x' } },
  'issue-close': { number: 1 },
  'issue-comment': { number: 1, payload: { body: 'x' } },
  'issue-comment-update': {
    number: 1,
    commentId: 1,
    expectedBodyHash: HASH,
    payload: { body: 'x' },
  },
  'issue-labels': { number: 1, payload: { labels: ['x'] } },
  'issue-label-add': { number: 1, payload: { labels: ['x'] } },
  'issue-label-remove': { number: 1, payload: { label: 'x' } },
  'sf-label-migrate': { issues: [{ number: 1, labels: ['sf-fix'] }] },
  'pr-read': { number: 1 },
  'pr-acceptance-sources': { number: 1, headSha: SHA },
  'issue-acceptance-criteria': { numbers: [1] },
  'pr-comments-read': { number: 1 },
  'pr-reviews-read': { number: 1 },
  'pr-list': {},
  'pr-status-read': { number: 1 },
  'pr-checks-wait': { number: 1 },
  'pr-draft-classify': { number: 1, headSha: SHA, baseRef: 'develop' },
  'pr-create': { payload: { title: 'x', body: 'x', head: 'h', base: 'b' } },
  'pr-update-body': { number: 1, expectedBodyHash: HASH, payload: { body: 'x' } },
  'pr-update-title': { number: 1, payload: { title: 'x' } },
  'pr-mark-ready': { number: 1 },
  'pr-comment': { number: 1, payload: { body: 'x' } },
  'pr-merge': { number: 1, payload: { method: 'squash', expectedHeadSha: SHA } },
  'review-create': {
    number: 1,
    payload: { body: 'x', comments: [{ path: 'a', line: 1, body: 'x', side: 'RIGHT' }] },
  },
  'review-threads-read': { number: 1 },
  'review-thread-reply': { number: 1, commentId: 1, payload: { body: 'x' } },
  'review-thread-resolve': { threadId: 'T' },
  'remote-parse': { remote: 'git@github.com:o/r.git' },
  'reference-parse': { reference: 'https://github.com/o/r/issues/1' },
  'signature-parse': { body: '' },
  'finding-build': { finding: FINDING },
  'follow-up-admission-build': { receipt: CLOSURE },
  'follow-up-admission-parse': { body: '' },
  'follow-up-admission-supersede': {
    body: SUPERSEDABLE,
    current: {
      gateVersion: 'v1',
      signature: 'other',
      evidenceDigest: HASH,
      reachabilityAnchor: 'a',
    },
  },
  'epic-build': { epic: { date: '2026-01-01', scope: 's', projectType: 'p' } },
  'planning-comment-build': { comment: COMMENT },
  'decomposition-records-build': {
    decomposition: {
      language: 'en',
      target: 'forge',
      repository: DECOMPOSITION_REPOSITORY,
      externalTool: null,
      parent: 42,
      records: [
        {
          key: 'child-01',
          title: 'T',
          workflow: 'Feature',
          body: '**Recommended workflow:** Feature\n\nDo it.',
          status: 'approved',
          issue: null,
        },
      ],
    },
  },
  'decomposition-records-parse': { body: '' },
  'decomposition-key-build': { decomposition: { target: 'forge', parent: 1, key: 'k' } },
  'decomposition-key-parse': { body: '', context: { target: 'forge' } },
  'decomposition-container-compare': {},
  'decomposition-child-workflow-parse': {
    workflow: { body: '**Recommended workflow:** Feature', language: 'en' },
  },
  'apply-comment-build': { comment: COMMENT },
  'pr-comment-build': { comment: COMMENT },
  'pr-review-comment-build': { comment: COMMENT },
  'finding-deduplicate': { existingIssues: [], findings: [] },
  'label-query-variants': { labels: [] },
  'sf-label-migration-plan': { issues: [] },
  'marker-patch': { body: '<!-- m -->\nold', patch: { marker: 'm', replacement: 'new' } },
  'checklist-patch': { body: '- [ ] #1', patch: { reference: '#1' } },
  'body-hash': { body: '' },
  'issue-lifecycle-receipt-build': {
    receipt: {
      target: 'forge',
      repository: 'o/r',
      externalTool: null,
      items: [{ issue: '#1', relationship: 'refs', container: null, containerMechanism: null }],
    },
  },
  'issue-lifecycle-receipt-parse': { body: '' },
  'thread-ledger-lookup': { repository: LEDGER_REPOSITORY, pr: 1, threads: [] },
  'thread-ledger-record': { repository: LEDGER_REPOSITORY, pr: 1, threads: ['T1'] },
  'merge-proof-local': { headSha: SHA, baseRef: 'develop' },
};

// ---- table parsing -----------------------------------------------------------------------------

const KEY_PATH = '[A-Za-z][A-Za-z0-9]*(?:\\.[A-Za-z][A-Za-z0-9]*)*';
const KEY = `\`(${KEY_PATH})\``;

function splitCells(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));
}

function parseTable(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = splitCells(line);
    if (cells[0] === 'Operation' || /^-+$/.test(cells[0])) continue;
    rows.push({ line, cells });
  }
  return rows;
}

function splitTopLevel(cell) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let index = 0; index < cell.length; index += 1) {
    const char = cell[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && cell.startsWith(', ', index)) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

// Returns items of kind key, alt, cond or array, or throws on any text outside the cell grammar.
function parseKeyCell(cell, where) {
  if (cell === '—') return [];
  return splitTopLevel(cell).map((part) => {
    let match;
    if ((match = new RegExp(`^${KEY}$`).exec(part))) return { kind: 'key', path: match[1] };
    if ((match = new RegExp(`^${KEY}((?: or ${KEY})+)$`).exec(part))) {
      const rest = [...part.matchAll(new RegExp(KEY, 'g'))].map((entry) => entry[1]);
      return { kind: 'alt', paths: rest };
    }
    if ((match = new RegExp(`^${KEY} \\(if \`([A-Za-z]+)\`\\)$`).exec(part))) {
      assert.ok(match[2] in CONDITION_VALUES, `${where}: unknown condition \`${match[2]}\``);
      return { kind: 'cond', path: match[1], capability: match[2] };
    }
    const elementKeys = '`[A-Za-z]+`(?:, `[A-Za-z]+`)*';
    if (
      (match = new RegExp(
        `^\`(${KEY_PATH})\\[\\]\` \\(each: (${elementKeys})(?:; optional (${elementKeys}))?\\)$`,
      ).exec(part))
    ) {
      const names = (text) =>
        text ? [...text.matchAll(/`([A-Za-z]+)`/g)].map((entry) => entry[1]) : [];
      return {
        kind: 'array',
        path: match[1],
        required: names(match[2]),
        optional: names(match[3]),
      };
    }
    assert.fail(`${where}: cell text outside the key-cell grammar: ${part}`);
  });
}

const fragmentSource = readFileSync(new URL(`../${FRAGMENT}`, import.meta.url), 'utf8');
const rows = parseTable(fragmentSource).map(({ cells }) => {
  const [operationCell, kind, required, optional, result, notes] = cells;
  const operation = /^`([a-z-]+)`$/.exec(operationCell)?.[1] ?? operationCell;
  return { operation, kind, required, optional, result, notes, cells };
});

function documented(row) {
  const required = parseKeyCell(row.required, `${row.operation} required`);
  const optional = parseKeyCell(row.optional, `${row.operation} optional`);
  const paths = new Set(COMMON_KEYS);
  for (const item of [...required, ...optional]) {
    for (const path of item.kind === 'alt' ? item.paths : [item.path]) paths.add(path);
  }
  return { required, optional, paths };
}

// ---- environment -------------------------------------------------------------------------------

function git(cwd, args) {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
    cwd,
    stdio: 'ignore',
  });
}

const checkouts = [];
function checkout() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'remote-tracker-reference-')));
  checkouts.push(root);
  git(root, ['init', '-q']);
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  return root;
}
after(() => {
  for (const root of checkouts) rmSync(root, { recursive: true, force: true });
});

function isLocal(row) {
  return row.kind.startsWith('local');
}

// Calls the real `executeOperation` with the sentinel runner. Mutations stay dry runs.
async function call(row, input, { provider = 'github', probe, cwd } = {}) {
  let runnerCalls = 0;
  const runner = async () => {
    runnerCalls += 1;
    throw new Error('SENTINEL runner reached');
  };
  const full = {
    cwd,
    ...(isLocal(row) ? {} : { repository: provider === 'forgejo' ? FORGEJO : GITHUB }),
    ...structuredClone(input),
    ...(probe ? { probe } : {}),
  };
  const envelope = await executeOperation(row.operation, full, {
    runner,
    skipProbe: true,
    sleeper: async () => {},
    clock: () => 1_700_000_000_000,
  });
  return { envelope, runnerCalls };
}

function deletePath(target, path) {
  const segments = path.split('.');
  let node = target;
  for (const segment of segments.slice(0, -1)) {
    node = node?.[segment];
    if (node === undefined || node === null || typeof node !== 'object') return;
  }
  delete node[segments.at(-1)];
}

function describe(result) {
  const error = result.envelope.error;
  return error
    ? `${error.code}${error.details?.field ? ` (${error.details.field})` : ''}: ${error.message}`
    : `ok dryRun=${result.envelope.dryRun}`;
}

// The kind-specific positive check; returns a problem description or null.
async function positiveProblem(row, input, options) {
  const { envelope, runnerCalls } = await call(row, input, options);
  const failure = `${row.operation} (${options.provider ?? 'github'}): ${describe({ envelope })}`;
  if (row.kind === 'forge mutation') {
    return envelope.ok === true && envelope.dryRun === true && runnerCalls === 0
      ? null
      : `expected a dry run without a runner call, got ${failure}, runner calls ${runnerCalls}`;
  }
  if (row.kind === 'forge read') {
    if (ZERO_RUNNER_READS.includes(row.operation)) {
      return envelope.ok === true && runnerCalls === 0
        ? null
        : `expected ok without runner, got ${failure}`;
    }
    return envelope.ok === false &&
      envelope.error?.code === 'COMMAND_FAILED' &&
      /SENTINEL/.test(envelope.error.message) &&
      runnerCalls >= 1
      ? null
      : `expected the sentinel runner failure, got ${failure}`;
  }
  const allowed = LOCAL_FAILURE_CODES[row.operation] ?? [];
  return envelope.ok === true ||
    (allowed.includes(envelope.error?.code) && !VALIDATION_CODES.includes(envelope.error?.code))
    ? null
    : `expected ok or a listed non-validation code, got ${failure}`;
}

function conditionProbe(capability) {
  return CONDITION_VALUES[capability];
}

// ---- tests -------------------------------------------------------------------------------------

// Invariant: the reference lists exactly the helper's operations, in the helper's order, with the
// class the core derives (mutation set, local-write set, `localOperation` cases, forge read rest),
// so adding, removing, reordering or reclassifying an operation fails here until the table follows.
test('the operation reference matches the helper set, order and class', () => {
  const names = rows.map((row) => row.operation);
  const missing = REMOTE_TRACKER_OPERATIONS.filter((name) => !names.includes(name));
  const extra = names.filter((name) => !REMOTE_TRACKER_OPERATIONS.includes(name));
  assert.deepEqual(missing, [], `operations without a row in ${FRAGMENT}: ${missing}`);
  assert.deepEqual(extra, [], `rows in ${FRAGMENT} for no helper operation: ${extra}`);
  assert.equal(new Set(names).size, names.length, `duplicate row in ${FRAGMENT}`);
  assert.deepEqual(names, [...REMOTE_TRACKER_OPERATIONS], `row order in ${FRAGMENT}`);

  const source = readFileSync(
    new URL('../src/scripts/remote-tracker-core.mjs', import.meta.url),
    'utf8',
  );
  const body = /function localOperation\([^)]*\) \{\n([\s\S]*?)\n\}\n/.exec(source)[1];
  const localCases = [...body.matchAll(/case '([a-z-]+)':/g)].map((entry) => entry[1]);
  for (const row of rows) {
    const expected = MUTATION_OPERATIONS.includes(row.operation)
      ? 'forge mutation'
      : LOCAL_WRITE_OPERATIONS.includes(row.operation)
        ? 'local write'
        : localCases.includes(row.operation)
          ? 'local'
          : 'forge read';
    assert.equal(row.kind, expected, `${row.operation} class in ${FRAGMENT}`);
  }
});

// Invariant: every row has six cells, a known class and key cells that parse under the cell
// grammar, so the probes below read exactly what the reference states.
test('every row of the operation reference follows the cell grammar', () => {
  for (const row of rows) {
    assert.equal(row.cells.length, 6, `${row.operation}: six cells`);
    assert.match(row.cells[0], /^`[a-z-]+`$/, `${row.operation}: operation cell`);
    assert.ok(CLASSES.includes(row.kind), `${row.operation}: class ${row.kind}`);
    parseKeyCell(row.required, `${row.operation} required`);
    parseKeyCell(row.optional, `${row.operation} optional`);
    assert.ok(row.result.length > 0 && row.notes.length > 0, `${row.operation}: empty cell`);
  }
});

// Invariant: the set of `structured` rows and each one's container key is pinned, so a row cannot
// lose its marker, owner pointer or container key unnoticed.
test('structured rows keep their marker, owner pointer and container key', () => {
  const structured = rows.filter((row) => row.notes.startsWith('structured;'));
  assert.deepEqual(
    structured.map((row) => row.operation).sort(),
    Object.keys(STRUCTURED_ROWS).sort(),
  );
  for (const row of structured) {
    assert.match(row.notes, /^structured; \S/, `${row.operation}: owner pointer after structured;`);
    const { paths } = documented(row);
    assert.ok(paths.has(STRUCTURED_ROWS[row.operation]), `${row.operation}: container key`);
  }
  // A required container key is probed below; these are the optional ones.
  for (const [operation, key] of [
    ['decomposition-container-compare', 'container'],
    ['issue-lifecycle-receipt-parse', 'context'],
  ]) {
    assert.ok(
      documented(rows.find((row) => row.operation === operation)).paths.has(key),
      operation,
    );
  }
});

// Invariant: a fixture can only supply keys its row documents, so a key the validator needs but the
// row leaves out cannot hide behind the test's own input.
test('every fixture key is documented in its row', () => {
  assert.deepEqual(Object.keys(FIXTURES), [...REMOTE_TRACKER_OPERATIONS]);
  for (const row of rows) {
    const { paths, required, optional } = documented(row);
    const arrays = new Map(
      [...required, ...optional]
        .filter((item) => item.kind === 'array')
        .map((item) => [item.path, item]),
    );
    for (const [key, value] of Object.entries(FIXTURES[row.operation])) {
      const flat =
        (key === 'payload' || key === 'comment') &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
          ? Object.keys(value).map((child) => `${key}.${child}`)
          : [key];
      for (const path of flat) {
        assert.ok(
          paths.has(path),
          `${row.operation}: fixture key ${path} is not documented in ${FRAGMENT}`,
        );
      }
    }
    for (const [path, item] of arrays) {
      const [first, ...rest] = path.split('.');
      const element = [FIXTURES[row.operation][first], ...rest].reduce(
        (node, key) => node?.[key],
      )?.[0];
      assert.ok(element, `${row.operation}: fixture carries one ${path}[] element`);
      const allowed = new Set([...item.required, ...item.optional]);
      for (const key of Object.keys(element)) {
        assert.ok(allowed.has(key), `${row.operation}: element key ${key} is not documented`);
      }
      for (const key of item.required)
        assert.ok(key in element, `${row.operation}: element ${key}`);
    }
  }
});

// Invariant: omitting any documented top-level required key or alternative group (and, for the
// number alias, every alias) fails the real GitHub validator with a validation code that names the
// omitted key where the failure carries a field, so a documented key the validator does not require
// fails here; omitting a nested comment element key of an array cell fails the same way.
test('omitting a documented required key fails the validator', async () => {
  const cwd = checkout();
  const mismatches = [];
  for (const row of rows) {
    const { required, optional } = documented(row);
    const base = FIXTURES[row.operation];
    const aliases = { ...FIELD_ALIASES['*'], ...FIELD_ALIASES[row.operation] };

    const probes = [];
    for (const item of required) {
      const groups = item.kind === 'alt' ? item.paths : [item.path];
      const omit = (input) => {
        for (const path of groups) deletePath(input, path);
        if (groups.includes('number')) {
          deletePath(input, 'issue');
          deletePath(input, 'pullRequest');
        }
      };
      const prepared = structuredClone(base);
      let probe;
      if (item.kind === 'cond') {
        probe = conditionProbe(item.capability);
        const positive = structuredClone(base);
        positive[item.path] = CONDITIONAL_KEY_VALUES[item.path];
        const problem = await positiveProblem(row, positive, { cwd, probe });
        if (problem) mismatches.push(`${row.operation}: conditional key ${item.path}: ${problem}`);
        prepared[item.path] = CONDITIONAL_KEY_VALUES[item.path];
      }
      if (!groups.some((path) => hasPath(prepared, path))) {
        mismatches.push(
          `${row.operation}: fixture carries no value for required key ${groups.join(' or ')}`,
        );
      }
      omit(prepared);
      probes.push({ label: groups, input: prepared, probe });
    }
    for (const item of [...required, ...optional].filter((entry) => entry.kind === 'array')) {
      for (const key of item.required) {
        const prepared = structuredClone(base);
        const [first, ...rest] = item.path.split('.');
        const element = [prepared[first], ...rest].reduce((node, name) => node?.[name])?.[0];
        if (element) delete element[key];
        probes.push({ label: [`${item.path}[].${key}`], input: prepared });
      }
    }

    for (const { label, input, probe } of probes) {
      const result = await call(row, input, { cwd, probe });
      const error = result.envelope.error;
      if (result.envelope.ok || !VALIDATION_CODES.includes(error?.code)) {
        mismatches.push(
          `${row.operation}: omitting ${label.join(' or ')} gave ${describe(result)}`,
        );
        continue;
      }
      const field = error.details?.field;
      if (field === undefined) continue;
      const normalized = field.replace(/\[\d+\]/g, '[]');
      const container = STRUCTURED_ROWS[row.operation];
      // A lenient structured builder reads the whole input when its container is absent and then
      // names its first nested field, `<container>.<field>`.
      const resolved =
        aliases[normalized] ??
        (container && normalized.startsWith(`${container}.`) ? container : normalized);
      if (!label.includes(resolved)) {
        mismatches.push(
          `${row.operation}: omitting ${label.join(' or ')} named field "${field}" (resolved "${resolved}")`,
        );
      }
    }
  }
  assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

function hasPath(target, path) {
  let node = target;
  for (const segment of path.split('.')) {
    if (node === undefined || node === null || typeof node !== 'object' || !(segment in node))
      return false;
    node = node[segment];
  }
  return true;
}

// Values for required alternative-group members no fixture carries; a member a fixture carries
// keeps the fixture's value.
const ALT_MEMBER_VALUES = {
  'payload.label': 'x',
  references: ['https://github.com/o/r/issues/1'],
  body: 'x',
  comments: ['C1'],
};

function setPath(target, path, value) {
  const segments = path.split('.');
  let node = target;
  for (const segment of segments.slice(0, -1)) {
    if (node[segment] === undefined || node[segment] === null) node[segment] = {};
    node = node[segment];
  }
  node[segments.at(-1)] = value;
}

// Removes the group's members and any parent object the removal leaves empty, so `body` alone is
// probed without an empty `comment` container shadowing it.
function omitGroup(input, group) {
  for (const path of group) {
    deletePath(input, path);
    const parent = path.split('.').slice(0, -1).join('.');
    if (!parent) continue;
    const node = parent.split('.').reduce((value, key) => value?.[key], input);
    if (node && typeof node === 'object' && Object.keys(node).length === 0)
      deletePath(input, parent);
  }
  if (group.includes('number')) {
    deletePath(input, 'issue');
    deletePath(input, 'pullRequest');
  }
}

// Invariant: each member of every documented required alternative group alone (the other members
// removed) passes the GitHub positive check, so a member the validator no longer accepts fails here
// while the omission probe above only shows that removing the whole group fails.
test('each member of a required alternative group alone passes the GitHub positive check', async () => {
  const problems = [];
  const covered = [];
  const expected = [];
  for (const row of rows) {
    const base = FIXTURES[row.operation];
    for (const item of documented(row).required.filter((entry) => entry.kind === 'alt')) {
      for (const member of item.paths) {
        expected.push(`${row.operation} ${member}`);
        const value = hasPath(base, member)
          ? member.split('.').reduce((node, key) => node[key], base)
          : ALT_MEMBER_VALUES[member];
        if (value === undefined) {
          problems.push(`${row.operation}: no value for alternative member ${member}`);
          continue;
        }
        const input = structuredClone(base);
        omitGroup(input, item.paths);
        setPath(input, member, structuredClone(value));
        covered.push(`${row.operation} ${member}`);
        const problem = await positiveProblem(row, input, { cwd: checkout() });
        if (problem) problems.push(`${row.operation}: with only ${member}: ${problem}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  // The check is not vacuous: it covers every member of every required alternative group, and the
  // table still carries the groups this test was written for.
  assert.deepEqual(covered, expected);
  for (const label of [
    'issue-labels payload.labels',
    'issue-labels payload.label',
    'issue-label-add payload.label',
    'reference-parse reference',
    'reference-parse references',
    'planning-comment-build comment.body',
    'planning-comment-build body',
    'pr-review-comment-build body',
    'thread-ledger-record threads',
    'thread-ledger-record comments',
  ]) {
    assert.ok(covered.includes(label), `alternative-member check covers ${label}`);
  }
});

// Invariant: the full minimal payload of every GitHub row passes validation up to the point its
// kind reaches (mutation dry run, runner reached, local ok), so a required key the row leaves out
// fails here whichever key the validator names; the local-write row runs only in a temp checkout
// and writes only under its runtime-state directory.
test('the minimal payload of every row passes the GitHub validators', async () => {
  const cwd = checkout();
  const problems = [];
  for (const row of rows) {
    if (row.kind === 'local write') continue;
    const problem = await positiveProblem(row, FIXTURES[row.operation], { cwd });
    if (problem) problems.push(problem);
  }
  assert.deepEqual(problems, [], problems.join('\n'));

  const root = checkout();
  const beforeEntries = listing(root);
  const row = rows.find((entry) => entry.kind === 'local write');
  const { envelope } = await call(row, FIXTURES[row.operation], { cwd: root });
  assert.equal(envelope.ok, true, describe({ envelope }));
  const written = resolve(root, envelope.data.path);
  const prefix = join(root, '.effective-flow', 'merge-gate') + sep;
  assert.ok(written.startsWith(prefix), `${written} is under ${prefix}`);
  const afterEntries = listing(root);
  assert.deepEqual(
    [...beforeEntries].filter((entry) => !afterEntries.has(entry)),
    [],
  );
  for (const entry of [...afterEntries].filter((item) => !beforeEntries.has(item))) {
    const path = join(root, entry);
    const inside =
      `${path}${sep}`.startsWith(prefix) ||
      path === prefix.slice(0, -1) ||
      path === join(root, '.effective-flow');
    assert.ok(inside, `unexpected new entry ${entry}`);
  }
});

// Invariant: dropping any documented optional key a fixture carries (top-level, `payload.<key>`,
// `comment.<key>` or an optional array-element key) keeps the GitHub positive check passing, so a
// validator-required key moved from the Required to the Optional cell fails here.
test('omitting a documented optional key keeps the GitHub positive check passing', async () => {
  const cwd = checkout();
  const problems = [];
  const omitted = [];
  for (const row of rows) {
    const { required, optional } = documented(row);
    const base = FIXTURES[row.operation];
    const variants = [];
    for (const item of optional) {
      for (const path of item.kind === 'alt' ? item.paths : [item.path]) {
        if (!hasPath(base, path)) continue;
        const input = structuredClone(base);
        deletePath(input, path);
        variants.push({ label: path, input });
      }
    }
    for (const item of [...required, ...optional].filter((entry) => entry.kind === 'array')) {
      for (const key of item.optional) {
        const input = structuredClone(base);
        const [first, ...rest] = item.path.split('.');
        const element = [input[first], ...rest].reduce((node, name) => node?.[name])?.[0];
        if (!element || !(key in element)) continue;
        delete element[key];
        variants.push({ label: `${item.path}[].${key}`, input });
      }
    }
    for (const { label, input } of variants) {
      omitted.push(`${row.operation} ${label}`);
      const problem = await positiveProblem(row, input, { cwd });
      if (problem) problems.push(`${row.operation}: without optional ${label}: ${problem}`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  // The probe is not vacuous: the fixtures carry these optional keys.
  for (const label of ['review-create payload.comments', 'review-create payload.comments[].side']) {
    assert.ok(omitted.includes(label), `optional-key omission covers ${label}`);
  }
});

// Invariant: every forge mutation row still reaches its dry run under each condition probe when it
// supplies only the conditional keys its own row documents for that condition, so a conditional
// requirement on a row without a matching `(if …)` cell fails here.
test('forge mutations pass every condition probe with only their documented conditional keys', async () => {
  const cwd = checkout();
  const problems = [];
  for (const row of rows.filter((entry) => entry.kind === 'forge mutation')) {
    const { required, optional } = documented(row);
    for (const [capability, probe] of Object.entries(CONDITION_VALUES)) {
      const input = structuredClone(FIXTURES[row.operation]);
      for (const item of [...required, ...optional]) {
        if (item.kind === 'cond' && item.capability === capability) {
          input[item.path] = CONDITIONAL_KEY_VALUES[item.path];
        }
      }
      const problem = await positiveProblem(row, input, { cwd, probe });
      if (problem) problems.push(`${row.operation} under ${capability}: ${problem}`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

function listing(root) {
  const entries = new Set();
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const path = join(directory, entry.name);
      entries.add(relative(root, path));
      if (entry.isDirectory()) walk(path);
    }
  };
  walk(root);
  return entries;
}

function forgejoNotes(row) {
  return {
    unsupported: /Forgejo: unsupported/.test(row.notes),
    needs: [...row.notes.matchAll(/Forgejo: needs `([A-Za-z]+)`/g)].map((entry) => entry[1]),
    additions: [...row.notes.matchAll(/Forgejo: `([^`]+)`(?: ([a-z]+))?/g)].map((entry) =>
      entry[2] ? `${entry[1]} ${entry[2]}` : entry[1],
    ),
  };
}

// Invariant: "Forgejo: unsupported" is a static gap (it holds even when every capability the helper
// checks is reported), "Forgejo: needs <capability>" is a capability gate (fails without it, passes
// with it), and the sets of both kinds are pinned.
test('Forgejo provider notes: unsupported rows are static and gated rows need their capability', async () => {
  const cwd = checkout();
  const forge = rows.filter((row) => !isLocal(row));
  assert.deepEqual(
    forge
      .filter((row) => forgejoNotes(row).unsupported)
      .map((row) => row.operation)
      .sort(),
    [...STATIC_FORGEJO_UNSUPPORTED].sort(),
  );
  assert.deepEqual(
    Object.fromEntries(
      forge
        .filter((row) => forgejoNotes(row).needs.length)
        .map((row) => [row.operation, forgejoNotes(row).needs[0]]),
    ),
    FORGEJO_CAPABILITY_GATED,
  );
  const everything = { executable: 'tea', capabilities: ALL_FORGEJO_CAPABILITIES };
  for (const operation of STATIC_FORGEJO_UNSUPPORTED) {
    const row = rows.find((entry) => entry.operation === operation);
    for (const probe of [undefined, everything]) {
      const { envelope } = await call(row, FIXTURES[operation], {
        provider: 'forgejo',
        probe,
        cwd,
      });
      assert.equal(envelope.error?.code, 'UNSUPPORTED_CAPABILITY', describe({ envelope }));
    }
  }
  for (const [operation, capability] of Object.entries(FORGEJO_CAPABILITY_GATED)) {
    const row = rows.find((entry) => entry.operation === operation);
    const input = withForgejoAdditions(operation, FIXTURES[operation]);
    const without = await call(row, input, { provider: 'forgejo', cwd });
    assert.equal(without.envelope.error?.code, 'UNSUPPORTED_CAPABILITY', describe(without));
    const withIt = await positiveProblem(row, input, {
      provider: 'forgejo',
      cwd,
      probe: { executable: 'tea', capabilities: { [capability]: true } },
    });
    assert.equal(withIt, null, withIt);
  }
});

// Invariant: the `pr-create` Forgejo draft gate the notes list states holds: a draft without the
// `pullRequestDraftCreate` probe capability is refused, with it the call is a dry run, and the
// list item names that capability.
test('the Forgejo pr-create draft gate needs pullRequestDraftCreate', async () => {
  const cwd = checkout();
  const row = rows.find((entry) => entry.operation === 'pr-create');
  const input = structuredClone(FIXTURES['pr-create']);
  input.payload.draft = true;
  const without = await call(row, input, { provider: 'forgejo', cwd });
  assert.equal(without.envelope.error?.code, 'UNSUPPORTED_CAPABILITY', describe(without));
  const withIt = await positiveProblem(row, input, {
    provider: 'forgejo',
    cwd,
    probe: { executable: 'tea', capabilities: { pullRequestDraftCreate: true } },
  });
  assert.equal(withIt, null, withIt);
  assert.match(fragmentSource, /^- `pr-create`: [^\n]*(?:\n {2}[^\n]*)*`pullRequestDraftCreate`/m);
});

function withForgejoAdditions(operation, input) {
  const copy = structuredClone(input);
  FORGEJO_ADDITIONS[operation]?.apply(copy);
  return copy;
}

// Invariant: every other forge row passes the positive check under the Forgejo override as well,
// with the pinned Forgejo-only additions, and each addition (and only those) is stated in the row's
// Notes in the fixed `Forgejo: \`<key>\`` form, so a Forgejo-only required key the reference omits
// fails here.
test('Forgejo rows pass the positive check and state their Forgejo-only additions', async () => {
  const cwd = checkout();
  const problems = [];
  const forge = rows.filter((row) => !isLocal(row));
  for (const row of forge) {
    const notes = forgejoNotes(row);
    const pinned = FORGEJO_ADDITIONS[row.operation]?.notes ?? [];
    assert.deepEqual(notes.additions, pinned, `${row.operation}: Forgejo-only additions in Notes`);
    if (notes.unsupported) continue;
    const gated = FORGEJO_CAPABILITY_GATED[row.operation];
    const problem = await positiveProblem(
      row,
      withForgejoAdditions(row.operation, FIXTURES[row.operation]),
      {
        provider: 'forgejo',
        cwd,
        probe: gated ? { executable: 'tea', capabilities: { [gated]: true } } : undefined,
      },
    );
    if (problem) problems.push(problem);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  // The addition is a real requirement: without it the Forgejo validator refuses the call.
  const markReady = rows.find((row) => row.operation === 'pr-mark-ready');
  const { envelope } = await call(markReady, FIXTURES['pr-mark-ready'], {
    provider: 'forgejo',
    cwd,
  });
  assert.equal(envelope.error?.code, 'INVALID_PAYLOAD', describe({ envelope }));
});
