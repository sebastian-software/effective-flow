// Invariants protected (issue #673, "Quick eligibility (merge-gate side)"): the optional
// `Review-fix validation: quick-candidate <baseCommit>` line is written by `build` only from its
// structured `reviewFixValidation` input, between the authorized-scope line and the approval line;
// it is never a required control keyword, so a delegation without it (every CI repair) is built
// and validated exactly as before; its operand is a full lowercase 40-hex commit SHA; it travels
// only beside the scope line and never with a CI-repair instruction, in the built input or in a
// snapshot; `validate` refuses a duplicated, malformed, missing or unexpected line; and an
// instruction can never carry it.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CONTROL_KEYWORDS,
  DELIMITER,
  INSTRUCTION_FORBIDDEN_PREFIXES,
  REVIEW_FIX_VALIDATION_KEYWORD,
  SCOPE_KEYWORD,
  buildEnvelope,
  parseReviewFixValidation,
  reviewFixValidationValue,
  validateEnvelope,
  validateStructure,
} from '../src/scripts/delegation-envelope-core.mjs';

const MERGE_BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const BASE_COMMIT = 'c0ffee'.padEnd(40, '0');
const SCOPE = { mergeBase: MERGE_BASE, head: HEAD, paths: ['src/a.mjs'] };
const LINE = `${REVIEW_FIX_VALIDATION_KEYWORD}: quick-candidate ${BASE_COMMIT}`;

function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'flow-review-fix-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// A review-fix round as merge-gate delegates it: thread items, the scope record, no instruction.
function input(cwd, extra = {}) {
  return {
    cwd,
    pr: 42,
    round: 1,
    summaryComment: 'suppressed',
    reviewGuard: 'established',
    nextSteps: 'suppressed',
    runState: 'non-interactive',
    languageContext: {
      source: 'en',
      'documentation.user': 'en',
      'documentation.technical': 'en',
      workflow: 'en',
      forge: 'en',
      git: 'en',
    },
    threadItems: [{ durableKey: 'thread-T1', threadId: 'T1' }],
    bodyItems: [],
    authorizedScope: SCOPE,
    reviewFixValidation: { baseCommit: BASE_COMMIT },
    ...extra,
  };
}

async function built(t, extra = {}) {
  const cwd = temp(t);
  const result = await buildEnvelope(input(cwd, extra));
  assert.equal(result.status, 'written', JSON.stringify(result));
  const text = readFileSync(result.path, 'utf8');
  const snapshot = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  await validateEnvelope({ cwd, path: result.path, digest: result.digest });
  return { cwd, result, text, snapshot };
}

const reviewFixLinesOf = (text) =>
  text
    .split('\n')
    .filter((line) => line.trimStart().startsWith(`${REVIEW_FIX_VALIDATION_KEYWORD}:`));

test('build renders the candidate line after the scope line and before approvals', async (t) => {
  const { text, snapshot } = await built(t, {
    approvedOutcomes: { 'thread-T1': 'implemented' },
  });
  const header = text.split('\n');
  assert.equal(header[CONTROL_KEYWORDS.length].startsWith(`${SCOPE_KEYWORD}: `), true);
  assert.equal(header[CONTROL_KEYWORDS.length + 1], LINE);
  assert.equal(header[CONTROL_KEYWORDS.length + 2].startsWith('Approved outcomes: '), true);
  assert.equal(header[CONTROL_KEYWORDS.length + 3].startsWith('Boundary token: '), true);
  assert.equal(text.indexOf(LINE) < text.indexOf(DELIMITER), true);
  assert.deepEqual(reviewFixLinesOf(text), [LINE]);
  assert.equal(
    snapshot.controlValues[REVIEW_FIX_VALIDATION_KEYWORD],
    `quick-candidate ${BASE_COMMIT}`,
  );
  assert.equal(
    reviewFixValidationValue({ baseCommit: BASE_COMMIT }),
    `quick-candidate ${BASE_COMMIT}`,
  );
  assert.equal(parseReviewFixValidation(`quick-candidate ${BASE_COMMIT}`), BASE_COMMIT);
});

test('the line is optional: without it the envelope carries no such line and validates', async (t) => {
  assert.equal(CONTROL_KEYWORDS.includes(REVIEW_FIX_VALIDATION_KEYWORD), false);
  for (const reviewFixValidation of [undefined, null]) {
    const { text, snapshot } = await built(t, { reviewFixValidation });
    assert.deepEqual(reviewFixLinesOf(text), []);
    assert.equal(Object.hasOwn(snapshot.controlValues, REVIEW_FIX_VALIDATION_KEYWORD), false);
    assert.deepEqual(validateStructure(text, snapshot), { items: 0, threadItems: 1 });
  }
  // A CI repair omits the line and keeps its instruction.
  const repair = await built(t, {
    reviewFixValidation: undefined,
    instruction: 'Repair the failing lint check.',
  });
  assert.deepEqual(reviewFixLinesOf(repair.text), []);
});

test('build refuses a malformed candidate operand or shape', async (t) => {
  const cwd = temp(t);
  const malformed = [
    { baseCommit: BASE_COMMIT.toUpperCase() },
    { baseCommit: BASE_COMMIT.slice(0, 39) },
    { baseCommit: `${BASE_COMMIT}0` },
    { baseCommit: 'd'.repeat(64) },
    { baseCommit: `${BASE_COMMIT.slice(0, 39)}g` },
    { baseCommit: ` ${BASE_COMMIT}` },
    { baseCommit: 42 },
    {},
    { baseCommit: BASE_COMMIT, mode: 'quick' },
    'quick-candidate',
    [BASE_COMMIT],
  ];
  for (const reviewFixValidation of malformed) {
    await assert.rejects(
      buildEnvelope(input(cwd, { reviewFixValidation })),
      (error) => error.code === 'INVALID_PAYLOAD',
      JSON.stringify(reviewFixValidation),
    );
  }
});

