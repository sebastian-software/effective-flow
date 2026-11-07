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
import { AGENT_PROFILE_MAPPINGS, FAST_PROFILE_AGENTS } from './support/native-profile-config.mjs';
import { LEDGER_MAX_BYTES, OPERATION_KEYS } from '../src/scripts/effective-flow-state-core.mjs';
import {
  LEDGER_COMMIT_KEYS,
  LEDGER_ENDPOINT_KEYS,
  LEDGER_KEYS,
  LEDGER_SUFFIX,
  LEDGERS_DIR,
} from '../src/scripts/effective-flow-state-ledger-core.mjs';
import {
  RESUME_OPERATION_PROOFS,
  RESUME_PROOFS,
} from '../src/scripts/effective-flow-state-recovery-core.mjs';
import { spliceDelegatedRun } from './support/merge-gate-source.mjs';

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
// `build` Phase 2 carries Fast-profile tokens, so rendering it needs the native profile mapping and
// the Fast-capable implementers, both derived from build.mjs by the shared test support module.
const renderConfig = {
  exposedTools: [...toolNames],
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: toolNames,
  knownAgents: agentNames,
  profileMappings: AGENT_PROFILE_MAPPINGS,
  fastProfileAgents: FAST_PROFILE_AGENTS,
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

// Invariant: every lifecycle writer goes through the runtime-state helper, which takes the
// per-record lock, re-reads fresh evidence under it and writes atomically; prose never writes a
// record or its lock, never breaks a foreign lock or claim, and names the claim owner fields.
test('all lifecycle writers share a fail-closed lock and fresh claim protocol', () => {
  const flat = lifecycle.replace(/\s+/g, ' ');
  assertClauses(flat, [
    [/per-record lock `<RECORD_ID>\.lock`/, 'per-record lock'],
    [
      /Only the runtime-state helper operations below create, change, claim or delete a record or take its lock; never write, rename or delete either in prose/,
      'helper-only record and lock writes',
    ],
    [
      /applies “Runtime-state write safety” to every record and lock handle itself, fail-closed/,
      'guarded handles',
    ],
    [/from fresh evidence under the record lock/i, 'fresh locked read'],
    [/cleanup claim, `cleanupRunId` and `claimedAt`/i, 'claim owner and timestamp'],
    [
      /(?:foreign|another|unknown|orphaned|stale)[^\n]*(?:lock|claim)[\s\S]{0,220}(?:must not|never|do not)[^\n]*(?:break|steal|overwrite|remove)/i,
      'foreign lock retention',
    ],
  ]);
  for (const operation of ['record-init', 'transition', 'inspect', 'remove']) {
    assert.match(
      lifecycle,
      new RegExp(
        `node <skill-root>/scripts/effective-flow-state\\.mjs worktree ${operation} <<< '\\{"cwd":"<RUNTIME_STATE_ROOT>"`,
      ),
      `literal worktree ${operation} call`,
    );
  }
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

// Invariant: prose never forces a worktree removal, prunes, or force-deletes a branch; the only
// non-`-d` branch deletion is the helper's compare-and-delete inside `apply-review` after its
// exact patch-id proof against the integration root, which `cleanup apply` never receives.
test('dangerous broad or forced Git cleanup commands are explicitly prohibited', () => {
  const relevant = `${lifecycle}\n${cleanup}\n${applyReview}`;
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

  const flatLifecycle = lifecycle.replace(/\s+/g, ' ');
  assert.match(
    flatLifecycle,
    /only an `apply-review` call carrying `integrationRoot` lets the helper prove every component commit by exact patch-id/,
  );
  assert.match(flatLifecycle, /a forced deletion outside that proof never happens/);
  const flatApplyReview = applyReview.replace(/\s+/g, ' ');
  assert.match(flatApplyReview, /"integrationRoot":"<ORIGINAL_ROOT>"/);
  assert.match(flatApplyReview, /That in-run proof is the only forced branch deletion/);
  assert.doesNotMatch(cleanup, /integrationRoot/, 'cleanup apply never carries the proof target');
  assert.match(
    cleanup.replace(/\s+/g, ' '),
    /cleanup keeps it and reports it as `BRANCH_RETAINED`/,
  );
});

// Invariant: no failed or partial `worktree remove` leaves completed work `active`, because
// cleanup collects only `cleanup-ready` and `cleanup-failed`: the lifecycle contract owns one
// denial fallback to the allowlisted `worktree transition` `active` → `cleanup-ready` with a null
// reason, triggered by any not-ok item or whole-call failure (after the one SANDBOX_DENIED rerun,
// which resends only the denied records), and every host that withdraws through `worktree remove`
// applies it.
test('every delivering host carries the worktree remove denial fallback', () => {
  const flatLifecycle = lifecycle.replace(/\s+/g, ' ');
  const fallback = flatLifecycle.match(/\*\*Denial fallback\.\*\*[^*]*/)?.[0];
  assert.ok(fallback, 'lifecycle contract owns the denial fallback paragraph');
  assert.match(fallback, /returns any item that is not `ok`[\s\S]*or fails as a whole call/);
  assert.match(fallback, /after the one `SANDBOX_DENIED` rerun/);
  assert.match(fallback, /`worktree transition` `active` → `cleanup-ready` with `"reason":null`/);
  assert.match(fallback, /collects only `cleanup-ready` and `cleanup-failed`/);
  assert.match(flatLifecycle, /listing only the denied `recordIds`/);
  for (const [name, text] of [
    ['shared/worktree-integration.md', delivery],
    ['tools/deliver.md', extractBody(readSource('tools', 'deliver.md'))],
    ['tools/apply-review-commit-mechanics.md', applyReview],
    ['tools/apply-issues.md', extractBody(readSource('tools', 'apply-issues.md'))],
    ['shared/plan-publication.md', readShared('plan-publication')],
    ['shared/merge-gate-checkout-boundary.md', readShared('merge-gate-checkout-boundary')],
    ['tools/iterate.md', extractBody(readSource('tools', 'iterate.md'))],
  ]) {
    const flat = text.replace(/\s+/g, ' ');
    assert.match(
      flat,
      /`worktree remove`|worktree remove <<</,
      `${name} withdraws through worktree remove`,
    );
    assert.match(flat, /denial fallback/, `${name} names the denial fallback`);
  }
});

// Invariant: a branch the helper kept (`BRANCH_RETAINED`) has no record left pointing at it, so
// every final report that can meet one names it with its unproven commits.
test('final reports name every BRANCH_RETAINED branch', () => {
  const flat = (text) => text.replace(/\s+/g, ' ');
  assert.match(
    flat(lifecycle),
    /A final report names every retained worktree and every `BRANCH_RETAINED` branch/,
  );
  assert.match(flat(lifecycle), /report `branch\.branch`, `branch\.reason` and `branch\.unproven`/);
  assert.match(
    flat(applyReview),
    /name every `BRANCH_RETAINED` branch with its unproven commits in the summary/,
  );
  assert.match(flat(cleanup), /every `BRANCH_RETAINED` branch with its unproven commits/);
});

// Invariant: lifecycle statuses and the runtime root survive every render with no unresolved directive.
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
      /After every group is a verified commit[\s\S]{0,320}Withdraw only the run-owned worktree with one `worktree remove` call/i,
      'commit-gated cleanup transition',
    ],
    [/removes only the verified clean worktree without force/i, 'ordinary owned cleanup'],
    [
      /any not-`ok` item or failed call takes the lifecycle denial fallback to `cleanup-ready`/,
      'denial fallback',
    ],
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
// can create a worktree. Its execution owner must therefore eagerly carry the
// obligation; the thin build caller selects the same runner fragment for its
// delegated and inline paths.

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

test('every worktree execution owner eagerly carries the record obligation', () => {
  assert.ok(obligationHosts.length > 0, 'derived obligation host set must not be empty');
  assert.ok(
    obligationHosts.includes('merge-gate'),
    `derived obligation host set must contain merge-gate, got: ${obligationHosts.join(', ')}`,
  );

  for (const name of obligationHosts) {
    let body = toolBody(name);
    if (name === 'build') {
      const runnerIncludes = [...body.matchAll(LAZY_INCLUDE_RE)].filter(
        (match) => match[1].trim() === 'build-delegated-run',
      );
      assert.equal(runnerIncludes.length, 1, 'build selects exactly one complete execution owner');
      assert.match(body, /read\/follow `build-delegated-run` in this caller/);
      body = readShared('build-delegated-run');
    }
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

// Invariant: the obligation allows only the fixed exit states and never removes, claims, or backfills.
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

// Invariant: every run that can create a worktree reads the record path, the fixed sentence and the
// self-check trigger. Delegated workflow callers read their complete execution owner before
// creating a worktree, so their render is checked over both documents. The test above separately
// pins the eager obligation to the owner and the build caller to its single owner pointer.
const renderedHostBody = (name) =>
  name === 'merge-gate'
    ? spliceDelegatedRun(toolBody(name), readShared('merge-gate-delegated-run'), `tools/${name}.md`)
    : name === 'build'
      ? toolBody(name).replace(LAZY_INCLUDE_RE, (match, fragment) =>
          fragment.trim() === 'build-delegated-run' ? readShared(fragment.trim()) : match,
        )
      : toolBody(name);

test('the record obligation survives every harness render of every host tool', () => {
  for (const name of obligationHosts) {
    const context = `tools/${name}.md`;
    const eagerResolved = resolveEagerIncludes(renderedHostBody(name), {
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

// Invariant: a call made after the run's own worktree was withdrawn cannot name that deleted path
// as `executionRoot`, so `worktree inspect`, the exit self-check and every later call pass
// `RUNTIME_STATE_ROOT`.
test('post-withdrawal lifecycle calls use the runtime root as executionRoot', () => {
  const flatLifecycle = lifecycle.replace(/\s+/g, ' ');
  assert.match(
    flatLifecycle,
    /`RUNTIME_STATE_ROOT` for `worktree inspect`, the exit self-check and every call after the run's own worktree was withdrawn/,
  );
  assert.match(
    lifecycle,
    /worktree inspect <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>"/,
  );
  assert.match(
    readShared('worktree-record-obligation').replace(/\s+/g, ' '),
    /Every self-check call passes `"executionRoot":"<RUNTIME_STATE_ROOT>"`/,
  );
  assert.match(
    delivery.replace(/\s+/g, ' '),
    /call `worktree remove` once, with `cwd` and `executionRoot` = `RUNTIME_STATE_ROOT` in the literal shape/,
  );
  assert.doesNotMatch(delivery, /cd <RUNTIME_STATE_ROOT> &&/);
});

// Invariant: the helper's purpose table derives `REPO_NAME` from `cwd` (the main checkout), so
// prose must name the same directory; `git rev-parse --show-toplevel` in a linked or harness
// checkout would name a path the helper refuses.
test('REPO_NAME is the basename of RUNTIME_STATE_ROOT at every worktree path derivation', () => {
  const flat = (text) => text.replace(/\s+/g, ' ');
  assert.match(flat(delivery), /`REPO_NAME` is the basename of the verified `RUNTIME_STATE_ROOT`/);
  assert.match(
    flat(applyReview),
    /`REPO_NAME` is the basename of the verified `RUNTIME_STATE_ROOT`/,
  );
  assert.match(
    flat(readShared('plan-publication')),
    /`REPO_NAME` \(the basename of `RUNTIME_STATE_ROOT`/,
  );
  assert.match(
    flat(readShared('plan-pr-continuation')),
    /`REPO_NAME` the basename of `RUNTIME_STATE_ROOT`/,
  );
  for (const text of [delivery, applyReview]) {
    assert.doesNotMatch(text, /basename "\$\(git rev-parse --show-toplevel\)"/);
  }
});

// Invariant: the purpose table admits one `delivery` worktree per session path, so parallel issue
// worktrees need a distinct per-issue sessionId that every later call for that record reuses.
test('apply-issues gives each issue worktree its own sessionId and path', () => {
  const flat = extractBody(readSource('tools', 'apply-issues.md')).replace(/\s+/g, ' ');
  assert.match(
    flat,
    /`sessionId` `<SESSION_ID>-issue-<n>` \(`<n>` the issue number\), path `BASE_DIR\/REPO_NAME\/<SESSION_ID>-issue-<n>` and purpose `delivery`/,
  );
  assert.match(
    flat,
    /its record, transitions, withdrawal and the exit self-check use that `sessionId`/,
  );
});

// Invariant: cleanup never deletes a legacy directory with an open carry-over entry, so every
// entry a copy cannot close is presented for an explicit discard, a legacy marker is disclosed
// before the carry-over question, and a live legacy configuration is routed to setup.
test('cleanup closes or surfaces every open carry-over entry before the final plan', () => {
  const flat = cleanup.replace(/\s+/g, ' ');
  assert.match(
    flat,
    /Before the Carry over question, tell the user about every item with `legacyMarker: true`/,
  );
  assert.match(
    flat,
    /After the copies, call `cleanup plan` with the decisions so far and present every entry still in `carryOver\.open`/,
  );
  assert.match(flat, /A differing or non-regular entry can only be discarded, never copied/);
  assert.match(
    flat,
    /Reason `live-configuration` \(`NOT_ELIGIBLE` on the `config:` item, an open carry-over entry inside a legacy directory\)[\s\S]*no decision, `discarded` included, unblocks it; the next step is `\{\{SKILL:setup\}\}`/,
  );
  assert.match(flat, /After `git rm` of tracked remnants, rerun cleanup/);
});

// Invariant: `cleanup plan` and `cleanup apply` guard the runtime root themselves; prose loads the
// runtime-state guard only for its own carry-over copies, migration and baseline discard.
test('cleanup applies the prose runtime-state guard only to prose mutations', () => {
  assert.doesNotMatch(cleanup, /Before reading lifecycle state, load and apply/);
  const trigger = cleanup
    .split('\n')
    .find((line, index, lines) => lines[index - 1] === 'runtime-state-safety');
  assert.ok(trigger, 'cleanup keeps a runtime-state-safety trigger');
  assert.doesNotMatch(trigger, /lifecycle/);
  assert.match(trigger, /stale diff baseline/);
  assert.match(trigger, /carry-over copy/);
});

// Invariant: every helper outcome a host can receive has a handling row, so none is improvised.
test('the lifecycle and cleanup outcome tables cover every helper code', () => {
  const flatLifecycle = lifecycle.replace(/\s+/g, ' ');
  for (const code of [
    'RECORD_NOT_FOUND',
    'INVALID_STATE',
    'UNSAFE_TARGET',
    'WRITE_FAILED',
    'GIT_FAILED',
    'PREVIEW_MISMATCH',
    'SANDBOX_DENIED',
    'DEADLINE_REACHED',
    'INTERRUPTED',
    'REMOVE_FAILED',
    'BRANCH_RETAINED',
  ]) {
    assert.match(flatLifecycle, new RegExp(`\`${code}\``), `lifecycle outcome table names ${code}`);
  }
  assert.match(flatLifecycle, /orphan record lock/);
  const flatCleanup = cleanup.replace(/\s+/g, ' ');
  assert.match(flatCleanup, /no longer actionable \(`not-actionable`\)/);
  assert.match(flatCleanup, /orphan record lock/);
});

// Invariant: record locks are helper-owned, so no prose instructs a host to take, hold or release
// one, and no lazy trigger fires on a helper-owned record or lock write.
test('no prose owns a lifecycle record lock', () => {
  assert.doesNotMatch(readShared('build-run-contract'), /Release the lifecycle lock/);
  assert.doesNotMatch(readShared('merge-gate-delegated-run'), /lifecycle\s+record handle/);
  for (const line of readShared('plan-publication').split('\n')) {
    if (line.startsWith('when:')) assert.doesNotMatch(line, /record lock|lifecycle record/);
  }
});

// --- Partial-diff recovery (#626) ---

const recovery = readShared('worktree-partial-diff-recovery');
const flatRecovery = recovery.replace(/\s+/g, ' ');

// Invariant: the state machine lists exactly two ways out of `aborted` or `failed`, each selected by
// its explicit discriminator: the adoption (`plan-pr-continuation` or `partial-diff-resume`) and
// the partial-diff release to `cleanup-ready`.
test('the state machine names the resume adoption and the partial-diff release', () => {
  const rows = lifecycle.split('\n').filter((line) => line.startsWith('| `aborted` or `failed`'));
  assert.equal(rows.length, 2, 'aborted or failed has exactly the adoption and the release row');
  assert.match(
    rows[0],
    /`active` \(adoption\)[^\n]*`adoption` `plan-pr-continuation` or `partial-diff-resume`/,
    'the adoption row names both adoption modes',
  );
  assert.match(
    rows[1],
    /`cleanup-ready` \(release\)[^\n]*`release: "partial-diff"`/,
    'the release row names its discriminator',
  );
  assert.doesNotMatch(
    lifecycle,
    /`plan-pr-continuation` only/,
    'adoption is no longer plan-PR only',
  );
});

// Invariant: the recovery contract is the deferred half of `worktree-lifecycle`: never eager
// anywhere, loaded only through the lifecycle contract, at a trigger naming every operation and
// discriminator it owns, so hosts that never recover a partial-diff delivery do not pay for it.
test('worktree-lifecycle defers the partial-diff recovery contract and names what it owns', () => {
  const sources = [
    ...[...toolNames].map((name) => readSource('tools', `${name}.md`)),
    ...readdirSync(join(SOURCE_DIR, 'shared'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => readSource('shared', name)),
  ];
  const loaders = sources.filter((text) =>
    collectIncludeNames(text).lazy.has('worktree-partial-diff-recovery'),
  );
  assert.deepEqual(loaders, [lifecycle], 'only worktree-lifecycle loads the recovery contract');
  assert.ok(
    sources.every((text) => !collectIncludeNames(text).eager.has('worktree-partial-diff-recovery')),
    'the recovery contract is never included eagerly',
  );
  const trigger = [...lifecycle.matchAll(LAZY_INCLUDE_RE)].find(
    (match) => match[1].trim() === 'worktree-partial-diff-recovery',
  )?.[2];
  for (const owned of [
    '`ledger init`',
    '`ledger append`',
    '`ledger reconcile`',
    '`worktree resume-check`',
    '`adoption`',
    '`visibility`',
    '`release`',
  ]) {
    assert.ok(trigger?.includes(owned), `the recovery pointer names ${owned}`);
  }
});

// Invariant: a released partial-diff record whose worktree vanished completely can still be
// removed (only the conditions that need the worktree are waived), while a half-gone worktree
// keeps every condition, so cleanup never prunes.
test('a released partial-diff record with a fully gone worktree stays removable', () => {
  const flat = lifecycle.replace(/\s+/g, ' ');
  const from = flat.indexOf('A released `partial-diff` record');
  assert.notEqual(from, -1, 'the gone-removal exception is stated');
  const rule = flat.slice(from, flat.indexOf('###', from));
  for (const token of [
    '`cleanup-ready` or `cleanup-failed`',
    'fully gone, unregistered and its path absent',
    'without conditions 3, 4, 5 and 7 and the toplevel part of 2',
    'no Git call runs in the vanished path',
    'A half-gone worktree keeps every condition',
  ]) {
    assert.ok(rule.includes(token), `the gone-removal exception states: ${token}`);
  }
});

// Invariant: the ledger never outlives its record unnoticed: removal deletes it first under the
// same lock or claim, and `inspect` reports one without a record but never deletes it.
test('the ledger is deleted before its record and an orphan ledger is only reported', () => {
  const flat = lifecycle.replace(/\s+/g, ' ');
  assert.match(
    flat,
    /deletes the record, its ledger first/,
    'worktree remove deletes the ledger first',
  );
  assert.match(
    flat,
    /ledgers without a record \(`orphanLedgers`\)/,
    'inspect lists orphan ledgers',
  );
  assert.match(flat, /a ledger with no record: report it; never break or delete it/);
  assert.match(
    flatRecovery,
    /`worktree remove` and `cleanup apply` delete it under the same lock or claim immediately before its record\. `worktree inspect` lists a ledger without a record in `orphanLedgers` and never deletes it/,
  );
});

// Invariant: the ledger contract states its location outside every record and lock scan, every
// key the helper writes at every level, its content-free bound with the helper's own byte limit,
// and what `ledger init` trusts from its caller.
test('the delivery ledger contract states its location, exact schema, bound and trust assumption', () => {
  assert.ok(
    recovery.includes(
      `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/${LEDGERS_DIR}/<RECORD_ID>${LEDGER_SUFFIX}`,
    ),
    'the ledger location matches the helper',
  );
  assert.match(
    flatRecovery,
    /keep it out of every scan for `\*\.json` records and `\*\.lock` locks/,
  );
  for (const key of [...LEDGER_KEYS, ...LEDGER_ENDPOINT_KEYS, ...LEDGER_COMMIT_KEYS]) {
    assert.match(recovery, new RegExp(`\\b${key}\\b`), `the ledger schema names ${key}`);
  }
  assert.match(flatRecovery, /exactly these keys at every level/);
  assert.match(flatRecovery, /holds no file content, credential or session token/);
  assert.equal(LEDGER_MAX_BYTES, 256 * 1024);
  assert.match(
    flatRecovery,
    /Its bound is 256 KiB \(`LEDGER_MAX_BYTES`\), checked once by `ledger init` against the worst case/,
    'the stated bound is the helper limit, checked against the worst case',
  );
  assert.match(
    flatRecovery,
    /The manifest is accepted only when the helper's own reconcile of it against the delivery worktree and the source is exact; the visibility is the caller's assertion\. Descriptors and digests are never caller input/,
    'the trust assumption of ledger init is explicit',
  );
});

// Invariant: every stable proof identifier the resume and release can report is named in the
// contract, so a refusal is never improvised, and the interrupted shapes are documented.
test('the recovery contract names every resume and release proof and the interrupted shapes', () => {
  for (const proof of [...RESUME_PROOFS, ...RESUME_OPERATION_PROOFS]) {
    const name = /^condition-[2-6]$/.test(proof)
      ? /`condition-2` … `condition-6`/
      : new RegExp(`\`${proof}\``);
    assert.match(recovery, name, `the recovery contract names the proof ${proof}`);
  }
  for (const route of ['gone', 'clean', 'ledger', 'no-ledger', 'half-gone']) {
    assert.match(recovery, new RegExp(`\`(?:route: ")?${route}"?\``), `release route ${route}`);
  }
  assert.match(
    flatRecovery,
    /`INTERRUPTED` after the resume's recovered-tip append and before its record write carries `written: false`, `ledgerAppended: true` and `appendedOid`/,
  );
  assert.match(
    flatRecovery,
    /an entry whose record write then fails is the ledger's own commit on the next resume/,
  );
});

// Invariant: every call line the recovery contract shows passes only keys the helper accepts for
// that operation, and every key the ledger operations and `resume-check` take.
test('the recovery call lines use exactly the helper operation keys', () => {
  const nested = new Set(['branch', 'oid', 'git', 'forge']);
  const calls = [
    ...recovery.matchAll(
      /^node <skill-root>\/scripts\/effective-flow-state\.mjs ([a-z]+ [a-z-]+) <<< '(.*)'$/gm,
    ),
  ];
  const operations = calls.map((match) => match[1]);
  for (const operation of [
    'ledger init',
    'ledger append',
    'ledger reconcile',
    'worktree resume-check',
  ]) {
    assert.ok(operations.includes(operation), `the recovery contract shows ${operation}`);
  }
  assert.equal(operations.filter((operation) => operation === 'worktree transition').length, 2);
  for (const [, operation, json] of calls) {
    const keys = [...json.matchAll(/"([A-Za-z]+)":/g)].map((match) => match[1]);
    const accepted = new Set([...OPERATION_KEYS[operation], ...nested]);
    for (const key of keys) assert.ok(accepted.has(key), `${operation} accepts ${key}`);
    if (operation !== 'worktree transition') {
      for (const key of OPERATION_KEYS[operation]) {
        assert.ok(keys.includes(key), `${operation} shows ${key}`);
      }
    }
  }
  assert.match(recovery, /"adoption":"partial-diff-resume","visibility":"<visible\|hidden>"/);
  assert.match(recovery, /"to":"cleanup-ready","reason":null,[^']*"release":"partial-diff"/);
});

// Invariant: the helper's visibility vocabulary differs from the resolved configuration's, so the
// recovery contract states the mapping once; and `resume-check` names exactly the paths an eligible
// ledger release discards, so the caller never derives them from its own `git status`.
test('the recovery contract maps the visibility and names the paths a ledger release discards', () => {
  for (const token of [
    'Every `visibility` input is `visible` or `hidden`',
    '`config-resolve` `standard` or `hidden`',
    'with `standard` as `visible`',
  ]) {
    assert.ok(flatRecovery.includes(token), `the visibility mapping states: ${token}`);
  }
  assert.match(
    flatRecovery,
    /`releasePaths` and `releasePathCount` \(for an eligible `ledger` route the bounded dirty residual paths a release discards/,
  );
});

// Invariant: only `deliver` writes a ledger, so the implementation handback's partial-diff worktree
// is never resumed and plan-PR continuation never adopts a partial-diff record; release stays open.
test('worktree-integration keeps partial-diff resume to deliver and plan-PR adoption to delivery', () => {
  const flat = delivery.replace(/\s+/g, ' ');
  const from = flat.indexOf('Only `{{SKILL:deliver}}` writes a delivery ledger');
  assert.notEqual(from, -1, 'the partial-diff resume scope is stated');
  const scope = flat.slice(from, flat.indexOf('###', from));
  for (const token of [
    'only its retained `partial-diff` records can be resumed',
    "this handback's failed worktree never is",
    '`plan-pr-continuation` adopts only purpose `delivery`',
    'release proofs of the partial-diff recovery contract',
  ]) {
    assert.ok(scope.includes(token), `worktree-integration states: ${token}`);
  }
});

// Invariant: cleanup's next step for a retained partial-diff record is the deliver resume or release
// route, the only supported way to make such a record removable.
test('cleanup routes a retained partial-diff record to the deliver release route', () => {
  const flat = cleanup.replace(/\s+/g, ' ');
  const from = flat.indexOf('- `aborted` or `failed`:');
  assert.notEqual(from, -1, 'cleanup names the aborted or failed retention reason');
  const hint = flat.slice(from, flat.indexOf(' - ', from + 2));
  for (const token of [
    'For a `partial-diff` record',
    '`{{SKILL:deliver}}` in its source checkout',
    'resume it or release it for cleanup',
    'also when its worktree is fully gone',
  ]) {
    assert.ok(hint.includes(token), `the cleanup hint states: ${token}`);
  }
});
