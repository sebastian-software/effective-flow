import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('delegated build consumes producer-selected review-report paths', () => {
  const prompt = readFileSync(
    new URL('../src/shared/build-delegated-run.md', import.meta.url),
    'utf8',
  );

  assert.match(prompt, /```lazy-include\nreview-report-format\n/);
  assert.equal(
    prompt.includes('review-report-YYYY-MM-DD-plan-<slug>.md'),
    false,
    'the delegated build must not override the report producer with the retired fixed filename',
  );
  assert.ok(
    prompt.includes('**External review report:** `<generated report path>`'),
    'the completion backlink must use the report path generated in Phase 6',
  );
});
