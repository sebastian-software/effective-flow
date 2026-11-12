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

const rule = read('shared/review-depth.md');
const ruleFlat = flat(rule);
const delegatedRun = read('shared/build-delegated-run.md');
const fix = read('tools/fix.md');
const refactor = read('tools/refactor.md');
const runContract = read('shared/build-run-contract.md');

const LOADERS = {
  'shared/build-delegated-run.md': delegatedRun,
  'tools/fix.md': fix,
  'tools/refactor.md': refactor,
};

const FLOOR = [
  'security, authentication and authorization',
  'secrets and credentials',
  'data protection and personal data',
  'persistence, schema and migrations',
  'destructive or irreversible data operations',
  'money and billing',
  'public API and cross-module contracts',
  'dependency manifests and lockfiles',
  'CI, release and delivery configuration',
];

// Invariant: the four full-pass triggers and the paths each one widens to are defined once, so a
// removed trigger or a widened scope (a full pass repeating the whole review) fails here.
test('review-depth defines triggers (a) to (d) with their triggering paths', () => {
  const triggers = flat(section(rule, '### Triggers', '### Scoped re-check'));
  assert.match(
    triggers,
    /\(a\) it changed a file that no corrected finding named — triggering paths: those unnamed files/,
  );
  assert.match(
    triggers,
    /\(b\) it touched a floor boundary[^;]*— triggering paths: the floor-hit files/,
  );
  assert.match(
    triggers,
    /\(c\) the scoped re-check cannot confirm a corrected finding as resolved — triggering paths: that finding's files/,
  );
  assert.match(
    triggers,
    /\(d\) it changed a recorded assumption, an acceptance criterion, an architecture decision, or public behavior — triggering paths: the files that carry the changed contract or behavior/,
  );
  assert.match(triggers, /on those paths only/);
  assert.match(triggers, /never repeats the whole review/);
});

// Invariant: the re-check report always has its three parts, and an admission-`uncertain`
// residual never buys an extra pass; the qualifier keeps that rule off the floor's `uncertain`.
test('review-depth scoped re-check reports three parts and keeps uncertain without an extra pass', () => {
  const recheck = flat(section(rule, '### Scoped re-check', '### Fixed floor'));
  assert.match(recheck, /\*\*Changed areas:\*\*/);
  assert.match(recheck, /\*\*Verified findings:\*\*/);
  assert.match(recheck, /\*\*Open evidence:\*\*/);
  assert.match(recheck, /unconfirmed corrected finding is trigger \(c\)/);
  assert.match(
    recheck,
    /finding outside the changed areas names the trigger or floor boundary that justifies it/,
  );
  assert.match(
    recheck,
    /An admission-`uncertain` residual keeps its bounded evidence check and its stop or block; it starts no extra pass/,
  );
});

// Invariant: without the review-input tree there is no scoped path; the fallback is a full pass on
// the cumulative path list with a recorded reason. A failed render, including a delta render
// refused after a successful cumulative one, stops the step (fail closed) and is never read as an
// unavailable review-input tree.
test('review-depth falls back to a full pass when the review-input tree is unavailable', () => {
  const delta = flat(section(rule, '### Delta render', '### Triggers'));
  assert.match(delta, /`reviewTree`/);
  assert.match(delta, /`sinceTree: reviewTree`/);
  assert.match(delta, /cumulative diff first/);
  assert.match(
    delta,
    /Only when no `reviewTree` was retained is the review-input tree unavailable\. Then there is no scoped path/,
  );
  assert.match(
    delta,
    /every affected routed reviewer runs a full pass on the cumulative path list/,
  );
  assert.match(delta, /record the reason/);
  assert.match(delta, /failed render stops the step/);
  assert.match(
    delta,
    /a delta render refused after a successful cumulative render is a failed render too/,
  );
  assert.match(delta, /empty delta/);
});

// Invariant: the post-incorporation sequence is stated once, in order, in the fragment, so load
// sites need not restate it.
test('review-depth states the re-check sequence in order in Default coverage', () => {
  const coverage = flat(section(rule, '### Default coverage', '### Delta render'));
  assert.match(
    coverage,
    /run once, in this order: the cumulative and delta render, the floor classification, the scoped re-check, and a full pass only on the paths a trigger or floor hit widens/,
  );
});

