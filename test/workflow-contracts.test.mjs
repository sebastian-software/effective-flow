import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { resolveEagerIncludes } from '../build-lib.mjs';

const repositoryRoot = new URL('..', import.meta.url);

function source(path) {
  return readFileSync(new URL(path, repositoryRoot), 'utf8');
}

function ordered(text, ...fragments) {
  let position = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, position + 1);
    assert.notEqual(next, -1, `missing ordered fragment: ${fragment}`);
    assert.ok(next > position, `fragment is out of order: ${fragment}`);
    position = next;
  }
}

test('plan routes an unambiguous issue through Stage A and exits before local planning', () => {
  const plan = source('src/tools/plan.md');
  const gateway = source('src/shared/plan-input-gateway.md');
  const renderedGateway = resolveEagerIncludes(gateway, {
    context: 'shared/plan-input-gateway.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  assert.match(plan, /lazy-include\nplan-input-gateway/);
  assert.match(gateway, /```include\napply-source-detection\n```/);
  assert.doesNotMatch(renderedGateway, /```include|shared\/apply-source-detection\.md/);
  assert.match(renderedGateway, /A four-digit number without a path is always a/);
  ordered(
    gateway,
    'Read the project-setup ADR',
    'Use the included source-detection contract and execute **Stage A only**',
    'If Stage A returns `issue-reference`',
    'delegate to `{{SKILL:plan-issue}}` with the complete\n   original argument unchanged',
    'end the local\n   `{{SKILL:plan}}` workflow immediately',
  );
  assert.match(gateway, /Do not inspect tracker state, create or migrate a plan/);
});

test('plan gateway preserves local-input and legacy-plan precedence', () => {
  const gateway = source('src/shared/plan-input-gateway.md');
  const detection = source('src/shared/apply-source-detection.md');

  ordered(detection, '**Plan reference**', '**Issue reference**', '**Otherwise**');
  assert.match(detection, /full path \(`<plan\.dir>\/YYYY-MM-DD-…md`\)/);
  assert.match(
    detection,
    /A four-digit number without a path is always a\n\(legacy\) plan reference, never an issue reference\./,
  );
  assert.match(
    gateway.replace(/\s+/g, ' '),
    /For `none`, `plan`, `review-report`, or `ambiguous`, do not infer an issue\.[\s\S]*Natural-language requirement text therefore retains the existing local-plan behavior\./,
  );
});

test('plan-issue runs the full quality baseline before its per-issue deep-review gate', () => {
  const planIssue = source('src/tools/plan-issue.md');

  ordered(
    planIssue,
    '### Phase 3: Automatic quality baseline per issue',
    'generic gap judgment',
    'validation judgment',
    'internal plan-review judgment',
    'do **not** offer the deep review yet',
    '### Phase 4: Persist, deep-review gate, and readiness',
    'question: Start the deep interactive plan review now?',
  );
  assert.match(planIssue, /Do not reuse this answer for any other selected issue\./);
  assert.match(
    planIssue,
    /On \*\*Yes\*\*, read `\{\{SKILL:plan-review\}\}` and invoke it in \*\*issue mode\*\*/,
  );
  assert.match(
    planIssue,
    /On \*\*No\*\*, retain the approved automatic baseline, record no artificial open point,[\s\S]*`\{\{SKILL:plan-issue\}\} <issue>` as the optional later re-entry/,
  );
});

test('plan-issue completes readiness sequentially and never releases blocked artifacts', () => {
  const planIssue = source('src/tools/plan-issue.md');

  assert.match(
    planIssue,
    /Complete this entire phase for the active issue before starting another issue/,
  );
  const normalized = planIssue.replace(/\s+/g, ' ');
  ordered(
    normalized,
    'If the deep review is ended, deferred after it starts, fails to persist, or returns a blocking',
    'keep or add `effective-flow-needs-planning`',
    'Otherwise remove `effective-flow-needs-planning`',
    'continue with the next selected issue',
  );
  assert.match(
    planIssue,
    /One blocked issue must not prevent the remaining issues from[\s\S]*their own baseline, question, comment update, and label decision/,
  );
  assert.match(planIssue, /A nonempty open-points section is implementation-blocking/);
});

test('plan-review exposes file and issue adapters while issue mode stays comment-only', () => {
  const review = source('src/tools/plan-review.md');

  assert.match(review, /\*\*File mode:\*\*/);
  assert.match(review, /\*\*Issue mode:\*\*/);
  assert.match(review, /open points exists at the end of the active\n\s*artifact/);
  assert.match(review, /In file mode, retain the existing end-of-plan contract/);
  assert.match(review, /\*\*File adapter:\*\* write only the resolved plan file back/);
  assert.match(
    review,
    /\*\*Issue adapter:\*\* preserve the leading `<!-- effective-flow-plan-issues -->` marker/,
  );
  assert.match(review, /call\n\s*`issue-comment-update` for only the supplied comment ID/);
  assert.match(
    review,
    /In issue mode, creating a plan file, adding a comment, updating another comment, changing the\n\s*issue body, or independently resolving a tracker\/issue is forbidden/,
  );
  assert.match(review, /never suggest the public `review`\n\s*gateway for an issue/);
});

test('issue planning updates one comment fail-closed and apply rejects blocking open points', () => {
  const tracker = source('src/shared/issue-tracker.md');
  const applyIssues = source('src/tools/apply-issues.md');

  assert.match(tracker, /targeted issue-comment update operation is `issue-comment-update`/);
  assert.match(tracker, /positive `commentId`/);
  assert.match(tracker, /reads the issue comments again/);
  assert.match(tracker, /must not fall back to `issue-comment` and create a competing comment/);
  assert.match(tracker, /abort with `UNSUPPORTED_CAPABILITY`\n\s*before a write/);

  assert.match(
    applyIssues,
    /planning artifact,\n\s*even if the original body is thin; it is \*\*not automatically sufficient\*\*/,
  );
  assert.match(
    applyIssues,
    /`### Open points` \/ `### Offene Punkte` section is nonempty[\s\S]*treat the issue as `insufficient`/,
  );
  assert.match(
    applyIssues,
    /review assumption explicitly marked as implementation-blocking as `insufficient`/,
  );
  assert.match(applyIssues, /never route it to\n\s*implementation/);
});
