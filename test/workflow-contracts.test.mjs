import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assertNoUnresolvedEagerIncludes,
  collectIncludeNames,
  renderBody,
  resolveEagerIncludes,
  resolveLazyIncludes,
} from '../build-lib.mjs';

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

// Slices one Markdown section so a row assertion cannot be satisfied by an
// identically named row that moved into a neighboring (e.g. optional) table.
function section(text, heading, stop = '\n### ') {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section heading: ${heading}`);
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf(stop);
  return end === -1 ? rest : rest.slice(0, end);
}

// Slices one workflow step so a step-level assertion cannot be satisfied by text
// that happens to sit in a neighboring step.
function workflowStep(text, name) {
  const marker = `      - name: ${name}`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const rest = text.slice(start + marker.length);
  const end = rest.search(/\n(?: {6}- | {2}\S)/);
  return end === -1 ? rest : rest.slice(0, end);
}

// First column of every Markdown table row in the given text, compared
// literally so no cell value is reinterpreted as a regular expression.
function firstColumnCells(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1].trim());
}

function tableRow(text, cell) {
  const row = text
    .split('\n')
    .find((line) => line.startsWith('|') && line.split('|')[1].trim() === cell);
  assert.ok(row, `missing table row: ${cell}`);
  return row;
}

function flat(text) {
  return text.replace(/\s+/g, ' ');
}

// Two contract tokens inside one bounded window, in either order. Used where the contract is
// that the two belong together — a rule and its rationale, an exclusion and the marker it
// names — but not which of them an editor puts first. A reworded paragraph therefore stays
// green while a dropped half still fails.
function near(first, second, span = 300) {
  return new RegExp(
    `(?:${first}[\\s\\S]{0,${span}}?${second}|${second}[\\s\\S]{0,${span}}?${first})`,
    'i',
  );
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

test('the session-title contract ships in the router and stays out of the budgeted tools', () => {
  const router = source('src/SKILL.md');
  const fragment = source('src/shared/session-title.md');
  const renderedRouter = resolveEagerIncludes(router, {
    context: 'SKILL.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  // The router is the only carrier: `build` and `plan` sit at the 700-line context
  // budget, so even a lazy-include pointer per tool would fail the build.
  assert.match(router, /```include\nsession-title\n```/);
  assert.equal(router.match(/```include\nsession-title\n```/g).length, 1);
  assert.doesNotMatch(renderedRouter, /```include/);
  assert.match(renderedRouter, /\*\*Suggested session title:\*\* <title>/);
  for (const directory of ['src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      assert.doesNotMatch(
        source(`${directory}/${file}`),
        /session-title/,
        `${directory}/${file} must not carry the always-loaded session-title fragment`,
      );
    }
  }

  // Load-bearing clauses: a host gate that never touches the running session, a
  // single emission, and a subject-first title.
  assert.match(fragment, /Never call such a tool for the current session/);
  assert.match(fragment, /apply the title silently instead of proposing it/);
  assert.match(fragment, /a delegate never repeats a subject its parent already proposed/);
  assert.match(fragment, /at most 60 characters/);
  for (const silent of ['version', 'open-plans', 'setup', 'cleanup', 'commit', 'pr']) {
    assert.match(
      fragment,
      new RegExp(`\`${silent}\``),
      `${silent} must stay listed as a silent tool`,
    );
  }
  ordered(
    fragment,
    '## Session title',
    'Only where sessions carry titles',
    'Only from work-subject tools',
    'Once, as soon as the subject exists',
    'Subject first',
    'One line, never blocking',
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

test('security findings stay local until the review publication gate is confirmed', () => {
  const review = source('src/tools/review.md');
  const gate = source('src/shared/security-disclosure-gate.md');
  const tracker = source('src/shared/issue-tracker.md');

  // review.md orchestrates: it loads the gate and classifies before it publishes anything.
  assert.match(review, /```lazy-include\nsecurity-disclosure-gate\n/);
  assert.match(review, /\*\*Central security classification:\*\*/);
  ordered(
    review,
    '**Dedup withheld findings:**',
    '**Reserve IDs:**',
    '**Run the security disclosure gate:**',
    '**Create finding issues:**',
  );
  assert.match(review, /must finish before the reservation, so a finding already recorded/);
  assert.match(review, /in that order and before any tracker mutation/);
  assert.match(
    review,
    /plus the withheld findings only when the gate returned an explicit publication confirmation/,
  );

  // The gate classifies conservatively and never weakens the reviewer signal.
  assert.match(
    gate,
    /`local-only` for every security-relevant finding, `publishable` for every other finding/,
  );
  assert.match(gate, /never\*\* de-escalate one marked `external`/);
  assert.match(gate, /uncertain value classifies as `local-only`/);

  // The gate persists the withheld findings before any tracker mutation, and only then asks.
  ordered(
    gate,
    '### Local dedup',
    '### Local-first persistence',
    'review-report-YYYY-MM-DD-security[-N].md',
    '### Publication offer',
    'header: Security',
    '🔓 Published as #<issue number>',
    '### Silence in public artifacts',
  );
  assert.match(gate, /an unanswered, skipped, or\nnon-interactive run publishes nothing/);
  assert.match(
    gate,
    /epic body and every issue body contain no count, title, signature, ID, or other reference/,
  );

  // A blocked report never blocks the unrelated findings, and never silently publishes.
  assert.match(
    gate,
    /\*\*If the report cannot be written\*\*, publish the `publishable` findings as usual, publish\n\s*nothing from the withheld set/,
  );

  // The gate binds every publisher and cannot be configured away. That it binds an
  // external target too is asserted once, in the tracker-target security test below.
  assert.match(tracker, /### Security disclosure gate/);
  assert.match(
    flat(tracker),
    /never\*\* written to a tracker without an explicit per-run confirmation/,
  );
  assert.match(
    flat(tracker),
    /does not sanitize branch names, commit subjects, or pull request bodies/,
  );

  // Every reviewer supplies the signal the classification consumes.
  for (const agent of [
    'frontend-reviewer',
    'nodejs-reviewer',
    'rust-reviewer',
    'generic-product-reviewer',
  ]) {
    const reviewer = source(`src/agents/${agent}.md`);
    assert.match(reviewer, /- Security relevance: `external`, `internal`, or `none`/);
    assert.match(reviewer, /when unsure, report the stronger value/);
  }

  // The local report route must not implement a finding that was published as an issue,
  // and must hand it over instead of dropping it — a report file cannot enter remote mode.
  const applyReview = source('src/tools/apply-review.md');
  assert.match(
    applyReview,
    /\*\*Already published as an issue:\*\*[\s\S]*do not implement it from the report/,
  );
  assert.match(applyReview, /\| Already published \(→ issue\) \| P \|/);
  assert.match(
    applyReview,
    /\*\*Hand over published findings:\*\*[\s\S]*`\{\{SKILL:apply\}\} #<nr> \[#<nr> …\]`/,
  );
  assert.match(applyReview, /Never drop them silently/);
  assert.match(
    applyReview,
    /a report consisting only of published findings ends with an executable next step/,
  );
});

test('release exposes verified delivery state to the disabled catalog job', () => {
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
    'if: false',
    'name: Update Effective Flow team-catalog pin',
  );
  // The catalog job is statically disabled while the catalog side does not resolve
  // `effective-flow` as a Dalo source. Its wiring stays intact so re-enabling is a one-line
  // change, but no created-release gate may quietly put the failing job back on the release
  // path without this contract being updated too.
  assert.doesNotMatch(release, /if: \$\{\{[^}]*needs\.release\.outputs\.release_created[^}]*\}\}/);
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
    'uses: actions/create-github-app-token@',
    'client-id: ${{ vars.DELIVERY_APP_CLIENT_ID }}',
    'private-key: ${{ secrets.DELIVERY_APP_PRIVATE_KEY }}',
    'permission-contents: write',
    'DELIVERY_TOKEN: ${{ steps.delivery-token.outputs.token }}',
  );
  // `app-id` is deprecated in actions/create-github-app-token; guard the whole workflow so the
  // deprecated input cannot creep back in (issue #254).
  assert.doesNotMatch(release, /^\s*app-id:/m);
});

test('release-please opens its pull request with an explicit non-default token', () => {
  const release = source('.github/workflows/release.yml');

  // The action defaults `token` to `${{ github.token }}`, and GitHub restricts what events
  // raised by the default token may start, so the release pull request's CI parks in
  // `action_required` and never runs. Omitting the input again would be silent, so the
  // assertion is scoped to the step and anchored at the `with:` key indent rather than
  // matching anywhere in the file (issue #279).
  const step = workflowStep(release, 'Release Please');
  assert.match(step, /^ {8}uses: googleapis\/release-please-action@/m);
  assert.match(step, /^ {10}token: \$\{\{ steps\.release-token\.outputs\.token \}\}$/m);
  assert.match(step, /^ {10}target-branch: develop$/m);
  assert.doesNotMatch(release, /^\s*token: \$\{\{ github\.token \}\}$/m);

  // The token is a short-lived App installation token rather than a long-lived personal
  // access token, so no credential on the release path expires or belongs to a person.
  // It must be minted before release-please consumes it, hence the ordering assertion.
  const mint = workflowStep(release, 'Create release token');
  // Matched without the ref: that this step runs a pinned implementation is asserted once, by
  // the workflow-pinning test below, so a Renovate digest bump touches no assertion at all.
  assert.match(mint, /^ {8}uses: actions\/create-github-app-token@/m);
  assert.match(mint, /^ {10}client-id: \$\{\{ vars\.RELEASE_APP_CLIENT_ID \}\}$/m);
  assert.match(mint, /^ {10}private-key: \$\{\{ secrets\.RELEASE_APP_PRIVATE_KEY \}\}$/m);
  // release-please needs both, and the token is scoped down to exactly those.
  assert.match(mint, /^ {10}permission-contents: write$/m);
  assert.match(mint, /^ {10}permission-pull-requests: write$/m);
  ordered(release, 'name: Create release token', 'name: Release Please');
});

