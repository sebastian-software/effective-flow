import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { collectIncludeNames, resolveEagerIncludes } from '../build-lib.mjs';

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
