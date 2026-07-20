import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const refactorTool = readFileSync(new URL('../src/tools/refactor.md', import.meta.url), 'utf8');

const phase4 = refactorTool.slice(
  refactorTool.indexOf('### Phase 4: Review'),
  refactorTool.indexOf('### Phase 5: Post-validation'),
);
const phase6 = refactorTool.slice(
  refactorTool.indexOf('### Phase 6: Before/after comparison and completion'),
  refactorTool.indexOf('```include\npre-commit-gate'),
);

test('refactor review results remain provisional until regression validation succeeds', () => {
  assert.match(phase4, /provisional/i);
  assert.match(phase4, /replace\s+the previous provisional (?:finding|review) set/i);
  assert.doesNotMatch(phase4, /write them into a new file under `.effective-flow\/review\/`/);
  assert.doesNotMatch(phase4, /add a short implementation note/);

  assert.match(phase6, /back to Phase 3, then phases 4, 5 and 6 again/);
  assert.match(phase6, /latest provisional review/i);
  assert.match(phase6, /at most one new file under `.effective-flow\/review\/`/);
  assert.match(phase6, /do not create a report/i);
  assert.match(phase6, /add a short implementation note/);
});

test('refactor report finalization precedes wisdom deletion and delivery handback', () => {
  const reportFinalization = phase6.indexOf('at most one new file under `.effective-flow/review/`');
  const backlinkFinalization = phase6.indexOf('add a short implementation note');
  const wisdomDeletion = phase6.indexOf('delete the wisdom file');
  const handback = phase6.indexOf('perform the handback');

  assert.ok(reportFinalization >= 0);
  assert.ok(backlinkFinalization > reportFinalization);
  assert.ok(wisdomDeletion > backlinkFinalization);
  assert.ok(handback > wisdomDeletion);
});