test('the delivery push keeps the delivery app identity', () => {
  const release = source('.github/workflows/release.yml');

  // A persisted GITHUB_TOKEN lands in the git config as an extraheader that outranks the
  // delivery App token in the push URL and is inherited by `git worktree`, so the push would
  // run as github-actions[bot] — not a ruleset bypass actor — and `main` would reject it.
  // That is how v1.53.0 and v1.54.0 failed to reach `main` (issue #274).
  // Matched without the ref so a re-pin cannot quietly turn this into `undefined === undefined`
  // and take the guard with it. The invariant is the count, not which version is referenced;
  // the pinning convention itself is asserted once, in the workflow-pinning test below.
  assert.equal(
    release.match(/^\s*-?\s*uses: actions\/checkout@/gm)?.length,
    release.match(/^\s*persist-credentials: false$/gm)?.length,
  );
  // Second, independent mechanism, because the delivery identity is only observable on a real
  // release and no pre-merge check would catch a regression: any surviving header is cleared
  // before the push. The unset must tolerate a missing key — `git config --unset-all` exits 5
  // for one and the step runs under `bash -e`.
  assert.match(
    release,
    /git config --unset-all http\.https:\/\/github\.com\/\.extraheader \|\| true/,
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

  assert.match(release, /actions\/create-github-app-token@/g);
  assert.equal(
    release.match(/client-id: \$\{\{ vars\.DALO_CATALOG_APP_CLIENT_ID \}\}/g)?.length,
    2,
  );
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

test('the tracker config keys document three modes in source, setup, and user guide', () => {
  const tracker = source('src/shared/issue-tracker.md');
  const setup = source('src/tools/setup.md');
  const docs = source('docs/user-guide/configuration.md');

  // Schema and defaults of the two new keys live in the tracker fragment. The JSON
  // keys are matched independently so the assertion does not pin their order.
  assert.match(tracker, /"externalTool": null/);
  assert.match(tracker, /"externalToolHint": null/);
  assert.match(tracker, /- `tracker\.externalTool`: `null`/);
  assert.match(tracker, /- `tracker\.externalToolHint`: `null`/);
  const flatTracker = flat(tracker);
  assert.match(flatTracker, /- `tracker\.mode`: `"local"`, `"remote"`, `"external"`/);
  assert.match(flatTracker, /Required when the mode is `external`\./);
  assert.match(flatTracker, /There is \*\*no\*\* whitelist/);
  assert.match(
    flatTracker,
    /`tracker\.externalToolHint`: free text that lets the run-time agent pick the right connection/,
  );
  assert.match(flatTracker, /It names a \*\*forge\*\* CLI and stays forge-only\./);

  // setup owns the interview that pins them, and asks for the same three modes.
  const flatSetup = flat(setup);
  for (const mode of ['local', 'remote', 'external']) {
    assert.match(
      flatSetup,
      new RegExp(`tracker\\.mode = ${mode}`),
      `the setup interview must offer tracker.mode = ${mode}`,
    );
  }
  assert.match(flatSetup, /`tracker\.externalTool` – the short, stable identifier/);
  assert.match(flatSetup, /It is required for this mode, there is no list of supported tools/);
  assert.match(flatSetup, /`tracker\.externalToolHint` – optional free text/);
  assert.match(flatSetup, /`tracker\.remoteToolOverride` stays a forge setting/);

  // The user guide carries the contract in its own `tracker` block, not in a passing
  // mention elsewhere. Its defaults are presented as `(unset)` rather than `null`.
  const trackerBlock = section(docs, '## Block `tracker`', '\n## ');
  const modeRow = tableRow(trackerBlock, '`mode`');
  for (const mode of ['local', 'remote', 'external']) {
    assert.match(modeRow, new RegExp(`\`${mode}\``), `the mode row must list ${mode}`);
  }
  assert.match(tableRow(trackerBlock, '`externalTool`'), /required for `mode: external`/);
  assert.match(tableRow(trackerBlock, '`externalTool`'), /no whitelist/);
  assert.match(tableRow(trackerBlock, '`externalToolHint`'), /connection/);
  assert.match(
    flat(trackerBlock),
    /A `mode: external` without a non-empty `externalTool` is invalid configuration: the run aborts instead of falling back to the forge or to `local`\./,
  );
});

test('an external tracker target fails closed on all four connection failures', () => {
  const target = source('src/shared/tracker-target.md');
  const tracker = source('src/shared/issue-tracker.md');
  const discovery = section(target, '### Connection discovery');
  const flatDiscovery = flat(discovery);

  assert.match(discovery, /\*\*Fail closed\.\*\*/);
  const classes = firstColumnCells(discovery);
  for (const failure of [
    'missing tool identifier',
    'no connection',
    'ambiguous connection',
    'missing capability',
  ]) {
    assert.ok(
      classes.includes(failure),
      `failure class must stay in the fail-closed table of "Connection discovery": ${failure}`,
    );
  }
  assert.match(
    flatDiscovery,
    /aborts the run before its first write, with a remediation hint and every workflow artifact preserved/,
  );
  assert.match(flatDiscovery, /There is no silent fallback\./);
  assert.match(
    flatDiscovery,
    /Publishing to the forge instead would scatter[\s\S]*degrading to a local report would hide work the user asked to publish/,
  );
  assert.match(flatDiscovery, /an unanswered or non-interactive run publishes nothing/);

  // The always-loaded fragment states the same closure for the missing identifier.
  assert.match(
    flat(tracker),
    /Never guess a tool, and never fall back to the forge or to `local`\./,
  );
});

test('the external capability gate aborts before the first write and keeps the relation conditional', () => {
  const target = source('src/shared/tracker-target.md');
  const required = section(target, '### Required capabilities');
  const flatRequired = flat(required);

  const capabilities = firstColumnCells(required);
  for (const capability of [
    'read one issue',
    'list or search issues',
    'create an issue',
    'read comments',
    'create a comment',
    'update a comment by its ID',
    'add and remove a classification',
    'patch an exact block or checklist',
  ]) {
    assert.ok(
      capabilities.includes(capability),
      `capability must stay in the required table of "Required capabilities": ${capability}`,
    );
  }
  assert.match(
    flatRequired,
    /abort before the first write and name the missing capability — the external equivalent of `UNSUPPORTED_CAPABILITY`/,
  );
  // Exactly one capability may be missing without aborting, and it is the relation —
  // but only together with the write that makes it usable. Gating the native mechanism on
  // the relation's mere existence let a read-only relation reach delivery and fail to mark
  // completion after the pull request existed.
  assert.match(
    flatRequired,
    /One capability is \*\*conditional\*\*: a native parent\/sub-issue relation \*\*whose sub-item completion state this connection can write\*\*/,
  );
  assert.match(
    flatRequired,
    /Discovery must prove that write, not merely that the relation exists/,
  );
  assert.match(
    flatRequired,
    /An unproven or missing completion write never aborts: the run selects the checklist fallback/,
  );
  // Capabilities come from the resolved connection, never from the tool's name.
  assert.match(
    flat(section(target, '### Connection discovery')),
    /Establish the coverage from the resolved connection itself, not from the tool's name/,
  );
});

test('the external container mechanism is chosen once, reported, and never mixed', () => {
  const target = source('src/shared/tracker-target.md');
  const container = flat(section(target, '### Container mechanism'));

  assert.match(
    container,
    /exactly one mechanism, decided once per run from the resolved connection and named in the run summary/,
  );
  ordered(
    container,
    '**Native relation (preferred).**',
    'If the connection exposes a parent/sub-issue relation',
    '**Checklist fallback.**',
  );
  assert.match(
    container,
    /Never mix the two within one container, and never downgrade a native relation to a checklist mid-run/,
  );

  // The native mechanism must be gated on the completion *write*, not on the relation's
  // existence. Otherwise a read-only relation is selected, the run creates a PR, and only
  // then fails to mark completion — after the first write, and leaving a work item the next
  // run implements again.
  assert.match(
    container,
    /parent\/sub-issue relation \*\*and\*\* discovery proved that it can write a sub-item's completion state/,
  );
  assert.match(
    container,
    /a relation whose completion state this connection cannot write — carry the/,
  );
  assert.match(
    container,
    /Selecting the fallback because the completion write could not be proven is part of that one decision, not a downgrade/,
  );

  // The conditional capability and its degrade-not-abort rule are pinned once, by the
  // capability-gate test above.
  // Both flows that tick off only after a PR exists must settle the mechanism in preflight.
  for (const path of ['src/tools/apply-issues.md', 'src/tools/apply-review-remote.md']) {
    assert.match(
      flat(source(path)),
      /only when the connection proves it can write a sub-item's completion state/,
      `${path} must settle the container mechanism before delivery`,
    );
  }
});

test('plan files stay committed and pull requests stay on the forge in every tracker target', () => {
  const target = source('src/shared/tracker-target.md');
  const prComments = source('src/shared/pr-review-comments.md');
  const boundary = flat(section(target, '### Forge boundary'));

  // Plan-file invariant: no target introduces an external publication path.
  assert.match(
    boundary,
    /`\{\{SKILL:plan\}\}` keeps writing a committed Markdown file below `plan\.dir` in every target, and no target introduces an external publication path for plan files/,
  );
  assert.match(
    boundary,
    /Investigations likewise stay local below `\.effective-flow\/investigation\/` in every target/,
  );

  // Forge boundary: code-host objects never follow the tracker target.
  assert.match(
    boundary,
    /Pull requests, PR comments, and PR review threads are code-host objects and stay with the forge behind `origin`, whatever the tracker target is/,
  );
  assert.match(boundary, /the PR body references the external issue identifier/);
  assert.match(
    flat(prComments),
    /Pull requests, PR comments, and PR review threads are code-host objects and stay with the forge behind `origin` even when the tracker target is `external`; a tracker target never redirects them/,
  );
});

test('the security disclosure gate binds every publisher on every tracker target', () => {
  const tracker = source('src/shared/issue-tracker.md');
  const gate = flat(section(tracker, '### Security disclosure gate'));

  assert.match(
    gate,
    /This gate binds every publisher of review findings and overrides `tracker\.mode`/,
  );
  assert.match(gate, /there is no configuration key that switches it off/);
  assert.match(
    gate,
    /Publication to a third-party tracker is a disclosure with the same consequences as publication to a public forge, so the gate binds a forge target and an external target alike/,
  );
  assert.match(gate, /Rules for every publisher, on whichever tracker target the run resolved/);
  // The AI-attribution ban generalizes the same way.
  assert.match(
    flat(section(tracker, '### No AI attribution in issue bodies and comments')),
    /This binds every publisher on every tracker target, the forge and an external tool alike/,
  );
});

test('every source embedding issue-tracker also loads the tracker-target fragment', () => {
  const fence =
    '```lazy-include\ntracker-target\nwhen: the resolved tracker target is `external`\n```';

  // The consumer set is derived, not listed: a seventh tool that embeds the tracker
  // integration without this pointer would otherwise ship without the external contract.
  function includeClosure(body) {
    const names = new Set();
    const pending = [body];
    while (pending.length > 0) {
      const { eager, lazy } = collectIncludeNames(pending.pop());
      for (const name of [...eager, ...lazy]) {
        if (names.has(name)) continue;
        names.add(name);
        pending.push(source(`src/shared/${name}.md`));
      }
    }
    return names;
  }

  // One documented exemption. `cleanup.md` embeds the tracker integration only to decide
  // whether its `firmo-` label class runs at all; it performs no tracker write and skips that
  // class entirely on an external target, so the contract would be pure context cost there.
  // Exemptions are listed, never inferred — adding one has to be a deliberate edit, and an
  // exempt source must both omit the pointer and say why.
  const exempt = new Set(['src/tools/cleanup.md']);

  const consumers = [];
  for (const directory of ['src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      const path = `${directory}/${file}`;
      const body = source(path);
      // Eager and lazy embedding count alike: `review.md` defers `issue-tracker` itself.
      if (!includeClosure(body).has('issue-tracker')) continue;
      consumers.push(path);
      if (exempt.has(path)) {
        assert.equal(
          body.split(fence).length - 1,
          0,
          `${path} is exempt and must not carry the tracker-target load pointer`,
        );
        assert.match(
          flat(body),
          /deliberately carries \*\*no\*\* deferred `tracker-target` pointer/,
          `${path} must state why it is exempt`,
        );
        continue;
      }
      assert.equal(
        body.split(fence).length - 1,
        1,
        `${path} must carry the tracker-target load pointer exactly once`,
      );
    }
  }
  assert.ok(consumers.length > 0, 'no source embeds issue-tracker — derivation is vacuous');
  for (const path of exempt) {
    assert.ok(consumers.includes(path), `stale exemption: ${path} no longer embeds issue-tracker`);
  }
  assert.ok(
    consumers.includes('src/tools/review.md'),
    'review.md lazily embeds issue-tracker and must be part of the derived consumer set',
  );

  // Deviation from the plan, which predicted one nested fence inside this fragment.
  // `build.mjs:571` does resolve lazy fences after eager inlining, so the five tools
  // that eagerly include `issue-tracker` would have rendered fine. The dead pointer
  // comes from `src/tools/review.md`, which defers `issue-tracker` itself: the fragment
  // then also ships standalone through the eager-only path at `build.mjs:803`, where a
  // raw lazy fence survives verbatim. Guard #99 would not have caught it either, because
  // `tracker-target` still ships via the other roots. Do not "simplify" these fences
  // back into the fragment.
  const tracker = source('src/shared/issue-tracker.md');
  assert.doesNotMatch(tracker, /```lazy-include/);
  const flatTracker = flat(tracker);
  assert.match(flatTracker, /lives in the `tracker-target` fragment\./);
  assert.match(
    flatTracker,
    /Every source that embeds this fragment \*\*must\*\* carry its own deferred pointer to `tracker-target`/,
  );
  assert.match(flatTracker, /as soon as the resolved target is `external`/);
});

test('no source cites the non-existent "Host and CLI detection" section', () => {
  // AC4: the section never existed in `issue-tracker.md`; the surviving references were
  // broken across lines, so the sweep normalizes whitespace and Markdown emphasis.
  const tracker = source('src/shared/issue-tracker.md');
  assert.doesNotMatch(
    tracker,
    /^#+ .*host and cli detection/im,
    'issue-tracker.md must not gain the section this sweep forbids citing',
  );

  for (const directory of ['src/shared', 'src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      const normalized = flat(source(`${directory}/${file}`).replaceAll('*', ''));
      assert.doesNotMatch(
        normalized,
        /host and CLI detection/i,
        `${directory}/${file} must not reference the non-existent "Host and CLI detection" section`,
      );
    }
  }
});

test('the pr-review-integration fragment resolves through the build into all three targets', () => {
  const fragment = source('src/shared/pr-review-integration.md');

  // The fragment ships once per harness as a lazily loaded shared/pr-review-integration.md
  // (build.mjs's #99 guard). That path resolves nested **eager** includes — the fragment loads
  // `pr-review-comments` and `security-disclosure-gate` that way — but it never runs the lazy
  // resolver, so a ```lazy-include fence here would survive into the shipped file unresolved.
  assert.doesNotMatch(fragment, /```lazy-include/);

  const knownTools = new Set(
    readdirSync(new URL('src/tools/', repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, '')),
  );
  const knownAgents = new Set(
    readdirSync(new URL('src/agents/', repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, '')),
  );
  const refConfig = {
    exposedTools: [...knownTools],
    agentPrefix: 'effective-flow-',
    skillName: 'effective-flow',
    knownTools,
    knownAgents,
  };

  const resolved = resolveEagerIncludes(fragment, {
    context: 'shared/pr-review-integration.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  for (const harness of ['claude', 'codex', 'portable']) {
    const context = `shared/pr-review-integration.md (${harness})`;
    const rendered = renderBody(resolved, harness, { ...refConfig, context });
    assertNoUnresolvedEagerIncludes(rendered, { context });
    assert.match(rendered, /review-create/, harness);
    assert.match(rendered, /<!-- effective-flow-pr-review -->/, harness);
    assert.match(rendered, /Never approve and never request changes/, harness);

    // The security gate on this published surface is unconditional: making it switchable by a
    // configuration key must not ship green. Pinned as the rule rather than as one sentence —
    // any wording is accepted as long as it still binds the gate, states that no configuration
    // key changes it, and names `delivery.prReview` as included in that.
    const gateRule = rendered.split(/\n{2,}/).find((block) => /no configuration key/i.test(block));
    assert.ok(
      gateRule,
      `${harness}: the fragment must state that no configuration key changes the security gate`,
    );
    assert.match(gateRule, /gate|security/i, harness);
    assert.match(gateRule, /delivery\.prReview/, harness);
  }
});

test('every one of the three delivery call sites and review.md load the pr-review-integration fragment exactly once', () => {
  const callSites = [
    'src/shared/worktree-integration.md',
    'src/tools/apply-review-remote.md',
    'src/tools/apply-issues.md',
    'src/tools/review.md',
  ];

  for (const path of callSites) {
    const body = source(path);
    const { eager, lazy } = collectIncludeNames(body);
    assert.equal(eager.has('pr-review-integration'), false, `${path} must not eager-include it`);
    assert.ok(lazy.has('pr-review-integration'), `${path} must reference pr-review-integration`);

    const { names } = resolveLazyIncludes(body, { context: path });
    assert.equal(
      names.filter((name) => name === 'pr-review-integration').length,
      1,
      `${path} must load pr-review-integration exactly once`,
    );
  }
});

test('review.md keeps the plan-file special case before the pull-request special case', () => {
  const review = source('src/tools/review.md');
  ordered(
    review,
    '### Plan-file special case',
    '### Pull-request special case',
    'a bare four-digit value stays a\nlegacy plan reference',
  );

  // The bare four-digit precedence is stated explicitly, right at the pull-request
  // branch, not only implied by section order — a re-ordering that kept the words but
  // moved the section would still be caught by `ordered` above.
  assert.match(
    review,
    /Evaluated \*\*after\*\* the plan-file special case and never before it: a bare four-digit value stays a\s*\nlegacy plan reference and is never read as a pull request\./,
  );
});

test('the documentation sync gate is a fixed, blocking part of every implementation tool', () => {
  const consumers = ['build', 'fix', 'refactor', 'maintain'];
  for (const tool of consumers) {
    const { eager, lazy } = collectIncludeNames(source(`src/tools/${tool}.md`));
    assert.ok(
      eager.has('documentation-sync'),
      `tools/${tool}.md must embed documentation-sync eagerly, so the phase cannot be deferred away`,
    );
    assert.ok(!lazy.has('documentation-sync'), `tools/${tool}.md must not lazy-load the gate core`);
  }

  // The eager core carries the mandate; only the detail contract is deferred.
  const core = source('src/shared/documentation-sync.md');
  assert.match(flat(core), /mandatory/i);
  assert.match(flat(core), /not skippable|unskippable/i);
  assert.ok(
    collectIncludeNames(core).lazy.has('documentation-sync-contract'),
    'the eager core must lazy-load its detail contract',
  );

  const contract = source('src/shared/documentation-sync-contract.md');
  for (const verdict of ['`updated`', '`no impact`', '`blocked`']) {
    assert.ok(contract.includes(verdict), `missing verdict state: ${verdict}`);
  }
  // A bare "not relevant" must not satisfy the gate, otherwise `no impact`
  // degrades into the skip clause this change removes.
  assert.match(flat(contract), /not relevant.{0,80}does not satisfy/i);
  // Both blocking branches: escalate interactively, hand off as a finding when
  // delegated non-interactively.
  ordered(flat(contract), 'interactive', 'non-interactive delegation');
  assert.match(flat(contract), /non-interactive delegation.{0,400}do not abort/i);
  assert.match(contract, /Action: \{\{SKILL:docs\}\}/);

  // The clauses that made documentation optional are gone.
  assert.doesNotMatch(source('src/tools/build.md'), /Skip user docs only with a short/);
  assert.doesNotMatch(
    source('src/tools/refactor.md'),
    /do not introduce a documentation phase if the refactoring/,
  );
  assert.doesNotMatch(
    source('docs/user-guide/tools-implement.md'),
    /Introduces no documentation phase when no public behavior/,
  );
});

test('the concept workflows keep their write boundary at the concept directory', () => {
  const concept = source('src/tools/concept.md');
  const conceptReview = source('src/tools/concept-review.md');

  // Neither workflow may produce the artifacts of a neighboring lifecycle: a plan file
  // would make an unimplementable concept look implementable, an ADR would break the
  // single-file write boundary, and code would leave the analysis phase entirely.
  assert.match(
    flat(concept),
    /Only analysis, follow-up questions, and one new file under `<concept\.dir>\/` are allowed\./,
  );
  assert.match(flat(concept), /no plan file under `<plan\.dir>\/` and no ADR under `docs\/adr\/`/);
  assert.match(concept, /Do not start any implementation phase and create no plan file\./);

  assert.match(
    flat(conceptReview),
    /changes to exactly one referenced concept file under `<concept\.dir>\/` are allowed\./,
  );
  assert.match(
    flat(conceptReview),
    /create no plan file under `<plan\.dir>\/` and no ADR under `docs\/adr\/`/,
  );
  assert.match(conceptReview, /Change only the one referenced concept file\./);
});

test('review evaluates the concept-file special case after the plan-file special case', () => {
  const review = source('src/tools/review.md');

  ordered(
    review,
    '### Plan-file special case',
    '### Concept-file special case',
    '### Phase 1: Scope',
  );

  // The precedence is stated explicitly at the concept branch, not merely implied by
  // section order: a reordering that kept the words would still be caught by `ordered`,
  // but a silently dropped precedence sentence would not.
  assert.match(
    review,
    /Evaluated \*\*after\*\* the plan-file special case and never before it: a bare four-digit value stays a\s*\nlegacy plan reference and is never read as a concept reference\./,
  );
  assert.match(review, /Read the internal instruction `\{\{SKILL:concept-review\}\}`/);

  // The plan branch ends the workflow as soon as it matches, so the cross-artifact
  // ambiguity rule only takes effect if it is decided inside that branch, before it acts.
  // Stated in the concept branch alone it would be unreachable for exactly the ambiguous
  // argument it exists for.
  const planCase = review.slice(
    review.indexOf('### Plan-file special case'),
    review.indexOf('### Concept-file special case'),
  );
  assert.match(
    flat(planCase),
    /first resolve the same argument against `<concept\.dir>\/` per the concept-file special case below/,
  );
  assert.match(
    flat(planCase),
    /\*\*Plan match and concept match:\*\* the argument is ambiguous\. Name both interpretations, ask which artifact was meant, and start neither review\./,
  );
  assert.match(
    flat(planCase),
    /Only a bare file name or a title slug can be ambiguous — a full path names its directory, and a bare four-digit value stays a legacy plan reference\./,
  );
});

test('a new concept follows the configured workflow language, not an existing corpus', () => {
  const concept = source('src/tools/concept.md');

  // Adopting the corpus language unconditionally would let one German concept silently
  // flip an `language.workflow: en` project's next concept to German.
  assert.match(
    flat(concept),
    /Their language is \*\*not\*\* adopted: a new concept follows the resolved `language\.workflow`/,
  );
  assert.match(
    flat(concept),
    /an existing concept corpus is not a language signal and never overrides it/,
  );
  assert.match(
    flat(concept),
    /Only when editing an existing concept do you preserve its clearly recognizable complete language/,
  );
});

test('every concept consumer loads the concept contract exactly once and lazily', () => {
  for (const path of [
    'src/tools/concept.md',
    'src/tools/concept-review.md',
    'src/tools/review.md',
  ]) {
    const body = source(path);
    const { eager, lazy } = collectIncludeNames(body);
    assert.equal(eager.has('concept-contract'), false, `${path} must not eager-include it`);
    assert.ok(lazy.has('concept-contract'), `${path} must reference concept-contract`);

    const occurrences = [...body.matchAll(/```lazy-include\nconcept-contract\n/g)].length;
    assert.equal(occurrences, 1, `${path} must load concept-contract exactly once`);
  }
});

test('the concept contract pins its four status forms and separates concept from plan directory', () => {
  const contract = source('src/shared/concept-contract.md');

  for (const marker of [
    '**Konzeptstatus:** Entwurf',
    '**Konzeptstatus:** Ausgearbeitet',
    '**Concept status:** Draft',
    '**Concept status:** Elaborated',
  ]) {
    assert.ok(contract.includes(marker), `concept-contract must declare ${marker}`);
  }

  // A concept directory that resolves onto the plan directory would make a plan
  // reference and a concept reference indistinguishable for the review router, so it
  // fails closed. String inequality is not enough: `docs/plan` and `./docs/plan` are the
  // same directory, and a concept directory nested inside the plan directory is still
  // enumerated by the plan resolvers.
  assert.match(
    flat(contract),
    /must be \*\*separate directories\*\*, compared as canonical paths rather than as configured strings/,
  );
  assert.match(flat(contract), /physically canonicalize them/);
  assert.match(
    flat(contract),
    /Reject a configuration where the two resolve to the same directory \*\*or\*\* where one contains the other/,
  );
  assert.match(flat(contract), /A bare four-digit value is never a concept reference/);
  assert.match(flat(contract), /Concepts have no archive and no implemented state\./);
});

test('the concept review gates the elaborated status and points its re-entry at review', () => {
  const conceptReview = source('src/tools/concept-review.md');

  assert.match(
    flat(conceptReview),
    /Set `\*\*Concept status:\*\* Elaborated` \(German: `\*\*Konzeptstatus:\*\* Ausgearbeitet`\) exactly when no critical finding and no blocking open point remains/,
  );
  assert.match(flat(conceptReview), /Otherwise the status stays `Draft`\/`Entwurf`/);
  assert.match(conceptReview, /the re-entry\n\s*`\{\{SKILL:review\}\} <concept-file>`/);
});

test('the concept handoff stays self-contained text and marks ADR candidates only', () => {
  const contract = source('src/shared/concept-contract.md');
  const conceptReview = source('src/tools/concept-review.md');

  // The handoff is a convention, not a coupling: the plan gateway knows plans, review
  // reports and issue references, so a concept path reaches it as free-text requirement.
  assert.match(
    flat(contract),
    /The handoff is \*\*self-contained text\*\*: a complete `\{\{SKILL:plan\}\}` call whose requirement string names the work package and the concept file/,
  );
  assert.match(flat(contract), /the concept keeps no list of the plans derived from it/);
  assert.match(
    flat(contract),
    /Neither concept workflow writes an ADR, and neither asks for one\./,
  );

  assert.match(
    flat(conceptReview),
    /Create no plan file, maintain no list of derived plans, and change nothing about the routing of `\{\{SKILL:plan\}\}`\./,
  );
  assert.match(
    flat(conceptReview),
    /Mark durable decisions in the concept as ADR candidates with a one-line rationale\. Write no ADR/,
  );
});

test('pr never repeats a creation whose mutation may already have succeeded', () => {
  const pr = flat(source('src/tools/pr.md'));

  assert.match(pr, /Never re-run PR creation after `mutationMayHaveSucceeded`/);
  assert.match(pr, /repeating the mutation would create a duplicate for the same head/);
  // The prescribed response must be a lookup, not another create. It has to be the head/base
  // lookup: this failure path never received a PR number, so a number-keyed read cannot run.
  assert.match(pr, /Resolve it by repeating the step 8 existing-PR lookup/);
  assert.match(pr, /identifies a pull request by head and base rather than by a number/);
  assert.match(pr, /Retrying the creation is forbidden on every provider/);
});

test('a failed delivery is surfaced as an assigned issue that closes itself', () => {
  const release = source('.github/workflows/release.yml');
  const alarm = section(release, '- name: Report a failed delivery', '\n  update-team-catalog');
  const close = section(
    release,
    '- name: Close a resolved delivery alarm',
    '\n      - name: Report a failed delivery',
  );

  // The gate is the whole point: an ordinary red run creates no release and therefore no
  // drift, and an alarm that cries wolf gets ignored — the failure mode #278 is about.
  assert.match(
    alarm,
    /if: \$\{\{ failure\(\) && steps\.release\.outputs\.release_created == 'true' \}\}/,
  );
  // failure() excludes cancellation; always() would not.
  assert.doesNotMatch(alarm, /always\(\)/);

  // github.repository_owner is the sebastian-software organization, which GitHub rejects
  // as an assignee. The actor is the person whose push produced the release.
  assert.match(alarm, /--add-assignee "\$ACTOR"/);
  assert.match(alarm, /ACTOR: \$\{\{ github\.actor \}\}/);
  // The prose comment names repository_owner to explain why it is wrong, so assert on the
  // expression form: the value must never be interpolated into this step.
  assert.doesNotMatch(alarm, /\$\{\{ github\.repository_owner \}\}/);
  // A rejected assignee must not cost the alarm itself.
  assert.match(alarm, /\|\| echo "Could not assign/);

  // Needs only issues: write — never the delivery app credentials.
  assert.match(alarm, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  for (const secret of [/DELIVERY_APP_PRIVATE_KEY/, /DELIVERY_APP_CLIENT_ID/]) {
    assert.doesNotMatch(alarm, secret);
    assert.doesNotMatch(close, secret);
  }

  // One open alarm at a time, so consecutive failures do not accumulate duplicates.
  assert.match(alarm, /gh issue list --label delivery-failed --state open/);
  assert.match(alarm, /gh issue comment "\$existing"/);

  // A green delivery resolves the alarm, and a failure to close never reddens that run.
  // success() is explicit: relying on the implicit rule would risk a false success comment
  // on a live alarm if it were ever misread or changed.
  assert.match(
    close,
    /if: \$\{\{ success\(\) && steps\.release\.outputs\.release_created == 'true' \}\}/,
  );
  assert.match(close, /continue-on-error: true/);
  // Every open alarm is closed: without a concurrency group two failing runs can each open
  // one, and closing a single issue would strand the other permanently.
  assert.match(close, /--limit 50 --json number --jq '\.\[\]\.number'/);
  assert.match(close, /gh issue close "\$number"/);

  // Both steps run after delivery and its verification.
  ordered(
    release,
    '- name: Deliver portable skill, consumer docs, and trusted automation to main',
    '- name: Verify delivered commit',
    '- name: Close a resolved delivery alarm',
    '- name: Report a failed delivery',
  );

  // Re-delivery stays rejected: nothing new may reach the default branch.
  const stageDelivery = source('scripts/stage-delivery.mjs');
  assert.match(
    stageDelivery,
    /const TRUSTED_AUTOMATION = \[\n\s+join\('\.github', 'workflows', 'close-develop-issues\.yml'\),\n\s+join\('\.github', 'scripts', 'close-develop-issues\.mjs'\),\n\];/,
  );
});

test('apply-issues carries the worktree lifecycle contract instead of referring to it', () => {
  const applyIssues = source('src/tools/apply-issues.md');

  // The defect this pins: Phase 4 pointed at apply-review's copy by analogy, so an agent
  // following apply-issues alone never learned to write a record — and cleanup, whose only
  // ownership proof is that record, could then never remove the worktree it had created.
  assert.match(applyIssues, /```include\nworktree-lifecycle\n```/);
  assert.match(applyIssues, /a reference by analogy is not a contract/);

  // Both ends of the lifecycle have to be instructed, not just the format.
  assert.match(
    flat(applyIssues),
    /Write the record immediately after the `effective-flow-created` receipt is verified/,
  );
  assert.match(applyIssues, /transition its lifecycle record from `active` to `cleanup-ready`/);
  // Every exit from the phase ends in a status, so no record is stranded at `active`.
  // Post-delegation failures count: a rejected push or a failed PR creation must also land.
  // Matched on flattened prose so a reflow by the formatter cannot break these.
  const flatIssues = flat(applyIssues);
  assert.match(
    flatIssues,
    /a failed delegation, a rejected push and a failed pull-request creation all set `failed`/,
  );
  assert.match(flatIssues, /A record must never be left at `active` once the issue is done with/);
  assert.match(
    flatIssues,
    /transition its lifecycle record to `failed` with the exact reason, whether the failure happened during delegation or afterwards during push or pull-request creation/,
  );

  // The fragment must actually resolve, so the rendered tool carries the record path.
  const rendered = resolveEagerIncludes(applyIssues, {
    context: 'tools/apply-issues.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });
  assert.match(rendered, /\.effective-flow\/worktree-runs\/<RECORD_ID>\.json/);
  assertNoUnresolvedEagerIncludes(rendered, 'tools/apply-issues.md');
});

// The two pull-request markers `iterate` and the outbound publication write.
// Pinned in one place so every assertion below reads the same contract.
const PULL_REQUEST_MARKERS = [
  '<!-- effective-flow-iterate -->', // iterate's own replies on a pull request
  '<!-- effective-flow-pr-review -->', // Effective Flow's published review findings
];

// The merge gate writes none. It recognizes its own trigger comment across runs through
// authorship plus the configured trigger text, so a marker would only put the tool's name
// into a body posted under the operator's own account.
//
// The retired literal is read out of the marker contract that documents its removal instead of
// being pinned here. Pinning it is what let the token rot through the rename: a marker
// reintroduced today would be spelled after the tool's current name, and a token frozen on the
// old spelling cannot see it. The current name is therefore covered too, and the enumeration
// below makes the spelling question moot for anything shaped like a marker.
function gateMarkerToken() {
  const contract = source('src/shared/pr-review-comments.md');
  const [, retired] = contract.match(/former third marker \(`(effective-flow-[a-z0-9-]+)`\)/) ?? [];
  assert.ok(retired, 'the marker contract must still name the retired gate marker it removed');
  return new RegExp(`${retired}|effective-flow-merge-gate`);
}

// Every HTML marker a source stamps or reads, as that source spells it.
function markersIn(text) {
  return new Set(
    Array.from(text.matchAll(/<!-- (effective-flow-[a-z0-9-]+) -->/g), ([, name]) => name),
  );
}

test('the merge gate is exposed in the "Deliver changes" group', () => {
  assert.ok(
    existsSync(new URL('src/tools/merge-gate.md', repositoryRoot)),
    'the exposed merge gate needs its own tool source',
  );

  // `TOOL_GROUPS` cannot be imported: build.mjs runs the entire build on load. The group is
  // sliced instead, so a `merge-gate` entry that drifted into a neighboring intent group
  // cannot satisfy this — the duplicate case is already covered by build.mjs's own guard.
  // The gate belongs beside `commit` and `pr`: it drives an existing pull request to merge,
  // it produces no findings of its own, and grouping it under "Ensure quality" is what made
  // it read as a reviewer.
  //
  // Membership is not enough: the router renders a group's members in array order, and
  // `commit` → `pr` → `merge-gate` is the delivery chain in the order it is walked. A gate
  // listed first would present the group as "merge, then commit", which is the reading the
  // group move exists to remove. The whole sequence is therefore pinned.
  const deliver = section(source('build.mjs'), "title: 'Deliver changes',", '\n  {');
  assert.match(deliver, /tools: \['commit', 'pr', 'merge-gate'\]/);

  // And the group it left keeps only the tool that actually reviews.
  const quality = section(source('build.mjs'), "title: 'Ensure quality',", '\n  {');
  assert.match(quality, /tools: \[[^\]]*'review'[^\]]*\]/);
  assert.doesNotMatch(quality, /'merge-gate'/);
});

test('the two pull-request markers stay distinct and free of substring collisions', () => {
  // Distinctness alone is not enough. Every consumer decides idempotency by an exact string
  // match, so if one marker contained another, a check for the shorter one would also fire
  // on a comment carrying the longer one and the wrong consumer would treat the thread as
  // already handled.
  assert.equal(
    new Set(PULL_REQUEST_MARKERS).size,
    PULL_REQUEST_MARKERS.length,
    'the pull-request markers must be pairwise distinct',
  );

  // The comparison set is derived from the sources rather than listed, so a third marker
  // cannot be introduced with a colliding name either. Collecting it also keeps the pinned
  // literals honest: a rename in the sources drops the marker from `used` and fails here.
  const used = new Set();
  for (const directory of ['src/shared', 'src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      for (const [marker] of source(`${directory}/${file}`).matchAll(
        /<!-- effective-flow-[a-z0-9-]+ -->/g,
      )) {
        used.add(marker);
      }
    }
  }

  for (const marker of PULL_REQUEST_MARKERS) {
    assert.ok(used.has(marker), `pinned pull-request marker is used by no source: ${marker}`);
    for (const other of used) {
      if (other === marker) continue;
      assert.equal(other.includes(marker), false, `marker collision: ${other} contains ${marker}`);
      assert.equal(marker.includes(other), false, `marker collision: ${marker} contains ${other}`);
    }
  }
});

test("iterate excludes Effective Flow's own marked threads from the ones it classifies", () => {
  const classification = flat(
    section(source('src/tools/iterate.md'), '### Phase 2: Classification'),
  );

  // Both markers must sit in the exclusion prose, not merely somewhere in the phase: without
  // the exclusion an `iterate` round reads Effective Flow's own output back as third-party
  // input and implements it. The markers carry no regular-expression metacharacter, so they
  // go into the pattern as they are.
  for (const marker of PULL_REQUEST_MARKERS) {
    assert.match(
      classification,
      near('Exclude', marker, 600),
      `Phase 2 must exclude threads carrying ${marker}`,
    );
  }

  // The gate marker is deliberately absent — see "the merge gate writes no marker of its own",
  // which asserts that for the whole file rather than for this phase alone.
});

test('the merge gate writes no marker of its own', () => {
  // The gate used to mark its trigger comment and its thread replies. Both jobs are gone:
  // authorship plus the configured trigger text now identify its one own write across runs,
  // and a marker in the raw body would announce which tool composed a comment that manual
  // mode posts under the operator's own account.
  const token = gateMarkerToken();
  assert.equal(
    PULL_REQUEST_MARKERS.some((marker) => token.test(marker)),
    false,
    'the gate marker must not be listed among the markers that are written',
  );

  // Its writer and its only reader. A mention left in either file is an instruction to write
  // a marker nobody may write, or a check for one nobody writes — the dead contract this
  // change removes. The historical note belongs in the marker contract in
  // `src/shared/pr-review-comments.md`, which is why that file is not scanned here.
  //
  // The named token catches the two spellings a reintroduction would plausibly use; the
  // enumeration below catches every other one, because it accepts no marker in these two files
  // beyond the two that are actually written. A third marker of any name — gate-flavored or
  // not — fails here rather than waiting for someone to guess its spelling.
  for (const file of ['src/tools/merge-gate.md', 'src/tools/iterate.md']) {
    assert.doesNotMatch(
      source(file),
      token,
      `${file} must neither write nor read the merge gate marker`,
    );
    for (const marker of markersIn(source(file))) {
      assert.ok(
        PULL_REQUEST_MARKERS.includes(`<!-- ${marker} -->`),
        `${file} names a marker outside the two that are written: ${marker}`,
      );
    }
  }
});

test('the merge gate evaluates bot authorship before it consults the identity lookup', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // The rules are an ordered evaluation, not a set of independent conditions.
  assert.match(phase1, /\border\b/i, 'Phase 1 must state that its rules are evaluated in order');

  // Anchored on the tokens that carry each rule — the configured-bot key, the thread state,
  // and the key that supplies the trigger text — so the order can be pinned without pinning a
  // sentence. `mergeGate.bots` is matched with its backticks, which keeps the bot rule apart
  // from the longer trigger key that contains it.
  ordered(phase1, '`mergeGate.bots`', 'resolved', '`mergeGate.bots.<login>.trigger`');

  // This is the assertion that guards app mode. `viewer-read` maps to `gh api user`, which
  // can legitimately fail on an installation token, so the bot rule must be decided from
  // authorship alone. A later refactor that hoisted the identity lookup above it would break
  // the one mode that never needed an identity — and nothing else here would fail.
  assert.match(
    phase1,
    near(
      '(?:`mergeGate\\.bots`|`authorType`)',
      '(?:(?:not|never|no|without)[^.]{0,60}(?:identity|viewer-?read)|(?:identity|viewer-?read)[^.]{0,60}(?:not|never)\\b)',
      700,
    ),
    'the configured-bot rule must state that it does not consult the identity lookup',
  );
});

test('a bot-typed author is excluded before the catch-all counts it as human', () => {
  // What this test is, and what it is not. Phase 1's rules 1 and 5 are textually unchanged by the
  // author normalization `pr-comments-read` now performs, so every assertion below is satisfied by
  // the rule as it stood before that change too. This is a forward regression guard on the rule,
  // never evidence of the behaviour change. The half that detects the change is the
  // unconfigured-bot arm of `pull-request comments normalize their author exactly as review threads
  // do` in `test/remote-tracker.test.mjs`: it fails on the old bare-string author, and nothing here
  // does.
  //
  // The two belong together because one contract is read from both ends. The normalizer decides
  // whether a top-level comment carries `authorType: bot`, and this rule decides what that costs: a
  // comment from a bot nobody configured — a CI, coverage, or dependency bot — is excluded at rule
  // 1 and never reaches the human-comment guard. A rewrite that made the exclusion reachable only
  // through `mergeGate.bots` would put every one of those comments back in front of the guard, and
  // the normalization test would stay green while it happened.
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // Both rules are picked by content, deliberately not by position. The numbered split also cuts at
  // the inline "counts under rule 5. Requiring" inside rule 4, so an index-based pick lands on a
  // slice that is not a rule at all and asserts against the wrong prose.
  const rules = phase1.split(/(?=\s\d+\.\s)/);
  const botRule = rules.find((item) => /\*\*The author is a bot\*\*/.test(item));
  const catchAll = rules.find((item) => /Everything else counts as human/.test(item));
  assert.ok(botRule, 'Phase 1 must carry a rule about an item whose author is a bot');
  assert.ok(catchAll, 'Phase 1 must carry the catch-all that counts every other item as human');

  // The normalized record is what the rule reads, so it has to name the field and the value the
  // read produces. A rule phrased purely in terms of configuration could not consume the normalized
  // author at all.
  assert.match(
    botRule,
    /`authorType`[^.]{0,60}`bot`/i,
    'rule 1 must name the normalized field and the value it excludes on',
  );

  // And that value has to stand on its own. `mergeGate.bots` lists the reviewers a project asked
  // for; the bots that comment on a pull request without being listed are the majority, and they
  // are reachable only through the account class the provider states. If this half were phrased as
  // a condition on a configured entry, every unlisted bot would fall through to the catch-all.
  assert.match(
    botRule,
    near('`authorType`', '(?:alone|overlap|on its own|do(?:es)? not divide|independent)', 500),
    'the bot-typed case must stand on its own rather than only qualifying a configured login',
  );

  // Exclusion and stop are one statement. "Excluded" without "stop" leaves a later rule free to
  // count the same item again, and the whole section is built on stopping at the first match.
  assert.match(
    botRule,
    near('\\bexcluded\\b', '(?:evaluation stops|stops? there|stop(?:s)? at)', 300),
    'rule 1 must state both the exclusion and that evaluation stops there',
  );

  // Order is the rest of the contract: a bot rule written after the catch-all is unreachable.
  ordered(phase1, '**The author is a bot**', 'Everything else counts as human');

  // The catch-all's own boundary, stated positively so it survives a rewording. `unknown` is what
  // an author record carries when no field decided — the fail-safe direction, where an unproven
  // account counts as human and keeps the guard. It is the value this rule admits, and the reason
  // the rule above must be about a *proven* bot rather than an unrecognized one.
  assert.match(
    catchAll,
    near('`unknown`', 'counts as human', 300),
    'the catch-all must name `unknown` as the value it counts as human',
  );
});

test("a resolved thread excludes only this tool's own items", () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // The evaluation is a numbered list, so the rule that carries the resolved-thread case is
  // sliced out of it: a neighbouring rule names `viewer-read` and bot authorship too, and
  // matching those across the item boundary would pass on a rule that dropped its own.
  const rule = phase1.split(/(?=\s\d+\.\s)/).find((item) => /\bresolved\b/i.test(item));
  assert.ok(rule, 'Phase 1 must carry a rule about items inside a resolved thread');

  // The author condition is the first half of the contract. Author-agnostic reads as "resolved
  // means settled", but neither provider auto-unresolves a thread when someone replies into it: a
  // reviewer objecting inside a thread `iterate` resolved would be discarded and the gate would
  // merge under an open objection — fail-open, in the one place this guard exists to be fail-safe.
  assert.match(
    rule,
    /viewer-?read|`?authorType`?|\bbot\b/i,
    'an item in a resolved thread may only be excluded through its author',
  );

  // The second half, and the one the author condition cannot cover: in manual mode the operator
  // and this tool are the SAME account, so authorship alone still discards an objection the
  // operator types into such a thread. The helper stamps every item this tool writes into a
  // thread, so the marker is what separates it from a hand-typed one. Dropping this condition
  // reopens the fail-open path for the single most likely objector on a manually driven pull
  // request.
  //
  // BOTH pull-request markers must appear. The two directions stamp different ones by design —
  // idempotency needs to tell which writer produced a body — while this rule needs the union.
  // A rule that knew only the iterate marker could never exclude an outbound review comment,
  // however resolved its thread and whoever wrote it, which is exactly the defect that made the
  // gate refuse to merge a pull request this product had annotated itself.
  for (const marker of ['effective-flow-iterate', 'effective-flow-pr-review']) {
    assert.match(
      rule,
      new RegExp(`<!-- ${marker} -->`),
      `an item in a resolved thread must be excludable by the ${marker} marker`,
    );
  }

  // And the marker only counts where a quote-reply cannot put it. Both providers prefix a quoted
  // body with `>`, so a copied marker lands inside a blockquote instead of opening the body.
  // Without the position requirement the operator's own quoted objection carries the marker along
  // and is discarded — the same bypass, one press of the quote button away.
  assert.match(
    rule,
    /first line|leading line|opens the body|begins with it/i,
    'the marker must only count as the body’s leading line, not anywhere in it',
  );

  // The rule's other property — that it decides per item rather than per thread, so it reaches
  // `iterate`'s replies inside a resolved thread — is carried by the shape of the rule itself
  // and is deliberately not asserted separately: every wording that survives the assertion
  // above already speaks about an item's author, and every token set tried for the per-item
  // half matched a thread-level rule too.
});

