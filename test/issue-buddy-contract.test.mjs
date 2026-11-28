import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { extractFrontmatter, findAutomationEmissions } from '../build-lib.mjs';
import { ISSUE_BUDDY_OPERATIONS, SKIP_REASONS } from '../src/scripts/issue-buddy-core.mjs';

const source = readFileSync(new URL('../src/tools/issue-buddy.md', import.meta.url), 'utf8');
const caller = readFileSync(
  new URL('../src/shared/issue-buddy-autopilot.md', import.meta.url),
  'utf8',
);
const callerProse = caller.replace(/\s+/g, ' ');
const baseMoveFragment = readFileSync(
  new URL('../src/shared/issue-buddy-base-move.md', import.meta.url),
  'utf8',
);
const baseMoveProse = baseMoveFragment.replace(/\s+/g, ' ');
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

// Invariant: the preflight keeps its order with a pass record in place of the whole-pass lock, the
// invocation may be any checkout of the repository while every runtime helper stays rooted at the
// primary checkout, and publication runs only in the pass's own `issue-planning` worktree.
test('Issue Buddy keeps the preflight order, a primary runtime root and its planning worktree', () => {
  ordered(
    'Configuration and root.',
    'Hidden mode.',
    'Tracker.',
    'GitHub origin.',
    'Runtime safety.',
    'Migration.',
    'Pass record.',
    'Repository visibility.',
    'Publishing rows and tree.',
    'Subagent capability.',
    'Phase 1: Earlier leftovers',
  );
  assert.match(source, /first `git worktree list --porcelain` record/);
  assert.doesNotMatch(source, /worktree-integration/);
  assert.doesNotMatch(prose, /whole-pass lock unchanged|a linked checkout is refused/);
  assert.match(
    prose,
    /The invocation checkout may be the primary checkout or any linked or harness worktree of the repository/,
  );
  assert.match(
    prose,
    /Require primary root = returned `data\.runtimeStateRoot` as `RUNTIME_STATE_ROOT`/,
  );
  assert.match(
    prose,
    /Every `issue-buddy\.mjs` and `remote-tracker\.mjs` call has `cwd: RUNTIME_STATE_ROOT`/,
  );
  assert.match(
    prose,
    /Every `plan-lint\.mjs` and `plan-publication\.mjs` call has `cwd: PLANNING_ROOT`, the pass's planning worktree/,
  );
  assert.match(prose, /Do not evaluate `delivery\.completion`/);
});

test('Issue Buddy uses the actual helper operation set and exact phase payload shapes', () => {
  for (const operation of ISSUE_BUDDY_OPERATIONS) {
    assert.match(source, new RegExp(`\\b${operation}\\b`), `missing helper operation ${operation}`);
  }
  assert.equal(SKIP_REASONS.length, 12);
  assert.match(prose, /preserve its twelve skip reasons/);
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
  assert.match(
    prose,
    /Never read\/write cache, pass records, `pass\.lock`, planning claims, journal or trusted JSON directly/,
  );
});

