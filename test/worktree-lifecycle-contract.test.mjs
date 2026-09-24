import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  EAGER_INCLUDE_RE,
  LAZY_INCLUDE_RE,
  collectIncludeNames,
  extractBody,
  renderBody,
  resolveEagerIncludes,
  resolveLazyIncludes,
} from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');

const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const readShared = (name) => readSource('shared', `${name}.md`);

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

const lifecycle = readShared('worktree-lifecycle');
const cleanup = extractBody(readSource('tools', 'cleanup.md'));
const delivery = readShared('worktree-integration');
const applyReview = extractBody(readSource('tools', 'apply-review-commit-mechanics.md'));

function assertClauses(text, clauses) {
  for (const [pattern, label] of clauses) {
    assert.match(text, pattern, `missing ${label}`);
  }
}

function assertDangerousCommandIsOnlyMentionedAsProhibited(text, pattern, label) {
  const matches = [...text.matchAll(pattern)];
  assert.ok(matches.length > 0, `missing explicit ${label} prohibition`);

  for (const match of matches) {
    const context = text.slice(Math.max(0, match.index - 180), match.index + match[0].length + 80);
    assert.match(
      context,
      /(?:never|must not|do not|forbidden|without|prohibit)/i,
      `${label} must only occur in an explicit prohibition`,
    );
  }
}

test('the lifecycle record has one stable schema and explicit status transitions', () => {
  assertClauses(lifecycle, [
    [/schema(?: version|-version|Version)/i, 'schema version'],
    [/(?:session|run)(?: ID| identifier)|sessionId|runId/i, 'session or run identity'],
    [/component/i, 'component identity'],
    [/workflow/i, 'workflow identity'],
    [/purpose/i, 'purpose'],
    [/repositoryIdentity|repository identity/i, 'canonical repository identity'],
    [/executionRoot|worktree (?:root|path|identity)/i, 'canonical worktree identity'],
    [/creationOid|creation OID/i, 'creation OID'],
    [/effective-flow-created/, 'Effective Flow ownership'],
    [/branch(?: handling| policy| disposition)|branchPolicy/i, 'branch follow-up policy'],
    [/createdAt|created at/i, 'creation timestamp'],
    [/updatedAt|updated at/i, 'update timestamp'],
  ]);

  for (const status of [
    'active',
    'cleanup-ready',
    'aborted',
    'failed',
    'cleanup-failed',
    'cleanup-in-progress',
  ]) {
    assert.match(lifecycle, new RegExp(`\\b${status}\\b`), `missing ${status} status`);
  }

  assertClauses(lifecycle, [
    [/`active`[^\n]*(?:`cleanup-ready`|`aborted`|`failed`)/, 'active terminal transition'],
    [
      /`cleanup-(?:ready|failed)`[\s\S]{0,240}`cleanup-in-progress`/,
      'exclusive cleanup claim transition',
    ],
    [
      /`cleanup-in-progress`[\s\S]{0,300}(?:`cleanup-failed`|remove|delet)/i,
      'claim completion transition',
    ],
    [
      /(?:(?:never|no |must not)[\s\S]{0,180}(?:TTL|heartbeat|stale-after)|(?:TTL|heartbeat|stale-after)[\s\S]{0,180}(?:never|no |must not))/i,
      'no stale timeout',
    ],
  ]);
});

test('all lifecycle writers share a fail-closed lock and fresh claim protocol', () => {
  assertClauses(lifecycle, [
    [/per-record lock[\s\S]{0,220}Acquire it atomically/i, 'atomic per-record lock'],
    [
      /(?:under|while holding) the\s+lock[\s\S]{0,220}(?:fresh|re-read|read again)/i,
      'fresh locked read',
    ],
    [/cleanup claim, `cleanupRunId` and `claimedAt`/i, 'claim owner and timestamp'],
    [
      /(?:foreign|another|unknown|orphaned|stale)[^\n]*(?:lock|claim)[\s\S]{0,220}(?:must not|never|do not)[^\n]*(?:break|steal|overwrite|remove)/i,
      'foreign lock retention',
    ],
    [/writing a complete sibling temporary file and atomically renaming/i, 'atomic record write'],
  ]);
});

