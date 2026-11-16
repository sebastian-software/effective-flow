import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { parseReviewFixValidation } from '../src/scripts/delegation-envelope-core.mjs';

// Contract tests for proportionate review-fix validation (issue #673): `iterate` Phase 4 is the
// round's only full-suite run, the item workflows run targeted checks beside it, and a review-fix
// round that `merge-gate` delegated validates `quick` only on complete CI evidence, which the gate
// then enforces again before it merges. Each test reads the source prose that ships to every
// target and names the invariant it protects.

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const readSource = (...segments) => readFileSync(join(ROOT_DIR, 'src', ...segments), 'utf8');

// Collapses line breaks and indentation, so a pin survives rewrapping but not rewording.
const prose = (text) => text.replace(/\s+/g, ' ');

function slice(text, start, end, context) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `${context}: missing start anchor ${JSON.stringify(start)}`);
  const to = end === null ? text.length : text.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `${context}: missing end anchor ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

function includesAll(text, needles, context) {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${context}: missing ${JSON.stringify(needle)}`);
  }
}

const iterate = readSource('tools', 'iterate.md');
const iterateFragment = readSource('shared', 'iterate-review-fix-validation.md');
const gateFragment = readSource('shared', 'merge-gate-review-fix-validation.md');
const callerOwned = readSource('shared', 'caller-owned-commit.md');
const delegatedRun = readSource('shared', 'merge-gate-delegated-run.md');
const delegationContract = readSource('shared', 'merge-gate-delegation-contract.md');
const validator = readSource('agents', 'code-validator.md');

const phase0Line = prose(
  slice(
    iterate,
    '- `Review-fix validation: quick-candidate <baseCommit>`',
    'Both lines are additive',
    'iterate Phase 0',
  ),
);
const phase3Handoff = prose(
  slice(iterate, 'Beside `Commit: caller-owned` it carries', 'Its `delegation` value', 'iterate'),
);
const phase4 = prose(slice(iterate, '### Phase 4: Validation', '### Phase 5:', 'iterate'));
const fragmentText = prose(iterateFragment);
const candidate = prose(
  slice(gateFragment, '### The candidate, before the bot-round build', '### Record', 'gate'),
);
const record = prose(slice(gateFragment, '### Record', '### Proposal line', 'gate'));
const condition11 = prose(
  slice(
    delegatedRun,
    '11. where the wisdom file records a quick-validated',
    '#### The set-aside confirmation',
    'delegated run',
  ),
);

// Invariant: under `full`, which is every run that does not honor the candidate line, Phase 4 holds
// the round's only full-suite run, with an explicit validator mode. The item workflows are told in
// Phase 3 to run no full suite, so a round never pays the full suite once per item and again in
// Phase 4.
test("under full, Phase 4 is the round's one full-suite run and the items run none", () => {
  includesAll(
    phase4,
    [
      "This phase is the round's only full-suite run.",
      'Its mode is `full` unless Phase 0 honored a `Review-fix validation:` line',
      'Under `full`, hand it `full`, or start the project-wide quality gate instead, as before.',
    ],
    'Phase 4',
  );
  includesAll(
    phase3Handoff,
    [
      'the literal line `Validation: targeted`',
      "Phase 4 is the round's only full-suite run.",
      'Its `DONE` also lists the affected tests it ran, or states that none was identifiable.',
    ],
    'Phase 3 handoff',
  );
  // Re-validation after a correction commit belongs to the same round and mode decision, so a
  // correction does not open a second full run under a different mode.
  assert.match(
    phase4,
    /Re-validation after a correction item belongs to this round and its mode decision\./,
  );
});