test('Issue Buddy Phase 6 projects recorded verdicts to the three report fields without fingerprint', () => {
  const phase = source.split(/^## Phase 6:.*$/m)[1]?.split(/^## /m)[0];
  assert.ok(phase, 'missing Phase 6 report contract');
  const reportProse = flat(phase);
  const fields = reportProse.match(/`verdicts`[^.]*exactly `\{([^}]+)\}`/);
  assert.ok(fields, 'missing exact verdict entry projection');
  assert.deepEqual(
    fields[1].split(',').map((field) => field.trim()),
    ['issue', 'verdict', 'reason'],
  );
  const example = phase.match(/`(\[\{[^`]+\}\])`/);
  assert.ok(example, 'missing JSON verdicts example');
  const [entry] = JSON.parse(example[1]);
  assert.deepEqual(Object.keys(entry).sort(), ['issue', 'reason', 'verdict']);
  assert.ok(Number.isSafeInteger(entry.issue) && entry.issue > 0);
  assert.equal(entry.verdict, 'not-ready');
  assert.ok(entry.reason.length > 0);
});

test('Issue Buddy binds leftovers, readiness, nested planning and report state', () => {
  ordered(
    'Earlier plans live only in kept planning worktrees',
    'For each regular untracked canonical',
    'Call `issue-buddy.mjs pass-collect`',
    'Before each eligible candidate',
    '<!-- spawn-site:issue-buddy/readiness -->',
    '<!-- spawn-site:issue-buddy/plan-run -->',
    '<!-- spawn-site:issue-buddy/nested-spawn-probe -->',
    'Always reach this phase on a controlled ending after `pass-open`.',
  );
  assert.match(source, /Require exactly the three lines defined by `planning-readiness`/);
  assert.match(
    prose,
    /leaf\*\* with the absolute paths `<skill-root>\/shared\/planning-readiness\.md` and `<skill-root>\/shared\/issue-assessment-criteria\.md` to apply under `issue-buddy`'s input scope/,
    'the readiness leaf receives the fragment R3 refers to as absolute paths, keeping both loads lazy',
  );
  assert.match(
    prose,
    /reads only WP3's trusted data under its guarded canonical path and the two named fragments/,
    'the readiness leaf reads nothing beyond the trusted data and its two fragments',
  );
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

// Invariant: the authority-holding pass passes no forge text. The helper derives title, commit
// subject and body from the verified plan bytes; the pass hands it only the two language values,
// and a refusal on that derived text is an issue-content failure, not a pass stop.
test('Issue Buddy passes no forge text, lets the helper derive it, and preserves integrity bindings', () => {
  assert.match(source, /reviewResult: "approved"\|"revision-required",\s*openPointCount/);
  assert.match(source, /expectedBaseOid: collect\.baseOid/);
  assert.match(source, /expectedTipOid: <inspected branchTip>/);
  assert.match(source, /expectedBlobOid: <metadata blobOid>/);
  for (const text of [prose, baseMoveProse]) {
    assert.doesNotMatch(text, /docs: plan issue #/);
    assert.doesNotMatch(text, /Plan for issue #<N>; review result/);
    assert.doesNotMatch(text, /Plan für Issue #<N>; Review-Ergebnis/);
  }
  assert.match(prose, /Pass no forge text\. WP4 derives the title, commit subject and body/);
  assert.match(prose, /Never copy plan\/issue\/title\/comment prose into a call/);
  assert.match(
    prose,
    /remote: "origin", baseBranch, languageGit, languageForge, expectedBaseOid: collect\.baseOid, expectedBlobOid: <metadata blobOid>\}/,
  );
  assert.match(
    prose,
    /plus `\{languageGit, languageForge, expectedTipOid: <inspected branchTip>\}`/,
  );
  assert.match(prose, /Pass no `planFile`, forge text or model prose to completion/);
  // No publication call names a caller title, body or commit message.
  for (const call of prose.match(/`\{cwd, runState: "unattended"[^`]*\}`/g) ?? []) {
    assert.doesNotMatch(call, /\b(?:title|body|commitMessage)\b/, call);
  }
  assert.match(
    prose,
    /any refusal with `details\.source: "derived"`, which WP4 raises on forge text it derived from the plan\) may record `failed`/,
  );
  assert.match(
    baseMoveProse,
    /a refusal with `details\.source: "base-move-flag"` is an item-5 input-contract stop/,
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
    '`git -C <PLANNING_ROOT> rev-parse HEAD == collect.baseOid`',
    '`consent-check` when it applies',
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
    /Without the scored lines the envelope stays exactly the five-line form plus its `Execution root:` line/,
  );
  assert.match(callerProse, /never reads the plan's "Decided by score" machine block/);
});

// Invariant: no whole-pass lock serializes passes any more: `pass-open` creates a pass record and
// takes no lock, `pass-close` releases the pass's remaining claims, and the mutex is bounded to
// short local state work with a 10 s retry before `LOCKED`.
test('Issue Buddy opens and closes a pass record instead of a whole-pass lock', () => {
  assert.doesNotMatch(source, /pass-lock-acquire|pass-lock-release|Whole-pass lock/);
  assert.match(
    prose,
    /\*\*Pass record\.\*\* Call `pass-open` with `\{cwd\}`; retain its `passId`\. It creates the pass record `passes\/<passId>\.json` and takes no lock/,
  );
  assert.match(prose, /There is no whole-pass lock/);
  assert.match(
    prose,
    /never a fetch or forge call, and retries a contended bind for at most 10 s before `LOCKED`/,
  );
  assert.match(
    prose,
    /attempt `pass-close` with `\{cwd, passId\}` after report handling, including after a failed report/,
  );
  assert.match(
    prose,
    /`\{passId, closed, releasedClaims\}`; `PASS_NOT_FOUND` means no open record/,
  );
  assert.doesNotMatch(source, /LOCK_MISMATCH/);
});

