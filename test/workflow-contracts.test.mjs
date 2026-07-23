import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('release exposes verified delivery state before starting the catalog job', () => {
  const release = source('.github/workflows/release.yml');

  assert.match(
    release,
    /outputs:\n\s+release_created: \$\{\{ steps\.release\.outputs\.release_created \}\}\n\s+tag_name: \$\{\{ steps\.release\.outputs\.tag_name \}\}\n\s+delivery_commit: \$\{\{ steps\.deliver\.outputs\.commit \}\}/,
  );
  ordered(
    release,
    'name: Release Please',
    'name: Deliver portable skill, consumer docs, and trusted automation to main',
    'name: Verify delivered commit',
    'update-team-catalog:',
    'needs: release',
    "needs.release.outputs.release_created == 'true'",
    'name: Update Effective Flow team-catalog pin',
  );
  assert.match(
    release,
    /if: \$\{\{ needs\.release\.result == 'success' && needs\.release\.outputs\.release_created == 'true' \}\}/,
  );
  assert.match(release, /--delivery-commit "\$\{\{ needs\.release\.outputs\.delivery_commit \}\}"/);
  assert.match(release, /--release-tag "\$\{\{ needs\.release\.outputs\.tag_name \}\}"/);
});

test('release delegates the licensed develop-to-main payload to central staging', () => {
  const release = source('.github/workflows/release.yml');
  const staging = source('scripts/stage-delivery.mjs');

  assert.match(release, /on:\n\s+push:\n\s+branches: \[develop\]/);
  assert.match(release, /target-branch: develop/);
  ordered(
    staging,
    "'effective-flow',\n    'LICENSE',",
    "cpSync(join(root, 'LICENSE'), join(work, 'LICENSE'));",
    "cpSync(portableSkill, join(work, 'effective-flow'), { recursive: true });",
  );
  ordered(
    release,
    'git fetch origin main',
    'git worktree add --force "$work" origin/main',
    'node scripts/stage-delivery.mjs "$work" "$GITHUB_REPOSITORY" develop',
    'node scripts/distribution-smoke.mjs delivery "$work"',
    'git -C "$work" push "https://x-access-token:${DELIVERY_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:main',
    'git fetch origin main',
    'test "$(git rev-parse origin/main)" = "${{ steps.deliver.outputs.commit }}"',
    'node scripts/distribution-smoke.mjs delivery "$verify_work"',
  );
  assert.doesNotMatch(release, /^\s*(?:cp|install|rsync)\b[^\n]*\bLICENSE\b[^\n]*$/m);

  // The delivery push authenticates with a dedicated delivery GitHub App token so that app
  // is the sole bypass identity once the `main` ruleset restricts direct pushes (issue #143).
  ordered(
    release,
    'name: Create delivery token',
    'uses: actions/create-github-app-token@v3',
    'app-id: ${{ secrets.DELIVERY_APP_ID }}',
    'private-key: ${{ secrets.DELIVERY_APP_PRIVATE_KEY }}',
    'permission-contents: write',
    'DELIVERY_TOKEN: ${{ steps.delivery-token.outputs.token }}',
  );
});

test('delivery stages the canonical Renovate config from the repository root', () => {
  const renovate = JSON.parse(source('renovate.json'));
  const staging = source('scripts/stage-delivery.mjs');
  const smoke = source('scripts/distribution-smoke.mjs');
  const release = source('.github/workflows/release.yml');
  const retiredConfig = new URL('scripts/delivery-renovate.json', repositoryRoot);

  assert.equal(renovate.$schema, 'https://docs.renovatebot.com/renovate-schema.json');
  assert.deepEqual(renovate.extends, ['local>sebastian-software/renovate-config']);
  assert.deepEqual(renovate.baseBranchPatterns, ['develop']);
  assert.equal(renovate.baseBranches, undefined);
  assert.match(staging, /cpSync\(join\(root, 'renovate\.json'\), join\(work, 'renovate\.json'\)\)/);
  assert.match(smoke, /'delivered Renovate config'/);
  assert.equal(existsSync(retiredConfig), false);
  for (const contents of [staging, smoke, release]) {
    assert.doesNotMatch(contents, /delivery-renovate\.json/);
  }
});

test('catalog job uses scoped app tokens and a checksum-pinned Dalo binary', () => {
  const release = source('.github/workflows/release.yml');

  assert.match(release, /actions\/create-github-app-token@v3/g);
  assert.equal(
    release.match(/client-id: \$\{\{ vars\.DALO_CATALOG_APP_CLIENT_ID \}\}/g)?.length,
    2,
  );
  // The catalog job authenticates through client-id; the only app-id in the workflow is the
  // dedicated delivery token (issue #143).
  assert.equal(release.match(/\bapp-id: \$\{\{ secrets\.DELIVERY_APP_ID \}\}/g)?.length, 1);
  assert.equal(
    release.match(/private-key: \$\{\{ secrets\.DALO_CATALOG_APP_PRIVATE_KEY \}\}/g)?.length,
    2,
  );
  assert.match(release, /repositories: effective-flow\n\s+permission-contents: read/);
  assert.match(
    release,
    /repositories: skills\.sebastian-software\.com\n\s+permission-contents: write\n\s+permission-pull-requests: write/,
  );
  assert.match(
    release,
    /repository: sebastian-software\/skills\.sebastian-software\.com[\s\S]*?persist-credentials: false[\s\S]*?path: team-catalog/,
  );
  assert.match(release, /dalo-0\.9\.2-x86_64-unknown-linux-musl/);
  assert.match(release, /7f7b7b4948a5cd156948bb0a8ceaa4889c09cd6d53397c07370c663bac1343ef/);
  ordered(release, 'curl --fail', 'sha256sum --check --strict', 'tar -xzf', 'install -m 0755');
  assert.match(release, /DALO_SOURCE_TOKEN: \$\{\{ steps\.source-token\.outputs\.token \}\}/);
  assert.match(release, /GH_TOKEN: \$\{\{ steps\.target-token\.outputs\.token \}\}/);
  assert.match(release, /node scripts\/update-team-catalog\.mjs/);
});