test("rule 2's marker enumeration stays in step with the helper's marker table", async () => {
  // The rule names its markers literally instead of referring to the table, and that is deliberate:
  // a reference would let a future comment kind join a fail-open exclusion automatically, with
  // nobody deciding that it should. This test is the other half of that bargain — it turns the
  // divergence into a build failure, so adding a writer forces a conscious choice about the guard
  // rather than silently widening or silently under-covering it.
  const { COMMENT_MARKERS } = await import('../src/scripts/remote-tracker-core.mjs');
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));
  const rule = phase1.split(/(?=\s\d+\.\s)/).find((item) => /\bresolved\b/i.test(item));

  // Only the pull-request writers belong in this rule. `planning` and `apply` stamp issue
  // comments, which never appear on a pull request's threads.
  const pullRequestKinds = ['pr', 'pr-review'];
  for (const kind of pullRequestKinds) {
    assert.ok(
      Object.hasOwn(COMMENT_MARKERS, kind),
      `the marker table must still carry the ${kind} comment kind`,
    );
    assert.match(
      rule,
      new RegExp(`<!-- ${COMMENT_MARKERS[kind]} -->`),
      `rule 2 must name the ${kind} marker ${COMMENT_MARKERS[kind]} from the marker table`,
    );
  }

  // If a new pull-request-facing kind appears, this fails and the guard gets a decision instead of
  // a default.
  assert.deepEqual(
    Object.keys(COMMENT_MARKERS).sort(),
    ['apply', 'planning', 'pr', 'pr-review'],
    'a new comment kind must be assessed against merge gate guard rules 2 and 4 before this list is updated',
  );
});