// Invariant: a batch pass skips an issue another run plans as `issue-in-progress` and moves on, a
// single-issue pass stops `ISSUE_CLAIMED` with the holder, an autopilot caller's run id is passed
// as `autopilotRunId` to adopt its claim, and the skip reason is told apart from the lifecycle label.
test('Issue Buddy documents per-issue claims, their stops and the issue-in-progress skip', () => {
  assert.ok(SKIP_REASONS.includes('issue-in-progress'));
  assert.match(
    prose,
    /plus `issue: <N>` only under `--issue <N>` and, with it, `autopilotRunId: <run-id>` only when the caller contract received an `Autopilot run:` line/,
  );
  assert.match(prose, /skips as `issue-in-progress` and the next eligible issue takes its place/);
  assert.match(
    prose,
    /A single-issue pass on such an issue fails collection with `ISSUE_CLAIMED`, naming the holder/,
  );
  for (const code of ['CLAIM_ADOPTION_REFUSED', 'LEGACY_PASS_LOCK']) {
    assert.match(source, new RegExp(`\`${code}\``), code);
  }
  // Adoption is exclusive and its refusal reasons match the caller contract.
  for (const reason of ['already-adopted', 'adoption-invalid']) {
    assert.match(source, new RegExp(`\`${reason}\``), reason);
    assert.match(callerProse, new RegExp(`\`${reason}\``), reason);
  }
  assert.match(prose, /a claim another run holds stays `ISSUE_CLAIMED`/);
  // The cleanup-owned operations are named but never run in a pass.
  assert.match(
    prose,
    /`pass-list`, `pass-prune` and `trusted-prune` are `\{\{SKILL:cleanup\}\}`'s and never run in a pass/,
  );
  assert.match(
    prose,
    /`issue-in-progress` is a local planning claim, not the lifecycle label `effective-flow-issue-in-progress`, which skips as `lifecycle-label`/,
  );
  assert.match(
    callerProse,
    /pass the received run-id as `autopilotRunId` in Phase 2's `pass-collect` payload/,
  );
  assert.match(callerProse, /No claim token enters a caller line, envelope or this run's context/);
  assert.doesNotMatch(callerProse, /before the lock/);
});

// Invariant: each publishing pass plans in its own `issue-planning` worktree created at
// `collect.baseOid` (no second fetch), names it to the plan writer as `Execution root:`, withdraws
// it on exit unless a preserved plan keeps it, and reads earlier leftovers from those records.
test('Issue Buddy plans in a per-pass issue-planning worktree at collect.baseOid', () => {
  ordered(
    'Call `issue-buddy.mjs pass-collect`',
    '**Planning worktree.**',
    "worktree add -b 'issue-planning/<passId>' <PLANNING_ROOT>",
    '`git -C <PLANNING_ROOT> rev-parse HEAD == collect.baseOid`',
    'Execution root: <absolute PLANNING_ROOT>',
  );
  assert.match(
    prose,
    /create the pass's `issue-planning` worktree at `collect\.baseOid`, so no second fetch runs/,
  );
  assert.match(
    prose,
    /unless Phase 4 or Phase 5 preserves a plan in it: then transition its record `active` → `aborted` with reason `plan-preserved`, keep it and report its path and issue\. The claim is released either way/,
  );
  assert.match(
    prose,
    /Read every record with `worktree inspect` without `sessionId` and keep those with purpose `issue-planning`, status `aborted` and reason `plan-preserved` only; an `active` one belongs to a running pass and is never inventoried/,
  );
  // The kept worktree's removal path: the operator moves or discards the plan, then cleanup removes it.
  assert.match(
    prose,
    /move the plan out of the kept worktree or discard it, then `\{\{SKILL:cleanup\}\}` removes the worktree and its `plan-preserved` record/,
  );
  assert.match(
    prose,
    /the configured `delivery\.baseBranch` \(a remote ref only on `origin`, normalized to the branch name\), else local `origin\/HEAD`, else `origin\/main`/,
  );
});

// Invariant (issue #799): a plan preserved after a planner abort is classified by the parent's own
// helpers and stays listable by Phase 1. An abort caused by the environment never spends an issue
// retry; only helper-proven blocked plan content (a non-empty `data.blocking`) does. The no-mutation verification still runs, the abort text
// never decides the outcome, and an aborted plan never reaches Phase 5's publish.
test('Issue Buddy classifies a planner abort from its own helpers and never publishes the plan', () => {
  ordered(
    'Require terminal `DONE` or `ABORT`',
    "The delegated orchestrator relays the planner's terminal line verbatim.",
    'After any planner `ABORT`',
    'Verify no HEAD/index/tracked/unrelated-path mutation',
    '## Phase 5: Publish',
  );
  assert.match(
    prose,
    /After any planner `ABORT` other than `NESTED_SPAWN_UNAVAILABLE`, still run the verification below, which here also admits zero new plans; a mutation or ambiguous identity stays a pass stop/,
  );
  assert.match(
    prose,
    /With exactly one verified new plan, run `publication-metadata` as below and `plan-publication\.mjs scan` with `\{cwd, runState: "unattended", planFile: <relative plan path>\}`, reading only its finding ids/,
  );
  assert.match(
    prose,
    /classify from these two helper results through the ordered mapping, never from the abort text/,
  );
  // An abort caused by the environment never spends an issue retry: only a non-empty
  // `data.blocking` from the parent's own scan is item 4; a `publication-metadata` refusal is
  // item 5 on this path, because an interrupted planner leaves the same refusal.
  const abortPath = prose.slice(
    prose.indexOf('After any planner `ABORT`'),
    prose.indexOf('Verify no HEAD/index'),
  );
  assert.match(abortPath, /non-empty `data\.blocking`[^.]*item 4/);
  assert.match(abortPath, /`publication-metadata` refusal[^.]*item 5/);
  assert.doesNotMatch(abortPath, /invalid metadata/);
  assert.match(
    prose,
    /preserve the plan as Phase 5 preserves an unpublished one, and skip Phase 5\. Without a new plan, item 5 applies and nothing is preserved/,
  );
  // The extra scan is the only helper call admitted beside publication-metadata.
  assert.match(
    prose,
    /Besides that abort path's one `scan`, call only `plan-lint\.mjs publication-metadata` with/,
  );
  // The nested-spawn abort keeps its own whole-pass stop.
  assert.match(
    prose,
    /returns `ABORT: NESTED_SPAWN_UNAVAILABLE` to the parent and stops the whole pass/,
  );
});

// Invariant (issue #734): the base-move continuation is reached through exactly one lazy pointer at
// the publication decision point, only for a pre-mutation `BASE_CHANGED` that this pass has not
// assessed yet, and it replaces item 5 only for that case.
test('Issue Buddy reaches the base-move fragment through one lazy pointer at Phase 5', () => {
  const pointers = source.match(/^```lazy-include\nissue-buddy-base-move\nwhen: [^\n]+\n```$/gm);
  assert.equal(pointers?.length, 1);
  assert.match(pointers[0], /`BASE_CHANGED`/);
  assert.match(pointers[0], /no `details\.state`/);
  assert.match(pointers[0], /assessed no base move for this issue/);
  assert.match(
    prose,
    /A `BASE_CHANGED` without `details\.state`, for an issue whose base move this pass has not yet assessed, follows `issue-buddy-base-move` instead of item 5/,
  );
  ordered(
    'Call `plan-publication.mjs publish --apply`',
    '`issue-buddy-base-move`',
    'Record `published` only',
  );
});

// Invariant (issue #734): item 5 still stops on base drift, with exactly one exception: the first
// pre-mutation `BASE_CHANGED`, which the fragment assesses for its single assessed re-publish,
// flagged when unresolved or moved again. A `BASE_CHANGED` from that re-publish is not exempt, and
// tip and blob drift keep stopping.
test('Issue Buddy item 5 keeps base drift a stop except the single assessed re-publish', () => {
  assert.match(
    prose,
    /base\/tip\/blob drift \(`BASE_CHANGED`, except the first pre-mutation one, which `issue-buddy-base-move` assesses for its single assessed re-publish, flagged when unresolved or moved again; `TIP_CHANGED`; `BLOB_CHANGED`\)/,
  );
  assert.doesNotMatch(prose, /`BASE_CHANGED` except the single assessed re-publish/);
  assert.match(
    prose,
    /stop the pass without an issue failure\/retry\. Do not retry or silently replan/,
  );
});

// Invariant (issue #734): the stored report can carry the move, so Phase 6 names `baseMoves` in the
// exact `pass-report` key list, only when the fragment added an entry, and the chat report names it.
test('Issue Buddy Phase 6 lists baseMoves in the pass-report keys and reports each base move', () => {
  assert.match(
    prose,
    /pass-report` with `\{cwd, passId, reportVersion: 2, outcome, cutOff, verdicts, pullRequestsOpened, pullRequestsRecovered, failures, repositoryVisibility, leftoverPlanFiles\}`, plus `baseMoves` when `issue-buddy-base-move` added an entry/,
  );
  assert.match(
    prose,
    /each base move as `issue-buddy-base-move` states \(a flagged PR, also on a base that moved again, as an unresolved base move left to review\)/,
  );
});

// Invariant (issue #734): at most one assessed re-publish per issue and pass. It binds to the
// assessed tip with `allowNewerBase: true`, so a base that moves again publishes flagged instead of
// stopping, while its own `BASE_CHANGED` (a stopping reason) still stops and keeps the entry. Only
// the base-move fragment passes `allowNewerBase`; no other skill Markdown, the tool included, does.
test('the base-move fragment re-publishes once on the assessed base and flags a further move', () => {
  assert.match(
    baseMoveProse,
    /One assessed re-publish per issue and pass may continue, also when the base moves again/,
  );
  assert.doesNotMatch(baseMoveProse, /a second `BASE_CHANGED` never does/);
  assert.match(baseMoveProse, /call `plan-publication\.mjs assess-base-move`/i);
  assert.match(baseMoveProse, /it pushes nothing and writes no forge object/i);
  assert.match(
    baseMoveProse,
    /call `publish --apply` once, with the unchanged input plus `expectedBaseOid: <toBaseOid>` and `allowNewerBase: true`/,
  );
  assert.equal(
    (baseMoveProse.match(/allowNewerBase: true/g) ?? []).length,
    1,
    'the flag is passed only on the single assessed re-publish',
  );
  const srcRoot = new URL('../src/', import.meta.url);
  const elsewhere = readdirSync(srcRoot, { recursive: true }).filter(
    (file) => file.endsWith('.md') && file !== 'shared/issue-buddy-base-move.md',
  );
  assert.ok(elsewhere.includes('tools/issue-buddy.md'));
  for (const file of elsewhere) {
    assert.doesNotMatch(
      readFileSync(new URL(file, srcRoot), 'utf8'),
      /allowNewerBase/,
      `${file} must leave allowNewerBase to the base-move fragment`,
    );
  }
  assert.match(
    baseMoveProse,
    /A base that moved again\s+still publishes on `toBaseOid`, the newer move flagged unassessed as\s+`furtherBaseMove`/,
  );
  assert.match(baseMoveProse, /its `BASE_CHANGED` is an item-5 stop keeping the entry/);
  assert.match(
    baseMoveProse,
    /same input\. Its projection, `blobOid` included, must equal the projection Phase 4 retained/,
  );
});

// Invariant (issue #734): every successful assessment, whatever its verdict, is recorded once with
// the closed field list; an assessment error records none and stops with its own code.
test('the base-move fragment records one baseMoves entry per successful assessment', () => {
  assert.match(
    baseMoveProse,
    /A successful envelope, whatever its verdict, adds exactly one `baseMoves` entry for this issue/,
  );
  for (const field of [
    'issue',
    'fromBaseOid',
    'toBaseOid',
    'verdict',
    'reason',
    'commitCount',
    'changedPathCount',
    'citedPathCount',
    'citedPaths',
    'overlappingPaths',
  ])
    assert.match(baseMoveProse, new RegExp(`\`${field}\``), `missing entry field ${field}`);
  assert.match(
    baseMoveProse,
    /An error envelope, such as `BASE_REWRITTEN` or `BLOB_CHANGED`, stops the pass with the null failure `\{issue: null, stage: "publish", code: <its code>\}` and adds no `baseMoves` entry/,
  );
});