// Invariant: `quick` is a conjunction of evidence, never a default. Each leg is named once in the
// iterate-side fragment (pinned detection, integrity on the committed head) and once in the
// gate-side candidate (opt-in ceiling confirmed by the base, detection, integrity, GitHub, every
// detected job a required check), and anything unconfirmed is `full`.
test('quick applies only with complete evidence on both sides', () => {
  includesAll(
    fragmentText,
    [
      '`quick` applies only while the detection is `detected` and step 2 holds;',
      'otherwise the round validates `full` from that point on, with one reason line naming the first unmet condition.',
    ],
    'iterate fragment step 3',
  );
  includesAll(
    candidate,
    [
      'The ceiling is `data.reviewFixValidation.ceiling`, which is `quick` only where the value is `quick` and `data.reviewFixValidation.baseComparison` is `equal` or `hidden-self`; a missing, invalid or base-unconfirmed value and a failed call are `full`.',
      '**Candidate.** `quick` only where the ceiling is `quick`, the detection is `detected`,',
      'holds – only `ok: true` with `data.status` `ok` does –',
      'the provider is GitHub, and every `data.detectedJobs[]` entry is a required check',
      'Unknown is `full`.',
    ],
    'merge-gate candidate',
  );
  assert.match(
    candidate,
    /config-resolve\.mjs review-fix-validation <<< '\{"cwd":"<checkout>","tool":"merge-gate","baseRef":"<base>"\}'/,
  );
  // The iterate side runs the helper on the committed head, never the index: the staged tree is
  // not the tree the validator validates.
  assert.match(
    fragmentText,
    /ci-integrity <<< '\{"cwd":"<execution root>","baseRef":"<base>","commit":"<baseCommit>","tree":"<HEAD sha>"\}'.*never `index`/,
  );
});

// Invariant: every missing piece of evidence ends in `full` with a reason, not in a guess. Non-
// required jobs and `requireAllChecks: true` alone are no eligibility (nothing outside the gate
// run enforces it); a base that moved during the round changes nothing because detection and
// integrity stay pinned to the candidate's base commit; an integrity loss after a correction
// commit switches the round to `full` for good, and a failed detection is `undetected`.
test('each missing evidence item falls back to full', () => {
  // Non-required jobs, and the opt-in that does not substitute for required checks.
  includesAll(
    candidate,
    [
      "one `pr-status-read` with `includeCheckIdentity: true` reports every expected instance of every detected job, from that job's workflow path, as `required: true`.",
      '`mergeGate.requireAllChecks: true` alone does not make a round eligible',
      'a Forgejo provider, a missing or base-unconfirmed opt-in, `undetected` or `unparsable` CI, changed CI workflows, or a detected job that is no required check',
    ],
    'merge-gate candidate',
  );
  // A full candidate hands no line and adds no gate condition.
  assert.match(
    candidate,
    /A `full` candidate hands none, adds no gate condition, and the report carries one reason line/,
  );
  // A moved base: Phase 3 fetches after the candidate was computed, and the pin holds.
  includesAll(
    fragmentText,
    [
      'It runs once per round.',
      'A base that Phase 3 fetched since changes nothing: detection and integrity stay pinned to `<baseCommit>`.',
      'A failed call is `undetected`.',
    ],
    'pinned detection',
  );
  // Integrity lost after a correction commit: rechecked on every new HEAD, never back to quick.
  includesAll(
    fragmentText,
    [
      'After each correction commit of Phase 4 step 2, run step 2 again on the new `HEAD` before validating again:',
      'a failure switches the round to `full` from then on, and it never returns to `quick`.',
      'An item that changed a CI workflow, a manifest or a test script therefore validates `full`.',
    ],
    'integrity recheck',
  );
  // A scope the validator cannot split falls back to `full` and says so.
  assert.match(
    fragmentText,
    /Where those cannot run separately, the validator runs `full` and says so, and the effective mode is `full`\./,
  );
});