test('the merge gate excludes its own top-level summary comment by author plus leading marker', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // A top-level comment has no resolved state, so before this rule existed a summary comment from
  // a directly invoked `iterate` run fell through to the catch-all and blocked the merge forever.
  // The rule is sliced out by the property no other rule has: it is about a top-level comment and
  // it names the iterate marker.
  const rule = phase1
    .split(/(?=\s\d+\.\s)/)
    .find((item) => /top-level/i.test(item) && /<!-- effective-flow-iterate -->/.test(item));
  assert.ok(rule, 'Phase 1 must carry a rule excluding this tool’s own top-level comment');

  // Author remains a required condition — the marker never excludes an item on its own.
  assert.match(
    rule,
    /viewer-?read|`?authorType`?|\bbot\b/i,
    'a top-level comment may only be excluded when its author is this tool’s own',
  );

  // And the marker only counts where a quote-reply cannot put it, exactly as in rule 2.
  assert.match(
    rule,
    /first line|leading line|opens the body|begins with it/i,
    'the marker must only count as the body’s leading line, not anywhere in it',
  );

  // The catch-all must still come last. If the new rule were appended after it, it would never be
  // reached, and the evaluation order is what this whole section is built on.
  ordered(phase1, 'top-level', 'Everything else counts as human');
});

test("rule 4's marker enumeration and two-condition shape stay pinned", async () => {
  // The same bargain rule 2 struck: the rule names its markers literally so a future comment kind
  // cannot join a fail-open exclusion by itself, and this test is what turns the divergence into a
  // build failure rather than a silent one.
  const { COMMENT_MARKERS } = await import('../src/scripts/remote-tracker-core.mjs');
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // Sliced by the top-level property alone, deliberately not by a marker. The neighbouring rule-4
  // test slices on `top-level` AND the iterate marker, which makes its own assertion about that
  // marker tautological; a slice that does not mention a marker keeps the assertions below honest.
  const rule = phase1.split(/(?=\s\d+\.\s)/).find((item) => /top-level/i.test(item));
  assert.ok(rule, 'Phase 1 must carry a rule about this tool’s own top-level comment');

  // Both pull-request writers land on a top-level comment: `iterate` posts its summary there, and
  // the outbound direction posts the findings it could not anchor inside the diff. `planning` and
  // `apply` stamp issue comments and never appear on a pull request.
  for (const kind of ['pr', 'pr-review']) {
    assert.ok(
      Object.hasOwn(COMMENT_MARKERS, kind),
      `the marker table must still carry the ${kind} comment kind`,
    );
    assert.match(
      rule,
      new RegExp(`<!-- ${COMMENT_MARKERS[kind]} -->`),
      `rule 4 must name the ${kind} marker ${COMMENT_MARKERS[kind]} from the marker table`,
    );
  }

  // The two-condition shape is load-bearing, not stylistic. A top-level comment is never resolved,
  // so adopting rule 2's `resolved` condition here would not tighten this rule — it would make the
  // exclusion unreachable and silently restore the deadlock the rule exists to prevent. Nothing
  // else in the suite would notice, which is why the shape is asserted rather than assumed.
  assert.match(rule, /both hold/i, 'rule 4 must hold on exactly the conditions it enumerates');
  assert.match(
    rule,
    /never resolved|no resolved state|would not tighten|disable it|no such container/i,
    'rule 4 must state why thread resolution cannot become a condition of it',
  );
});

