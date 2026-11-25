// Contract of `shared/scored-decisions.md`, the owning fragment of scored decision mode under an
// Automation caller: its question-site table covers every `ask` fence reachable from the seven
// downstream tools, every row's anchor stays literal in its source, its leaf briefs keep the
// shared calibration bands, and its site ids and blocker kinds match the deterministic helper.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ASK_SCORING, parseAskBlock } from '../build-lib.mjs';
import {
  BLOCKER_KINDS,
  RUN_OUTCOMES,
  SITE_ID,
  SITE_REQUIRED_KINDS,
} from '../src/scripts/autopilot-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const read = (relative) => readFileSync(join(SRC, relative), 'utf8');
const FRAGMENT = read('shared/scored-decisions.md');
const TOOLS = ['plan', 'plan-review', 'build', 'fix', 'refactor', 'docs', 'pr'];
const KINDS = ['scored', 'fixed', 'blocker'];

// The source include closure of the seven tools: every `include` and `lazy-include` fence,
// followed transitively. The fragment itself is excluded: it is the table, not a question site.
function closure() {
  const seen = new Set();
  const queue = TOOLS.map((name) => `tools/${name}.md`);
  while (queue.length > 0) {
    const relative = queue.shift();
    if (seen.has(relative)) continue;
    seen.add(relative);
    for (const match of read(relative).matchAll(
      /^```(?:include|lazy-include)\n([^\n]+)(?:\nwhen:[^\n]+)?\n```/gm,
    )) {
      const name = match[1].trim();
      if (name !== 'scored-decisions') queue.push(`shared/${name}.md`);
    }
  }
  return [...seen].sort();
}

// Every `ask` fence of the closure as `{ file, header }`.
function askFences(files, readSource = read) {
  return files.flatMap((relative) =>
    [...readSource(relative).matchAll(/^```ask\n([\s\S]*?)^```/gm)].map((match) => ({
      file: `src/${relative}`,
      header: parseAskBlock(match[1], { context: relative }).header,
    })),
  );
}

