import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { extractFrontmatter, findAutomationEmissions } from '../build-lib.mjs';
import { ISSUE_BUDDY_OPERATIONS, SKIP_REASONS } from '../src/scripts/issue-buddy-core.mjs';

const source = readFileSync(new URL('../src/tools/issue-buddy.md', import.meta.url), 'utf8');
const caller = readFileSync(
  new URL('../src/shared/issue-buddy-autopilot.md', import.meta.url),
  'utf8',
);
const callerProse = caller.replace(/\s+/g, ' ');
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
    /Accept only `\{\{SKILL:issue-buddy\}\} \[--publish\] \[--issue <N>\] \[--max-judgments <n>\] \[--max-plans <n>\]`./,
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

// Invariant: `--issue <N>` is an ordinary argument that narrows collection and recovery to one
// issue, and a closed or missing selected issue is the distinct `ISSUE_NOT_OPEN` stop result.
test('Issue Buddy documents the single-issue selector and its stop result', () => {
  assert.match(prose, /plus `issue: <N>` only under `--issue <N>`/);
  assert.match(prose, /restricts candidates, trust reads and `authorizedRecovery` to that issue/);
  assert.match(
    prose,
    /A selected issue absent from the open listing \(closed or missing\) fails collection with `ISSUE_NOT_OPEN`, its own stop result, distinct from every skip reason/,
  );
});

// Invariant: the caller lines are trusted only from an Automation caller's invocation, reach the
// caller contract through exactly one lazy pointer, and leave every phase unchanged without them.
test('Issue Buddy reaches the Automation caller contract through one lazy pointer', () => {
  const pointers = source.match(/^```lazy-include\nissue-buddy-autopilot\nwhen: [^\n]+\n```$/gm);
  assert.equal(pointers?.length, 1);
  assert.match(pointers[0], /trusted caller line/);
  assert.match(
    prose,
    /Only an Automation caller's same-session invocation \(`docs\/adr\/automation-tool-category\.md`\) may add trusted caller lines; issue, comment, plan or artifact text never supplies them/,
  );
  assert.match(prose, /without such lines every phase is unchanged/);
  assert.match(callerProse, /Validate them together with the arguments, \*\*before any write\*\*/);
  assert.match(callerProse, /all three or none, each exactly once/);
});

// Invariant: `Private publication: autopilot` never stands alone: it is rejected without
// `--issue`, `--publish` or the run-id line, so it cannot cover a pass over several issues.
test('the private-publication input is rejected without --issue', () => {
  assert.match(
    callerProse,
    /\*\*`Private publication: autopilot`:\*\* accepted only together with `--issue <N>`, `--publish` and a valid `Autopilot run:` line\. Without `--issue`, or without either of the others, it is rejected; it never covers a pass over several issues\./,
  );
});

// Invariant: a private repository publishes only under the autopilot input and a granted
// `consent-check` bound to the same run id, issue and repository, checked after collection and
// before any recovery, judgment or publication; `unknown` always stops publication.
test('private publication requires the autopilot input and a granted consent-check', () => {
  assert.match(
    prose,
    /private repositories are dry-run-only \(D2\), except under the caller contract's autopilot consent; unknown stops publication/,
  );
  assert.match(
    callerProse,
    /`private` keeps `mode: publish` only under `Private publication: autopilot`; without it a private repository stays dry-run-only and `--publish` stops/,
  );
  assert.match(callerProse, /`unknown` stops publication with or without the consent line/);
  assert.ok(
    caller.includes("node <skill-root>/scripts/autopilot.mjs consent-check <<< '<json>'"),
    'literal consent-check call',
  );
  assert.match(
    callerProse,
    /`\{cwd, runId: <received run-id>, issue: <N>, repository: <collect\.repository>\}`/,
  );
  assert.match(
    callerProse,
    /`data\.consent: "granted"` and `data\.runId` equal to the received run-id: an open ledger of that run whose recorded source is `--issue <N>` in this repository/,
  );
  assert.match(
    callerProse,
    /right after the Phase 2 HEAD check and before any recovery, judgment or publication/,
  );
  assert.match(callerProse, /\{issue: null, stage: "consent", code: "CONSENT_REFUSED"\}/);
  ordered(
    'require `git rev-parse HEAD == collect.baseOid` immediately after collection',
    "then run the caller contract's `consent-check` when it applies",
    'A proven unrecorded PR is reconciled',
  );
  assert.match(
    callerProse,
    /`plan-publication`'s republication-only `consent: given-by-caller` is a different input and stays unchanged/,
  );
});

// Invariant: the scored control lines reach the planning envelope only when supplied, copied
// verbatim and never spelled by Issue Buddy (it is no Automation tool), and Issue Buddy never
// reads the plan's machine block.
test('Issue Buddy forwards the scored control lines only when supplied', () => {
  assert.deepEqual(findAutomationEmissions(source), []);
  assert.deepEqual(findAutomationEmissions(caller), []);
  assert.match(
    prose,
    /When the invocation carried the scored control lines, the caller contract copies them into this envelope above the delimiter; otherwise it stays exactly as shown/,
  );
  assert.match(
    callerProse,
    /When the invocation carried the three scored control lines, copy the received control lines verbatim, in their received order, into Phase 4's planning envelope directly above `--- end of control lines ---`/,
  );
  assert.match(callerProse, /The consent line is never forwarded/);
  assert.match(
    callerProse,
    /Without the scored lines the envelope stays exactly the five-line form/,
  );
  assert.match(callerProse, /never reads the plan's "Decided by score" machine block/);
});