test('the merge gate recognizes its own trigger comment by identity plus the complete trigger text', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // Both halves are one rule, and both are anchored on machine tokens: the operation that
  // supplies the authenticated login, and the configuration key that supplies the text.
  assert.match(phase1, /viewer-?read/i, 'Phase 1 must name the identity operation');
  assert.match(
    phase1,
    near('viewer-?read', '`mergeGate\\.bots\\.<login>\\.trigger`', 500),
    'identity and configured trigger text must be one rule, not two independent ones',
  );

  // The comparison is over the whole body. A substring rule would let a quote-reply that
  // copies the trigger text switch the guard off, which is the bypass an exact match closes.
  assert.match(
    phase1,
    /\b(?:complete|whole|entire|full)\b[^.]{0,40}\bbody\b/i,
    'the body comparison must be stated as covering the complete body',
  );
  assert.match(
    phase1,
    /\b(?:partial|substring|prefix|fuzzy)\b/i,
    'a partial match must be ruled out explicitly, not left to the reader',
  );
});

test('a deferred bot finding is named in chat instead of answered in its thread', () => {
  const mergeGate = flat(source('src/tools/merge-gate.md'));

  // The gate's own writes are what broke the previous contract across runs: an unresolved
  // reply left behind is read as a human comment by the next run. The report therefore leaves
  // the pull request entirely.
  assert.match(
    mergeGate,
    near(
      '\\bchat\\b',
      '(?:writes? nothing|no (?:thread )?repl|not repl|never repl|leaves? [^.]{0,40}untouched)',
      400,
    ),
    'a finding this run does not implement must be reported in chat and get no thread reply',
  );

  // Resolving such a thread would signal "handled" for a finding nobody handled, so the gate
  // resolves nothing of its own either.
  assert.match(
    mergeGate,
    /(?:resolves? nothing|no thread resolution|resolution of any kind|nothing[^.]{0,40}resolv)/i,
    'the gate must resolve no thread of its own',
  );
});

test('an unprovable identity activates the merge gate guard and binds only the identity rule', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // Fail-closed direction: an identity the gate cannot establish makes the item count and the
  // guard activate, never the reverse. The reverse reading is the one that merges a pull
  // request under an open human comment.
  assert.match(
    phase1,
    near('(?:fails? clos|fail-clos|failing clos)', '(?:viewer-?read|identity|login)', 500),
    'Phase 1 must tie the fail-closed rule to the identity it could not establish',
  );
  assert.match(
    phase1,
    near(
      '(?:viewer-?read|authenticated login)',
      '(?:guard activates|activates? the guard|guard (?:is|becomes|stays) (?:\\*\\*)?activ)',
      500,
    ),
    'an unprovable identity must activate the guard rather than clear it',
  );

  // And it binds that rule alone: the rules decided from authorship keep working without an
  // identity, which is what keeps app mode alive on an installation token. Asserted as the
  // carve-out for those rules rather than as a bare "only" near "fail closed" — Phase 1 uses
  // that phrase in more than one place, so proximity alone would pass on a global rule.
  assert.match(
    phase1,
    near(
      '(?:rules? \\d|bot rule|resolved-thread rule|authorship rules?)',
      '(?:untouched|unaffected|keeps? working|never depends?|does not depend|need no identity|no identity)',
      300,
    ),
    'the rules that need no identity must stay exempt from the fail-closed rule',
  );
});

// The literal line a caller announces to suppress `iterate`'s per-round summary comment. Read
// out of the parsing side instead of pinned here, so a rename both sides make together stays
// green while a rename only one side makes fails — which is the failure that matters: the
// delegated run aborts on a switch it cannot parse.
function summaryCommentSwitch() {
  const phase0 = section(source('src/tools/iterate.md'), '### Phase 0');
  const [, literal] = phase0.match(/`([^`\n]*summary[^`\n]*:[^`\n]+)`/i) ?? [];
  assert.ok(literal, 'iterate.md Phase 0 must announce a literal summary-comment switch');
  return literal;
}

test('iterate lets a caller suppress its summary comment and posts it by default', () => {
  const iterate = source('src/tools/iterate.md');

  // Phase 0 owns the caller contract: a switch the parsing phase does not know is a switch the
  // run ignores. Its list item is sliced out so the item filter — a neighbouring, almost
  // identically shaped contract with its own `ABORT` and its own additive invariant — cannot
  // satisfy a single assertion below.
  const suppression = flat(
    section(iterate, '### Phase 0')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => /summary/i.test(item)) ?? '',
  );
  assert.ok(suppression, 'Phase 0 must parse an optional summary-comment suppression');
  assert.ok(
    suppression.includes(summaryCommentSwitch()),
    'the parsed literal must sit in the Phase 0 item that documents the switch',
  );

  // A caller contract, not user free text, and optional.
  assert.match(suppression, /optional/i);
  assert.match(suppression, /caller|delegat/i);

  // Additive by construction: an invocation that announces nothing still posts its one summary
  // comment. Without that invariant every interactive `iterate` run silently loses its summary.
  assert.match(
    suppression,
    /(?:without|unset|absent|not announced|no such line)/i,
    'the unannounced case must be named',
  );
  assert.match(
    suppression,
    /(?:current behaviou?r|as before|unchanged|additive|still posts?)/i,
    'an unannounced switch must keep the current behavior',
  );

  // Fail closed on a switch it cannot parse. Continuing as an unsuppressed run is the one
  // resolution that must not happen: the caller suppresses precisely because an unsuppressed
  // comment would be read back as a third party's writing on its next run.
  assert.match(suppression, /ABORT/, 'an unparseable switch must abort');
  assert.match(suppression, near('(?:never|not)', 'unsuppress', 150));

  // Suppression removes the summary comment only. The thread replies and their resolution are
  // what Phase 1's rule 2 needs in order to keep an earlier round's output out of the guard, so
  // widening the switch to them would reintroduce the defect it exists to remove.
  assert.match(
    suppression,
    near('(?:repl(?:y|ies)|resolution)', '(?:unaffected|unchanged|still|only)', 300),
    'suppression must be limited to the summary comment',
  );

  // The write site honours it. A switch parsed but not honoured is worse than none: the caller
  // reports content it believes was not posted, while the comment sits on the pull request.
  const delivery = flat(section(iterate, '### Phase 5'));
  assert.ok(
    delivery.includes(summaryCommentSwitch()),
    'the summary-posting step must name the switch it honours',
  );
  assert.match(
    delivery,
    near('caller', '(?:hand|report|back)', 300),
    'the suppressed content must go back to the caller instead of being dropped',
  );
});

test('the merge gate announces the exact suppression literal iterate parses', () => {
  const contract = section(source('src/tools/merge-gate.md'), '## Delegation contract', '\n## ');

  // The suppression belongs in the delegation contract rather than in one phase: `iterate`
  // posts one summary comment per delegated round under the operator's own account in manual
  // mode, so a single unsuppressed round leaves a top-level, unresolvable, non-trigger item
  // that the very next fresh read — including this run's own Phase 4 read — counts as human.
  // That is the defect this change removes, relocated one delegation deep.
  //
  // Sliced to its own list item, because the neighbouring item-filter item calls itself
  // mandatory in every delegation too: matched against the whole section, the second assertion
  // would keep passing after the suppression item was deleted.
  const item = flat(contract.split(/\n-\s/).find((entry) => /summary/i.test(entry)) ?? '');
  assert.ok(item, 'the delegation contract must carry the summary-comment suppression');
  assert.ok(
    item.includes(summaryCommentSwitch()),
    'every delegation must announce the literal suppression switch that `iterate` parses',
  );
  assert.match(
    item,
    /mandatory|every delegation|never delegate without/i,
    'the suppression must bind every delegation, not an unspecified subset',
  );
});

test('every claim that the trigger comment is the only own write names what makes it true', () => {
  const mergeGate = flat(source('src/tools/merge-gate.md'));

  // The claim is only true together with the suppression of the delegated run's summary
  // comment, so a sentence that makes it without naming that qualifier is the contradiction
  // this test exists to catch. A file that makes no such claim passes vacuously — a valid
  // resolution too, and the suppression itself is pinned by the delegation-contract test.
  //
  // Restricted to claims that mention the trigger comment. Without that, "This is the only kind
  // of Git write this workflow performs" would demand a summary-comment qualifier it has no
  // business carrying.
  const claims = mergeGate
    .split(/(?<=\.)\s+/)
    .filter(
      (sentence) =>
        /\bonly\b/i.test(sentence) && /\bwrit/i.test(sentence) && /\btrigger\b/i.test(sentence),
    );

  for (const claim of claims) {
    const start = mergeGate.indexOf(claim);
    const window = mergeGate.slice(Math.max(0, start - 400), start + claim.length + 400);
    assert.match(
      window,
      /suppress|no summary|without[^.]{0,40}summary/i,
      `a claim about the gate's only own write must name the summary suppression: ${claim}`,
    );
  }
});

test('only the bot threads this run implemented can block the merge', () => {
  const preconditions = flat(section(source('src/tools/merge-gate.md'), '### Phase 4'));

  // Unscoped, this precondition was unsatisfiable by construction: a deferred or rejected
  // finding gets no reply and no resolution by design, so "every bot thread is answered or
  // resolved" could never become true once one finding was deferred — the gate would block on
  // its own rule. The numbered conditions are semicolon-separated, so the bounded window here
  // cannot leak into a neighbouring condition.
  assert.match(
    preconditions,
    /(?:implement[a-z]*[^;]{0,250}(?:answered|resolved)|(?:answered|resolved)[^;]{0,250}implement)/i,
    'the answered-or-resolved condition must be scoped to the findings this run implemented',
  );

  // And the other half of the scoping: a finding the run did not implement is reported, not
  // turned into a blocker.
  assert.match(
    preconditions,
    near(
      '(?:deferred|rejected|not implement)',
      '(?:not\\*{0,2}\\s*block|never blocks|no blocker|not a blocker)',
      400,
    ),
    'a deferred or rejected finding must be stated as not blocking the merge',
  );
  assert.match(
    preconditions,
    near('(?:deferred|rejected)', '(?:chat|summary)', 400),
    'a deferred finding must be named in the chat summary instead',
  );
});

test('a reviewer thread no round assessed blocks the merge in a condition of its own', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase4 = section(gate, '### Phase 4');

  // The window: a reviewer's check goes terminal before the reviewer's last thread is published,
  // so Phase 3 delegates only the thread IDs it could see and the thread that lands afterwards was
  // assessed by nobody. Condition 6 cannot catch it — that one asks about the findings this run
  // *implemented* — so without a condition of its own the gate merges a pull request carrying a
  // reviewer finding no run ever read. `src/shared/review-bot-state.md` names this window and
  // assigns closing it to the consumer; these assertions are that consumer discharging it.
  //
  // Sliced per numbered condition, because condition 6 already carries the "deferred or rejected"
  // vocabulary: matched against the whole Phase-4 section, the assertions below would stay green
  // with the new condition deleted outright.
  const conditions = phase4.split(/(?=\n\d+\.\s)/).slice(1);
  const unassessedIndex = conditions.findIndex((item) => /assessed/i.test(item));
  const implementedIndex = conditions.findIndex((item) =>
    /implement[a-z]*[\s\S]{0,160}(?:answered|resolved)/i.test(item),
  );
  assert.notEqual(unassessedIndex, -1, 'Phase 4 must carry a never-assessed precondition');
  assert.notEqual(implementedIndex, -1, 'Phase 4 must keep its implemented-and-answered condition');

  // Two conditions, never one. Folding them back together is the realistic regression — they read
  // as near-duplicates — and each direction of that fold reintroduces a defect: widening
  // condition 6 demands a thread reply for a deferred finding, which nothing may write and no run
  // could satisfy, while narrowing this one to implemented findings merges past the unread thread.
  assert.notEqual(
    unassessedIndex,
    implementedIndex,
    'the never-assessed rule must be its own condition, not folded into the implemented one',
  );

  const unassessed = flat(conditions[unassessedIndex]);

  // What "assessed" covers has to be enumerated, or the condition is unexecutable: a deferred or
  // rejected finding is an outcome this run reached and must not block a second time.
  for (const outcome of ['implement', 'defer', 'reject']) {
    assert.match(
      unassessed,
      new RegExp(outcome, 'i'),
      `the condition must name ${outcome} as an outcome that counts as assessed`,
    );
  }
  assert.match(
    unassessed,
    near('(?:nobody|no round|neither)', 'block', 300),
    'a thread nobody reached an outcome about must be stated to block the merge',
  );

  // The distinction itself is load-bearing prose, not decoration: it is what stops the next reader
  // from simplifying the two conditions back into one.
  assert.match(
    unassessed,
    near('condition 6', '(?:folded|widened|different question|assessed at all)', 400),
    'the condition must state how it differs from the implemented-and-answered one',
  );

  // Blocking alone would end the run; the agreed behaviour is to pull the round back and let the
  // late threads be assessed. Bounded by the same counter as every other round, or a reviewer that
  // keeps publishing holds the run open forever.
  assert.match(
    unassessed,
    near('Phase 3', 'consumes a round', 300),
    'the return to Phase 3 must consume a round',
  );
  assert.match(
    unassessed,
    near('`mergeGate\\.maxRounds`', '(?:never with a merge|never a merge)', 300),
    'an exhausted round budget must end the run with a report, never with a merge',
  );

  // And the counter has to know about it. "Consumes a round" is only true if round accounting
  // counts an event that begins no Phase-2 round — the pre-existing rule counts Phase-2 starts
  // alone, so a Phase-4 return would otherwise be free and unbounded.
  const accounting = flat(section(gate, '#### Round accounting', '\n### '));
  assert.match(
    accounting,
    near('(?:Phase 4|condition 7)', '(?:by one more|consumes a round)', 400),
    'round accounting must count the Phase-4 return, which begins no Phase-2 round of its own',
  );

  // Fail closed, like every other precondition here: an assessment the read cannot establish is
  // not an assessment.
  assert.match(
    unassessed,
    near('(?:cannot establish|unprovable|unreadable)', '(?:unassessed|blocks)', 300),
    'an assessment the fresh read cannot establish must block rather than pass',
  );

  // The shared contract states the obligation; a contract whose consumer never discharges it is
  // the defect this closes. Both ends are asserted so neither can drift away from the other.
  const window = flat(
    section(source('src/shared/review-bot-state.md'), '### This narrows the window'),
  );
  assert.match(
    window,
    near('\\{\\{SKILL:merge-gate\\}\\}', '(?:Phase-4|Phase 4|precondition)', 300),
    'the shared contract must name where its consumer closes the window it leaves open',
  );
});