// Invariant (issue #734 follow-up): the envelope's `republish` decides. A re-publishing envelope
// re-publishes once, passing `baseMove` for an unresolved verdict so `publish` renders the flag;
// only `republish: false` (the stopping reasons) or a stopped re-publish stops the pass with the
// null BASE_CHANGED record, preserves the plan, and tells the operator range, paths, reason and way
// out.
test('the base-move fragment re-publishes on republish: true, flags an unresolved move, and stops only on republish: false', () => {
  assert.match(
    baseMoveProse,
    /3\. \*\*`republish: true`\.\*\* Re-run `plan-lint\.mjs publication-metadata`/,
  );
  assert.match(
    baseMoveProse,
    /an `overlap` or `undecidable` verdict also passes `baseMove: \{fromBaseOid, toBaseOid, verdict, reason, commitCount, overlappingPaths\}` from the envelope, rendered as the fixed "Unresolved base move" flag/,
  );
  assert.match(baseMoveProse, /A flagged PR is a normal `published` outcome; review reconciles it/);
  assert.match(
    baseMoveProse,
    /4\. \*\*`republish: false`\*\* \(`not-ancestor`, `same-issue-plan` or `plan-identity`\)\. Stop as item 5 does: preserve the plan and its planning worktree \(Phase 2\) and record the pass failure `\{issue: null, stage: "publish", code: "BASE_CHANGED"\}`/,
  );
  assert.doesNotMatch(baseMoveProse, /`overlap` or `undecidable`\.\*\* Stop/);
  assert.match(
    baseMoveProse,
    /A stopping move, a `republish: false` envelope or a stopped re-publish, names the range, the commit count, the bounded `overlappingPaths` with the `reason` \(a re-publish stop: its `details\.reason`\), the preserved plan and planning worktree paths, and the way out/,
  );
  assert.match(
    baseMoveProse,
    /A flagged move that published adds the `reason` and the bounded `overlappingPaths`; a `furtherBaseMove` on either adds its range and count, unassessed; each says the PR carries the unresolved base move/,
  );
  assert.match(
    baseMoveProse,
    /move or discard the preserved plan, run `\{\{SKILL:cleanup\}\}` to remove the kept planning worktree, then rerun the pass or the autopilot run, which plans on the current tip/,
  );
  assert.match(
    baseMoveProse,
    /A fitting move that published is one chat line: the range `<from>\.\.<to>` as short object IDs, the commit count and the cited-path count/,
  );
});

