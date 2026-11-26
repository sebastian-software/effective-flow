// Invariant protected here: a plan carries exactly one review-result line; repeated reviews update
// it in place and move earlier passes into result-free history subsections (issue #733). The rule
// is owned once by `src/shared/plan-contract.md`; the tools only point at it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src');
const flat = (text) => text.replace(/\s+/g, ' ');
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8');
const QUESTION_RE = /\bask(s|ed)?\b|\bclarif(y|ication)\b|\bconfirm(ation)?\b|AskUserQuestion/i;

const HEADING = '### Single review-result line';

function subsection() {
  const text = read('shared', 'plan-contract.md');
  const start = text.indexOf(HEADING);
  assert.notEqual(start, -1, 'plan-contract.md lacks the single review-result line subsection');
  const next = text.indexOf('### Compact outcome checkpoint', start);
  assert.ok(next > start, 'subsection must end before the compact outcome checkpoint');
  return { text, start, body: flat(text.slice(start, next)) };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

test('the single review-result line rule sits outside both guarded plan-contract tables', () => {
  const { text, start } = subsection();
  assert.ok(start > text.indexOf('<!-- plan-contract-placeholders:end -->'));
  assert.ok(start > text.indexOf('<!-- plan-contract-mapping:end -->'));
});

test('plan-contract states exactly one review-result line and defines a pass', () => {
  const { body } = subsection();
  for (const literal of [
    'holds exactly one review-result line, directly below its heading',
    '`##` in a plan file and `###` in a planning comment',
    'A pass is one run of `plan` (its Phase 6 review or a re-planning) or of `plan-review`, interactive or delegated',
  ])
    assert.ok(body.includes(literal), `missing literal: ${literal}`);
});

test('a pass moves prior results into history once and updates the current result in place', () => {
  const { body } = subsection();
  for (const literal of [
    'At its first write of the section, a pass moves any previous summary and findings into one history subsection',
    'later writes in the same pass update the current result, summary and findings in place',
    'is its own `plan-review` pass, so the internal review becomes history',
  ])
    assert.ok(body.includes(literal), `missing literal: ${literal}`);
});

test('history subsections have a result-free form in both languages and a fixed position', () => {
  const { body } = subsection();
  for (const literal of [
    '(`###` in a file, `####` in a comment)',
    '`Review history (<YYYY-MM-DD>, <tool>)`',
    '`Review-Verlauf (<YYYY-MM-DD>, <tool>)`',
    '`Result at that time: <value>`',
    '`Ergebnis damals: <value>`',
    'newest first, before the open-points section',
  ])
    assert.ok(body.includes(literal), `missing literal: ${literal}`);
});

test('a pass never deletes history or adds a second result line, and rewrites duplicates', () => {
  const { body } = subsection();
  for (const literal of [
    'never deletes earlier history and never adds a second result line or a subsection with its own result line',
    'keeps one current line and rewrites each older one into the history form above',
  ])
    assert.ok(body.includes(literal), `missing literal: ${literal}`);
});

test('the one-result-line rule is stated once in src', () => {
  const owners = walk(SRC).filter((file) =>
    flat(readFileSync(file, 'utf8')).includes('holds exactly one review-result line'),
  );
  assert.deepEqual(
    owners.map((file) => file.slice(SRC.length + 1)),
    ['shared/plan-contract.md'],
  );
});

test('plan-review points at the single result line rule in its write and normalization steps', () => {
  const body = flat(read('tools', 'plan-review.md'));
  assert.ok(body.includes('keeping its single result line per `plan-contract`'));
  assert.ok(body.includes('the duplicate result-line rewrite of `plan-contract`'));
});

test('plan records re-planning reviews through the contract and never overwrites or dates a section', () => {
  const body = flat(read('tools', 'plan.md'));
  assert.ok(
    body.includes(
      "Record this run's review per the single review-result rule of `plan-contract`; never delete earlier passes.",
    ),
  );
  assert.ok(!body.includes('never overwrite the existing section'));
  assert.ok(!body.includes('as a **dated subsection**'));
});

test('plan-issue loads plan-contract when the plan-review section is written', () => {
  const text = read('tools', 'plan-issue.md');
  const fences = [...text.matchAll(/```lazy-include\n([\s\S]*?)\n```/g)].map(([, inner]) =>
    inner.split('\n'),
  );
  const fence = fences.find(([name]) => name === 'plan-contract');
  assert.ok(fence, 'plan-issue.md lacks a plan-contract lazy-include');
  assert.equal(
    fence[1],
    "when: the canonical planning comment's compact outcome checkpoint is written or reviewed, or its plan-review section is written",
  );
});

// Cuts the span from `startLiteral` through `endLiteral` out of flattened source text, failing when
// either anchor is missing so a moved or reworded source never makes a check pass on the wrong text.
function sourceSpan(text, startLiteral, endLiteral, label) {
  const start = text.indexOf(startLiteral);
  assert.notEqual(start, -1, `${label}: start anchor not found: ${startLiteral}`);
  const end = text.indexOf(endLiteral, start);
  assert.notEqual(end, -1, `${label}: end anchor not found: ${endLiteral}`);
  return text.slice(start, end + endLiteral.length);
}

// Invariant: the single result line rule and every pointer to it stay free of question-site
// wording, so they add no new question site to the unattended planning boundary. Every checked
// piece is cut from the shipped source, never written in the test.
test('the new single result line prose carries no question-site wording', () => {
  const planReview = flat(read('tools', 'plan-review.md'));
  const plan = flat(read('tools', 'plan.md'));
  const pieces = [
    subsection().body,
    sourceSpan(
      planReview,
      '6. Except for the explicit open-points normalization above and the duplicate result-line rewrite of `plan-contract`',
      'the delegate does not resolve configuration independently.',
      'plan-review Phase 1 step 6',
    ),
    sourceSpan(
      planReview,
      '3. Update the matching plan-review section in the artifact language',
      'keeping its single result line per `plan-contract`:',
      'plan-review Phase 4 step 3 lead-in',
    ),
    sourceSpan(
      plan,
      "- Record this run's review per the single review-result rule of `plan-contract`",
      'never delete earlier passes.',
      'plan re-planning bullet',
    ),
  ];
  for (const piece of pieces) assert.doesNotMatch(piece, QUESTION_RE);
});