test('delivery, partial-diff, apply-review, and cleanup consume the same lifecycle contract', () => {
  const deliveryIncludes = collectIncludeNames(delivery);
  const applyReviewIncludes = collectIncludeNames(applyReview);
  const cleanupIncludes = collectIncludeNames(cleanup);

  assert.equal(
    deliveryIncludes.eager.has('worktree-lifecycle') ||
      deliveryIncludes.lazy.has('worktree-lifecycle'),
    true,
    'delivery must include the lifecycle contract',
  );
  assert.equal(
    applyReviewIncludes.eager.has('worktree-lifecycle') ||
      applyReviewIncludes.lazy.has('worktree-lifecycle'),
    true,
    'apply-review must include the lifecycle contract',
  );
  assert.equal(
    cleanupIncludes.eager.has('worktree-lifecycle') ||
      cleanupIncludes.lazy.has('worktree-lifecycle'),
    true,
    'cleanup must include the lifecycle contract',
  );

  assertClauses(delivery, [
    [/git worktree add[\s\S]{0,700}(?:lifecycle|worktree-runs)/i, 'delivery registration'],
    [/partial[- ]diff[\s\S]{0,500}(?:lifecycle|worktree-runs)/i, 'partial-diff registration'],
    [/(?:successful|secured|committed)[\s\S]{0,260}`cleanup-ready`/i, 'delivery ready transition'],
  ]);
  assertClauses(applyReview, [
    [/component[\s\S]{0,360}(?:lifecycle|worktree-runs)/i, 'component registration'],
    [/(?:cherry-pick|integrat)[\s\S]{0,420}`cleanup-ready`/i, 'component ready transition'],
    [/(?:abort|fail)[\s\S]{0,300}(?:`aborted`|`failed`)/i, 'component retention transition'],
  ]);
});

test('cleanup applies the complete conservative candidate and retention matrix', () => {
  const cleanupContract = `${cleanup}\n${lifecycle}`;
  assertClauses(cleanupContract, [
    [/git worktree list --porcelain -z/, 'NUL-delimited worktree inventory'],
    [/(?:first record|main worktree)[\s\S]{0,240}(?:exclude|not a candidate)/i, 'main exclusion'],
    [
      /(?:current|own)[^\n]*(?:execution|EXECUTION_ROOT)[\s\S]{0,300}(?:retain|never[^\n]*remove|not a candidate)/i,
      'current execution retention',
    ],
    [/effective-flow-created/, 'owned-origin predicate'],
    [/(?:cleanup-ready|cleanup-failed)/, 'eligible lifecycle statuses'],
    [/(?:receipt|execution-location)[\s\S]{0,300}(?:match|consistent|verify)/i, 'receipt match'],
    [/(?:clean|git status --porcelain)/i, 'clean checkout predicate'],
    [/locked/, 'locked retention'],
    [/prunable/, 'prunable retention'],
    [/(?:dirty|untracked|submodule)/i, 'dirty and submodule retention'],
    [/(?:harness-managed|user-managed|foreign)/i, 'external ownership retention'],
    [/(?:missing|without|no)[^\n]*(?:lifecycle|record)/i, 'recordless retention'],
    [
      /(?:branch|OID|common Git directory)[\s\S]{0,280}(?:mismatch|differ|match)/i,
      'identity mismatch retention',
    ],
    [/(?:unknown|unsupported)[^\n]*(?:schema|version)/i, 'unknown schema retention'],
    [
      /(?:lock|claim)[\s\S]{0,240}(?:foreign|another|owner|in progress)/i,
      'concurrent claim retention',
    ],
  ]);

  assertClauses(cleanupContract, [
    [/dry[- ]run/i, 'worktree dry run'],
    [/(?:explicit|express)[^\n]*confirm/i, 'explicit confirmation'],
    [/git worktree remove <(?:WORKTREE_PATH|path)>/i, 'targeted ordinary removal'],
    [/failed[\s\S]{0,320}`cleanup-failed`/i, 'failed removal persistence'],
    [
      /(?:continue|remaining|other)[^\n]*(?:candidate|worktree)/i,
      'independent candidate continuation',
    ],
    [/(?:partial cleanup|partially cleaned)/i, 'partial cleanup reconciliation'],
    [
      /(?:already absent|no longer registered)[\s\S]{0,320}(?:record|branch|claim)/i,
      'removed-worktree reconciliation',
    ],
  ]);
});

