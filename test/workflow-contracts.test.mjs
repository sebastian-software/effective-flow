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
    'uses: actions/create-github-app-token@v3',
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
  assert.match(step, /^ {8}uses: googleapis\/release-please-action@v5$/m);
  assert.match(step, /^ {10}token: \$\{\{ steps\.release-token\.outputs\.token \}\}$/m);
  assert.match(step, /^ {10}target-branch: develop$/m);
  assert.doesNotMatch(release, /^\s*token: \$\{\{ github\.token \}\}$/m);

  // The token is a short-lived App installation token rather than a long-lived personal
  // access token, so no credential on the release path expires or belongs to a person.
  // It must be minted before release-please consumes it, hence the ordering assertion.
  const mint = workflowStep(release, 'Create release token');
  assert.match(mint, /^ {8}uses: actions\/create-github-app-token@v3$/m);
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
  assert.equal(
    release.match(/^\s*-?\s*uses: actions\/checkout@v7$/gm)?.length,
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

  assert.match(release, /actions\/create-github-app-token@v3/g);
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
