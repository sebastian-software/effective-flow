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
const regressionBranch = phase6.slice(
  phase6.indexOf('3. If regressions are found:'),
  phase6.indexOf('4. If no regressions:'),
);
const successBranch = phase6.slice(phase6.indexOf('4. If no regressions:'));

// Invariant: Phase 4 writes no report or backlink; its findings stay provisional and are replaced per run.
test('refactor review results remain provisional until regression validation succeeds', () => {
  assert.match(phase4, /provisional/i);
  assert.match(phase4, /replace\s+the previous provisional (?:finding|review) set/i);
  assert.doesNotMatch(phase4, /write them into a new file under `.effective-flow\/review\/`/);
  assert.doesNotMatch(phase4, /add a short implementation note/);
});

// Invariant: a regression loops back through review with a bounded retry and never finalizes state.
test('refactor regression branch re-reviews with bounded retry and no finalization', () => {
  assert.match(regressionBranch, /back to Phase 3, then phases 4, 5 and 6 again/);
  assert.match(regressionBranch, /bound the internal correction rounds/);
  assert.match(regressionBranch, /escalate to the user/);
  assert.doesNotMatch(regressionBranch, /finalize external review state/i);
  assert.doesNotMatch(regressionBranch, /new file under `.effective-flow\/review\/`/);
  assert.doesNotMatch(regressionBranch, /implementation note/);
});

// Invariant: only the no-regression branch finalizes, writing at most one report from the latest review.
test('refactor success branch alone finalizes the latest provisional review', () => {
  assert.match(successBranch, /finalize external review state/i);
  assert.match(successBranch, /latest provisional review/i);
  assert.match(successBranch, /at most one new file under `.effective-flow\/review\/`/);
  assert.match(successBranch, /do not create a report/i);
  assert.match(successBranch, /add a short implementation note/);
  assert.equal(phase6.match(/finalize external review state/gi)?.length, 1);
});

// Invariant: a rerun reuses its own marked report and note instead of duplicating them, and stops on ambiguity.
test('refactor success finalization is idempotent for reports and backlinks', () => {
  assert.match(successBranch, /session ID as the stable finalization marker/i);
  assert.match(
    successBranch,
    /search `.effective-flow\/review\/`[^\n]*`Source workflow` is `\{\{SKILL:refactor\}\}` and whose `Source review` contains this run's finalization marker/,
    "the reuse lookup must key on this workflow and on this run's finalization marker",
  );
  assert.match(
    successBranch,
    /if no matching report exists,[^\n]*at most one new file under `.effective-flow\/review\/`/,
  );
  assert.match(
    successBranch,
    /if exactly one matching report exists,[^\n]*reuse that report[^\n]*do not create a collision-suffixed report/,
  );
  assert.match(
    successBranch,
    /if more than one matching report exists,[^\n]*stop before writing[^\n]*escalate the ambiguity to the user/,
  );
  assert.match(successBranch, /include the same finalization marker/i);
  assert.match(successBranch, /do not append another note/i);
});

// Invariant: external review state is persisted before the wisdom file is deleted and delivery hands back.
test('refactor report finalization precedes wisdom deletion and delivery handback', () => {
  const reportFinalization = successBranch.indexOf(
    'at most one new file under `.effective-flow/review/`',
  );
  const backlinkFinalization = successBranch.indexOf('add a short implementation note');
  const wisdomDeletion = successBranch.indexOf('delete the wisdom file');
  const handback = successBranch.indexOf('perform the handback');

  assert.ok(reportFinalization >= 0);
  assert.ok(backlinkFinalization > reportFinalization);
  assert.ok(wisdomDeletion > backlinkFinalization);
  assert.ok(handback > wisdomDeletion);
});

// Invariant: the profile integration keeps the provisional/final review lifecycle. Phase 4
// incorporation is Quality-only, the pilot record is finalized independently of the external
// review state on every exit, and only the no-regression branch finalizes reports and backlinks,
// with the pilot record finalized after that state and before the completion report.
test('refactor profile integration preserves provisional-then-final review ordering', () => {
  assert.match(
    phase4,
    /incorporation pass for new current-scope\s+items through the routed Quality implementer/,
  );
  const pilotRecord = phase6.slice(
    phase6.indexOf('**Pilot record.**'),
    phase6.indexOf('1. Compare the results'),
  );
  assert.match(pilotRecord, /every terminal\s+exit/);
  assert.match(pilotRecord, /independently of the\s+external review state below/);
  assert.doesNotMatch(pilotRecord, /\.effective-flow\/review\/|implementation note/);
  assert.match(regressionBranch, /routed Quality implementer/);
  assert.doesNotMatch(regressionBranch, /finalize a reserved pilot record/);

  const reviewFinalization = successBranch.indexOf('finalize external review state');
  const handback = successBranch.indexOf('perform the handback');
  const pilotFinalization = successBranch.indexOf('finalize a reserved pilot record');
  const summary = successBranch.indexOf('summarize what was refactored');
  assert.ok(reviewFinalization >= 0 && handback > reviewFinalization);
  assert.ok(pilotFinalization > handback, 'the pilot record follows the external review state');
  assert.ok(summary > pilotFinalization, 'the pilot record is finalized before the report');
});