test('the final report is mandatory and accounts for every remaining linked worktree', () => {
  const cleanupContract = `${cleanup}\n${lifecycle}`;
  assertClauses(cleanupContract, [
    [/(?:mandatory worktree report|completion report is mandatory)/i, 'mandatory report'],
    [/no legacy remnant[\s\S]{0,180}completion reporting/i, 'report on migration no-op'],
    [/(?:removed worktrees|worktrees removed)/i, 'removed result group'],
    [/(?:failed removal|removal failures|cleanup-failed)/i, 'failed result group'],
    [/(?:remaining linked worktree|retained worktree)/i, 'remaining result group'],
    [/(?:checkout identity|branch or detached|branch\/OID)/i, 'checkout identity field'],
    [/(?:lifecycle|inspection) status/i, 'status field'],
    [/(?:retention reason|reason for retention|keep reason)/i, 'individual reason field'],
    [/(?:safe next step|next safe step|next action)/i, 'safe next step field'],
    [
      /(?:no linked worktrees remain|none remain|no remaining linked worktrees)/i,
      'empty result message',
    ],
    [
      /current cleanup execution worktree[\s\S]{0,100}cleanup is running in this worktree/i,
      'current execution explanation',
    ],
  ]);
});

test('dangerous broad or forced Git cleanup commands are explicitly prohibited', () => {
  const relevant = `${lifecycle}\n${cleanup}`;
  assertDangerousCommandIsOnlyMentionedAsProhibited(
    relevant,
    /git worktree remove[\s\S]{0,140}--force/g,
    'forced worktree removal',
  );
  assertDangerousCommandIsOnlyMentionedAsProhibited(
    relevant,
    /git worktree prune/g,
    'broad worktree prune',
  );
  assertDangerousCommandIsOnlyMentionedAsProhibited(
    relevant,
    /git branch -D/g,
    'forced branch deletion',
  );
  assert.match(relevant, /git branch -d <(?:BRANCH_NAME|branch)>/i);
});