// Invariant: every uncorrected-by-later-review correction is classified per path from path and
// hunks, with `uncertain` failing closed, and the record goes into the review results.
test('review-depth classifies each changed path and fails closed on uncertain', () => {
  const floor = flat(section(rule, '### Fixed floor'));
  assert.match(floor, /no later review covers/);
  assert.match(
    floor,
    /classify each changed path from its path \*\*and\*\* its hunks in the delta patch/,
  );
  assert.match(floor, /the boundary hit, `none`, or `uncertain`/);
  assert.match(floor, /A floor classification of `uncertain` counts as a hit \(fail closed\)/);
  assert.match(floor, /never `none`/);
  assert.match(floor, /classification record goes into the loading workflow's review results/);
  assert.match(floor, /A hit is trigger \(b\)/);
});

// Invariant: the fixed floor lists exactly nine boundaries; dropping or adding one is a
// deliberate rule change that must update this test.
test('review-depth floor lists exactly the nine fixed boundaries', () => {
  const floor = section(rule, 'The boundaries:', 'The list is fixed');
  const items = floor
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).replace(/;$|\.$/, ''));
  assert.deepEqual(items, FLOOR);
  assert.match(
    ruleFlat,
    /The list is fixed: changing it is a deliberate rule change, never a per-run reviewer judgment/,
  );
});

// Invariant: the rule is a lazy fragment defined once; hosts load it behind a `when:` condition
// and never include it eagerly or copy its text.
test('review-depth is loaded only through a lazy-include with a when line and never copied', () => {
  for (const [name, text] of Object.entries(LOADERS)) {
    assert.match(
      text,
      /```lazy-include\nreview-depth\nwhen: \S[^\n]*\n```/,
      `${name} lazy-include`,
    );
    assert.doesNotMatch(text, /```include\nreview-depth\b/, `${name} must not include eagerly`);
    assert.equal(
      text.match(/```(?:lazy-)?include\nreview-depth\b/g)?.length,
      1,
      `${name} loads once`,
    );
    const copied = flat(text);
    for (const item of FLOOR)
      assert.ok(!copied.includes(item), `${name} copies floor item ${item}`);
    assert.doesNotMatch(copied, /fail closed/, `${name} copies the classification rule`);
    assert.doesNotMatch(
      copied,
      /never repeats the whole review/,
      `${name} copies the trigger rule`,
    );
    assert.doesNotMatch(copied, /on its own paths only/, `${name} copies the full-pass scope`);
    assert.doesNotMatch(
      copied,
      /cumulative and delta render/,
      `${name} copies the re-check sequence`,
    );
  }
  // No source outside the three loaders may load it, eagerly or lazily.
  const srcRoot = new URL('../src/', import.meta.url);
  const others = readdirSync(srcRoot, { recursive: true })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => entry.endsWith('.md') && !(entry in LOADERS));
  assert.ok(others.length > 0, 'no other sources found');
  for (const other of others) {
    assert.doesNotMatch(
      read(other),
      /```(?:lazy-)?include\nreview-depth\b/,
      `${other} must not load review-depth`,
    );
  }
});

// Invariant: `fix` starts no reviewer re-check without a floor hit or trigger; the orchestrator
// writes the three-part report, and a hit, trigger or missing tree starts the generic reviewer.
test('fix re-checks without a reviewer unless a floor hit or trigger starts generic-product-reviewer', () => {
  const verification = flat(section(fix, '2. Then render the diff baseline', '```lazy-include'));
  assert.match(verification, /retain its `currentTree` as `reviewTree`/);
  assert.match(
    verification,
    /after the incorporation pass, on a `review-depth` floor hit or trigger, or when `reviewTree` is unavailable: `\{\{AGENT:generic-product-reviewer\}\}` with its reduced-depth notice for the full pass/,
  );
  assert.match(
    verification,
    /When `reviewTree` is unavailable, this reviewer also stands in for the routed reviewers/,
  );
  const incorporation = flat(
    section(fix, 'If findings or residual risks arise', 'Then pass the residual batch'),
  );
  assert.match(
    incorporation,
    /apply `review-depth` without a reviewer re-check unless a floor hit or trigger starts step 2's full-pass reviewer on its triggering paths/,
  );
  assert.match(
    incorporation,
    /the orchestrator runs both renders, classifies the floor, and writes the three-part report itself/,
  );
  assert.match(
    incorporation,
    /from the delta render, the corrected findings with their evidence, and the open evidence/,
  );
  assert.match(
    flat(fix),
    /Phase 4 report carries the floor classification record and the three-part report/,
  );
  assert.match(fix, /```lazy-include\nreview-depth\nwhen: Phase 4 /);
});

// Invariant: the delegated build keeps the review-input tree, classifies later corrections and
// containments against the floor, and reports the classification with the review results.
test('build-delegated-run retains reviewTree, floors step 3 corrections and records the classification', () => {
  const phase6 = section(delegatedRun, '### Phase 6: Review', '**Review results**');
  const flat6 = flat(phase6);
  const step1 = flat(section(phase6, '1. Render the diff baseline', '2. Aggregate'));
  assert.match(step1, /Retain this render's `currentTree` as `reviewTree`/);
  assert.match(
    step1,
    /floor hit on a tooling or CI path goes to `\{\{AGENT:generic-product-reviewer\}\}`/,
  );
  const step2 = flat(section(phase6, '2. Aggregate all review findings', '3. Send the residual'));
  assert.match(step2, /exactly one automatic incorporation pass/);
  assert.match(step2, /re-run the affected review checks once per `review-depth`\./);
  const step3 = flat(section(phase6, '3. Send the residual', '4. Assign each finding'));
  assert.match(
    step3,
    /`current-scope`: correct or safely contain it now[^:]*then render again and classify that correction or containment against the `review-depth` floor before accepting it/,
  );
  const step5 = flat(section(phase6, '5. Present the review results', '```markdown'));
  assert.match(
    step5,
    /followed by the `review-depth` floor classification record and re-check report/,
  );
  assert.match(
    flat6,
    /```lazy-include review-depth when: [^`]*a step 3 correction or containment is about to be accepted/,
  );
});

