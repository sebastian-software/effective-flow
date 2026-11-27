import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const contract = readFileSync(new URL('../src/shared/plan-contract.md', import.meta.url), 'utf8');
const fixture = readFileSync(
  new URL('./fixtures/plan-contract/nested-checklist.md', import.meta.url),
  'utf8',
);

// Invariant: the nested checklist form that `plan-contract` documents is the exact block the
// committed fixture holds under `## Acceptance criteria`. CI's `pnpm agent:check` proves that the
// repository formatter keeps the fixture unchanged, so this drift check carries that proof over
// to the documented example without making the unit suite depend on an installed formatter.
test('the documented nested checklist example equals the formatter-checked fixture block', () => {
  const rule = contract.indexOf('Nested list items and continuation lines under a `- [ ]` item');
  assert.notEqual(rule, -1, 'missing nested checklist rule');
  const example = contract.slice(rule).match(/^```markdown\n([\s\S]*?)^```$/m);
  assert.ok(example, 'missing nested checklist example after the rule');
  const section = fixture.match(/^## Acceptance criteria\n\n([\s\S]*?)\n(?=## )/m);
  assert.ok(section, 'missing fixture acceptance-criteria block');
  assert.equal(section[1], example[1]);
  assert.match(example[1], /^- \[ \] .+\n {2}- .+\n {2}- .+\n$/);
});