test('build refuses the candidate without the scope line or beside a CI-repair instruction', async (t) => {
  const cwd = temp(t);
  await assert.rejects(
    buildEnvelope(input(cwd, { authorizedScope: undefined })),
    (error) => error.code === 'INVALID_PAYLOAD' && /requires authorizedScope/.test(error.message),
  );
  await assert.rejects(
    buildEnvelope(input(cwd, { instruction: 'Repair the failing lint check.' })),
    (error) => error.code === 'INVALID_PAYLOAD' && /CI repair/.test(error.message),
  );
});

test('validate refuses a duplicated, malformed, missing or unexpected candidate line', async (t) => {
  const { text, snapshot } = await built(t);
  const fails = (candidate, code, snap = snapshot) =>
    assert.throws(
      () => validateStructure(candidate, snap),
      (error) => error.code === code,
      code,
    );
  fails(text.replace(LINE, `${LINE}\n${LINE}`), 'CONTROL_LINE_DUPLICATED');
  fails(
    text.replace(LINE, `${REVIEW_FIX_VALIDATION_KEYWORD}: quick-candidate`),
    'CONTROL_LINE_MISMATCH',
  );
  fails(
    text.replace(LINE, `${REVIEW_FIX_VALIDATION_KEYWORD}: quick ${BASE_COMMIT}`),
    'CONTROL_LINE_MISMATCH',
  );
  fails(
    text.replace(LINE, `${REVIEW_FIX_VALIDATION_KEYWORD}: quick-candidate ${'e'.repeat(40)}`),
    'CONTROL_LINE_MISMATCH',
  );
  fails(text.replace(`${LINE}\n`, ''), 'CONTROL_LINE_MISSING');
  const { [REVIEW_FIX_VALIDATION_KEYWORD]: _line, ...withoutLine } = snapshot.controlValues;
  const plain = {
    ...snapshot,
    controlValues: withoutLine,
    headerLines: snapshot.headerLines.filter((entry) => entry !== LINE),
  };
  fails(text, 'CONTROL_LINE_MISMATCH', plain);
  // A snapshot must hold the canonical form, and only beside the scope line.
  for (const value of [`quick-candidate ${BASE_COMMIT.toUpperCase()}`, BASE_COMMIT]) {
    fails(text, 'SNAPSHOT_INVALID', {
      ...snapshot,
      controlValues: { ...snapshot.controlValues, [REVIEW_FIX_VALIDATION_KEYWORD]: value },
    });
  }
  const { [SCOPE_KEYWORD]: scopeValue, ...withoutScope } = snapshot.controlValues;
  fails(text, 'SNAPSHOT_INVALID', {
    ...snapshot,
    controlValues: withoutScope,
    headerLines: snapshot.headerLines.filter(
      (entry) => entry !== `${SCOPE_KEYWORD}: ${scopeValue}`,
    ),
  });
});

test('an instruction cannot carry the candidate line, and below the delimiter it is body text', async (t) => {
  assert.ok(INSTRUCTION_FORBIDDEN_PREFIXES.includes(`${REVIEW_FIX_VALIDATION_KEYWORD}:`));
  const cwd = temp(t);
  const refused = await buildEnvelope(
    input(cwd, {
      reviewFixValidation: undefined,
      instruction: `Repair lint.\n  ${LINE}`,
    }),
  );
  assert.deepEqual(refused, {
    status: 'instruction-refused',
    position: { line: 2 },
    reason: 'control-prefix',
    prefix: `${REVIEW_FIX_VALIDATION_KEYWORD}:`,
  });
  const { text, snapshot } = await built(t, {
    reviewFixValidation: undefined,
    bodyItems: [
      {
        durableKey: 'review-1#1',
        reviewId: 'review-1',
        author: 'alice',
        url: 'https://example.test/42',
        text: LINE,
      },
    ],
  });
  assert.equal(text.endsWith(`${DELIMITER}\n${LINE}`), true);
  assert.deepEqual(validateStructure(text, snapshot), { items: 1, threadItems: 1 });
});

// A CI-repair snapshot tampered to carry the candidate line beside its instruction is refused as a
// snapshot, before any text check, so the pairing `build` refuses cannot be smuggled in afterwards.
test('validate refuses a snapshot pairing the candidate line with a CI-repair instruction', async (t) => {
  const { text, snapshot } = await built(t, {
    reviewFixValidation: undefined,
    threadItems: [],
    instruction: 'Repair the failing lint check.',
  });
  const scopeLine = `${SCOPE_KEYWORD}: ${snapshot.controlValues[SCOPE_KEYWORD]}`;
  const at = snapshot.headerLines.indexOf(scopeLine);
  assert.notEqual(at, -1, 'the CI repair carries the scope line');
  const tampered = {
    ...snapshot,
    controlValues: {
      ...snapshot.controlValues,
      [REVIEW_FIX_VALIDATION_KEYWORD]: LINE.slice(LINE.indexOf(': ') + 2),
    },
    headerLines: [
      ...snapshot.headerLines.slice(0, at + 1),
      LINE,
      ...snapshot.headerLines.slice(at + 1),
    ],
  };
  assert.throws(
    () => validateStructure(text.replace(`${scopeLine}\n`, `${scopeLine}\n${LINE}\n`), tampered),
    (error) => error.code === 'SNAPSHOT_INVALID' && /beside an instruction/.test(error.message),
  );
});