// Invariant: the delegated `independent-review` receipt judges the content Phase 6 finally
// leaves, so a step 3 correction or containment after the incorporation pass cannot make it drift
// from the completion basis; it is issued only after every floor pass, those of step 3 included.
test('build-run-contract issues independent-review after every floor pass, on the final Phase 6 content', () => {
  assert.match(
    flat(runContract),
    /Issue `independent-review` only after the Phase 6 scoped re-check and every `review-depth` floor pass, including those for step 3 corrections and containments, bound to the content Phase 6 leaves after its last accepted correction/,
  );
  assert.doesNotMatch(flat(runContract), /post-incorporation content/);
});

// Invariant: `refactor` runs the scoped re-check through its routed reviewers, applies the floor,
// and records the classification and re-check report in its Phase 4 step 3 results.
test('refactor applies the scoped re-check and floor and records them in Phase 4 step 3', () => {
  const phase4 = section(refactor, '### Phase 4: Review', '### Phase 5: Post-validation');
  const step1 = flat(section(phase4, '1. Render the diff baseline', '2. Aggregate'));
  assert.match(step1, /Retain this render's `currentTree` as `reviewTree`/);
  assert.match(
    step1,
    /floor hit on a tooling or CI path goes to `\{\{AGENT:generic-product-reviewer\}\}`/,
  );
  const step2 = flat(section(phase4, '2. Aggregate findings', '3. Present'));
  assert.match(step2, /once per `review-depth`, with the scoped re-check by the routed reviewers/);
  const step3 = flat(section(phase4, '3. Present the review results', 'provisional until'));
  assert.match(step3, /the `review-depth` floor classification record and the re-check report/);
  assert.match(phase4, /```lazy-include\nreview-depth\nwhen: /);
});

// Invariant: implementation full-pass senders use the receiver's explicit exception and give
// concrete paths with confirmed routes; otherwise a specialist/tooling scope is rejected or
// silently widened. Fix alone substitutes the whole cumulative list for a missing reviewTree.
for (const [name, workflow, phase] of [
  ['fix', fix, '### Phase 4: Verification'],
  ['build', delegatedRun, '### Phase 6: Review'],
  ['refactor', refactor, '### Phase 4: Review'],
]) {
  test(`${name} full-pass assignment matches the generic reviewer's bounded scope contract`, () => {
    const receiver = flat(read('agents/generic-product-reviewer.md'));
    assert.match(
      receiver,
      /for an explicit bounded implementation full-pass assignment from `effective-flow fix`, `effective-flow build`, or `effective-flow refactor`, accept only the supplied paths and their confirmed routes/,
    );
    const assignment = flat(section(workflow, phase, '```lazy-include'));
    assert.match(
      assignment,
      new RegExp(
        'explicit bounded implementation full-pass assignment[^;]*from `\\{\\{SKILL:' +
          name +
          '\\}\\}`',
      ),
      'the sender explicitly invokes the receiving workflow exception',
    );
    assert.match(assignment, /reduced-depth notice/);
    assert.match(assignment, /path list and each path's confirmed route/);
    if (name === 'fix') {
      assert.match(assignment, /floor hit or trigger, or when `reviewTree` is unavailable/);
      assert.match(assignment, /supply only its triggering path list/);
      assert.match(
        assignment,
        /When `reviewTree` is unavailable[^;]*stands in for the routed reviewers; give it the full cumulative path list and confirmed routes under the same explicit assignment/,
      );
    } else {
      assert.match(assignment, /supply only the floor-hit tooling\/CI path list/);
      assert.doesNotMatch(assignment, /full cumulative path list/);
    }
  });
}
