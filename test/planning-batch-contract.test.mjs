import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const section = (text, from, to) => {
  const start = text.indexOf(from);
  assert.notEqual(start, -1, `${from} missing`);
  const end = to === undefined ? text.length : text.indexOf(to, start + from.length);
  return text.slice(start, end === -1 ? text.length : end);
};
const ordered = (text, ...parts) => {
  let at = -1;
  for (const part of parts) {
    const next = text.indexOf(part, at + 1);
    assert.ok(next > at, `${part} missing or out of order`);
    at = next;
  }
};

const rule = read('shared/planning-batch.md');
const ruleFlat = flat(rule);
const plan = read('tools/plan.md');
const planIssue = read('tools/plan-issue.md');
const unattended = read('shared/unattended-planning.md');
const reviewDepth = read('shared/review-depth.md');

const LOADERS = { 'tools/plan.md': plan, 'tools/plan-issue.md': planIssue };
const LOAD_RE = /```(?:lazy-)?include\nplanning-batch\b/g;

// Invariant: the planning-batch rule is defined once and reaches a run only through a lazy pointer
// with a `when:` condition in `plan` and `plan-issue`; no host includes it eagerly or a third time.
test('planning-batch is loaded lazily, once, by exactly plan and plan-issue', () => {
  for (const [name, text] of Object.entries(LOADERS)) {
    assert.match(text, /```lazy-include\nplanning-batch\nwhen: \S[^\n]*\n```/, `${name} pointer`);
    assert.doesNotMatch(text, /```include\nplanning-batch\b/, `${name} must not include eagerly`);
    assert.equal(text.match(LOAD_RE)?.length, 1, `${name} loads once`);
  }
  const srcRoot = new URL('../src/', import.meta.url);
  const others = readdirSync(srcRoot, { recursive: true })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => entry.endsWith('.md') && !(entry in LOADERS));
  assert.ok(others.length > 0, 'no other sources found');
  for (const other of others)
    assert.doesNotMatch(read(other), LOAD_RE, `${other} must not load planning-batch`);
});

// Invariant: the triggers and the floor list stay defined only in `review-depth`; planning-batch
// loads it exactly once, at the ladder's trigger check, and restates neither.
test('planning-batch loads review-depth only at the ladder and copies no trigger or floor text', () => {
  const loads = rule.match(/```(?:lazy-)?include\nreview-depth\b/g) ?? [];
  assert.equal(loads.length, 1);
  assert.match(
    section(rule, '### Planning ladder'),
    /```lazy-include\nreview-depth\nwhen: the batch answers are worked in and the planning ladder's trigger check runs\n```/,
  );
  const floor = section(reviewDepth, 'The boundaries:', 'The list is fixed')
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).replace(/;$|\.$/, ''));
  assert.equal(floor.length, 9);
  for (const item of floor) assert.ok(!ruleFlat.includes(item), `copies floor item ${item}`);
  const triggers = flat(section(reviewDepth, '### Triggers', '### Scoped re-check'));
  for (const [, definition] of triggers.matchAll(/\([a-d]\) ([^—]+) —/g))
    assert.ok(!ruleFlat.includes(definition.trim()), `copies trigger ${definition}`);
  assert.doesNotMatch(ruleFlat, /triggering paths/);
});