function siteRows(fragment = FRAGMENT) {
  const start = fragment.indexOf('| Site');
  assert.notEqual(start, -1, 'the fragment carries the question-site table');
  return fragment
    .slice(start)
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => {
      const [site, file, anchor, kind, outcome] = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      return { site, file, anchor, kind: kind.replace(/`/g, ''), outcome };
    });
}

function unmappedFences(fences, rows) {
  return fences.filter(
    ({ file, header }) =>
      !rows.some((row) => row.file === file && row.anchor === `header: ${header}`),
  );
}

// Invariant: every `ask` fence reachable from the seven tools has exactly one row, so no question
// can be reached under scored mode without a decided outcome.
test('every ask fence in the include closure of the seven tools has a site row', () => {
  const fences = askFences(closure());
  assert.ok(fences.length >= 15, 'the closure walk reaches the known fences');
  assert.deepEqual(unmappedFences(fences, siteRows()), []);
  for (const { file, header } of fences) {
    const matches = siteRows().filter(
      (row) => row.file === file && row.anchor === `header: ${header}`,
    );
    assert.equal(matches.length, 1, `${file} header: ${header} has exactly one row`);
  }
});

// Invariant: the coverage check really fails on an unmapped fence (guards against a vacuous walk).
test('an ask fence without a row is detected', () => {
  const fixture = [
    '```ask',
    'header: Unmapped',
    'question: New?',
    'options:',
    '  - label: A',
    '    description: a',
    '  - label: B',
    '    description: b',
    '```',
    '',
  ].join('\n');
  const fences = askFences(['tools/fixture.md'], () => fixture);
  assert.deepEqual(unmappedFences(fences, siteRows()), [
    { file: 'src/tools/fixture.md', header: 'Unmapped' },
  ]);
});

// Invariant: every row names an existing source, a literal anchor in it, a known kind and a unique
// site id the helper accepts, so a renamed or reworded site fails here instead of drifting.
test('every row has a unique helper site id, an existing file, a literal anchor and a kind', () => {
  const rows = siteRows();
  assert.ok(rows.length > 0);
  const seen = new Set();
  for (const { site, file, anchor, kind } of rows) {
    assert.match(site, SITE_ID, `${site} is a helper site id`);
    assert.equal(seen.has(site), false, `duplicate site ${site}`);
    seen.add(site);
    assert.ok(KINDS.includes(kind), `${site} kind ${kind}`);
    assert.ok(file.startsWith('src/') && existsSync(join(ROOT, file)), `${site} file ${file}`);
    assert.ok(
      readFileSync(join(ROOT, file), 'utf8').includes(anchor),
      `${site} anchor drifted: ${anchor}`,
    );
  }
});

// Invariant: the anchor check really fails when a row's anchor is missing from its source (guards
// against a vacuous `includes` check): an altered anchor is detected, the original is not.
test('a row whose anchor is missing from its source is detected', () => {
  const [row] = siteRows();
  const source = readFileSync(join(ROOT, row.file), 'utf8');
  assert.ok(source.includes(row.anchor), 'the unaltered anchor is present');
  const drifted = FRAGMENT.replace(row.anchor, `${row.anchor} (reworded)`);
  const driftedRow = siteRows(drifted).find((entry) => entry.site === row.site);
  assert.notEqual(driftedRow.anchor, row.anchor);
  assert.equal(source.includes(driftedRow.anchor), false);
});

// Invariant: the hand-listed prose sites the plan names stay covered, and the fragment states that
// prose questions are covered only through such anchors.
test('the named prose sites are hand-listed and the prose rule is stated', () => {
  const rows = siteRows();
  const byAnchor = (fragment) => rows.find((row) => row.anchor.includes(fragment));
  for (const [anchor, kind] of [
    ['AMBIGUOUS_HOST', 'blocker'],
    ['ask the user and restart planning', 'blocker'],
    ['Ask the user about every relevant ambiguity.', 'scored'],
    ['Inline fallback:', 'blocker'],
    ['**Not passed:**', 'blocker'],
    ['with origin `delivery-choice`', 'fixed'],
  ]) {
    assert.equal(byAnchor(anchor)?.kind, kind, anchor);
  }
  assert.ok(
    FRAGMENT.replace(/\s+/g, ' ').includes(
      'Prose questions are covered only through their hand-listed anchors here.',
    ),
  );
});

// Invariant: the fixed answers of decision 5 hold at their sites.
test('the fixed-answer rows keep approval, completion, review publication and disclosure', () => {
  const rows = new Map(siteRows().map((row) => [row.site, row]));
  for (const site of ['S-APR', 'S-FXP', 'S-RFA', 'S-DCP', 'S-DPR']) {
    assert.deepEqual(
      [rows.get(site).kind, rows.get(site).outcome.startsWith('Yes')],
      ['fixed', true],
    );
  }
  assert.match(rows.get('S-CMP').outcome, /`pr` \+ `Draft: requested`/);
  assert.equal(rows.get('S-PRR').outcome, 'No.');
  assert.match(rows.get('S-SEC').outcome, /^Keep local; record a `security` blocker/);
  assert.match(FRAGMENT, /even under `delivery\.prReview: always`/);
  assert.match(FRAGMENT, /is never scored and never chosen/);
});

// Invariant: the scoring brief carries the calibration bands of scored `ask` fences verbatim, and
// only the re-score brief drops "equal fit gets equal scores" in favour of distinct scores.
test('the leaf briefs reuse the scored-fence calibration', () => {
  const flat = FRAGMENT.replace(/\s+/g, ' ');
  const scoring = flat.slice(flat.indexOf('**Scoring leaf:**'), flat.indexOf('**Re-score leaf:**'));
  const rescore = flat.slice(flat.indexOf('**Re-score leaf:**'), flat.indexOf('### Fixed answers'));
  for (const part of [ASK_SCORING.en.bands, ASK_SCORING.en.topScore, ASK_SCORING.en.tie]) {
    assert.ok(scoring.includes(part), part);
  }
  assert.equal(rescore.includes(ASK_SCORING.en.tie), false);
  assert.match(rescore, /pairwise distinct integer scores/);
  assert.match(rescore, /rank only the tied options/);
});

// Invariant: both leaves are spawn sites, and every blocker kind the fragment names is one the
// helper records.
test('the leaves are spawn sites and named blocker kinds exist in the helper', () => {
  for (const id of ['scored-decisions/score', 'scored-decisions/tie-rescore']) {
    assert.ok(FRAGMENT.includes(`<!-- spawn-site:${id} -->`), id);
    assert.match(
      read('shared/model-tiers.md'),
      new RegExp(`\\| \`${id}\`\\s+\\|[^\\n]*\\| \`deep\``),
    );
  }
  const named = [...FRAGMENT.matchAll(/`([a-z]+(?:-[a-z]+)+|security|floor)` blocker/g)].map(
    (match) => match[1],
  );
  assert.ok(named.length > 0);
  for (const kind of named) assert.ok(BLOCKER_KINDS.includes(kind), kind);
});

// Invariant: every `blocker` row maps to a helper blocker kind: `site-blocker` (which requires its
// site) unless "Records" names a dedicated kind for it, and a conditional Outcome decides before
// the Kind, so a scored row that is a blocker under a condition never reaches scoring then.
test('blocker rows map to helper kinds and conditional outcomes decide before the kind', () => {
  const flatFragment = FRAGMENT.replace(/\s+/g, ' ');
  assert.ok(BLOCKER_KINDS.includes('site-blocker'));
  assert.deepEqual(SITE_REQUIRED_KINDS, ['site-blocker']);
  assert.match(flatFragment, /A `blocker` row records `site-blocker`, which requires `site`/);
  assert.match(flatFragment, /read its Outcome before its Kind/);
  assert.match(flatFragment, /a question without a row records an `unknown-question` blocker/);
  const rows = new Map(siteRows().map((row) => [row.site, row]));
  const dedicated = { 'S-GATE': 'clarity-gate' };
  for (const site of ['S-GFIX', 'S-GRFC', 'S-GDOC', 'S-GBLD']) dedicated[site] = 'validation-red';
  for (const [site, kind] of Object.entries(dedicated)) {
    assert.equal(rows.get(site).kind, 'blocker', site);
    assert.ok(BLOCKER_KINDS.includes(kind), kind);
    assert.ok(flatFragment.includes(site), site);
  }
  for (const site of ['S-PPR', 'S-PDF']) {
    assert.match(
      rows.get(site).outcome,
      /^A blocker while the caller holds a verified plan pull request; otherwise scored/,
    );
  }
});

// Invariant: every blocker that arose at a question site records that site, a conditional blocker
// of a `scored` or `fixed` row included, and the siteless kinds are named exhaustively.
test('conditional row blockers record their site and the siteless kinds are named', () => {
  const flatFragment = FRAGMENT.replace(/\s+/g, ' ');
  assert.match(
    flatFragment,
    /only a blocker without a site \(`plan-not-approved`, `appendix-scan`, `post-branch-failure`, `unknown-question`, and a `scoring-failure` from a malformed `decision-extract` block\) omits it/,
  );
  assert.match(
    flatFragment,
    /A conditional blocker of a `scored` or `fixed` row \(`scored`: S-PPR or S-PDF while a verified plan pull request is held, S-RFQ, S-CLR or S-RUL without options; `fixed`: S-INT on any other result, S-LOC on an overlapping change or a local commit ahead of the resolved base ref\) also records `site-blocker` with that row's site/,
  );
  const rows = new Map(siteRows().map((row) => [row.site, row]));
  for (const site of ['S-PPR', 'S-PDF', 'S-RFQ']) assert.equal(rows.get(site).kind, 'scored', site);
  for (const site of ['S-INT', 'S-LOC']) assert.equal(rows.get(site).kind, 'fixed', site);
});

// Invariant: a rerun on the same plan updates its existing plan-only draft only after verifying its
// base and plan-only diff and claims no branch ownership, any other existing-branch state is a
// recorded publication failure, and a plan pull request that a blocker or a failed rerun update
// left unchanged is recorded at close so `cleanup` keeps the ledger.
test('autopilot blockers update a rerun draft and record an unchanged plan pull request', () => {
  const blockers = read('shared/autopilot-blockers.md').replace(/\s+/g, ' ');
  for (const part of [
    '**Existing branch** (a rerun on the same plan)',
    'runs the "Appendix-only update" of `pr-automation-lines`',
    'is a publication failure: record a `post-branch-failure` blocker and publish nothing',
    "with `plan-pull-request-unchanged` and that pull request's number",
    'close with `plan-pull-request-unchanged` and the plan pull request number',
    'whose `base` is the resolved local base branch',
    'must touch only this plan file',
    "the branch-created flag stays false and no branch creation OID is claimed as this run's",
    'in the `-b` variant the fetched remote tip',
    "leaves the draft's old appendix and closes with `plan-pull-request-unchanged` and the draft's number",
  ]) {
    assert.ok(blockers.includes(part), part);
  }
  assert.ok(RUN_OUTCOMES.includes('plan-pull-request-unchanged'));
  assert.match(read('tools/autopilot.md').replace(/\s+/g, ' '), /`plan-pull-request-unchanged`/);
  for (const file of [
    '../docs/adr/automation-tool-category.md',
    '../docs/user-guide/tools-automation.md',
  ]) {
    assert.match(
      read(file).replace(/\s+/g, ' '),
      /a failed publication step \(plan-only draft or `pr`\)/i,
      file,
    );
  }
});

// Invariant: the autopilot Phase 6 report names the base move, from `run-close`'s `baseMove` or a
// stopping `baseMoves` pass-report entry, so a base that moved during planning is never silent; an
// unresolved recorded move is reported as left to review.
test('autopilot Phase 6 reports the base move', () => {
  const phase6 = read('tools/autopilot.md').split('## Phase 6: Report')[1].replace(/\s+/g, ' ');
  assert.match(phase6, /the base move: `run-close`'s `baseMove` with its old and new base/);
  assert.match(phase6, /counts and cited paths/);
  assert.match(
    phase6,
    /for an `overlap` or `undecidable` verdict its reason and overlapping paths as an unresolved move left to review/,
  );
  assert.match(
    phase6,
    /a stopping `baseMoves` entry's range, reason, overlapping paths and way out/,
  );
});

// Invariant (issue #734 follow-up): the autopilot issue source records every base move beside a
// confirmed pull request for `#<N>` through the literal `base-move-record` call with its exact key
// list, `verdict`, `reason` and `overlappingPaths` included, before that pull request continues; an
// unresolved move continues the run, and an entry without that pull request records nothing and
// stops.
test('autopilot issue source records a base move beside its pull request and continues', () => {
  const mapping = read('shared/autopilot-issue-source.md').replace(/\s+/g, ' ');
  assert.match(
    mapping,
    /any entry beside a confirmed pull request for `#<N>` is recorded, with the literal `autopilot\.mjs base-move-record` call `\{cwd, runId, fromBaseOid, toBaseOid, verdict, reason, commitCount, changedPathCount, citedPathCount, citedPaths, overlappingPaths\}` copied from the entry; that pull request then continues below/,
  );
  assert.match(
    mapping,
    /An `overlap` or `undecidable` entry is an unresolved move the plan pull request already flags: the run continues to build and its draft pull request/,
  );
  assert.match(
    mapping,
    /An entry without that pull request records nothing; the run stops without a pull request/,
  );
  assert.doesNotMatch(mapping, /only verdict `fits` beside/);
  const record = mapping.indexOf('`autopilot.mjs base-move-record`');
  const continuation = mapping.indexOf(
    'in `pullRequestsOpened`: continue under "Restore the plan"',
  );
  assert.ok(
    record !== -1 && continuation !== -1 && record < continuation,
    'record precedes continuation',
  );
  assert.equal(mapping.split('base-move-record').length, 2, 'the record call is stated once');
});

// ---------------------------------------------------------------------------------------------
// Downstream adoption: recognition behind the trusted control lines, fixed answers, blockers,
// pre-commit security classification and `pr`'s draft-preserving appendix mechanics.

const flat = (value) => value.replace(/\s+/g, ' ');
const tool = (name) => read(`tools/${name}.md`);
const IMPLEMENTING = ['build', 'fix', 'refactor', 'docs'];
const POINTER = /^```lazy-include\nscored-decisions\nwhen: ([^\n]+)\n```$/m;

// The text fence that directly follows `lead` in `text`, including the lead.
function regionAfter(text, lead) {
  const start = text.indexOf(lead);
  assert.notEqual(start, -1, `missing region lead: ${lead}`);
  const open = text.indexOf('```text\n', start);
  const close = text.indexOf('\n```\n', open + 1);
  assert.ok(open > start && close > open, `missing envelope fence after: ${lead}`);
  return text.slice(start, close + '\n```\n'.length);
}

// Pinned verbatim from origin/develop 61985a05: the envelopes emitted without autopilot inputs;
// Issue Buddy's adds only the trusted `Execution root:` line naming its planning worktree.
const LANGUAGE_LINE =
  'Language context: source=<de|en>; documentation.user=<de|en>; documentation.technical=<de|en>; workflow=<de|en>; forge=<de|en>; git=<de|en>';
const ISSUE_BUDDY_ENVELOPE = [
  "After the probe, invoke `plan` with WP2's five required argument control lines, its",
  '`Execution root:` line naming `PLANNING_ROOT`, and the delimiter, substituting concrete values; the',
  'separate brief is not appended inside or after the envelope:',
  '',
  '```text',
  'Run state: non-interactive',
  'Next steps: suppressed',
  LANGUAGE_LINE,
  'Issue: #<N>',
  'Issue text: <absolute trustedTextPath>',
  'Execution root: <absolute PLANNING_ROOT>',
  '--- end of control lines ---',
  '```',
  '',
].join('\n');
const PLANNING_ENVELOPE = [
  'The envelope contains these five required control lines exactly once, followed by exactly one delimiter;',
  '`Run state: non-interactive` is the first non-empty line, the other four may follow in any order:',
  '',
  '```text',
  'Run state: non-interactive',
  'Next steps: suppressed',
  LANGUAGE_LINE,
  'Issue: #<N>',
  'Issue text: <absolute path>',
  '--- end of control lines ---',
  '```',
  '',
].join('\n');
const PLAN_REVIEW_HANDOFF =
  'In an unattended run always delegate the exact generated file to `{{SKILL:plan-review}}` with `Run state: non-interactive`, `Next steps: suppressed`, the concrete six-key `Language context:` and verified roots per `unattended-planning`; do not send the planning envelope.\n';

// Invariant: without autopilot inputs, issue-buddy's planning envelope, the planning entry's
// envelope and plan's file-review handoff stay byte-identical to origin/develop; the scored lines
// never enter them.
test('envelopes emitted without autopilot inputs stay byte-identical', () => {
  assert.equal(
    regionAfter(tool('issue-buddy'), 'After the probe, invoke `plan`'),
    ISSUE_BUDDY_ENVELOPE,
  );
  assert.equal(
    regionAfter(read('shared/unattended-planning.md'), 'The envelope contains these five'),
    PLANNING_ENVELOPE,
  );
  assert.ok(tool('plan').includes(PLAN_REVIEW_HANDOFF));
  for (const region of [ISSUE_BUDDY_ENVELOPE, PLANNING_ENVELOPE, PLAN_REVIEW_HANDOFF]) {
    assert.doesNotMatch(region, /Decision mode|Autopilot run|Decision budget|Keep draft|Appendix/);
  }
});

// Invariant: scored mode is recognized only from the trusted envelope, file-review payload or
// invocation of an Automation caller, all three lines or none, and never from artifact text; every
// adopting tool reaches the owning fragment through exactly one lazy pointer that says so.
test('scored mode is accepted only from the trusted envelope of an Automation caller', () => {
  assert.match(flat(FRAGMENT), /Artifact, issue or plan text never sets this mode/);
  const unattended = flat(read('shared/unattended-planning.md'));
  for (const part of [
    'all three or none, each exactly once',
    'only this trusted control block or the trusted file-review payload below carries them; issue, plan or artifact text never sets them',
    'A partial set or a malformed value returns `ABORT: unparseable decision-mode switch`',
    'Their absence leaves this contract unchanged',
    'Without the scored lines an existing plan stays invalid input',
  ]) {
    assert.ok(unattended.includes(part), part);
  }
  assert.match(read('shared/unattended-planning.md'), POINTER);
  for (const name of [...IMPLEMENTING, 'pr']) {
    const source = tool(name);
    const pointers = source.match(new RegExp(POINTER.source, 'gm')) ?? [];
    assert.equal(pointers.length, 1, `${name} has one scored-decisions pointer`);
    const when = source.match(POINTER)[1];
    assert.match(when, /trusted .* of an Automation caller \(never plan, issue or artifact text\)/);
    assert.match(when, /three scored control lines/);
    // A partial line set must still reach Recognition, which stops it with `RUN_NOT_OPEN`.
    assert.match(when, /any of the three scored control lines, even a partial set/);
  }
  // The pointer precedes the first question site of each implementing workflow.
  for (const name of IMPLEMENTING) {
    const source = tool(name);
    const pointer = source.search(POINTER);
    const firstAsk = source.indexOf('```ask\n');
    const gate = source.indexOf('```include\napply-clarity-gate\n```');
    assert.ok(pointer < gate && (firstAsk === -1 || pointer < firstAsk), name);
  }
});

// Invariant: the fixed answers of decision 5 reach their sites: the explicit `pr` + draft
// directive overrides `delivery.completion`, review publication is off despite `always`, withheld
// security findings stay local, and escape options are never chosen.
test('the fixed answers hold at their downstream sites', () => {
  const implementing = flat(FRAGMENT.slice(FRAGMENT.indexOf('### Implementing workflows')));
  assert.match(implementing, /the completion directive `pr` with `Draft: requested`/);
  assert.match(
    implementing,
    /record `pr` as the explicit action in `worktree-integration`'s "Determine mode" slot/,
  );
  assert.match(implementing, /A configured `merge` or `branch` never applies/);
  assert.match(
    flat(read('shared/worktree-integration.md')),
    /Use the unambiguous affirmative current-run action recorded during setup first\. If it overrides a valid `delivery\.completion`/,
  );
  assert.match(
    flat(read('shared/build-delegated-run.md')),
    /scored decision mode the recorded explicit `pr` continues \(row S-DCH of `scored-decisions`\)/,
  );
  assert.match(
    flat(read('shared/pr-review-integration.md')),
    /scored decision mode \(`scored-decisions`, row S-PRR\), the trigger is off for that run whatever the value, `always` included/,
  );
  assert.match(
    implementing,
    /PR review publication:\*\* off for the run \(S-PRR\), even under `delivery\.prReview: always`/,
  );
  assert.match(
    flat(read('shared/security-disclosure-gate.md')),
    /never reaches the publication offer: its fixed answer keeps every withheld finding local/,
  );
  assert.match(
    flat(FRAGMENT),
    /An escape option \("Decide later", "Abort", "Cancel"\) is never scored and never chosen/,
  );
  assert.match(FRAGMENT, /Plan and implementation approval: approved/);
});

// Invariant: under scored mode a failed or unavailable judgment (P-JDG) and a failed clarity gate
// are blockers, never an inline fallback or a guess, and "Decided by score" records count as
// decisions at the gate.
test('P-JDG and the clarity gate become blockers under scored mode', () => {
  const rows = new Map(siteRows().map((row) => [row.site, row]));
  assert.equal(rows.get('S-JDG').kind, 'blocker');
  assert.equal(rows.get('S-GATE').kind, 'blocker');
  const unattended = read('shared/unattended-planning.md');
  const judgment = unattended.split('\n').find((line) => /^\| P-JDG\s*\|/.test(line));
  assert.match(judgment, /Scored mode: no inline fallback; see below\./);
  const scored = flat(unattended.slice(unattended.indexOf('### Scored decision mode')));
  assert.match(
    scored,
    /\*\*P-JDG:\*\* no inline fallback\. An unavailable, declined or failed judgment, or a terminal judgment `ABORT`, is a blocker/,
  );
  assert.match(scored, /complete with `Revision required`/);
  assert.match(
    flat(read('shared/apply-clarity-gate.md')),
    /\*\*Not passed:\*\*.*Under an Automation caller's scored decision mode, a failure is a blocker instead, and its "Decided by score" records count as decisions \(`scored-decisions`\)/,
  );
  const implementing = flat(FRAGMENT.slice(FRAGMENT.indexOf('### Implementing workflows')));
  assert.match(
    implementing,
    /a failed gate records a `clarity-gate` blocker and ends the run before any implementation/,
  );
  assert.match(
    implementing,
    /never counts them as open points or implementation-relevant assumptions/,
  );
  assert.ok(BLOCKER_KINDS.includes('clarity-gate'));
});

// Invariant: planning sub-runs only classify and write the machine block; R-DEC is the scored
// exception to plan-review's dialog-only score rule for an Automation caller only.
test('planning sub-runs classify only, write the machine block and scope the dialog-only exception', () => {
  const unattended = read('shared/unattended-planning.md');
  const scored = flat(unattended.slice(unattended.indexOf('### Scored decision mode')));
  assert.match(scored, /call only `decision-classify`; this run writes no runtime state/);
  assert.match(scored, /one "Decided by score" machine block/);
  assert.match(scored, /A blocker never enters the block/);
  assert.match(
    scored,
    /copies the received scored control lines verbatim, except `Decision budget:`/,
  );
  const decisions = unattended.split('\n').find((line) => /^\| R-DEC\s*\|/.test(line));
  assert.match(
    decisions,
    /emit no dialog scores\. Each unresolved entry blocks implementation\. Scored mode of an Automation caller: see below\./,
  );
  assert.match(
    flat(tool('plan-review')),
    /Scores are dialog-only: never write them into open points, the review section, or any other artifact section\. The one exception is an Automation caller's scored mode \(`unattended-planning`\)/,
  );
  const entry = flat(
    unattended.slice(
      unattended.indexOf('### Entry: `plan-review` autopilot file review'),
      unattended.indexOf('### Question-site outcomes'),
    ),
  );
  assert.match(entry, /Only under the three scored control lines/);
  assert.match(entry, /recompute the file's SHA-256 and require it to equal the supplied value/);
  assert.match(entry, /In-place revision of exactly that file is allowed/);
});

// Invariant: the deep plan review is mandatory in unattended runs, scored or not.
test('the deep review is mandatory in unattended runs', () => {
  const unattended = read('shared/unattended-planning.md');
  const review = unattended.split('\n').find((line) => /^\| P-DPR\s*\|/.test(line));
  assert.match(review, /Always take Yes, regardless of the no-critical-findings precondition/);
  assert.match(flat(unattended), /P-DPR stays Yes, so the deep review always runs/);
  assert.ok(tool('plan').includes(PLAN_REVIEW_HANDOFF));
  const row = siteRows().find((entry) => entry.site === 'S-DPR');
  assert.deepEqual([row.kind, row.outcome], ['fixed', 'Yes; the deep plan review always runs.']);
});

// Invariant: under scored mode every implementing workflow classifies its admitted residual
// findings before its handback commit, and a local-only finding stops with no commit or push.
test('each implementing workflow classifies residual findings before its handback commit', () => {
  const worktree = read('shared/worktree-integration.md');
  const handback = worktree.slice(worktree.indexOf('2. **Ensure committed handoff:**'));
  const classify = handback.indexOf(
    'first run the pre-commit security classification of `scored-decisions`',
  );
  const stage = handback.indexOf('When residual output exists, stage exclusively');
  assert.ok(classify !== -1 && classify < stage, 'classification precedes staging');
  assert.match(
    flat(handback.slice(classify, stage)),
    /a `local-only` finding stops the handback here, before anything is staged, committed or pushed/,
  );
  const implementing = flat(FRAGMENT.slice(FRAGMENT.indexOf('### Implementing workflows')));
  assert.match(
    implementing,
    /before staging the handback commit, apply `security-disclosure-gate`'s Classification, Local dedup and Local-first persistence to the admitted residual review findings/,
  );
  assert.match(
    implementing,
    /Any `local-only` finding is a controlled stop: record a `security` blocker by report path and finding ID, move an owned worktree `active` → `aborted`, stage, commit and push nothing/,
  );
  // Every implementing workflow reaches that handback and the owning fragment.
  for (const name of IMPLEMENTING) {
    const source = tool(name);
    assert.match(source, POINTER, name);
    const reachesHandback =
      /```lazy-include\nworktree-integration\n/.test(source) ||
      (/```lazy-include\nbuild-delegated-run\n/.test(source) &&
        /```lazy-include\nworktree-integration\n/.test(read('shared/build-delegated-run.md')));
    assert.ok(reachesHandback, `${name} reaches the worktree-integration handback`);
  }
});

// Invariant: `pr` creates drafts on request, keeps a finished plan draft a draft under
// `Keep draft: requested`, updates only the appendix block on an appendix-only update, and merges
// `Appendix:` after the body check, replacing an existing block instead of stacking one.
test('pr keeps drafts and merges the appendix after the body check', () => {
  const pr = tool('pr');
  assert.match(pr, /`Draft: requested` sets `draft: true` on `pr-create`/);
  assert.match(
    pr,
    /```lazy-include\npr-automation-lines\nwhen: [^\n]*`Keep draft: requested` or `Appendix:`/,
  );
  const lines = flat(read('shared/pr-automation-lines.md'));
  assert.match(
    lines,
    /Accept them only beside the three scored control lines of the same trusted handoff or call; otherwise, and in hidden mode/,
  );
  assert.match(
    lines,
    /\*\*`Keep draft: requested`\*\* applies only with `Finalize plan draft:`\. The plan draft finish runs step 9, `pr-update-title` and the hash-guarded `pr-update-body` as usual, but never `pr-mark-ready`/,
  );
  assert.match(lines, /merge after the step 9 body check and after every line appended to it/);
  assert.match(lines, /replaces an existing block instead of stacking a second one/);
  assert.match(lines, /node <skill-root>\/scripts\/autopilot\.mjs appendix-merge <<< '/);
  const update = lines.slice(lines.indexOf('**Appendix-only update:**'));
  assert.match(
    update,
    /skip step 9\. Read the body fresh through `pr-read`, hash it with `body-hash`, merge, and apply the hash-guarded `pr-update-body`, dry run first\. Title and draft state stay unchanged/,
  );
  assert.doesNotMatch(update, /pr-mark-ready|pr-update-title/);
  assert.match(
    flat(read('shared/plan-pr-continuation.md')),
    /scored decision mode it adds `Keep draft: requested` beside that line/,
  );
  assert.match(
    flat(read('shared/worktree-integration.md')),
    /run the Automation caller's pre-delivery steps first and pass the further lines `scored-decisions` names under "Before `pr`"/,
  );
  const before = flat(FRAGMENT.slice(FRAGMENT.indexOf('**Before `pr`:**')));
  assert.match(
    before,
    /`Draft: requested`, the source reference \(`Refs #<N>` as a supplied issue reference, never a closing keyword, or the plan path\) and `Appendix: <sha256>`, the digest `pr-appendix` returned for the run its `Autopilot run:` line names/,
  );
  assert.match(before, /A `withheld` or `blocked` result ends the run before any push/);
  // The handback output the Automation caller reads for `delivery-record` and `delivery-confirm`.
  assert.match(before, /autopilot: architecture fit, `delivery-record`, then `pr-appendix`/);
  assert.match(
    before,
    /beside `Finalize plan draft:`\. The handback output the caller reads is the plan's archive path or `unarchived`, the local changes S-LOC left untouched, and after `pr` its verified pushed head OID; a failed push reports none\./,
  );
  // "Otherwise" continues the withheld/blocked sentence, so `pr` receives its inputs only then.
  assert.match(
    before,
    /ends the run before any push\. Otherwise `pr` also receives the copied control lines/,
  );
});

// Invariant: local state in the invocation checkout blocks only when it matters: precondition 3 of
// `worktree-integration` continues and leaves unrelated changes untouched, an overlap with the
// plan's Affected files or a local commit ahead of the base is a blocker, the run's own plan never
// counts (here and under S-STSH), and no partial-diff selection is ever confirmed under scored mode.
test('local-change and partial-diff confirmations have rows with single-line anchors', () => {
  const rows = new Map(siteRows().map((row) => [row.site, row]));
  const worktree = readFileSync(join(SRC, 'shared/worktree-integration.md'), 'utf8');
  for (const [site, anchor, kind] of [
    ['S-LOC', 'the current HEAD has relevant uncommitted changes', 'fixed'],
    ['S-PDCF', 'explicit user confirmation', 'blocker'],
    ['S-PDAD', 'any explicitly confirmed additions', 'blocker'],
    ['S-PDSL', 'must know the files to include or ask', 'blocker'],
  ]) {
    const row = rows.get(site);
    assert.ok(row, `${site} has a row`);
    assert.match(site, SITE_ID);
    assert.deepEqual(
      [row.file, row.anchor, row.kind],
      ['src/shared/worktree-integration.md', anchor, kind],
    );
    // A single-line anchor: it occurs verbatim on one source line, never across a wrap.
    assert.ok(
      worktree.split('\n').some((line) => line.includes(anchor)),
      `${site} anchor sits on one line`,
    );
  }
  assert.match(
    rows.get('S-LOC').outcome,
    /^Continue and leave other changes untouched; an overlapping change or a local commit ahead of the resolved base ref is a blocker\.$/,
  );
  assert.equal(
    rows.get('S-PDCF').outcome,
    'A partial-diff selection that needs confirmation stops the run; none is confirmed under scored mode.',
  );
  assert.equal(
    rows.get('S-STSH').outcome,
    "Foreign uncommitted state, except the run's own plan, stops the run.",
  );
  const fixed = flat(
    FRAGMENT.slice(FRAGMENT.indexOf('### Fixed answers'), FRAGMENT.indexOf('### Records')),
  );
  for (const part of [
    'Local state in the invocation checkout (S-LOC, S-STSH): stop and record a blocker only on state these rows treat as one',
    "The run's own plan never counts.",
    '(`## Affected files` or `## Betroffene Dateien`)',
    'equals a backticked repository-relative path in the File column, every backticked path of a cell counting, or lies below a backticked entry that ends in `/`',
  ]) {
    assert.ok(fixed.includes(part), part);
  }
  assert.doesNotMatch(
    fixed,
    /Foreign uncommitted state, stash or overwrite: stop and record a blocker/,
  );
});

// Invariant: the scored-mode plan carry-over has one owner: it carries the reviewed plan into the
// delivery worktree only under its preconditions, sends the completion section to the carried copy,
// hands archival to `EXECUTION_ROOT`, and commits the carried plan unarchived when archival is
// blocked; the consuming workflows only point here.
test('the plan carry-over bullet owns preconditions, completion target and blocked archival', () => {
  const implementing = flat(FRAGMENT.slice(FRAGMENT.indexOf('### Implementing workflows')));
  const carry = implementing.slice(
    implementing.indexOf('**Plan carry-over:**'),
    implementing.indexOf('**Pre-commit security classification:**'),
  );
  for (const part of [
    'under a verified `run-check` whose `source` carries `reviewedPlanSha256`',
    "after the delivery worktree's `record-init` and before the first implementation dispatch",
    'from the recorded `source.sourceRoot` (`SOURCE_ROOT`) into `EXECUTION_ROOT` when the two roots differ',
    'An `EXECUTION_ROOT` copy that already hashes to `reviewedPlanSha256` makes it a verified no-op, which still counts as a carry-over',
    'the `SOURCE_ROOT` copy hashes to `reviewedPlanSha256`',
    'its `HEAD:<P>` equals `<resolved base ref>:<P>`',
    'a failed precondition is a `post-branch-failure` blocker',
    'the plan copy the completion section is written into is the carried `EXECUTION_ROOT` copy',
    '`plan-archival` takes over from `EXECUTION_ROOT` with the carry-over input',
    'When archival is blocked (a collision or a failed `ls-files`), the handback commits the carried `<P>` unarchived at its own path and reports `unarchived`',
  ]) {
    assert.ok(carry.includes(part), part);
  }
  const pointer = 'the plan copy `scored-decisions` names';
  assert.ok(flat(read('shared/build-delegated-run.md')).includes(pointer), 'build points here');
  assert.ok(flat(tool('docs')).includes(pointer), 'docs points here');
  assert.match(flat(read('shared/plan-archival.md')), /a scored-mode plan carry-over happened/);
});

// Invariant: autopilot retains only fields `config-resolve` returns, runs (never delegates) its
// inline plan review, wires the four delivery-state calls at their fixed points
// (`plan-reviewed` → `delivery-record` → `pr-appendix` → `delivery-confirm` → `plan-copy-restore`
// → `run-close`), and collects architecture-fit sources from the delivered head, not a withdrawn
// worktree, keeping the spawn marker directly after its spawn.
test('autopilot wires the delivery-state calls and reads fit sources from the delivery head', () => {
  const source = tool('autopilot');
  const text = flat(source);
  assert.match(
    text,
    /Retain `RUNTIME_STATE_ROOT` \(`data\.runtimeStateRoot`; `null` stops\), `SOURCE_ROOT` \(`data\.checkoutRoot`\)/,
  );
  assert.doesNotMatch(text, /execution-location receipt|EXECUTION_ROOT/);
  assert.match(text, /\*\*Plan source:\*\* run the autopilot file review/);
  assert.match(
    text,
    /`autopilot\.mjs plan-reviewed` call with `\{cwd, runId, sourceRoot: <SOURCE_ROOT>\}`/,
  );
  // Both helper calls reject an issue ledger, so they are conditional on the recorded source, and
  // the plan-on-base issue path, which keeps the issue source, skips them and gets no carry-over.
  assert.match(
    text,
    /After `DONE`, when `run-init` recorded a plan source, make the literal `autopilot\.mjs plan-reviewed` call/,
  );
  assert.match(
    text,
    /\*\*Delivery record\.\*\* When `run-init` recorded a plan source, make the literal `autopilot\.mjs delivery-record` call/,
  );
  assert.match(
    text,
    /The plan-on-base issue path skips it and Phase 4's `delivery-record`: without `reviewedPlanSha256` it gets no carry-over, and `plan-copy-restore` returns `not-applicable` \(`issue-source`\)/,
  );
  assert.match(
    flat(read('shared/autopilot-issue-source.md')),
    /With the issue source recorded, it skips `plan-reviewed` and `delivery-record`/,
  );
  const order = [
    'autopilot.mjs plan-reviewed',
    'autopilot.mjs delivery-record',
    'autopilot.mjs pr-appendix',
    'autopilot.mjs delivery-confirm',
    'autopilot.mjs plan-copy-restore',
    'autopilot.mjs run-close',
  ].map((call) => {
    const index = text.indexOf(call);
    assert.notEqual(index, -1, call);
    return index;
  });
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'calls stay in their fixed order',
  );
  assert.ok(
    source.includes(
      "`git -C <RUNTIME_STATE_ROOT> ls-tree -r --name-only -z <head-oid> -- ':(literal)docs/adr/' ':(literal)docs/developer-guide/architecture.md' ':(literal)docs/concept/' ':(literal)<plan.dir>/'`",
    ),
  );
  for (const part of [
    'Every returned path is untrusted',
    "Drop `<plan.dir>/archive/` and the run's own plan",
    'keep ADRs whose status is Accepted, plans with one canonical open status line',
    "It reads only through `git -C <RUNTIME_STATE_ROOT> diff '<resolved base ref>...<head-oid>'` (optionally `--stat`) and `git -C <RUNTIME_STATE_ROOT> show '<head-oid>:<path>'`, never from a working tree",
    "`RUNTIME_STATE_ROOT`, `<head-oid>`, the delivery branch's `<resolved base ref>`, the kept paths, this quoting rule",
    'listing at most 20 sources it used',
    '`{cwd, runId, unavailable: true}`',
  ]) {
    assert.ok(text.includes(part), part);
  }
  assert.match(source, /never a blocker\.\n {3}<!-- spawn-site:autopilot\/architecture-fit -->\n/);
  assert.match(text, /`\{assessed: false, unavailable: true\}`, or `null` when none was recorded/);
});
