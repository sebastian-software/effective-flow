import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBody, renderBody } from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const SHARED_DIR = join(SOURCE_DIR, 'shared');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');

const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const readShared = (name) => readSource('shared', `${name}.md`);

function resolveEagerIncludes(body, included = new Set()) {
  return body.replace(/```include\n([^\n]+)\n```/g, (directive, rawName) => {
    const name = rawName.trim();
    assert.ok(!included.has(name), `cyclic eager include: ${name}`);
    const nextIncluded = new Set(included).add(name);
    return resolveEagerIncludes(readShared(name), nextIncluded).replace(/\n+$/, '');
  });
}

const toolNames = new Set(
  readdirSync(TOOLS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3)),
);
const agentNames = new Set(
  readdirSync(AGENTS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3)),
);
const renderConfig = {
  exposedTools: [...toolNames],
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: toolNames,
  knownAgents: agentNames,
};

const contract = readShared('execution-location').trim();
const resolvedDeliveryFragment = resolveEagerIncludes(readShared('worktree-integration'));
const resolvedApplyReviewMechanics = resolveEagerIncludes(
  extractBody(readSource('tools', 'apply-review-commit-mechanics.md')),
);

test('delivery and apply-review paths include the canonical execution-location contract', () => {
  const deliveryTools = ['build', 'docs', 'fix', 'maintain', 'refactor'];

  for (const tool of deliveryTools) {
    const body = extractBody(readSource('tools', `${tool}.md`));
    assert.match(
      body,
      /```(?:lazy-)?include\nworktree-integration\n(?:when:[^\n]+\n)?```/,
      `${tool} must route through the delivery worktree contract`,
    );
  }

  assert.ok(resolvedDeliveryFragment.includes(contract));
  assert.ok(resolvedApplyReviewMechanics.includes(contract));

  const applyReview = extractBody(readSource('tools', 'apply-review.md'));
  assert.match(applyReview, /tools\/apply-review-commit-mechanics\.md/);
  assert.match(applyReview, /execution-location receipt per component/);
});

test('the execution-location contract survives every harness render unchanged', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const context = `shared/execution-location.md (${harness})`;
    const renderedContract = renderBody(`${contract}\n`, harness, { ...renderConfig, context });
    const renderedDelivery = renderBody(resolvedDeliveryFragment, harness, {
      ...renderConfig,
      context: `shared/worktree-integration.md (${harness})`,
    });
    const renderedApplyReview = renderBody(resolvedApplyReviewMechanics, harness, {
      ...renderConfig,
      context: `tools/apply-review-commit-mechanics.md (${harness})`,
    });

    assert.equal(
      renderedContract
        .trim()
        .replaceAll('`/effective-flow setup`', '`{{SKILL:setup}}`')
        .replaceAll('`$effective-flow setup`', '`{{SKILL:setup}}`')
        .replaceAll('`effective-flow setup`', '`{{SKILL:setup}}`'),
      contract,
    );
    assert.ok(renderedDelivery.includes(renderedContract.trim()), `delivery output for ${harness}`);
    assert.ok(
      renderedApplyReview.includes(renderedContract.trim()),
      `apply-review output for ${harness}`,
    );
  }
});

test('the canonical receipt fails closed and roots every write-capable operation', () => {
  const requiredClauses = [
    [/git rev-parse --show-toplevel/, 'canonical execution root'],
    [/git rev-parse --git-common-dir/, 'canonical repository identity'],
    [/exact branch name, or `detached` plus the exact commit OID/, 'branch or detached OID'],
    [
      /At each write-capable orchestrator or worker boundary, and again after resume or Handoff/,
      'boundary preflight',
    ],
    [
      /If any value is missing, cannot be canonicalized, or differs, abort before writing/,
      'fail-closed behavior',
    ],
    [/root tracked project,[\s\S]*operations in `EXECUTION_ROOT`/, 'rooted operations'],
    [/After a Handoff or resume/, 'Handoff revalidation'],
    [/receipt says `effective-flow-created`/, 'cleanup ownership'],
    [/Never force-remove a dirty,[\s\S]*harness-managed worktree/, 'ownership-safe cleanup'],
    [/`EXECUTION_ROOT` and `RUNTIME_STATE_ROOT`/, 'separate execution and runtime roots'],
    [/first record of `git worktree list --porcelain`/, 'main-worktree discovery'],
    [/A `bare` first record/, 'bare-main rejection'],
    [/same canonical Git common directory/, 'runtime repository identity'],
    [/must not change `RUNTIME_STATE_ROOT`/, 'stable runtime root across worktree entry'],
    [/never remove, rename, or otherwise alter `RUNTIME_STATE_ROOT`/, 'runtime-root preservation'],
  ];

  for (const [pattern, clause] of requiredClauses) {
    assert.match(contract, pattern, `missing ${clause} clause`);
  }
});