// Invariant: Phase 4 incorporates resolvable gaps without asking and defers decision points into
// the open points under one fixed marker per artifact language; Phase 6 does not re-report them.
test('planning-batch defers decision points under a fixed pending marker', () => {
  const deferral = flat(section(rule, '### Deferral', '### Batch round'));
  assert.match(deferral, /incorporates every directly resolvable gap without asking/);
  assert.match(
    deferral,
    /pending marker `Pending batch:` \(German artifact: `Offen bis zur Sammelrunde:`\)/,
  );
  assert.match(deferral, /validation step's decision needs join the batch the same way/);
  assert.match(
    deferral,
    /receives the pending points as known open points and does not report them again as findings/,
  );
  assert.match(
    deferral,
    /critical findings that still need a decision after its revision, join the batch/,
  );
  const phase4 = flat(section(plan, '### Phase 4: Gap analysis', '### Phase 5'));
  assert.match(phase4, /```lazy-include planning-batch when: the Phase 4 gap analysis starts/);
  assert.match(
    phase4,
    /Incorporate directly resolvable gaps and clean up the plan; defer each decision-requiring gap per `planning-batch`/,
  );
  const phase6 = flat(section(plan, '### Phase 6: Plan review', '### Phase 6b'));
  assert.match(
    phase6,
    /receives the pending points as known open points and does not report them again/,
  );
});

// Invariant: plan maps the fragment's generic roles onto its own phases and open-points heading,
// and a decision-requiring Important finding joins the batch instead of a recorded rationale.
test('plan maps the batch roles and batches decision-requiring Important findings', () => {
  const phase4 = flat(section(plan, '### Phase 4: Gap analysis', '### Phase 5'));
  ordered(
    phase4,
    'gap step Phase 4',
    'validation step Phase 5',
    'internal review step Phase 6',
    '`## Open points` / `## Offene Punkte`',
  );
  const approach = flat(
    section(plan, 'Approach:\n\n1. Obtain the review judgment', '### Phase 6b'),
  );
  ordered(
    approach,
    '3. A decision-requiring important finding joins the batch',
    'incorporate the other important findings or document',
    'deliberately not implemented',
  );
});

// Invariant: only the Phase 5 mechanical check accepts points pending the batch; its Phase 7 rerun
// accepts every open point without the marker and converts a marked entry like an unanswered
// point without a new round, and the plan-lint script stays unaware of the marker.
test('only the Phase 5 mechanical check accepts points pending the batch', () => {
  const phase5 = flat(section(plan, '### Phase 5: Plan validation', '### Phase 6'));
  ordered(
    phase5,
    'If a criterion is not met, revise the plan',
    'a missing decision joins the batch',
  );
  const check = phase5.slice(phase5.indexOf('**Mechanical check:**'));
  ordered(
    check,
    'here it may hold points pending the batch',
    'the Phase 7 rerun accepts every open point without the pending marker',
    'deferred by the user',
    'left open by the batch round',
    'written blocking by an unattended site',
    'still carrying the marker is converted like an unanswered point',
    'a concrete open point (blocking in an unattended run) with a re-entry note',
    'its marker removed, without a new round',
  );
  const outsideCheck = plan.replace(section(plan, '**Mechanical check:**', '\n### Phase 6'), '');
  assert.doesNotMatch(
    flat(outsideCheck),
    /may hold points pending the batch|accepts every open point/,
  );
  for (const script of ['plan-lint.mjs', 'plan-lint-core.mjs'])
    assert.doesNotMatch(read(`scripts/${script}`), /Pending batch|Sammelrunde/, script);
});

// Invariant: all pending points reach the user in one round after the internal review, before
// completion and before the deep review is offered, in plan-review's Phase 3 decision format.
test('the batch round runs once after Phase 6 and before Phase 6b', () => {
  const round = flat(section(rule, '### Batch round', '### Planning ladder'));
  ordered(
    round,
    'After the internal review step, every pending point reaches the user in one round',
    'before completion and before the deep review is offered',
    '`{{SKILL:plan-review}}` Phase 3 decision format',
  );
  assert.match(round, /Consecutive ask calls with no analysis in between count as one round/);
  assert.match(round, /With no pending point there is no round/);
  assert.match(round, /Before completion no entry keeps the pending marker/);
  assert.match(read('tools/plan-review.md'), /### Phase 3: Clarify decisions/);
  const approach = flat(
    section(plan, 'Approach:\n\n1. Obtain the review judgment', '### Phase 6b'),
  );
  ordered(
    approach,
    '5. If critical findings still remain after the revision, they join the batch',
    'do not report the plan ready while one stays undecided',
    '6. Run the batch round and the planning ladder per `planning-batch` before Phase 6b',
  );
});

// Invariant: an undecided Critical point, from the first or the second round, can never be
// downgraded; it ends as a blocking open point with `Revision required`, no interactive
// deep-review offer, and a plan that is still written and reported through the open-points row,
// which every `Revision required` result or blocking count takes, whatever phase produced it.
test('an undecided Critical point ends as a blocking open point with Revision required', () => {
  const answers = flat(section(rule, 'An answered point', '### Planning ladder'));
  ordered(
    answers,
    'classifies as Critical, a gap-step point included, stays blocking and is never downgraded',
    'left undecided, it becomes a blocking open point',
    'the review result is `Revision required`',
    'in an interactive run the deep review is not offered',
    'the completion phase still writes and reports the artifact with its open points',
  );
  assert.match(flat(rule), /an undecided Critical one stays blocking as above/);
  assert.doesNotMatch(flat(plan), /do not complete the plan while/);
  assert.match(
    flat(section(plan, '### Phase 7: Completion', '\n## ')),
    /Any `Revision required` result or nonzero blocking open-point count, whether from Phase 6, the batch or the deep review, takes the open-points row, not the ready one/,
  );
});

// Invariant: the planning ladder maps answers to no judgment, a scoped or a full internal review;
// late decision points become open points and only a new Critical finding opens one bounded second
// round.
test('the planning ladder sets judgment depth and bounds further rounds', () => {
  const answers = flat(section(rule, 'An answered point', '### Planning ladder'));
  assert.match(answers, /incorporated into its artifact section and its open-points entry removed/);
  assert.match(
    answers,
    /An unanswered point or "Decide later" becomes a concrete open point with a re-entry note/,
  );
  const ladder = flat(section(rule, '### Planning ladder'));
  assert.match(
    ladder,
    /only triggers \(a\) to \(d\) and the floor boundaries apply, to plan sections instead of files/,
  );
  assert.match(ladder, /\(b\) is an answer that changed a section naming a floor boundary/);
  ordered(
    ladder,
    '- no trigger: no new judgment',
    '- (a), (c) or (d): a scoped internal-review judgment of the changed sections',
    '- (b): a full internal-review judgment',
    'becomes an open point without a new round',
    'only a new Critical finding opens a second round',
    'no third round follows',
  );
});

// Invariant: the user-requested-depth rule is defined once, in planning-batch, and both planning
// tools visibly label their deep review with it while the P-DPR line and ask fences stay intact.
test('plan and plan-issue label the deep review as user-requested depth', () => {
  const coverage = flat(section(rule, '### Default coverage', '### Deferral'));
  ordered(
    coverage,
    'the deep review (`{{SKILL:plan-review}}`) is user-requested depth',
    'offered only after the batch round and its ladder, never run as a default step',
  );
  assert.match(coverage, /explicit request for a full re-review or for the deep review is honored/);
  const phase6b = section(plan, '### Phase 6b: Deep interactive plan review', '### Phase 7');
  assert.match(phase6b, /This review is user-requested depth \(`planning-batch`\)\./);
  assert.ok(
    phase6b.includes(
      '\nask the user whether the deep interactive plan review should be started now.\n\n```ask\nheader: Plan review\n',
    ),
  );
  const gate = flat(section(planIssue, '### Phase 4: Persist', '### Phase 5'));
  ordered(
    gate,
    '4. This review is user-requested depth (`planning-batch`).',
    'With a baseline that has no critical findings, ask for this issue only:',
    '```ask header: Plan review',
  );
  for (const host of [plan, planIssue])
    assert.doesNotMatch(flat(host), /honored as user-requested depth|never run as a default step/);
});

// Invariant: a revision's post-move questions are limited to those it does not owe — the batch
// round with its bounded second round, the deep review and publication — each leaving the moved
// plan valid on a decline or "Decide later".
test('a revision admits the batch round among the post-move question exceptions', () => {
  const rule1 = flat(
    section(plan, '- **Ask everything before the move', '- Perform that move back'),
  );
  ordered(
    rule1,
    'The exceptions are the `planning-batch` round with its bounded second round',
    "Phase 6b's deep-review question",
    'Phase 7 publication question',
    'after the move a decline or "Decide later" leaves the moved plan valid, with open points',
  );
});

// Invariant: plan-issue maps its baseline steps onto the batch roles and holds one batch round
// between steps 3 and 4 for the active issue, with no tracker write before Phase 4.
test('plan-issue holds one batch round between Phase 3 steps 3 and 4', () => {
  const phase3 = section(
    planIssue,
    '### Phase 3: Automatic quality baseline per issue',
    '### Phase 4',
  );
  ordered(
    flat(phase3),
    'steps 1, 2 and 3 are its gap, validation and internal review steps',
    '(`{{SKILL:plan}}` Phases 4, 5 and 6)',
    'open-points section holds the pending points',
  );
  assert.match(flat(phase3), /defer decision-requiring ones per `planning-batch`/);
  assert.match(flat(phase3), /remaining decision-requiring findings join the batch/);
  ordered(
    phase3,
    '\n3. Obtain the internal plan-review judgment',
    '\nThen run the batch round and its ladder for this issue only',
    '\n4. Normalize the active comment',
  );
  const round = flat(section(phase3, 'Then run the batch round', '4. Normalize'));
  assert.match(round, /no tracker write before Phase 4/);
  assert.match(round, /unanswered points and "Decide later" become open points that feed step 6/);
});

// Invariant: an unattended run holds no batch round; P-VAL and P-CRT feed the batch, and P-BAT
// turns every pending point into a blocking open point before P-DPR, forcing `Revision required`
// only when one exists; the P-DPR row stays unchanged.
test('unattended planning converts the batch into blocking open points before P-DPR', () => {
  const rows = new Map(
    unattended
      .split('\n')
      .filter((line) => /^\| [PR]-[A-Z]+\s*\|/.test(line))
      .map((line) => {
        const cells = line.split('|').map((cell) => cell.trim());
        return [cells[1], { file: cells[2], anchor: cells[3], outcome: cells[4] }];
      }),
  );
  const order = [...rows.keys()];
  assert.ok(order.indexOf('P-BAT') > order.indexOf('P-CRT'));
  assert.ok(order.indexOf('P-BAT') < order.indexOf('P-DPR'));
  const bat = rows.get('P-BAT');
  assert.equal(bat.file, 'src/shared/planning-batch.md');
  assert.ok(rule.includes(bat.anchor));
  ordered(
    bat.outcome,
    'No batch round or ladder',
    'Before P-DPR, each pending point becomes a blocking open point',
    'options, a recommendation and a re-entry note, marker removed',
    'P-DPR acts on these open points',
    'If any exists, complete with `Revision required`',
  );
  ordered(
    rows.get('P-VAL').outcome,
    'joins the batch as a pending point that P-BAT converts',
    'Mechanical lint failures still abort',
  );
  assert.match(rows.get('P-CRT').outcome, /joins the batch as a pending point that P-BAT converts/);
  for (const site of ['P-VAL', 'P-CRT']) assert.ok(plan.includes(rows.get(site).anchor), site);
  assert.deepEqual(rows.get('P-DPR'), {
    file: 'src/tools/plan.md',
    anchor: 'header: Plan review',
    outcome:
      'Always take Yes, regardless of the no-critical-findings precondition, after P-CRT records open points. Delegate the exact generated file with the file-review payload and verified roots, never the planning envelope.',
  });
});
