import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { extractFrontmatter } from '../build-lib.mjs';
import { ISSUE_BUDDY_OPERATIONS, SKIP_REASONS } from '../src/scripts/issue-buddy-core.mjs';

const source = readFileSync(new URL('../src/tools/issue-buddy.md', import.meta.url), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const prose = flat(source);

function ordered(...fragments) {
  let position = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, position + 1);
    assert.notEqual(next, -1, `missing ordered contract fragment: ${fragment}`);
    assert.ok(next > position, `contract fragment is out of order: ${fragment}`);
    position = next;
  }
}

test('Issue Buddy is registered with a bounded, quoted catalog contract', () => {
  const frontmatter = extractFrontmatter(source);
  assert.match(frontmatter, /description: "Runs one bounded, unattended Issue Buddy pass/);
  assert.match(
    frontmatter,
    /catalogHint: "Checks trusted issues and optionally publishes draft plans\."/,
  );
  assert.match(
    source,
    /Accept only `\{\{SKILL:issue-buddy\}\} \[--publish\] \[--max-judgments <n>\] \[--max-plans <n>\]`./,
  );
  assert.match(
    prose,
    /Reject zero, signs, leading zeroes, fractions, exponents, unsafe integers, duplicate flags/,
  );
  assert.match(prose, /before any write/);
});

test('Issue Buddy keeps the primary-root preflight order and no-worktree publication path', () => {
  ordered(
    'Configuration and root.',
    'Hidden mode.',
    'Tracker.',
    'GitHub origin.',
    'Runtime safety.',
    'Migration.',
    'Whole-pass lock.',
    'Repository visibility.',
    'Publishing rows and tree.',
    'Subagent capability.',
    'Phase 1: Earlier leftovers',
  );
  assert.match(source, /first `git worktree list --porcelain` record/);
  assert.doesNotMatch(source, /git worktree add|worktree-integration/);
  assert.match(prose, /invocation root = primary root = returned `data\.runtimeStateRoot`/);
  assert.match(prose, /Do not evaluate `delivery\.completion`/);
});

test('Issue Buddy uses the actual helper operation set and exact phase payload shapes', () => {
  for (const operation of ISSUE_BUDDY_OPERATIONS) {
    assert.match(source, new RegExp(`\\b${operation}\\b`), `missing helper operation ${operation}`);
  }
  assert.equal(SKIP_REASONS.length, 11);
  assert.match(prose, /preserve its eleven skip reasons/);
  assert.match(
    prose,
    /pass-collect` with exactly `\{cwd, passId, mode, baseBranch, planDir, branchPrefix, visibility: "standard", limits, repositoryVisibility, leftoverPlanFiles\}`/,
  );
  assert.match(prose, /pass-report` with/);
  for (const field of [
    'reportVersion: 2',
    'outcome',
    'cutOff',
    'verdicts',
    'pullRequestsOpened',
    'pullRequestsRecovered',
    'failures',
    'repositoryVisibility',
    'leftoverPlanFiles',
  ]) {
    assert.match(prose, new RegExp(field), `pass-report is missing ${field}`);
  }
  assert.match(prose, /No stale-attempt evidence is inferred from a file/);
  assert.match(prose, /Never read\/write cache, `pass\.lock`, journal or trusted JSON directly/);
});

test('Issue Buddy binds leftovers, readiness, nested planning and report state', () => {
  ordered(
    'Inventory every existing path directly under canonical `plan.dir`',
    'For each regular untracked canonical',
    'Call `issue-buddy.mjs pass-collect`',
    'Before each eligible candidate',
    '<!-- spawn-site:issue-buddy/readiness -->',
    '<!-- spawn-site:issue-buddy/plan-run -->',
    '<!-- spawn-site:issue-buddy/nested-spawn-probe -->',
    'Always reach this phase on a controlled ending after acquisition.',
  );
  assert.match(source, /Require exactly the three lines defined by `planning-readiness`/);
  assert.match(source, /Verdict: ready\|not-ready/);
  assert.match(source, /Failed: <ordered R-ids or none>/);
  assert.match(source, /Reason: <one line, at most 160 characters>/);
  assert.match(
    source,
    /Before loading\/running `plan`, this delegated orchestrator must start and await one no-op child/,
  );
  assert.match(source, /Never plan inline after that refusal/);
  assert.match(source, /reportVersion: 2/);
  assert.match(source, /Initial leftovers are bound by collection/);
  assert.doesNotMatch(source, /\`\`\`ask/);
  assert.match(prose, /never inline judgment\/planning or an issue retry/);
});

test('Issue Buddy publishes only fixed metadata-derived forge text and preserves integrity bindings', () => {
  assert.match(source, /reviewResult: "approved"\|"revision-required",\s*openPointCount/);
  assert.match(source, /expectedBaseOid: collect\.baseOid/);
  assert.match(source, /expectedTipOid: <inspected branchTip>/);
  assert.match(source, /expectedBlobOid: <metadata blobOid>/);
  assert.match(source, /Do not copy plan\/issue\/title\/comment prose/);
  assert.match(prose, /English title and `commitMessage` are exactly `docs: plan issue #<N>`/);
  assert.match(
    prose,
    /English body: `Plan for issue #<N>; review result: <approved\|revision required>; open points: <n>\.`/,
  );
  assert.match(
    prose,
    /German body: `Plan für Issue #<N>; Review-Ergebnis: <freigegeben\|Überarbeitung nötig>; offene Punkte: <n>\.`/,
  );
  assert.match(prose, /A moved tip\/base stops; only confirmed success is recordable/);
  assert.match(
    prose,
    /Only after confirmed publication may this pass remove its exact newly created plan/,
  );
});

test('Issue Buddy has exactly three spawn markers and keeps unattended control lines explicit', () => {
  const markers = [...source.matchAll(/^<!-- spawn-site:([^>]+) -->$/gm)].map(([, id]) => id);
  assert.deepEqual(markers, [
    'issue-buddy/readiness',
    'issue-buddy/plan-run',
    'issue-buddy/nested-spawn-probe',
  ]);
  assert.match(source, /Run state: non-interactive/);
  assert.match(source, /Next steps: suppressed/);
  assert.match(source, /Never call user-input tools or emit prose questions/);
  assert.match(source, /Every child must finish before its parent ends/);
});