test('the trigger idempotency check rests on evidence the forge actually exposes', () => {
  const phase3 = flat(section(source('src/tools/merge-gate.md'), '### Phase 3'));
  const IDEMPOTENCY = '(?:idempot|second trigger|already been posted|already posted)';

  // The evidence is authorship plus the exact body plus the timestamps — all normalized
  // fields. The earlier form asked for "the configured bot login", a value no configuration
  // holds: a `mergeGate.bots` entry is a reviewer the gate waits for, never the account it
  // posts as. App mode therefore had no idempotency at all and re-triggered on every run.
  assert.match(phase3, near(IDEMPOTENCY, 'trigger text', 500), 'the body is the trigger text');
  assert.match(
    phase3,
    near(IDEMPOTENCY, '(?:`createdAt`|`headCommittedAt`)', 700),
    'the timestamps decide whether the trigger belongs to the current head',
  );
  assert.match(
    phase3,
    near('app mode', '`authorType`', 400),
    'app mode must establish its own authorship through the normalized author type',
  );
  assert.match(
    phase3,
    near('manual mode', 'viewer-?read', 400),
    'manual mode must establish its own authorship through the authenticated login',
  );
  assert.match(
    phase3,
    near('`mergeGate\\.bots`', '(?:never the author|cannot exist|no configuration names)', 500),
    'the configured reviewer list must be stated not to name the account the gate posts as',
  );

  // Unprovable evidence posts the trigger again rather than suppressing it: a redundant
  // mention costs one bot run, a wrongly suppressed one costs the merge.
  assert.match(
    phase3,
    near('(?:absent|cannot be established|unprovable)', '(?:not yet posted|post it)', 400),
    'unprovable idempotency evidence must resolve towards posting, not towards suppressing',
  );
});

test('merge-gate states its no-commit/no-push boundary and delegates every other change to iterate', () => {
  const mergeGate = flat(source('src/tools/merge-gate.md'));

  // Both prohibitions must sit close to the stated exception, so a later edit that keeps
  // "no commit" but drops "no push" (or vice versa) cannot pass silently.
  assert.match(mergeGate, /performs no `git commit` and no push of its own/);
  assert.match(
    mergeGate,
    /with exactly one exception:.{0,400}`BEHIND`.{0,400}merges `origin\/<base>` into the head branch as\s*a merge commit and pushes that branch normally/,
  );
  // Two separate contracts, each asserted on meaning rather than on a sentence, so that rewording
  // the paragraph cannot fail the suite while weakening it still does.
  //
  // (a) The exception is exhaustive: nothing else may be committed or pushed.
  assert.match(
    mergeGate,
    /(complete set of Git writes|no Git write of any other kind|no other (?:Git )?write)/,
  );
  // (b) The exception is a KIND of write, not a one-time allowance. A branch can fall behind again
  //     in a later round, and a "single write" reading would refuse that second, legitimate repair.
  assert.match(mergeGate, /(a \*\*kind\*\* of write|every Phase-2 round|each occurrence)/);
  assert.match(mergeGate, /Every other code change is delegated to `\{\{SKILL:iterate\}\}`/);
});