// Invariant (issue #800): a publishing pass resolves the Markdown formatter once, after the
// caller's `consent-check` and before recovery and judgment, accepts only the direct call that
// `unattended-planning` "Completion" step 1 defines once (pointed to, never restated here), and
// stops with stage `format` and `FORMATTER_UNAVAILABLE` before anything is planned. The formatter
// is the one the base tree names: project instructions, package scripts and formatter
// configuration are read in `PLANNING_ROOT` (the planning worktree at `collect.baseOid`), host
// instructions stay host-side, and only the installed executable comes from `RUNTIME_STATE_ROOT`;
// an installed executable other than the one the `PLANNING_ROOT` tree names stops the pass with
// `FORMATTER_UNAVAILABLE`.
test('Issue Buddy preflights a named formatter before recovery and judgment', () => {
  ordered(
    '`consent-check` when it applies',
    '**Formatter preflight.** In publishing mode, after `consent-check` and before recovery or',
    'A proven unrecorded PR is reconciled',
    '## Phase 3: Readiness',
  );
  assert.match(
    prose,
    /check that a named formatter allows a direct call as `<skill-root>\/shared\/unattended-planning\.md` "Completion" step 1 defines it, already installed in `RUNTIME_STATE_ROOT` and allowed by host instructions to run with working directory `PLANNING_ROOT`/,
  );
  assert.doesNotMatch(prose, /single executable resolves|bin shim/);
  assert.match(prose, /This parent never installs/);
  assert.match(
    prose,
    /resolve once from the project's instructions \(`AGENTS\.md` and its includes, package scripts, formatter configuration\) read in `PLANNING_ROOT`, plus host instructions, whether they name a Markdown formatter/,
  );
  assert.match(prose, /reading them runs no project tool there/);
  assert.match(prose, /only that executable comes from `RUNTIME_STATE_ROOT`/);
  assert.match(
    prose,
    /A named formatter that cannot run directly, an installed executable other than the one the `PLANNING_ROOT` tree names, or ambiguous instructions stop the pass with `\{issue: null, stage: "format", code: "FORMATTER_UNAVAILABLE"\}`/,
  );
  // The tool source discovers the formatter and names no concrete runner or formatter.
  assert.doesNotMatch(source, /\boxfmt\b|pnpm exec|\bnpx\b|t3-project/);
});