test('the lifecycle contract survives every harness render', () => {
  const eagerResolved = resolveEagerIncludes(lifecycle, {
    context: 'shared/worktree-lifecycle.md',
    readFragment: readShared,
  });
  const { body: resolved } = resolveLazyIncludes(eagerResolved, {
    context: 'shared/worktree-lifecycle.md',
  });

  for (const harness of ['claude', 'codex', 'portable']) {
    const rendered = renderBody(`${resolved.trim()}\n`, harness, {
      ...renderConfig,
      context: `shared/worktree-lifecycle.md (${harness})`,
    });
    for (const status of ['active', 'cleanup-ready', 'cleanup-in-progress', 'cleanup-failed']) {
      assert.match(rendered, new RegExp(`\\b${status}\\b`), `${status} in ${harness}`);
    }
    assert.match(rendered, /RUNTIME_STATE_ROOT/);
    assert.doesNotMatch(rendered, /\{\{(?:SKILL|AGENT):/);
    assert.doesNotMatch(rendered, /```(?:lazy-)?include/);
  }
});

test('deliver owns only its partial-diff lifecycle and retains artifacts on incomplete delivery', () => {
  const deliverTool = extractBody(readSource('tools', 'deliver.md'));

  assert.match(deliverTool, /```include\nworktree-lifecycle\n```/);
  assertClauses(deliverTool, [
    [/purpose `partial-diff`[\s\S]{0,240}lifecycle record as `active`/i, 'active registration'],
    [
      /If delegation, a hook, tree comparison, receipt validation, or residual comparison fails[\s\S]{0,360}preserve\s+the worktree, branch, verified earlier commits, and remaining\s+uncommitted groups/i,
      'later-group failure retention',
    ],
    [
      /After every group is a verified commit[\s\S]{0,320}transition only the run-owned lifecycle record through `cleanup-ready` and\s+`cleanup-in-progress`/i,
      'commit-gated cleanup transition',
    ],
    [/remove only its verified clean worktree without force/i, 'ordinary owned cleanup'],
    [/A PR failure retains the committed branch/i, 'PR failure branch retention'],
  ]);

  assert.doesNotMatch(
    deliverTool,
    /remove[^\n]*harness-managed source checkout/i,
    'deliver must never remove the harness-owned source checkout',
  );
});

// --- Worktree-record obligation guard (#380) ---
//
// The host set is derived, never listed: every tool whose include graph reaches
// `worktree-integration` (eager or lazy, directly or through shared fragments)
// can create a worktree and must therefore carry the eager obligation fragment.

const OBLIGATION = 'worktree-record-obligation';
const OBLIGATION_SENTENCE =
  'Every worktree this run created must end with its record deleted and the worktree unregistered, or with its record in cleanup-ready, aborted, failed or cleanup-failed; anything else is reported.';
const OBLIGATION_TRIGGER = 'Run the worktree-record exit self-check.';
const flatten = (text) => text.replace(/\s+/g, ' ');

function includeGraphReaches(body, target, seen = new Set()) {
  const { eager, lazy } = collectIncludeNames(body);
  for (const name of [...eager, ...lazy]) {
    if (name === target) return true;
    if (seen.has(name)) continue;
    seen.add(name);
    if (includeGraphReaches(readShared(name), target, seen)) return true;
  }
  return false;
}

const toolBody = (name) => extractBody(readSource('tools', `${name}.md`));
const obligationHosts = [...toolNames]
  .sort()
  .filter((name) => includeGraphReaches(toolBody(name), 'worktree-integration'));

test('every tool that can reach worktree-integration eagerly carries the record obligation', () => {
  assert.ok(obligationHosts.length > 0, 'derived obligation host set must not be empty');
  assert.ok(
    obligationHosts.includes('merge-gate'),
    `derived obligation host set must contain merge-gate, got: ${obligationHosts.join(', ')}`,
  );

  for (const name of obligationHosts) {
    const body = toolBody(name);
    const eagerObligations = [...body.matchAll(EAGER_INCLUDE_RE)].filter(
      (match) => match[1].trim() === OBLIGATION,
    );
    assert.equal(
      eagerObligations.length,
      1,
      `${name} must eagerly include ${OBLIGATION} exactly once (column-0 include fence)`,
    );

    const runtimeSafety = [...body.matchAll(LAZY_INCLUDE_RE)].find(
      (match) => match[1].trim() === 'runtime-state-safety',
    );
    assert.ok(runtimeSafety, `${name} must lazily include runtime-state-safety`);
    assert.ok(
      eagerObligations[0].index > runtimeSafety.index,
      `${name} must include ${OBLIGATION} after its lazy runtime-state-safety include`,
    );
  }
});

test('the record obligation fragment pins the allowed exit states and its own limits', () => {
  const fragment = readShared(OBLIGATION);
  const flat = flatten(fragment);
  const { eager, lazy } = collectIncludeNames(fragment);

  assert.equal(eager.size + lazy.size, 0, `${OBLIGATION} must carry no include fence`);
  assert.doesNotMatch(fragment, /```(?:lazy-)?include/);
  assert.match(fragment, /\.effective-flow\/worktree-runs\//);
  assert.match(
    flat,
    /reading the deferred `worktree-integration` fragment is mandatory, not a judgement call/,
    'missing mandatory-load statement',
  );

  assert.ok(flat.includes(OBLIGATION_SENTENCE), 'fixed self-check sentence changed or missing');
  assert.doesNotMatch(OBLIGATION_SENTENCE, /\{\{/);

  const parsed = OBLIGATION_SENTENCE.match(
    /end with its (record deleted and the worktree unregistered), or with its record in ([^;]+);/,
  );
  assert.ok(parsed, 'fixed sentence must list the allowed end states');
  const allowed = new Set([
    'deleted and unregistered',
    ...parsed[2].split(/,\s*|\s+or\s+/).map((state) => state.trim()),
  ]);
  assert.deepEqual(
    [...allowed].sort(),
    ['aborted', 'cleanup-failed', 'cleanup-ready', 'deleted and unregistered', 'failed'].sort(),
  );
  assert.equal(allowed.has('cleanup-in-progress'), false);
  assert.match(flat, /Report a `cleanup-in-progress` record\./);

  assert.match(flat, /never removes or claims/);
  assert.match(flat, /never creates or backfills/);
});

test('the record obligation survives every harness render of every host tool', () => {
  for (const name of obligationHosts) {
    const context = `tools/${name}.md`;
    const eagerResolved = resolveEagerIncludes(toolBody(name), {
      context,
      readFragment: readShared,
    });
    const { body: resolved } = resolveLazyIncludes(eagerResolved, { context });

    const sentences = new Set();
    for (const harness of ['claude', 'codex', 'portable']) {
      const rendered = flatten(
        renderBody(resolved, harness, { ...renderConfig, context: `${context} (${harness})` }),
      );
      const where = `${name} (${harness})`;
      assert.ok(rendered.includes('.effective-flow/worktree-runs/'), `record path in ${where}`);
      assert.ok(rendered.includes(OBLIGATION_SENTENCE), `fixed sentence in ${where}`);
      assert.ok(rendered.includes(OBLIGATION_TRIGGER), `self-check trigger in ${where}`);
      sentences.add(
        rendered.match(/Every worktree this run created must end with [^;]+;[^.]+\./)[0],
      );
    }
    assert.equal(sentences.size, 1, `${name} renders a different fixed sentence per harness`);
  }
});