test('setup carries the mergeGate.* and delivery.mergeMethod configuration keys with their defaults', () => {
  const setup = source('src/tools/setup.md');

  // The block-9 wizard table pairs each dotted key with its default in the third column.
  const table = section(
    setup,
    '| Key                              | Values                             | Default   |',
  );
  for (const [key, value] of [
    ['mergeGate.completion', 'ask'],
    ['mergeGate.requireAllChecks', 'true'],
    ['mergeGate.checkWaitMinutes', '20'],
    ['mergeGate.maxRounds', '3'],
    ['mergeGate.botWaitMinutes', '10'],
    ['mergeGate.bots', '(empty)'],
  ]) {
    assert.match(
      tableRow(table, `\`${key}\``),
      new RegExp(`\\| \`${value.replace(/[().]/g, '\\$&')}\``),
      `setup.md's block-9 table must pair ${key} with its default ${value}`,
    );
  }
  assert.match(table, /`mergeGate\.bots\.<login>\.trigger`/);
  assert.match(table, /`mergeGate\.bots\.<login>\.check`/);

  // delivery.mergeMethod is asked in block 5 (delivery), documented as prose rather than a
  // table row, so its default is matched by proximity to the key instead.
  assert.match(flat(setup), /`delivery\.mergeMethod` \(squash\/merge\/rebase, default `squash`/);
});

test('the user guide disambiguates mergeGate.* from the pre-existing delivery.prReview key', () => {
  const docs = source('docs/user-guide/configuration.md');
  const flatDocs = flat(docs);

  for (const key of [
    'mergeGate.completion',
    'mergeGate.requireAllChecks',
    'mergeGate.checkWaitMinutes',
    'mergeGate.maxRounds',
    'mergeGate.botWaitMinutes',
    'delivery.mergeMethod',
  ]) {
    assert.match(flatDocs, new RegExp(key.replace(/\./g, '\\.')));
  }

  // The dedicated "Block `mergeGate`" table carries the untraded key/default pairs.
  const block = section(docs, '## Block `mergeGate`', '\n## ');
  assert.match(tableRow(block, '`completion`'), /`ask`/);
  assert.match(tableRow(block, '`requireAllChecks`'), /`true`/);
  assert.match(tableRow(block, '`checkWaitMinutes`'), /`20`/);
  assert.match(tableRow(block, '`maxRounds`'), /`3`/);
  assert.match(tableRow(block, '`botWaitMinutes`'), /`10`/);
  assert.match(tableRow(block, '`bots`'), /`\(empty\)`/);

  // The rename removed the shared name but not the confusion: `delivery.prReview` is still a
  // configuration key about publishing this run's own findings, while the gate's block is about
  // driving somebody else's pull request. The disambiguation must stay an explicit sentence
  // naming both, not merely implied by separate sections.
  assert.match(
    flat(block),
    /Do not confuse `mergeGate\.\*` with the pre-existing `delivery\.prReview`/,
  );
});

test('skill-ownership.json names no merge gate among the consumers of the pr-review skill', () => {
  // The manifest used to declare the gate as a delegate consumer of the central `pr-review`
  // skill, which the gate's own source forbids in bold: that skill brings its own approve and
  // request-changes submissions, its own CI recovery, and its own summary conventions, and this
  // workflow allows none of them. The row survived only because consumer and skill shared a
  // name and it read as a tautology. Asserted for both names, so the entry cannot come back
  // under the new one either.
  const ownership = JSON.parse(source('docs/developer-guide/skill-ownership.json'));
  const entry = ownership.relationships.find((skill) => skill.skill === 'pr-review');
  assert.ok(entry, 'skill-ownership.json must list a "pr-review" skill entry');
  for (const forbidden of ['pr-review', 'merge-gate']) {
    assert.equal(
      entry.consumers.some((consumer) => consumer.consumer === forbidden),
      false,
      `the "pr-review" skill entry must not list "${forbidden}" as a consumer`,
    );
  }

  // The empty slot needs its reason asserted too. An absence proves nothing on its own: delete the
  // gate's exclusion section and the manifest row above stays correct-looking while the rule that
  // makes it correct is gone — and the next person reading a missing row reads it as an oversight
  // and puts it back. The three named behaviours are the substance: they are what the skill would
  // bring and what this workflow forbids, and they are why the gate is a non-consumer rather than
  // an unlisted one.
  const gate = flat(source('src/tools/merge-gate.md'));
  assert.match(
    gate,
    /Do not load the central `pr-review` skill/,
    'the gate must forbid loading the central pr-review skill',
  );
  for (const forbidden of [
    'approve and request-changes submissions',
    'CI recovery',
    'summary conventions',
  ]) {
    assert.ok(
      gate.includes(forbidden),
      `the exclusion must name what the skill brings that this workflow forbids: ${forbidden}`,
    );
  }

  // And the judgment itself is not dropped, only relocated — otherwise the exclusion would read as
  // "this gate reviews without a reviewer".
  assert.match(
    gate,
    near('`\\{\\{SKILL:iterate\\}\\}` loads it', '(?:Mode C|handoff)', 200),
    'the excluded judgment must be stated as happening one delegation away',
  );
});

test('the review-publication fragments and their marker survive the merge-gate rename', () => {
  // These three carry the *review-publication* concept, not the gate: the fragments describe how
  // a delivery publishes its own findings onto a pull request, and the marker stamps those
  // comments. An over-eager `pr-review` → `merge-gate` sweep would rename them along with the
  // gate and recreate exactly the confusion the rename removed — and the marker rename would
  // additionally break idempotency against every comment already posted under the old literal.
  for (const path of ['src/shared/pr-review-comments.md', 'src/shared/pr-review-integration.md']) {
    assert.ok(existsSync(new URL(path, repositoryRoot)), `${path} must keep its name`);
  }

  // Collected from the sources rather than pinned to one file, so moving the marker between
  // fragments stays green while dropping or renaming it fails.
  const marker = '<!-- effective-flow-pr-review -->';
  const carriers = ['src/shared', 'src/tools', 'src/agents'].flatMap((directory) =>
    readdirSync(new URL(`${directory}/`, repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .filter((entry) => source(`${directory}/${entry}`).includes(marker)),
  );
  assert.ok(carriers.length > 0, `no source carries the review-publication marker ${marker}`);
});

test('the shared reviewer-state contract is loaded by the gate and by the guard', () => {
  // One block, two consumers, on purpose: the gate decides whether to trigger and wait, and
  // `iterate`'s guard decides whether to classify at all. If each derived "is this reviewer
  // still running?" for itself, the two could disagree about the same pull request — the gate
  // waiting for a reviewer the guard just declared finished, or the reverse.
  assert.ok(
    existsSync(new URL('src/shared/review-bot-state.md', repositoryRoot)),
    'the shared reviewer-state contract needs its own fragment',
  );

  for (const path of ['src/tools/merge-gate.md', 'src/tools/iterate.md']) {
    // The include fence, not a mere mention: a tool that only names the fragment in prose never
    // receives its rules.
    assert.match(
      source(path),
      /```(?:lazy-)?include\n(?:[a-z0-9-]+\n)*review-bot-state\n(?:[a-z0-9-]+\n)*```/,
      `${path} must load review-bot-state through an include fence`,
    );
  }
});

test('an emoji acknowledgment is never presented as evidence that a reviewer has no check', () => {
  // This cost a real merge. The gate refused to merge PR #317 because Greptile's freshness could
  // not be proven, while Greptile's own `Greptile Review` check sat green on the same head: the
  // sources claimed Greptile "publishes no check context either", so nobody configured `.check`
  // for it and the gate stayed on a fallback signal that cannot work for that reviewer at all.
  //
  // Two distinct things were conflated. A reaction is how a bot acknowledges a *trigger*, and it
  // is genuinely unreadable through the helper. A check context is how it reports the *review*,
  // and it is read from `pr-status-read` like any other check. A reviewer can — and Greptile does
  // — do both. Inferring the absence of the second from the presence of the first is the mistake
  // this test exists to keep out of the sources.
  //
  // Asserted as the guarantee the sources must carry, not as the absence of the one sentence that
  // was deleted. A negative pinned to that wording passes again for any paraphrase of it — dropping
  // the single word "either" was enough — and it says nothing about what has to stand there
  // instead. Every claim below is therefore bound to the edge-case bullet that must carry it, and
  // the one negative left is a second lock on the formulation that already misled a reader once.
  const edgeCases = section(source('src/tools/merge-gate.md'), '## Edge cases', '\n## ');
  const bullet = (marker) => {
    const entry = edgeCases.split(/\n-\s+/).find((item) => item.includes(marker));
    assert.ok(entry, `the gate's edge cases must carry the bullet about: ${marker}`);
    return flat(entry);
  };

  const reaction = bullet('acknowledges with an emoji reaction');
  assert.match(
    reaction,
    near('reaction', '`Greptile Review` check', 400),
    'the emoji-reaction case must name the check context this reviewer does publish',
  );
  assert.match(
    reaction,
    near('reaction', '(?:is not a check|no check to configure)', 300),
    "a reaction must be stated not to be evidence about the reviewer's check context",
  );
  assert.doesNotMatch(
    flat(edgeCases),
    /publishes no check/i,
    'no edge case may reintroduce the claim that this reviewer publishes no check context',
  );

  // The sticky-comment case is the concrete failure the fallback cannot survive, and it is the
  // reason `.check` is not merely an optimisation for these reviewers. Each assertion here is
  // matched on what its message promises: the frozen timestamp, the scope of the consequence, and
  // the remedy — not on the bullet's opening words, which a trimmed bullet would still satisfy.
  const sticky = bullet('edits one sticky comment in place');
  assert.match(
    sticky,
    near('edits one sticky comment in place', 'never moves past `headCommittedAt`', 200),
    "the sticky-comment case must document that the reviewer's `createdAt` freezes against the head",
  );
  // Scoped, because the fallback reads threads and thread replies too: a review that also opens a
  // thread for this head *is* seen, and claiming otherwise would trade one wrong statement about
  // this reviewer for another.
  assert.match(
    sticky,
    near('only\\*{0,2} output', '\\*\\*not started\\*\\*', 300),
    'the not-started consequence must be scoped to a head whose only output is that frozen edit',
  );
  assert.match(
    sticky,
    near('configured `\\.check`', '(?:fallback cannot|the one timestamp it reads)', 200),
    'the remedy must stay, and stay stated as the one the fallback cannot substitute',
  );

  // The wizard half, bound to the `.check` bullet it belongs to. Its substance is the warning, not
  // the removed example: delete the warning and an asserted deletion still passes.
  const checkKey = flat(
    section(source('src/tools/setup.md'), '#### Block 9: the merge gate (`mergeGate.*`)')
      .split(/\n-\s+/)
      .find((entry) => entry.includes('`mergeGate.bots.<login>.check`:')) ?? '',
  );
  assert.ok(checkKey, 'the wizard must explain `mergeGate.bots.<login>.check` in its own bullet');
  assert.match(
    checkKey,
    near('reaction', '`Greptile Review` check', 200),
    'the wizard must state that this reviewer reacts *and* publishes a check context',
  );
  assert.doesNotMatch(
    checkKey,
    near('Greptile', '(?:is not a check|publishes no readable check)', 200),
    'the wizard must not use Greptile as its example of a reviewer without a check context',
  );

  // "Publishes no check context at all" is only usable as a criterion if the wizard also says how
  // to observe which case a reviewer is — and which way to resolve doubt, given that it offers
  // "not set" as the default answer.
  assert.match(
    checkKey,
    near('checks list', 'pull request', 200),
    'the wizard must name where the check context is observed',
  );
  assert.match(
    checkKey,
    near('checks list', 'exactly the name', 200),
    'the observed entry must be stated to carry exactly the value to configure',
  );
  assert.match(
    checkKey,
    near('(?:in doubt|unsure)', 'configure it', 120),
    'doubt must resolve toward configuring the context, never toward leaving it unset',
  );
  assert.match(
    checkKey,
    near('wrongly set', '(?:never be reported|can never be reported)', 300),
    'the asymmetry must be stated: a wrong context blocks visibly, an omitted one is never reported',
  );
});

test("this repository's own gate is not left on a signal its reviewer cannot use", () => {
  // `/effective-flow setup` rewrites these rows in place and offers "not set" as the default answer
  // for `.check`. A wizard run that accepted that default here would silently restore the state
  // that blocked PR #317 — this repository's reviewer back on a timestamp it stopped moving — and
  // until now no test read this file at all, so the suite would have stayed green through it.
  //
  // Deliberately narrow. `.check` is optional by contract, and a reviewer that genuinely publishes
  // no context must stay configurable without one, so this asserts nothing about bots in general:
  // only about the reviewer configured here, whose check context the gate itself documents.
  const adr = source('docs/adr/effective-flow-project-setup.md');
  const logins = tableRow(adr, 'mergeGate.bots')
    .split('|')[2]
    .split(',')
    .map((login) => login.trim())
    .filter(Boolean);
  const configured = logins.filter((login) => /greptile/i.test(login));
  assert.ok(
    configured.length > 0,
    'this repository must configure the reviewer its gate waits for',
  );

  for (const login of configured) {
    const context = tableRow(adr, `mergeGate.bots.${login}.check`).split('|')[2].trim();
    assert.ok(
      context && !/^(?:unset|not set|none|null|-)$/i.test(context),
      `${login} must carry a check context rather than the wizard's "not set" default`,
    );
    // And the reviewer's own context, not a plausible-looking typo: a context that never appears
    // resolves to **not started** exactly like a missing row does, so the two failures are one.
    assert.ok(
      source('src/tools/merge-gate.md').includes(context),
      `the configured context for ${login} must be the one the gate documents: ${context}`,
    );
  }
});

test('the reviewer-state contract pins its three states and its fail-closed precedence', () => {
  const state = source('src/shared/review-bot-state.md');
  const states = flat(section(state, '### The three states'));
  const precedence = flat(section(state, '### Precedence'));

  // Being included proves nothing about what is included. This fragment is the single source of
  // the reviewer-state rules for both consumers, and every rule below decides a merge
  // precondition: each one, silently inverted, merges a head no reviewer looked at.
  for (const name of ['running', 'not started', 'has run']) {
    assert.match(
      states,
      new RegExp(`\\*\\*${name}\\*\\*`),
      `the contract must define the ${name} state`,
    );
  }

  // Only the primary signal can prove "running". A consumer that read the fallback's
  // "not started" as "nothing is happening" would trigger a reviewer already at work.
  assert.match(
    precedence,
    near('`status: PENDING`', '\\*\\*running\\*\\*', 120),
    'a pending check must map to running',
  );

  // A terminal check is a finished review whatever it concluded. Reading a red review as
  // "has not run" re-triggers a reviewer that already answered.
  assert.match(
    precedence,
    near('`status: COMPLETED`', '\\*\\*has run\\*\\*', 120),
    'a completed check must map to has run',
  );
  assert.match(
    precedence,
    near('\\*\\*has run\\*\\*', 'whatever its `conclusion`', 120),
    'the conclusion must be stated not to decide whether the reviewer ran',
  );

  // The three fail-closed rules, each asserted in its own direction. Flipping any one of them
  // makes the gate's merge precondition pass for a reviewer that never ran — a misconfigured
  // context, an app that is not installed, or a queued run.
  assert.match(
    precedence,
    near('no matching entry', '\\*\\*not started\\*\\*', 200),
    'a context that never appears must count as not started, never as has run',
  );
  // Bound tightly and matched on the resolution itself: a wider window reaches the word
  // "fallback" in rule 2's own opening and would hold even for a `checksReported: false` that
  // resolved a state outright, which is the difference between "unavailable" and "negative".
  assert.match(
    precedence,
    near(
      '`checksReported: false`',
      '(?:falls through to rule 2|unavailable rather than negative)',
      160,
    ),
    'an unavailable check list must fall through to the fallback rather than resolve a state',
  );
  assert.match(
    precedence,
    near('unprovable', 'not started', 200),
    'anything unprovable must count as not started',
  );
  assert.match(
    precedence,
    near('unprovable', '(?:in no other|and in no other direction|never the opposite)', 300),
    'the fail-closed direction must be stated as the only one, not as a preference',
  );

  // And the fallback must not be readable as a running signal, which is the drift that would let
  // the two consumers disagree about the same pull request: the gate waiting for a reviewer the
  // guard just declared finished, or the guard holding a run the gate is not waiting for.
  assert.match(
    precedence,
    /never reports? running|says nothing whatsoever about what is in flight/i,
    'the fallback must state that it can never report running',
  );
});

test('the review-guard switch is announced by the gate and required by iterate', () => {
  // A caller-contract line is a literal two files must agree on, and the failure is silent on
  // one side: if the gate stops announcing it, every delegated round re-derives the reviewer
  // state and either duplicates the gate's wait or blocks against a reviewer the gate is
  // deliberately not waiting for. Both ends are therefore asserted in one test.
  const SWITCH = 'Review guard: established';

  // The requiring end. Sliced to its own Phase 0 item, because the item filter and the
  // summary-comment suppression are almost identically shaped contracts with their own `ABORT`.
  const exemption = flat(
    section(source('src/tools/iterate.md'), '### Phase 0')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => item.includes(SWITCH)) ?? '',
  );
  assert.ok(exemption, `iterate Phase 0 must parse the literal \`${SWITCH}\` switch`);
  assert.match(exemption, /caller|delegat/i, 'the switch must be a caller contract, not user text');
  assert.match(
    exemption,
    /(?:without that line|absent|unset|not announced|no such line)/i,
    'the unannounced case must be named, so the guard stays the default',
  );

  // Fail closed on a form it cannot parse. Continuing as an unguarded run is the resolution that
  // must not happen: the caller believes the guard is answered for, so a misread line would let
  // the run classify a thread set a reviewer is still adding to.
  //
  // The exact return value, not a bare `ABORT`: this item also contains the word inside prose
  // about what the run does *not* do, so a rule rewritten to "ignore the line and continue —
  // never `ABORT` for a misread switch" would satisfy a bare token while inverting the contract.
  assert.match(
    exemption,
    /ABORT: unparseable review-guard switch/,
    'an unparseable review-guard switch must return that exact literal',
  );

  // Anchored on `unguarded`, which occurs only in the sentence being protected. `guard` alone
  // matches the item's own opening sentence and would hold whatever the fail-closed rule said.
  assert.match(
    exemption,
    near('(?:never|not)\\s+continue', 'unguarded', 120),
    'the aborting run must be stated not to continue as an unguarded one',
  );

  // The announcing end.
  const contract = section(source('src/tools/merge-gate.md'), '## Delegation contract', '\n## ');
  const item = flat(contract.split(/\n-\s/).find((entry) => entry.includes(SWITCH)) ?? '');
  assert.ok(item, `the delegation contract must announce the literal \`${SWITCH}\``);
  assert.match(
    item,
    /mandatory|every delegation|never delegate without/i,
    'the exemption must bind every delegation, not an unspecified subset',
  );
});

test("iterate's review-in-flight guard is exempted by the switch, never by a filter", () => {
  const guard = flat(section(source('src/tools/iterate.md'), '### Phase 1.5'));
  assert.ok(guard, 'iterate must carry a review-in-flight guard phase');

  // The exemption is its own caller-contract line. Coupling it to `Item filter:` was the obvious
  // shortcut and the wrong one: a filter states the scope of a run, never that the reviewer state
  // is known, so any future workflow that filtered for scoping would lose the guard silently.
  assert.match(
    guard,
    /`?Review guard: established`?/,
    'the guard must name the caller-contract switch that exempts it',
  );

  // The negative belongs on the skip list, which is the only place an exemption can be added, and
  // it is checked per bullet. The switch's own bullet may explain why a caller sends the line —
  // including that it scoped the run — because that run still has to send it. What must not exist
  // is a *separate* condition that skips the guard on scope alone: any future workflow that
  // filtered for scoping would then lose the guard without ever deciding to.
  const skipItem =
    section(source('src/tools/iterate.md'), '### Phase 1.5')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => /skip conditions/i.test(item)) ?? '';
  assert.ok(skipItem, 'Phase 1.5 must carry an explicit skip-condition list');

  const skipBullets = skipItem.split(/\n\s*-\s+/).slice(1);
  assert.ok(skipBullets.length >= 2, 'the skip-condition list must enumerate its cases as bullets');
  for (const bullet of skipBullets) {
    if (bullet.includes('Review guard: established')) continue;
    assert.doesNotMatch(
      flat(bullet),
      /filter|scop(?:e|ed|ing)/i,
      'no skip condition beside the caller-contract switch may rest on the run being scoped',
    );
  }

  // And non-interactivity is not the exemption either — `apply-review` also delegates
  // non-interactively and knows nothing about reviewer state, so precisely the runs that need the
  // guard would lose it. Such a run aborts with the exact literal instead.
  assert.match(
    guard,
    /ABORT: review still in flight/,
    'a non-interactive run without the switch must abort with the exact literal',
  );
  assert.match(
    guard,
    near('non-interactive', 'ABORT: review still in flight', 300),
    'the abort must be tied to the run that cannot be asked, not to an unspecified failure',
  );
});

test('the gate branches on three reviewer states and triggers only on "not started"', () => {
  const phase3 = flat(section(source('src/tools/merge-gate.md'), '### Phase 3'));

  // Three states, not two. Under a check-based signal the old "has run" / "has not run" split is
  // wrong: a reviewer whose check is still pending has not run and must not be triggered — a
  // mention would queue a redundant second run or, for a reviewer that reads one as a fresh
  // request, discard the review already in flight.
  for (const state of ['running', 'not started', 'has run']) {
    assert.match(
      phase3,
      new RegExp(`\\*\\*${state}\\*\\*`, 'i'),
      `Phase 3 must distinguish the ${state} state`,
    );
  }

  // The trigger hangs off "not started" specifically. Asserted on the step that posts the trigger
  // text, so a step that reverted to "has not run" cannot satisfy it.
  assert.match(
    phase3,
    near('\\*\\*Not started', '`mergeGate\\.bots\\.<login>\\.trigger`', 200),
    'the trigger step must be conditioned on the not-started state',
  );

  // And the running state is a wait with no write at all.
  assert.match(
    phase3,
    near('\\*\\*Running', '(?:post \\*\\*no\\*\\* trigger|no trigger comment|post nothing)', 300),
    'a running reviewer must be waited for and never triggered',
  );

  // An unprovable state still falls to the safe side, exactly as before the three-way split.
  assert.match(
    phase3,
    near('(?:unprovable|cannot be established)', 'not started', 200),
    'an unprovable reviewer state must count as not started, never as an assumed pass',
  );
});

test('setup rewrites a legacy prReview.* block in place instead of leaving both standing', () => {
  // Without the in-place rewrite a migrated project ends up with two adjacent blocks of
  // plausible-looking configuration, one of them inert — the artifact a later maintainer edits
  // without effect. Sliced to setup's own migration section so a sentence elsewhere in the file
  // cannot satisfy these.
  const migration = flat(
    section(
      source('src/tools/setup.md'),
      '#### Rewriting a legacy `prReview.*` merge-gate block in place',
    ),
  );

  assert.match(
    migration,
    near('carry', '`mergeGate\\.', 300),
    'every legacy row must be carried over to the identical trailing key under mergeGate',
  );
  assert.match(
    migration,
    /(?:Remove the old rows|remove the legacy rows)/i,
    'the old rows must be removed, not left beside the new ones',
  );

  // A shadowed key is reported rather than merged: merging two differing values into one setting
  // would invent a configuration nobody chose.
  assert.match(
    migration,
    near(
      '(?:shadow|both present|both.{0,30}different values)',
      '(?:do not merge|never combine|not merge)',
      400,
    ),
    'a shadowed legacy key must be reported and never merged with its mergeGate counterpart',
  );

  // The write authority boundary the migration rests on: only setup writes configuration.
  assert.match(
    flat(source('src/tools/setup.md')),
    near('only', 'writer of the configuration', 200),
    'setup must state that it is the only writer of the configuration',
  );
});

test('the shared configuration fragment documents every merge-gate key and the legacy fallback', () => {
  // The fragment is what every consumer loads, so a key missing here is a key no run resolves —
  // it silently falls back to a default instead, turning a configured `merge` completion into
  // `ask` or a configured bot list into "no bots expected".
  const migration = source('src/shared/config-migration.md');
  const block = section(
    migration,
    '### Merge-gate keys (`mergeGate.*`) and their legacy namespace',
    '\n### ',
  );

  for (const key of [
    'mergeGate.completion',
    'mergeGate.requireAllChecks',
    'mergeGate.checkWaitMinutes',
    'mergeGate.maxRounds',
    'mergeGate.botWaitMinutes',
    'mergeGate.bots',
    'mergeGate.bots.<login>.trigger',
    'mergeGate.bots.<login>.check',
  ]) {
    assert.ok(block.includes(`\`${key}\``), `the configuration fragment must document ${key}`);
  }

  // The read fallback with its per-key precedence. A whole-block fallback would let one migrated
  // key hide every unmigrated one.
  const flatBlock = flat(block);
  assert.match(
    flatBlock,
    near('`prReview\\.<key>`', '(?:absent|missing|where a)', 300),
    'the legacy namespace must be read where the mergeGate key is absent',
  );
  assert.match(
    flatBlock,
    near('per key', '(?:wins|precedence)', 300),
    'precedence must be stated per key, not per block',
  );
});

test("the router's description names both iterate and the merge gate", () => {
  // The frontmatter description is the only catalog a harness sees before it loads anything, so a
  // tool missing from it is a tool nobody discovers by name.
  const [, description] = source('src/SKILL.md').match(/^description:\s*(.+)$/m) ?? [];
  assert.ok(description, 'SKILL.md must carry a frontmatter description');
  for (const tool of ['iterate', 'merge-gate']) {
    assert.match(
      description,
      new RegExp(`\\b${tool}\\b`),
      `the router description must name the ${tool} tool`,
    );
  }
  assert.doesNotMatch(description, /\bpr-review\b/, 'the renamed tool must not linger in the list');
});

test('iterate documents an optional item filter that never falls back to all items', () => {
  const iterate = source('src/tools/iterate.md');

  // The filter is what makes the gate's phase order binding rather than descriptive: an
  // unfiltered delegation classifies every unaddressed thread, so a run meant to repair one
  // failing check would silently implement every open bot finding along with it.
  assert.match(
    section(iterate, '### Phase 0: Target detection and input parsing'),
    /filter/i,
    'Phase 0 must parse the optional item filter out of the invocation',
  );
  assert.match(
    section(iterate, '### Phase 2: Classification'),
    /filter/i,
    'Phase 2 must apply the item filter to the items it classifies',
  );

  const blocks = iterate.split(/\n{2,}/).filter((block) => /filter/i.test(block));
  assert.ok(blocks.length > 0, 'iterate.md must document the optional item filter');
  const contract = flat(blocks.join('\n\n'));

  assert.match(contract, /item filter/i);
  assert.match(contract, /optional/i);
  // Both selectable scopes: the free-text items alone, or an explicit list of thread IDs.
  assert.match(contract, /free[- ]text/i);
  assert.match(contract, /thread ID/i);
  // Additive by construction — an unfiltered invocation keeps the current all-items behavior.
  assert.match(
    contract,
    /unfiltered|without (?:an? )?(?:item )?filter|no (?:item )?filter/i,
    'the contract must state what an unfiltered invocation does',
  );
  // The filter's most important failure mode: matching nothing yields an empty run, never a
  // silent fallback to processing every item.
  assert.match(
    contract,
    /matche?s? (?:no|nothing)|no item|nothing/i,
    'the contract must cover a filter that matches no item',
  );
  assert.match(
    contract,
    /fall(?:s|ing)? back|fallback/i,
    'the contract must rule out the fallback to all items explicitly',
  );
});

test('ci.yml keeps the job names the develop ruleset requires', () => {
  // The `develop` ruleset lists these two strings as required status checks, and GitHub matches
  // a required check by its exact name. Renaming either job would not fail anything here or on
  // GitHub — the check would simply stop reporting, and every pull request into `develop` would
  // block forever with no timeout, no override short of editing the ruleset, and nothing naming
  // the cause (issue #282).
  //
  // Only these two are required, deliberately. The managers job exercises externally published
  // manager releases, so requiring it would let an unrelated upstream release block every merge,
  // including the release pull request. That is also why its name is left alone here.
  const ci = source('.github/workflows/ci.yml');
  for (const name of ['Format, test and build', 'Shellcheck']) {
    assert.ok(
      ci.includes(`name: ${name}\n`),
      `ci.yml must keep the job name "${name}"; the develop ruleset requires it by that exact string`,
    );
  }
});

test('every workflow action is pinned to a commit', () => {
  // Movable tags let upstream change what runs in a job where the App private keys are in
  // scope — including for actions that receive no credential of their own. This scans the
  // directory rather than a file list so a newly added workflow cannot slip past (issue #293).
  //
  // Only the ref shape is asserted here. Every other assertion in this file matches actions
  // without their ref, so a Renovate digest bump touches no test at all; concentrating the
  // format in one place is what keeps those bumps from becoming an occasion to weaken a guard.
  const directory = new URL('.github/workflows/', repositoryRoot);
  // Both extensions, because GitHub runs both — filtering `.yml` alone would let a `.yaml`
  // workflow carry movable tags past the very scan that exists to catch new files.
  const workflows = readdirSync(directory).filter(
    (entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'),
  );
  assert.ok(workflows.length >= 3, 'expected the workflow directory to be populated');

  for (const workflow of workflows) {
    const lines = source(`.github/workflows/${workflow}`).split('\n');
    for (const [index, line] of lines.entries()) {
      const step = line.match(/^\s*-?\s*uses:\s*(\S+)\s*(.*)$/);
      if (!step) continue;
      const [, reference, trailer] = step;
      assert.match(
        reference,
        /@[0-9a-f]{40}$/,
        `${workflow}:${index + 1} must pin its action to a commit, found ${reference}`,
      );
      // The version comment is what Renovate reads to know which release the digest belongs
      // to; without it the pin becomes an opaque hash nobody can place. Its precision is left
      // to Renovate, which writes the upstream tag's own (`# v9`, not `# v9.0.0`).
      assert.match(
        trailer,
        /^# v\d+(?:\.\d+)*$/,
        `${workflow}:${index + 1} must carry a version comment, found "${trailer}"`,
      );
    }
  }
});

// --- Deprecated pr-review alias for merge-gate ---

test('src/tools/pr-review.md is a minimal alias that reports deprecation before forwarding to merge-gate', () => {
  const alias = source('src/tools/pr-review.md');

  const lineCount = alias.split('\n').length;
  assert.ok(
    lineCount < 40,
    `src/tools/pr-review.md has ${lineCount} lines but must stay under 40; the size cap is what ` +
      'keeps the alias from growing a second gate implementation next to the one in merge-gate.md',
  );

  assert.doesNotMatch(
    alias,
    /^## Phase/m,
    'the alias must carry no `## Phase` heading; a phase heading is the shape of the gate logic ' +
      'that belongs only in merge-gate.md',
  );
  for (const forbidden of [
    /\bapprove and request-changes/i,
    /\brequireAllChecks\b/,
    /\bbotWaitMinutes\b/,
    /\bcheckWaitMinutes\b/,
  ]) {
    assert.doesNotMatch(
      alias,
      forbidden,
      `the alias must carry no merge/check/reviewer logic of its own (found pattern: ${forbidden})`,
    );
  }

  // The deprecation notice must be instructed before the forward, not merely present somewhere
  // in the file — a reordered file would still "mention" both without actually notifying the
  // user before the gate's own Phase 1 output starts.
  ordered(alias, 'Emit the deprecation notice', 'Then read `tools/merge-gate.md`');
  assert.match(
    flat(alias),
    /read `tools\/merge-gate\.md`[\s\S]{0,40}follow it verbatim/,
    'the alias must state that it reads and follows tools/merge-gate.md verbatim',
  );
});

test('src/tools/pr-review.md states it is not the central pr-review skill and must not load it', () => {
  // merge-gate forbids loading the central `pr-review` skill in bold (see the neighboring test
  // "skill-ownership.json names no merge gate among the consumers of the pr-review skill"). A
  // tool source that now shares that skill's name is exactly the accident that rule exists for:
  // without an explicit exclusion here, the alias is the one place an agent could plausibly
  // reach for "the pr-review skill" by name and get it wrong.
  const alias = flat(source('src/tools/pr-review.md'));
  assert.match(
    alias,
    /not the central `pr-review` skill/,
    'the alias must state it is not the central pr-review skill',
  );
  assert.match(
    alias,
    /must not load it/,
    'the alias must state that it must not load the central pr-review skill',
  );
});

test('build.mjs declares the pr-review alias and keeps it out of the tool catalog', () => {
  // TOOL_GROUPS cannot be imported: build.mjs runs the entire build on load, so the group
  // definition is sliced out of the source text instead, the same technique the neighboring
  // test "the merge gate is exposed in the Deliver changes group" uses.
  const groups = section(source('build.mjs'), 'const TOOL_GROUPS = [', '\nconst EXPOSED_TOOLS');
  assert.doesNotMatch(
    groups,
    /'pr-review'/,
    'pr-review must appear in no TOOL_GROUPS entry; TOOL_GROUPS drives the router catalog, and ' +
      'listing the retired name there would advertise it again',
  );

  assert.match(
    source('build.mjs'),
    /const DEPRECATED_TOOL_ALIASES = \[\{ alias: 'pr-review', replacement: 'merge-gate' \}\];/,
    'build.mjs must declare DEPRECATED_TOOL_ALIASES mapping pr-review to merge-gate',
  );
});

test('argument-hint is derived from the pure exposed tool set, without the deprecated alias', () => {
  const argumentHintLine = source('build.mjs')
    .split('\n')
    .find((line) => line.includes('const argumentHint ='));
  assert.ok(argumentHintLine, 'build.mjs must define argumentHint');
  assert.match(
    argumentHintLine,
    /EXPOSED_TOOLS\.join/,
    'argumentHint must be derived from the pure EXPOSED_TOOLS array, not a set that also carries ' +
      'deprecated alias names — otherwise the retired pr-review name would get autocomplete',
  );
  assert.doesNotMatch(
    argumentHintLine,
    /DEPRECATED_TOOL_ALIASES/,
    'argumentHint must not reference DEPRECATED_TOOL_ALIASES',
  );
});

test('src/SKILL.md carries the {{DEPRECATED_ALIASES}} placeholder in its dispatch section', () => {
  // The rendered alias clause is the only thing that makes an unlisted name route instead of
  // falling into dispatch rule 1 ("no or unknown tool -> print the catalog"). Losing this
  // placeholder from the source would silently break the alias without failing anything else,
  // because the router would still render — just without the clause that routes `pr-review`.
  const dispatch = section(source('src/SKILL.md'), '## Dispatch rule', '\n```include');
  assert.match(
    dispatch,
    /\{\{DEPRECATED_ALIASES\}\}/,
    'the dispatch rule section must contain the {{DEPRECATED_ALIASES}} placeholder',
  );
});

test('one rule decides when a configured reviewer login matches a reported one', () => {
  const state = source('src/shared/review-bot-state.md');
  // Default stop, so the slice ends at the next `###` heading: assertions must be satisfied by the
  // rule itself, not by neighbouring prose elsewhere in the fragment.
  const rule = flat(section(state, '### Matching a configured login'));

  // The defect this rule exists for: the same account arrives as `greptile-apps[bot]` from REST and
  // `greptile-apps` from GraphQL, so no single configured value satisfied both surfaces. Configured
  // the REST way, Phase 4's unassessed-thread condition matched nothing and reported itself
  // satisfied while open reviewer findings sat there.
  assert.match(rule, /\[bot\]/, 'the rule must name the suffix it tolerates');
  assert.match(
    rule,
    near('trailing', '\\[bot\\]', 200),
    'only a trailing suffix is trimmed — a `[bot]` elsewhere is part of the login',
  );
  assert.match(
    rule,
    /exact|exactly/i,
    'the comparison must stay exact apart from that trim, or it becomes a substring match',
  );

  // The trim is an allowance for one bot account spelled two ways, so it takes a bot account.
  // GitHub mints `foo[bot]` for an app slug `foo` while the bare `foo` stays an ordinary user or
  // organization name: an ungated trim adds exactly one human-reachable login per configured entry,
  // and that human's comments then count as the reviewer's output on every consumer of this rule.
  assert.match(
    rule,
    near('trim', '(?:`isBot`|`authorType`|bot-typed)', 400),
    'the trim must be conditioned on the reported account class, not applied to every login',
  );

  // Resolution direction. The dotted config keys are spelled the way the project wrote them, so a
  // tolerant match that then looked config up under the *reported* spelling would find nothing.
  assert.match(
    rule,
    near('`mergeGate\\.bots\\.<login>\\.(?:trigger|check)`', 'configured spelling', 400),
    'the rule must state that .trigger/.check are looked up under the configured spelling',
  );

  // A project may already carry both spellings as the documented workaround. After this rule they
  // are one reviewer, which must not silently become two rounds, two mentions and two waits.
  assert.match(
    rule,
    near('(?:collapse|collapsing|de-duplicat|duplicate)', '(?:report|conflict)', 400),
    'collapsing entries must be de-duplicated, and a conflicting trigger/check reported',
  );
});

test('every site that matches mergeGate.bots resolves through the shared login rule', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase1 = flat(section(gate, '### Phase 1'));
  const phase3 = flat(section(gate, '### Phase 3'));
  const phase4 = section(gate, '### Phase 4');

  // Four sites compare a configured login against a reported one, on two surfaces that spell the
  // same account differently. A site that restates a bare equality instead of resolving through the
  // shared rule reintroduces the defect at that site alone, which is exactly how it stayed hidden.
  const reference = /Matching a configured login/;

  assert.match(
    phase1,
    reference,
    'Phase 1 rule 1 must resolve the configured login through the rule',
  );
  assert.match(phase3, reference, "Phase 3's per-login round must resolve through the rule");

  const conditions = phase4.split(/(?=\n\d+\.\s)/).slice(1);
  const hasRunIndex = conditions.findIndex((item) => /has run/i.test(item));
  const assessedIndex = conditions.findIndex((item) => /assessed/i.test(item));
  assert.notEqual(hasRunIndex, -1, 'Phase 4 must keep its reviewer has-run condition');
  assert.notEqual(assessedIndex, -1, 'Phase 4 must keep its never-assessed condition');
  assert.match(
    flat(conditions[hasRunIndex]),
    reference,
    'the has-run condition must resolve the configured login through the rule',
  );
  assert.match(
    flat(conditions[assessedIndex]),
    reference,
    'the never-assessed condition must resolve the configured login through the rule',
  );
});

test('condition 7 finding no reviewer thread is reported, not passed over in silence', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase4 = section(gate, '### Phase 4');

  // The numbered preconditions are cut out first, so every assertion below can tell a merge
  // condition apart from the commentary that follows it. The cut starts at the list's own first
  // numbered line: anchoring on the section's first blank line lands between the heading and the
  // intro paragraph — before the list — and leaves an empty slice that asserts nothing. It ends at
  // the first blank line followed by a line that is neither indented (a condition's own
  // continuation) nor numbered (the next condition); everything past that point is Phase 4
  // commentary. Splitting without that cut would file trailing prose under the last condition and
  // fail a correctly placed report.
  const listStart = phase4.search(/\n\d+\.\s/);
  assert.notEqual(listStart, -1, 'Phase 4 must carry its merge preconditions as a numbered list');
  const list = phase4.slice(listStart);
  const listEnd = list.search(/\n\n(?![ \t])(?!\d+\.)/);
  assert.notEqual(listEnd, -1, 'Phase 4 must carry prose after its numbered preconditions');
  const conditions = list.slice(0, listEnd).split(/(?=\n\d+\.\s)/);
  const afterList = flat(list.slice(listEnd));

  // The slicing is itself under test: an empty or truncated condition list would let the
  // not-a-precondition check below pass without ever reading a condition.
  assert.ok(
    conditions.length >= 7,
    'Phase 4 must slice into its numbered preconditions — condition 7 among them — or the checks below assert nothing',
  );

  // The report's own contract phrase, required of the prose and forbidden of the conditions, so both
  // halves move together when it is reworded. `\b` keeps the alternation out of `Note`, `nothing`
  // and `not`, and naming one phrase replaces a bare character distance that could pair a `no` in
  // one sentence with a `match` in another.
  const zeroMatch = 'match(?:ed|es|ing)?\\s+\\b(?:no|zero|none of the)\\b\\s+configured\\s+logins?';
  const zeroMatchPhrase = new RegExp(zeroMatch, 'i');

  // "Satisfied" and "no reviewer threads are open" were indistinguishable in the log, which is why
  // a gate whose unassessed-thread protection was inert said so nowhere. A misconfigured or absent
  // login is not a suffix problem, so the matching rule above does not reach this case.
  assert.match(
    afterList,
    near(zeroMatch, '(?:report|name)', 500),
    'Phase 4 must report a reviewer list that matched no unresolved thread',
  );

  // Report-only, deliberately. An unresolved *human* thread already blocks at the human-comment
  // guard, so a blocking condition here would double-count it and could stall merges that the
  // guard correctly releases.
  assert.match(
    afterList,
    near(
      '(?:reports? only|not a (?:new )?(?:blocking )?condition|never blocks|does not block)',
      'condition',
      400,
    ),
    'the zero-match report must state that it is not a blocking condition',
  );

  // It must not have been written as a numbered precondition, or it would gate the merge after all.
  const asCondition = conditions.filter((item) => zeroMatchPhrase.test(flat(item)));
  assert.equal(
    asCondition.length,
    0,
    'the zero-match report must not be a numbered Phase 4 merge precondition',
  );
  assert.match(
    afterList,
    zeroMatchPhrase,
    'the zero-match report must live in the prose after the numbered preconditions',
  );
});