test('every local report consumer retains and uses the absolute main-checkout handle', () => {
  const sourceDetection = readShared('apply-source-detection');
  const backlinks = readShared('review-report-backlinks');
  const unresolved = readShared('unresolved-review-report');
  const runtimeSafety = readShared('runtime-state-safety');
  const apply = readSource('tools', 'apply.md');
  const applyReview = readSource('tools', 'apply-review.md');
  const applyReviewMechanics = readSource('tools', 'apply-review-commit-mechanics.md');
  const review = readSource('tools', 'review.md');
  const configMigration = readShared('config-migration');

  assert.match(sourceDetection, /Before report-source resolution/);
  assert.match(sourceDetection, /filename-only/);
  assert.match(sourceDetection, /absolute report handle/);
  assert.match(sourceDetection, /<RUNTIME_STATE_ROOT>\/\.effective-flow\/review\//);
  assert.match(sourceDetection, /symlink escape/);
  assert.match(backlinks, /absolute report handle/);
  assert.match(backlinks, /RUNTIME_STATE_ROOT/);
  assert.match(unresolved, /RUNTIME_STATE_ROOT/);
  assert.match(unresolved, /collision checks/);
  assert.match(unresolved, /memory\.json/);
  assert.match(runtimeSafety, /from `RUNTIME_STATE_ROOT`/);
  assert.match(runtimeSafety, /exact absolute runtime-state handle/);
  assert.match(apply, /<RUNTIME_STATE_ROOT>\/\.effective-flow\/review\//);
  assert.match(applyReview, /Retain `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separately/);
  assert.match(applyReview, /absolute report handle/);
  assert.match(
    applyReview,
    /retained absolute `<RUNTIME_STATE_ROOT>\/\.effective-flow\/apply-review-commit\.lock` handle/,
  );
  assert.doesNotMatch(
    applyReview,
    /run every finding commit under `\.effective-flow\/apply-review-commit\.lock`/,
  );
  assert.match(
    applyReviewMechanics,
    /<RUNTIME_STATE_ROOT>\/\.effective-flow\/apply-review-commit\.lock/,
  );
  assert.match(applyReviewMechanics, /Resolve a relative BaseDir against `RUNTIME_STATE_ROOT`/);
  assert.match(
    review,
    /<RUNTIME_STATE_ROOT>\/\.sf-memory\.json[\s\S]*<RUNTIME_STATE_ROOT>\/\.effective-flow\/cache\.json/,
  );
  assert.match(review, /RUNTIME_STATE_ROOT/);
  assert.match(review, /collision checks/);
  assert.match(
    configMigration,
    /<RUNTIME_STATE_ROOT>\/\.effective-flow\/config\.json[\s\S]*<RUNTIME_STATE_ROOT>\/\.firmo\/config\.json/,
  );
});

test('the dual-root contract survives every harness render', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const renderedDelivery = renderBody(resolvedDeliveryFragment, harness, {
      ...renderConfig,
      context: `shared/worktree-integration.md dual roots (${harness})`,
    });
    const renderedApplyReview = renderBody(resolvedApplyReviewMechanics, harness, {
      ...renderConfig,
      context: `tools/apply-review-commit-mechanics.md dual roots (${harness})`,
    });

    for (const rendered of [renderedDelivery, renderedApplyReview]) {
      assert.match(rendered, /`EXECUTION_ROOT` and `RUNTIME_STATE_ROOT`/);
      assert.match(rendered, /first record of `git worktree list --porcelain`/);
      assert.match(rendered, /never remove, rename, or otherwise alter `RUNTIME_STATE_ROOT`/);
    }
  }
});

test('maintenance red-baseline abort uses ownership-safe delivery handback', () => {
  const maintain = extractBody(readSource('tools', 'maintain.md'));
  const abortClauses = [
    [/current-run ownership flags/, 'current-run artifact ownership'],
    [/original verified[\s\S]*execution-location receipt/, 'original checkout receipt'],
    [/exact creation OID/, 'immutable creation OID'],
    [/Never[\s\S]*compare against a moving remote tip/, 'moving-remote exclusion'],
    [/Effective Flow-owned worktree/, 'owned worktree cleanup'],
    [/git worktree remove <WORKTREE_PATH>[\s\S]*without force/, 'non-forced worktree removal'],
    [/git branch -d <BRANCH_NAME>/, 'safe branch deletion'],
    [/In-place transient branch/, 'in-place checkout restoration'],
    [/Restore the original branch or detached OID first/, 'restore-before-delete ordering'],
    [/harness-managed[\s\S]*perform no lifecycle mutation/, 'externally managed no-op'],
    [/in-place execution without delivery[\s\S]*no lifecycle\s+cleanup/, 'no-delivery no-op'],
    [/partial cleanup explicitly/, 'partial cleanup reporting'],
    [/Never[\s\S]*force-delete a branch/, 'forced cleanup prohibition'],
  ];

  for (const [pattern, clause] of abortClauses) {
    assert.match(resolvedDeliveryFragment, pattern, `missing ${clause} clause`);
  }

  assert.match(maintain, /Wait for both baseline workers to finish/);
  assert.match(maintain, /preserve both diagnostics/);
  assert.match(maintain, /Abort handback before implementation/);
  assert.match(maintain, /point to `\{\{SKILL:fix\}\}`/);
  assert.match(maintain, /End the workflow before Phase 3/);
  assert.match(maintain, /before any commit, completion prompt, push, pull request or[\s\S]*merge/);
});

test('legacy arbitrary-CWD delegation and unconditional cleanup wording stay removed', () => {
  const relevantSources = [
    readShared('execution-location'),
    readShared('worktree-integration'),
    readSource('tools', 'apply-review-commit-mechanics.md'),
    readSource('tools', 'apply-review.md'),
  ].join('\n');

  const prohibitedWording = [
    /files with the working directory in the worktree/,
    /start the sub-agent with this worktree as the working directory/i,
    /Start the delegation sub-agent with the working directory `<WORKTREE_PATH>`/,
    /If a worktree was involved, run `git worktree remove/,
    /After a successful integration and validation: remove the worktree/,
    /Remove the worktree, leave the delivery branch locally/,
  ];

  for (const pattern of prohibitedWording) {
    assert.doesNotMatch(relevantSources, pattern);
  }

  for (const renderedPath of [resolvedDeliveryFragment, resolvedApplyReviewMechanics]) {
    for (const match of renderedPath.matchAll(/git worktree remove <WORKTREE_PATH>/g)) {
      const surroundingContract = renderedPath.slice(Math.max(0, match.index - 900), match.index);
      assert.match(surroundingContract, /effective-flow-created/);
    }
  }
});

test('forge operations are rooted in the runtime state root, not the execution worktree', () => {
  const requiredClauses = [
    [/Root every forge operation in `RUNTIME_STATE_ROOT`/, 'forge rooting category'],
    [
      /provider CLI such as `gh` or `tea` resolves its repository context from its working\s+directory/,
      'provider working-directory rationale',
    ],
    [/may already have been withdrawn/, 'withdrawn-worktree rationale'],
    [
      /It never redirects tracked project work, which stays\s+in `EXECUTION_ROOT`/,
      'boundary against tracked project work',
    ],
  ];

  for (const [pattern, clause] of requiredClauses) {
    assert.match(contract, pattern, `missing ${clause} clause`);
  }
});

test('the completion action and the pr tool root their forge work in the runtime state root', () => {
  assert.match(
    resolvedDeliveryFragment,
    /5\. \*\*Execute action:\*\* Run this step and every Git, remote-helper and provider-CLI operation it\s+performs in `RUNTIME_STATE_ROOT`/,
    'the completion action must name its execution root',
  );
  assert.match(
    resolvedDeliveryFragment,
    /Never fall back to\s+`EXECUTION_ROOT` for this step/,
    'the completion action must forbid the execution-root fallback',
  );
  assert.match(
    resolvedDeliveryFragment,
    /pass the delivery branch, base branch, the verified\s+`RUNTIME_STATE_ROOT` as its execution root/,
    'the pr handback must pass the runtime root',
  );

  const pr = extractBody(readSource('tools', 'pr.md'));
  assert.match(pr, /^## Execution root$/m, 'pr.md must state its execution root');
  assert.match(
    pr,
    /```lazy-include\nexecution-location\n(?:when:[^\n]+\n)?```/,
    'pr.md must attach the canonical execution-location contract',
  );
  assert.match(pr, /`git -C <execution-root> push -u origin <head-branch>`/, 'rooted push');
  for (const step of [
    /repository-resolution operation with the execution root as the payload's `cwd`/,
    /Invoke the helper probe once — again with the execution root as `cwd`/,
    /`pr-list` operation for open pull requests, with the execution root as `cwd`/,
    /set the execution root as its `cwd`, and invoke the helper's PR-create mutation/,
  ]) {
    assert.match(pr, step, 'every helper invocation in pr.md must carry the execution root');
  }
});

test('the remote helper contract documents the working directory it runs in', () => {
  const issueTracker = readShared('issue-tracker');
  assert.match(
    issueTracker,
    /Pass the verified absolute `RUNTIME_STATE_ROOT` as the top-level `cwd`/,
    'the helper contract must document the cwd input',
  );
  assert.match(
    issueTracker,
    /A `cwd` that is not an existing directory fails with\s+a structured error naming the path, never as a missing-CLI error/,
    'the helper contract must document the unusable-directory error',
  );
});