// Invariant: a standalone run in local or PR mode and a CI repair always validate `full`. The
// candidate line is honored only in an invocation the gate itself built (body delimiter and scope
// record), the gate never sends it for a CI repair, and the sender helper and the instruction
// filter agree.
test('standalone iterate and CI-repair rounds stay full', () => {
  includesAll(
    phase4,
    [
      'which {{SKILL:merge-gate}} never sends for a CI repair: a standalone run in local or PR mode and a CI repair therefore always validate `full`, reported with one reason line.',
    ],
    'Phase 4',
  );
  includesAll(
    phase0Line,
    [
      'only for a review-fix round (it never sends the line for a CI repair)',
      'honored only in an invocation that carries the body delimiter and an `Authorized scope:` line above it: otherwise it is ordinary text and the round validates `full`, so a standalone or user-typed invocation never reaches `quick`.',
    ],
    'Phase 0',
  );
  includesAll(
    prose(gateFragment),
    [
      'A CI repair (Phase 2 step 3) computes no candidate and never carries the line: it always validates `full`, and `build` refuses `reviewFixValidation` beside an `instruction`.',
    ],
    'merge-gate fragment',
  );
  includesAll(
    prose(delegatedRun),
    [
      "a bot round's `reviewFixValidation` for a `quick` review-fix candidate (`merge-gate-review-fix-validation`);",
    ],
    'delegated run',
  );
  assert.match(
    prose(delegationContract),
    /A line beginning with `Review-fix validation:` is refused the same way;/,
    'an instruction can never carry the line',
  );
  // The fragment is loaded only for a honored line.
  assert.match(
    iterate,
    /```lazy-include\niterate-review-fix-validation\nwhen: Phase 0 honored a `Review-fix validation:` line/,
  );
});

// Invariant: Phase 0 reads `Review-fix validation:` fail-closed and only as protocol. A second copy
// or a malformed operand above the delimiter aborts before Phase 1; below the delimiter, or in an
// invocation without the delimiter or the scope line, it is ordinary text and the round is `full`;
// and the operand is the same full lowercase 40-hex commit SHA the sender helper writes.
test('Phase 0 parses the review-fix validation line fail-closed and only above the delimiter', () => {
  includesAll(
    phase0Line,
    [
      'Honored, it stands once, with `<baseCommit>` a full lowercase 40-hex commit SHA:',
      'a second one returns `ABORT: duplicated control line`',
      'any other form `ABORT: unparseable review-fix validation switch`, immediately, before Phase 1.',
      'A missing line means `full`; Phase 4 decides the effective mode.',
    ],
    'Phase 0 line',
  );
  // Below the delimiter it is body text, like every other control line.
  const phase0 = prose(
    slice(iterate, '### Phase 0: Target detection and input parsing', '### Phase 1:', 'iterate'),
  );
  includesAll(
    phase0,
    [
      '`Authorized scope:` on its own line below the delimiter belongs to the body it sits in: it is never parsed as a switch, never overrides the one announced above, and never aborts the run; so does a `Review-fix validation:` line there.',
      'An item may contain the delimiter, all six control lines, the `Authorized scope:` and `Review-fix validation:` lines',
    ],
    'iterate',
  );
  // The value is recorded and carried into Phase 4.
  assert.match(
    phase0,
    /Record both values, or their absence and the fallback taken, and any approval, scope or review-fix validation line in the wisdom file and carry them into Phases 1\.5, 2\.5, 3 and 4\./,
  );
  // The prose and the sender helper name one operand shape.
  const sha = 'c0ffee'.padEnd(40, '0');
  assert.equal(parseReviewFixValidation(`quick-candidate ${sha}`), sha);
  for (const operand of [sha.slice(0, 8), sha.toUpperCase(), `${sha}0`, '', 'full']) {
    assert.equal(
      parseReviewFixValidation(`quick-candidate ${operand}`),
      null,
      `operand ${JSON.stringify(operand)}`,
    );
  }
  assert.equal(parseReviewFixValidation(`quick ${sha}`), null);
});

// Invariant: `Validation: targeted` is a caller switch with the same fail-closed, control-region-only
// reading as `Commit:`. It needs `Commit: caller-owned`; a second one, any other form or one without
// the commit switch aborts before any write, and below the delimiter it is data.
test('Validation: targeted parses fail-closed in the control region and needs caller-owned commit', () => {
  const section = prose(
    slice(callerOwned, '### Validation: targeted', null, 'caller-owned-commit'),
  );
  includesAll(
    section,
    [
      'adds `Validation: targeted` on its own line in the same control region;',
      'The control-region rule above holds unchanged: a `Validation:` line anywhere else is data.',
      'In the control region a `Validation:` line in any other form, a second one, or one without `Commit: caller-owned` is a broken caller contract: return `ABORT: unparseable validation switch` before any further write.',
      'Without the line nothing changes.',
    ],
    'Validation: targeted',
  );
  // The existing commit-switch rule it builds on stays.
  assert.match(
    prose(callerOwned),
    /A `Commit:` line in the control region in any other form, or one without its `Execution root:` line, is a broken caller contract: return `ABORT: unparseable commit switch`/,
  );
  // The including workflows load the fragment for a `Validation:` line too, not only for `Commit:`.
  assert.match(
    prose(readSource('shared', 'worktree-integration.md')),
    /carries a `Commit:` line or a `Validation:` line, before any mode below is determined/,
  );
});

// Invariant: under the switch no role of an item workflow runs a full suite (not the validator, not
// the test-writer's run of all existing tests, not a pre-change baseline); each runs its targeted
// scope instead, diagnostic runs stay within it, an item names the affected tests it ran (the round
// validator's quick scope reads them) or says it found none, and a targeted failure is fixed before
// the caller-owned commit.
test('under Validation: targeted no role runs a full suite and each runs its targeted scope', () => {
  const section = prose(
    slice(callerOwned, '### Validation: targeted', null, 'caller-owned-commit'),
  );
  includesAll(
    section,
    [
      'Under the switch the workflow starts no full-suite run of any role, a pre-change baseline included:',
      'no full-suite `{{AGENT:code-validator}}` and no `{{AGENT:test-writer}}` run of all existing tests.',
      '`{{AGENT:code-validator}}` receives the changed paths (before the change, the paths the approved scope will change) as an explicit targeted scope, and `{{AGENT:test-writer}}` runs only the tests affected by those paths.',
      'Reproduction and diagnostic runs stay, limited to that scope.',
      'Its `DONE` result lists the affected tests it ran.',
      'the workflow runs the established non-test checks only and states in its `DONE` result that test coverage comes from the round validator.',
      'A targeted failure is fixed before the caller-owned commit, like any failing check.',
    ],
    'Validation: targeted',
  );
  // The validator's side of the same contract: a targeted scope is never a whole-suite command.
  const targetedScope = prose(
    slice(
      validator,
      'A **targeted scope** from an item workflow',
      'A **conflict-commit scope**',
      'validator',
    ),
  );
  includesAll(
    targetedScope,
    [
      'under `Validation: targeted` replaces the mode mapping',
      'only the tests affected by them, never a whole-suite command or a combined gate that contains one.',
      '`SKIPPED (coverage from the round validator)`',
    ],
    'validator targeted scope',
  );
});

// Invariant: every item workflow `iterate` delegates to (fix, refactor, docs, and build through its
// delegated-run contract) honors the switch where it would otherwise run a full suite, names the
// owner (`caller-owned-commit`) instead of restating it, and changes nothing without the line; build
// under the switch also skips its own validation budget, attribution and signature handling.
test('each item workflow honors Validation: targeted and keeps its default without it', () => {
  const fix = prose(readSource('tools', 'fix.md'));
  assert.match(
    fix,
    /Under `Validation: targeted` \(`caller-owned-commit`\) the reproduction stays, limited to the targeted scope\./,
  );

  const refactor = prose(readSource('tools', 'refactor.md'));
  assert.match(
    refactor,
    /Under `Validation: targeted` \(`caller-owned-commit`\) both runs cover only the targeted scope\./,
  );
  assert.match(
    refactor,
    /runs all existing tests again, or the targeted scope under `Validation: targeted`/,
    'the post-change test run keeps "all existing tests" as its default',
  );

  const docs = prose(readSource('tools', 'docs.md'));
  assert.match(
    docs,
    /under `Validation: targeted` \(`caller-owned-commit`\) with the changed paths as its targeted scope\./,
  );

  const build = prose(readSource('shared', 'build-delegated-run.md'));
  assert.match(
    build,
    /Under `Validation: targeted` \(`caller-owned-commit`\) that list is its targeted scope, here and in Phase 7's final check, and none of the validation budget below applies: no full run in either phase, no \(a\) or \(b\), no `Failure attribution:` line, and signature handling stays with the caller\./,
    'a caller-owned targeted build runs none of its own validation budget',
  );
  const runContract = prose(readSource('shared', 'build-run-contract.md'));
  assert.match(
    runContract,
    /under `Validation: targeted` \(`caller-owned-commit`\) the `reason` of the `validation` and `final-validation` receipts names their targeted scope\./,
  );
  const diffBaseline = prose(readSource('shared', 'diff-baseline.md'));
  assert.match(
    diffBaseline,
    /Under `Validation: targeted` \(`caller-owned-commit`\) the list is the validator's targeted scope instead\./,
  );

  // Defaults: each unconditional phrase the switch qualifies is still there, so a run without the
  // line reads today's text.
  assert.match(
    fix,
    /Try to reproduce the bug with `\{\{AGENT:code-validator\}\}` for the current technical state\./,
  );
  assert.match(refactor, /run all existing tests and document the result/);
  assert.match(
    docs,
    /Start `\{\{AGENT:code-validator\}\}` when doc changes affect technical artifacts or the project build can plausibly check the change;/,
  );
  assert.match(
    build,
    /Render the diff baseline and hand the path list to `\{\{AGENT:code-validator\}\}` per "Diff baseline"\./,
  );
});

// Invariant: Phase 4 never lets the cheaper path hide in the mode-less gate. The validator always
// gets an explicit mode; `quick` runs only the validator with the review-fix scope, which excludes
// only the detected test commands by normalized script identity, requires every other established
// check and adds the items' targeted tests; an environment signature stops the round.
test('Phase 4 hands the validator an explicit mode and quick uses only the review-fix scope', () => {
  includesAll(
    phase4,
    [
      "Start {{AGENT:code-validator}} with an explicit mode, its scope excluding every rejected item's paths.",
      'Under `quick`, only {{AGENT:code-validator}} runs, with the review-fix scope of that fragment, never the mode-less project-wide quality gate.',
    ],
    'Phase 4 step 1',
  );
  includesAll(
    fragmentText,
    [
      "every command in the detection's `data.testCommands` as an excluded command, excluded only by normalized script identity;",
      "every other established check the repository's instructions or CI define for the round's changes;",
      "and the affected tests the items' targeted checks named in their `DONE` results.",
      '"on an environment signature, report the check and its diagnostic; no suite split, no base comparison, no rerun"',
      'the run pushes nothing and returns `ABORT: validation environment signature`, naming the class and the affected checks.',
    ],
    'review-fix scope',
  );
});

// Invariant: the outcome report carries what the gate needs to record fail-closed: the effective
// mode, the head the last validator run validated and the detection verbatim, as one compact JSON
// line stated once; an effective `full` carries a non-empty reason.
test('the round reports its effective mode, validated head and detection', () => {
  includesAll(
    fragmentText,
    [
      'Review-fix validation result: {"mode":"<full|quick>","head":"<validated head SHA>","reason":<one reason line or null>,"detection":<the detection\'s data object or null>}',
      'On `DONE`, and on every `ABORT` after Phase 4 started',
      '`reason` is a non-empty string exactly for `full`.',
    ],
    'return line',
  );
  includesAll(
    prose(iterate),
    [
      "Phase 4's effective validation mode (`full` or `quick`), the validated head SHA (the committed `HEAD` its last validator run validated) and the detection verbatim where Phase 4 ran one; an effective `full` with its one reason line",
      "Phase 4's effective validation mode with its reason, the validated head SHA and any detection",
    ],
    'iterate outcome report and wisdom file',
  );
});

// Invariant: the gate records a quick-validated review-fix head unless the return proves `full`
// for exactly the pushed head: one parseable outcome line with mode `full`, a reason and a 40-hex
// head equal to `after`. Anything else, including a `full` line with a missing, malformed or other
// head, records `after`, so a round whose report was lost or ambiguous can never merge on the
// strength of a `full` run nobody saw; a later round never removes the record.
test('a missing iterate outcome is recorded fail-closed as a quick-validated review-fix head', () => {
  includesAll(
    record,
    [
      'where the `after` head of "Repair checkpoints" step 3 differs from its `before`, record `after` as the **quick-validated review-fix head**, with the detection\'s `baseCommit`.',
      'The one exception is a return whose final text, read where its `Returned commits:` line is read, carries exactly one `Review-fix validation result:` line that parses as one compact JSON object with `mode` `full`, a non-empty `reason` string and a `head` of 40 hex characters equal to `after`.',
      'Every other return records `after`, and a parsed `quick` head other than `after` is recorded as well.',
      'A later round never removes the record;',
    ],
    'merge-gate record',
  );
  includesAll(
    record,
    [
      'Record in the wisdom file the ceiling with its source, the detection verbatim, and the candidate with every unmet condition.',
    ],
    'merge-gate record',
  );
});

// Invariant: Phase 4 condition 11 covers the recorded review-fix head exactly as it covers a
// quick-validated conflict commit, so a head validated `quick` merges only on fresh CI evidence for
// the verified head; the status read carries check identity from the start of the batch; an unmet
// condition names a remedy a review-fix head can use, since it has no marker commit to drop; and a
// CI-repair delegation, which records nothing, adds no condition.
test('condition 11 covers the recorded review-fix head', () => {
  includesAll(
    condition11,
    [
      'where the wisdom file records a quick-validated conflict commit or quick-validated review-fix head, or the quick-marker scan found one, CI evidence on this batch for every **marked commit**',
      'A recorded review-fix head is a recorded marked commit, exactly as a quick-validated conflict commit is, its tree holding the CI definition its round was validated against.',
      'Its status read carries `includeCheckIdentity: true`',
      'the waiver and the no-CI policy never satisfy this condition.',
      'no force push and no local `full` run.',
      'A recorded review-fix head has no marker commit to drop: its remedy is a later gate run, held by branch protection to the required job, or a merge by hand once that job passed.',
    ],
    'condition 11',
  );
  // The ancestry-checked detection comes from the recorded head itself, never from the base.
  assert.match(
    condition11,
    /ci-detect <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","baseRef":"<baseRef>","commit":"<commit>"\}'.* never from the current base or a recorded detection/,
  );
  // Phase 4's opening batch read is told about the recorded head, so condition 11's read is the one
  // carrying check identity rather than an extra round trip afterwards.
  const phase4Intro = prose(
    slice(
      delegatedRun,
      '### Phase 4: Merge preconditions',
      'Only after that fresh status',
      'delegated run',
    ),
  );
  assert.match(
    phase4Intro,
    /A recorded \*\*quick-validated review-fix head\*\* \(`merge-gate-review-fix-validation`\) is such a commit in this phase and in condition 11\./,
  );
  // The completion report names the head and the candidate's reason line.
  assert.match(
    prose(delegatedRun),
    /per bot-round delegation, the review-fix candidate with its one reason line where it was `full`, any quick-validated review-fix head, and, once, the proposal line of `merge-gate-review-fix-validation` where its conditions held;/,
  );
});

// Invariant: the proposal is an offer the gate prints once, only where the opt-in is absent or
// `full`, the provider is GitHub and CI was detected; it states the evidence and the gap, and asks
// nothing.
test('the proposal line is a once-only offer under a full ceiling', () => {
  const proposal = prose(slice(gateFragment, '### Proposal line', null, 'gate'));
  includesAll(
    proposal,
    [
      'Where the ceiling is `full` because the value is `full` or absent, the provider is GitHub and the detection is `detected`',
      'proposing `iterate.reviewFixValidation: quick`',
      'that the jobs must be required checks of the base branch',
      'Nothing is asked.',
    ],
    'proposal',
  );
});
