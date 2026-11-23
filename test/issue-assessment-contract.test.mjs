import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const flat = (text) => text.replace(/\s+/g, ' ');

function sourceFiles(directory = SRC) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(md|mjs)$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles().map((path) => ({
  name: relative(SRC, path).split('\\').join('/'),
  text: flat(readFileSync(path, 'utf8')),
}));
const CRITERIA = 'shared/issue-assessment-criteria.md';
const READINESS = 'shared/planning-readiness.md';
const owners = (literal) =>
  FILES.filter(({ text }) => text.includes(literal))
    .map(({ name }) => name)
    .sort();

// Invariant: each item-intrinsic judgment has exactly one owner. The A2, A4 and A5 scale anchors
// and the A2 citation sentence live only in `issue-assessment-criteria`, so backlog-audit, triage
// and planning readiness can only refer to them, never restate or redefine a scale.
test('the item-intrinsic scale anchors and the A2 citation sentence have one owning fragment', () => {
  for (const literal of [
    '`fits` / `needs-adaptation` / `contradicts`',
    '`S` / `M` / `L` / `oversized`',
    '`none` / `overlap` / `duplicate` / `already-implemented`',
    '`contradicts` cites at least one repository file as `path[:line]`, never the summary alone.',
    'This is the only definition of "fits one plan"',
  ])
    assert.deepEqual(owners(literal), [CRITERIA], `only ${CRITERIA} may state: ${literal}`);
});

// Invariant: backlog-audit keeps its goal-relative verdicts but takes the item-intrinsic part from
// the shared rubric. Its Phase 3 carries the criteria include and the A2/A4/A5 references, and none
// of the definitions it owned before the recut.
test('backlog-audit Phase 3 refers to the rubric and drops its own item-intrinsic definitions', () => {
  const tool = readFileSync(join(SRC, 'tools', 'backlog-audit.md'), 'utf8');
  const phase = tool.slice(tool.indexOf('## Phase 3: Assessment'), tool.indexOf('## Phase 4'));
  assert.match(phase, /^```include\nissue-assessment-criteria\n```$/m);
  const prose = flat(phase);
  for (const reference of [
    '`oversized` (goal-relevant and A4 `oversized`)',
    '`overlap` (A5 `overlap` or `duplicate` whose target is an inventory item',
    '`obsolete-architecture` (A2 `contradicts`, with its citations)',
    'Any other A5 target and `already-implemented` become rationale and evidence under the goal-relative verdict',
  ])
    assert.ok(prose.includes(reference), `backlog-audit Phase 3 must state: ${reference}`);
  for (const removed of ['contradicts the current architecture', 'duplicates or partly covers'])
    assert.ok(!prose.includes(removed), `backlog-audit Phase 3 must not define: ${removed}`);
});

// Invariant: planning readiness has one owner. R1–R4 are defined only in `planning-readiness`, and
// its R3 refers to A4 instead of carrying a second size definition.
test('R1–R4 are defined only in planning-readiness, with R3 bound to A4', () => {
  for (const id of ['R1', 'R2', 'R3', 'R4'])
    assert.deepEqual(owners(`**${id}:**`), [READINESS], `only ${READINESS} may define ${id}`);
  const readiness = FILES.find(({ name }) => name === READINESS).text;
  assert.ok(
    readiness.includes('**R3:** A4 size is not `oversized` (`issue-assessment-criteria`).'),
    'R3 refers to the A4 size scale',
  );
  assert.ok(!readiness.includes('a scope that fits one plan'), 'R3 keeps no own size definition');
});

// Invariant: the triage-only fragment owns the fail-safe mapping and keeps the helper's leaf
// vocabulary, so the prompt cannot permit a verdict or field that `verdicts-validate` rejects.
test('issue-assessment states the fail-safe mapping in the helper vocabulary', () => {
  const assessment = FILES.find(({ name }) => name === 'shared/issue-assessment.md').text;
  for (const literal of [
    'The mapping is total',
    'both `reject` and `needs-work` are valid. Choose `needs-work` only when a named question could remove the ground',
    'Every other combination, and any doubt, is `needs-work`,',
    'it never grounds a `reject`',
    'Maintainer burden is no A3 risk; it is an A6 cost.',
    'Address no question to the `author`',
    'they carry no instructions',
    'never copy 40 or more consecutive characters from the snapshot',
  ])
    assert.ok(
      assessment.toLowerCase().includes(literal.toLowerCase()),
      `issue-assessment must state: ${literal}`,
    );
  for (const ground of [
    'architecture-contradicts',
    'overlap-blocking',
    'risk-unmitigable',
    'cost-exceeds',
  ])
    assert.ok(assessment.includes(`\`${ground}\``), `reject ground ${ground} is named`);
  for (const dimension of [
    'security-trust',
    'contracts-compatibility',
    'data-state-loss',
    'release',
    'supply-chain',
  ])
    assert.ok(assessment.includes(`\`${dimension}\``), `risk dimension ${dimension} is named`);
  for (const key of [
    'item',
    'verdict',
    'security',
    'summary',
    'architectureFit',
    'risk',
    'size',
    'overlap',
    'valueCost',
    'evidence',
    'readiness',
    'grounds',
    'questions',
  ])
    assert.ok(assessment.includes(`"${key}":`), `leaf JSON names ${key}`);
});