// Invariant (issue #800): the separate planning brief forbids every project tool in
// `PLANNING_ROOT`, the formatter included, and carries that prohibition into every agent the
// sub-run starts as that child handoff's authority limits, outside any control-line payload (so a
// strict entry such as `plan-review` keeps its exact payload); any new ignored or untracked path
// besides the plan is an unrelated mutation.
test('Issue Buddy forbids project tools in the planning brief and names new ignored paths as mutation', () => {
  assert.match(
    prose,
    /no project build, install, test, formatter or generated-output command in `PLANNING_ROOT` \(using, besides the plan write, only file reads, read-only Git and the skill's own helper scripts\), restated as the authority limits of every child handoff it starts, outside any control-line payload, and no user questions as its separate brief/,
  );
  assert.match(
    prose,
    /exactly one new regular untracked canonical plan directly under its `plan\.dir`, associated with this issue; any other new ignored or untracked path is an unrelated mutation/,
  );
  assert.match(prose, /unrelated mutation or ambiguous identity is a pass stop/);
});

// Invariant (issue #800): between the first `publication-metadata` call and `publish --apply`
// the parent formats the plan without reading formatter output, re-checks mutation, validates
// again and retains that projection, whose `blobOid` is `<metadata blobOid>`; creation identity is
// type, device, inode and link count 1 and is re-recorded only after the second call succeeds.
test('Issue Buddy formats before publication, validates again and binds the formatted blob', () => {
  ordered(
    'call only\n`plan-lint.mjs publication-metadata`',
    '**Format.** With no Markdown formatter named (Phase 2), retain the first projection',
    'evaluating only its exit status',
    'Then re-verify HEAD, index and tracked state',
    '`publication-metadata` again with the same input',
    'Only then check identity',
    '`<metadata blobOid>` is the retained projection',
    'Call `plan-publication.mjs publish --apply`',
  );
  assert.match(prose, /the plan is published as-is/);
  assert.match(
    prose,
    /run the preflighted formatter on the plan path only, working directory `PLANNING_ROOT`, keeping its stdout and stderr out of context and evaluating only its exit status; this is no overwrite in the sense above/,
  );
  assert.match(
    prose,
    /a nonzero exit, any HEAD\/index\/tracked change or any other new path stops with `FORMAT_FAILED`/,
  );
  assert.match(
    prose,
    /it must succeed with the same `planFile`, `reviewResult` and `openPointCount`, else stop with `FORMAT_METADATA_CHANGED`, and its projection is retained/,
  );
  assert.match(
    prose,
    /Record creation identity independently as file type, device, inode and a link count of 1, never modification time or size/,
  );
  assert.match(
    prose,
    /a non-regular file or a link count other than 1 stops with `FORMAT_FAILED`, and a changed inode is re-recorded as the creation identity from the formatted file/,
  );
  assert.match(
    prose,
    /Each stop is the null failure `\{issue: null, stage: "format", code\}` under item 5, preserving the plan and its planning worktree/,
  );
  assert.match(
    prose,
    /with proven creation ownership by the retained creation identity, unchanged current blob equal to WP4's `blobOid` \(the formatted blob when Phase 4 formatted\)/,
  );
});

// Invariant (issue #800): formatter output and absolute host paths never reach the report; a
// format stop names only the executable, the repository-relative plan path and the exit status in
// chat, its persisted failure keeps the closed `{issue: null, stage, code}` shape, and a pass
// without a named formatter says that it published as-is.
test('Issue Buddy reports format stops with bounded safe details only', () => {
  assert.match(
    prose,
    /Say when a plan was published as-is because the project names no Markdown formatter/,
  );
  assert.match(
    prose,
    /A `format` stop's details name only the formatter executable, the repository-relative plan path and the exit status, never an absolute host path; its persisted failure stays `\{issue: null, stage, code\}`/,
  );
});
