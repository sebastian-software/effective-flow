// Contract tests for the repair-attempt wiring in the merge-gate and iterate prose (issue #662).
//
// The helper `repair-attempt` owns the mechanics and has its own unit tests; what these tests pin
// is that the prose calls it at the right moments and states the rules a reader acts on. Each test
// names the invariant it protects. Anchors are the smallest stable phrases, so rewording stays free
// while losing the invariant fails.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LAZY_INCLUDE_RE } from '../build-lib.mjs';
import { MAINTAINER_DECISIONS, STOP_AFTER_ATTEMPTS } from '../src/scripts/repair-attempt-core.mjs';

const repositoryRoot = new URL('..', import.meta.url);

function source(path) {
  return readFileSync(new URL(path, repositoryRoot), 'utf8');
}

// Collapses line wrapping, so a phrase the formatter wraps differently still matches.
function flat(text) {
  return text.replace(/\s+/g, ' ');
}

// The text from a heading line up to the next heading of the same or a higher level.
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? rest : rest.slice(0, next);
}

// The text of one numbered step of a list, up to the next step at the same indentation.
function step(text, number) {
  const start = text.search(new RegExp(`\\n${number}\\. `));
  assert.notEqual(start, -1, `missing step ${number}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(3).search(/\n\d+\. /);
  return next === -1 ? rest : rest.slice(0, next + 3);
}

function lazyPointers(text) {
  return new Map(
    [...text.matchAll(LAZY_INCLUDE_RE)].map((match) => [match[1].trim(), (match[2] ?? '').trim()]),
  );
}

function ordered(text, ...fragments) {
  let position = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, position + 1);
    assert.notEqual(next, -1, `missing ordered fragment: ${fragment}`);
    position = next;
  }
}

const delegatedRun = source('src/shared/merge-gate-delegated-run.md');
const contract = source('src/shared/merge-gate-delegation-contract.md');
const reviewer = source('src/shared/merge-gate-configured-reviewer.md');
const iterate = source('src/tools/iterate.md');
const scopeReturn = source('src/shared/delegated-scope-return.md');
const repairReport = source('src/shared/merge-gate-repair-report.md');

// Invariant: repair attempts are accounted beside `mergeGate.maxRounds`, never instead of it, and a
// wait or a gate base merge consumes no attempt. Folding the two counters together is the defect
// #662 fixes: a CI re-wait and a base merge then spent the budget a real repair needed.
test('merge-gate accounts repair attempts separately, with waits and base merges excluded', () => {
  const accounting = flat(section(delegatedRun, '#### Round accounting'));
  assert.match(
    accounting,
    /`mergeGate\.maxRounds` bounds the \*\*whole run\*\*/,
    'the round counter must keep its run-wide meaning',
  );
  assert.match(
    accounting,
    /Repair attempts are accounted separately and change nothing above/,
    'repair accounting must be stated as separate from the round counter',
  );
  for (const excluded of [
    'A CI wait',
    'a bot wait',
    'a review resubmission',
    'resolved delegation without a head movement',
    'a gate base merge',
  ]) {
    assert.ok(
      accounting.includes(excluded),
      `"${excluded}" must be named among the zero-attempt events`,
    );
  }
  assert.match(
    accounting,
    /consume \*\*zero\*\* attempts/,
    'the excluded events must consume zero attempts',
  );
  assert.match(
    accounting,
    /correction-bucket commits count for no cause/,
    'correction-bucket commits must count no attempt',
  );
});

// Invariant: only a reviewer cause can stop the run, on its second verified ineffective attempt;
// CI attempts are counted and never stop, because the gate reads only a check's name and
// conclusion. The prose count is tied to the helper's own constant so the two cannot drift.
test('merge-gate stops on the second ineffective repair of a reviewer cause only', () => {
  assert.equal(STOP_AFTER_ATTEMPTS, 2, 'the helper must stop after two attempts');
  const accounting = flat(section(delegatedRun, '#### Round accounting'));
  assert.match(
    accounting,
    /CI attempts are counted and reported and never stop the run/,
    'CI attempts must never stop the run',
  );
  assert.match(
    accounting,
    /A reviewer cause whose \*\*second\*\* verified attempt is still blocking stops it/,
    'the stop must be the second verified attempt of a reviewer cause',
  );
  assert.match(flat(delegatedRun), /A stop never merges/, 'a stop must never merge');
});

// Invariant: the same/new/uncertain rule is stated per configured reviewer, `uncertain` neither
// counts nor resets, and a `new` finding is never evidence against another cause. Without `new`, an
// unrelated finding blocked resolution; without per-reviewer matching another reviewer's thread
// counted against a cause.
test('the configured-reviewer route states the same/new/uncertain rule per reviewer', () => {
  const rule = flat(section(reviewer, '## Repair evaluation per configured reviewer'));
  assert.match(
    rule,
    /"Matching a configured login"/,
    'causes must be matched per configured login',
  );
  assert.match(
    rule,
    /another reviewer's overlapping thread never counts against it/,
    'another reviewer must never count against a cause',
  );
  assert.match(
    rule,
    /`same` when it keeps a recorded durable key, or its anchored path/,
    'same rule',
  );
  assert.match(
    rule,
    /`new` – its own cause with its own counter, never evidence against another/,
    'new rule',
  );
  assert.match(rule, /`uncertain` otherwise/, 'uncertain must be the fallback class');
  for (const cause of [
    '`lineOutdated`',
    'Forgejo',
    'changed the anchored path',
    'undetermined read',
    'body finding',
  ]) {
    assert.ok(rule.includes(cause), `"${cause}" must be named as an uncertain cause`);
  }
  assert.match(
    rule,
    /`uncertain` neither counts nor resets/,
    'uncertain must neither count nor reset',
  );
  assert.match(
    rule,
    /fresh evidence on a later head/,
    'only fresh evidence on a later head may make a repair ineffective',
  );
});

// Invariant: in delegated mode with a scope line, iterate declares every item's paths through the
// helper before any edit and before its commit, at all three ownership checkpoints, and a refused
// manifest item returns `unassessed`, which the set-aside confirmation cannot clear.
test('iterate declares the authorized scope before edit and before commit', () => {
  const phase3 = section(iterate, '### Phase 3: Implementation');
  const declaration = flat(phase3.slice(0, phase3.indexOf('\n1. ')));
  assert.match(
    declaration,
    /`node <skill-root>\/scripts\/repair-attempt\.mjs scope-check` with one JSON object on standard input/,
    'the scope check must run through the helper',
  );
  assert.match(
    declaration,
    /each manifest item, the free-text repair, every Phase-4 correction item/,
    'every item kind must be declared',
  );
  assert.match(
    declaration,
    /before any edit and before its commit/,
    'the declaration precedes edit and commit',
  );
  assert.match(
    declaration,
    /return a manifest item `unassessed`, which no set-aside confirmation clears/,
    'a refused item must be unassessed and unclearable',
  );
  assert.match(
    flat(step(phase3, 1)),
    /run the scope check on it/,
    'step 1 must check analyzed paths',
  );
  assert.match(
    flat(step(phase3, 2)),
    /Run the scope check on it, then add the path to the item's actual ownership/,
    'step 2 must check an outside path before adding it to ownership',
  );
  const integrity = flat(section(iterate, '#### Commit integrity for parallel items'));
  ordered(
    integrity,
    '1. **Inspect the diff**',
    'Run the scope check',
    'before `commit create`',
    '2. **Commit with one call.**',
  );
  assert.match(
    flat(iterate),
    /\| refused by the authorized-scope check \(Phase 3 "Authorized scope"\) +\| `unassessed` +\|/,
    'the mapping must send a scope refusal to `unassessed`',
  );
});

// Invariant: the post-check of every commit actually made – returned or foreign, so a run that
// leaves a commit out of `Returned commits:` still fails closed (plan decision 3) – and the stop it
// can raise are eager in the delegated run and run before the next delegation, base merge or merge.
// Behind a lazy pointer a run that skipped the load would merge past a committed expansion.
test('merge-gate post-checks every delegated round eagerly and stops before the next write', () => {
  const checkpoints = flat(section(delegatedRun, '#### Repair checkpoints'));
  assert.match(
    checkpoints,
    /After every return of a dispatched round, `ABORT` included/,
    'every return is recorded',
  );
  assert.match(
    checkpoints,
    /[Rr]un `record`\s+with `scope`, `round`, `before`, `after`/,
    'record carries the round',
  );
  const steps = section(delegatedRun, '#### Repair checkpoints');
  assert.match(
    flat(step(steps, 3)),
    /post-checks the paths of every commit actually made, returned or foreign, against the scope – a foreign commit that passes only leaves the round `uncertain`; `decision: stop` or a failed call ends the run per step 4/,
    'every commit actually made is post-checked, and a stop or a failed record ends the run through step 4',
  );
  assert.match(
    flat(section(contract, '## Returned outcome record')),
    /a commit no minted entry returns is foreign: `record` post-checks it like a returned one/,
    'the receiver rule states that an unreturned commit is still checked',
  );
  assert.equal(MAINTAINER_DECISIONS['foreign-commit-unverified'], 'verify-returned-commits');
  assert.match(
    flat(repairReport),
    /a foreign commit outside the scope, without exactly one parent or not readable \(`foreign-commit-unverified`/,
    'the repair report names the foreign-commit stop',
  );
  assert.match(
    flat(step(steps, 4)),
    /Ending the run at any repair checkpoint means no further delegation, base merge or merge, no revert and no force push/,
    'step 4 alone must define the run end: before any further delegation, base merge or merge',
  );
  assert.match(
    flat(step(steps, 5)),
    /`decision: stop` or a failed call ends the run per step 4/,
    'a stop or a failed evaluate must end the run like a failed record',
  );
  assert.match(
    flat(step(steps, 1)),
    /run the ancestry check's fetches 1 and 2, then `scope-read`/,
    'the scope read must run after its own fetches, even in a round without the ancestry check',
  );
  assert.match(
    checkpoints,
    /Immediately before each dispatch, record the `headSha` of one fresh `pr-status-read` as `before`/,
    'the head must be recorded immediately before dispatch',
  );
  assert.match(
    checkpoints,
    /Immediately before the run's first delegation is built[^.]*then `scope-read`/,
    'the scope is read once, just before the first delegation',
  );
  assert.match(checkpoints, /never recomputes it/, 'a resume must use the stored scope');
  assert.match(
    checkpoints,
    /blocks delegation only: record the code once, and every later delegation site then delegates nothing[^.]*while the run otherwise proceeds/,
    'an undetermined scope read must skip every later delegation and let the run proceed, never end it at the site',
  );
  // Eager: neither the checkpoints nor the post-check sit behind a lazy pointer of the delegated run.
  assert.ok(
    !repairReport.includes('`record`'),
    'the lazy report fragment must not own the record call',
  );
  assert.ok(
    !lazyPointers(delegatedRun).has('merge-gate-repair-checkpoints'),
    'the checkpoints must stay eager',
  );
});

// Invariant: the stop check runs at the start of Phase 2 step 1, before either base-merge trigger,
// at Phase 2 step 3 before its delegation, and at configured-reviewer Phase 3 step 5 before its
// own. A check after a trigger would push a base merge onto a pull request the run already stopped.
test('merge-gate places the stop check before step 1 triggers, step 3 and Phase 3 step 5', () => {
  const phase2 = section(delegatedRun, '### Phase 2: Check gate (bounded)');
  const step1 = flat(step(phase2, 1));
  ordered(
    step1,
    'First apply the stop check of "Repair checkpoints"',
    '**Trigger (a):**',
    '**Trigger (b):**',
  );
  const step3 = flat(step(phase2, 3));
  ordered(step3, 'First apply the stop check of "Repair checkpoints"', 'Otherwise delegate to');
  const phase3 = section(reviewer, '## Phase 3: Automatic reviewer round');
  ordered(
    flat(step(phase3, 5)),
    'first apply the stop check of "Repair checkpoints"',
    '"Repair evaluation per configured reviewer"',
    'only then hand its unresolved threads',
  );
});

// Invariant: iterate's scope parse and scope checks live in its eager source, never behind a lazy
// pointer: only the return format and the mapping detail are deferred. A deferred parse would let
// a run that never loaded it implement unscoped.
test('iterate keeps its scope parse and checks eager and defers only the return format', () => {
  const phase0 = flat(section(iterate, '### Phase 0: Target detection and input parsing'));
  assert.match(
    phase0,
    /Any other form returns `ABORT: unparseable authorized scope` immediately, before Phase 1/,
    'the scope line must be parsed fail-closed in Phase 0',
  );
  assert.match(
    phase0,
    /`Language context:` or `Authorized scope:` on its own line below the delimiter/,
    'the scope keyword below the delimiter must be body text',
  );
  const pointers = lazyPointers(iterate);
  assert.match(
    pointers.get('delegated-scope-return') ?? '',
    /`Authorized scope:`[\s\S]*return/,
    'the return format must load when a scoped run composes its return',
  );
  for (const eagerOnly of ['scope-check', 'ABORT: unparseable authorized scope']) {
    assert.ok(
      !scopeReturn.includes(eagerOnly),
      `the lazy return fragment must not carry ${eagerOnly}`,
    );
  }
  assert.match(flat(scopeReturn), /Returned commits:/, 'the return fragment owns the commit list');
  assert.match(
    flat(scopeReturn),
    /Scope expansion:/,
    'the return fragment owns the expansion list',
  );
});

// Invariant: the scope line is mandatory for every gate delegation, its identifiers are recorded
// before dispatch, and the receiver rule keeps unminted entries inert while any declared expansion
// for a minted identifier stops the run.
test('the merge-gate delegation contract makes the scope line mandatory and states the receiver rule', () => {
  const text = flat(contract);
  assert.match(
    text,
    /the \*\*authorized scope\*\*, on its own line, as `Authorized scope: <JSON>`\. This is mandatory in \*\*every\*\* delegation/,
    'mandatory scope line',
  );
  assert.match(
    text,
    /Record\*\* that map in the wisdom file before anything is dispatched, with `scopeIdentifiers`/,
    'identifiers recorded before dispatch',
  );
  assert.match(
    text,
    /`Authorized scope:` follows both, before approvals/,
    'canonical order names the scope line',
  );
  assert.match(
    text,
    /optional `Progress context:`, `Authorized scope:`, `Approved outcomes:`/,
    'refusal keyword list',
  );
  const receiver = flat(section(contract, '## Returned outcome record'));
  assert.match(
    receiver,
    /`ci`, `validation`, a thread ID[^;]*is inert[^;]*, and an identical repeat is idempotent/,
    'unminted entries are inert',
  );
  assert.match(
    receiver,
    /one SHA returned for two identifiers[^;]*makes the round `uncertain`, and no attempt is counted/,
    'duplicate SHA rule',
  );
  assert.match(
    receiver,
    /any `Scope expansion:` entry for a minted identifier[^;]*stops the run/,
    'declared expansion stops',
  );
  assert.match(
    lazyPointers(contract).get('delegated-scope-return') ?? '',
    /`Authorized scope:`/,
    'the gate loads the shared return format when it reads a scoped return',
  );
});

// Invariant: the Phase-6 repair-progress layout is the only part deferred, and it loads before the
// wisdom file it reads from is deleted.
test('the repair-progress report loads in Phase 6 before the wisdom file is deleted', () => {
  const when = lazyPointers(delegatedRun).get('merge-gate-repair-report');
  assert.ok(when, 'the delegated run must point at the repair-progress report');
  assert.match(
    when,
    /(?=[\s\S]*Phase 6)(?=[\s\S]*stop)(?=[\s\S]*wisdom file)/,
    'pointer names Phase 6, a stop and the wisdom file',
  );
  ordered(flat(delegatedRun), 'merge-gate-repair-report', '1. Delete the wisdom file');
  for (const item of [
    'unresolved cause and its reviewer',
    'Every observed repair attempt',
    'waits and base changes in between',
    'Foreign commits',
    'Out-of-scope paths with their SHAs',
    'decision the maintainer needs to make',
  ]) {
    assert.ok(flat(repairReport).includes(item), `the report must name ${item}`);
  }
  assert.match(
    flat(delegatedRun),
    /the repair attempts per reviewer cause and the CI attempts per check/,
    'every run reports the attempt counts beside the delegated rounds',
  );
});

// Invariant: both helper calls join on one encoding of the reviewer and the durable key, and the
// counts Phase 6 reports are the latest call's, stored beside the state. A key written one way in
// the `build` map and another way in an observation would make every re-report `new`.
test('record and evaluate join on one stated reviewer and durable-key encoding', () => {
  const checkpoints = flat(section(delegatedRun, '#### Repair checkpoints'));
  assert.match(checkpoints, /store `data\.state` with that call's `data\.counts`/, 'counts stored');
  assert.match(
    checkpoints,
    /`reviewer` is the configured login as "Matching a configured login"[^.]*collapsed it/,
    'reviewer encoding',
  );
  assert.match(
    checkpoints,
    /the one string given to `build` as `durableKey`[^.]*`<review id>#<ordinal>`/,
    'durable-key encoding',
  );
  assert.match(
    checkpoints,
    /\{"items":\[\{"identifier","key","reviewer","outcome"\}\],"freeText","correction"\}/,
    'the literal minted shape',
  );
  for (const type of ['ci-wait', 'bot-wait', 'review-wait', 'review-resubmission', 'base-merge']) {
    assert.ok(checkpoints.includes(`\`${type}\``), `event type ${type}`);
  }
  assert.match(flat(delegatedRun), /from the latest call's `data\.counts`/, 'Phase 6 counts');
});

// Invariant: a scoped return whose `Scope expansion:` line is missing or unparseable ends the run
// (fail closed) through a sticky helper stop, so Phase 6 reports it on the one repair-report path,
// while a missing `Returned commits:` line only counts nothing; the return format says which, so the
// writer knows a missing line is never the same as an empty one.
test('the gate states its side of a missing or unparseable return line', () => {
  const receiver = flat(section(contract, '## Returned outcome record'));
  assert.match(
    receiver,
    /without a parseable `Scope expansion:` line, `record` gets `scopeExpansion: \[\]` and `scopeLineMissing: true`, which stops the run with `scope-line-missing`/,
    'a missing expansion line ends the run through a recorded stop',
  );
  assert.match(
    receiver,
    /without a parseable `Returned commits:` line, `returned` is `\[\]`/,
    'a missing commit line counts nothing',
  );
  assert.match(
    flat(scopeReturn),
    /the caller ends the run on a missing `Scope expansion:` line/,
    'the return format names the consequence',
  );
  assert.equal(MAINTAINER_DECISIONS['scope-line-missing'], 'verify-returned-commits');
  assert.match(
    flat(repairReport),
    /without a parseable `Scope expansion:` line \(`scope-line-missing`\)/,
    'the repair report names the missing-line stop',
  );
  assert.match(
    flat(step(section(delegatedRun, '#### Repair checkpoints'), 3)),
    /with `scopeLineMissing` per the delegation contract's receiver rule/,
    'record carries the missing-line fact',
  );
});

// Invariant: only a return that can carry the lines is held to them. A relayed `BLOCKED-USER`
// question and an iterate Phase-0 refusal made no edit and carry neither line; treating either as
// a missing line would end the run instead of relaying the question, or send a maintainer to
// inspect commits that do not exist. A `BLOCKED-USER` return is not recorded at all, so the round
// the answer's delegation re-enters is recorded exactly once.
test('a BLOCKED-USER return is never recorded and a Phase-0 refusal counts nothing', () => {
  const receiver = flat(section(contract, '## Returned outcome record'));
  assert.match(
    receiver,
    /A `DONE` and every `ABORT` but a Phase-0 refusal state the `Returned commits:` and `Scope expansion:` lines/,
    'the lines are owed by DONE and non-Phase-0 ABORT only',
  );
  assert.match(
    receiver,
    /A `BLOCKED-USER` return and a Phase-0 refusal[^.]*`duplicated control line`, `manifest and body mismatch` or a reason starting `unparseable`[^.]*carry neither line and edited nothing/,
    'neither is read as a missing line',
  );
  // The delegation consuming the answer re-enters the same round; a record for the question would
  // make that round's own record a same-round call with other heads, which the helper refuses.
  assert.match(
    receiver,
    /A `BLOCKED-USER` return gets no `record` call: the delegation consuming its answer re-enters the same round, which "Repair checkpoints" records once, on that delegation's return/,
    'a BLOCKED-USER return is never recorded',
  );
  assert.match(
    receiver,
    /A Phase-0 refusal gets `record` with `returned: \[\]` and `scopeExpansion: \[\]`, which counts nothing/,
    'a Phase-0 refusal is recorded with empty lists',
  );
  const checkpoints = flat(section(delegatedRun, '#### Repair checkpoints'));
  assert.match(
    checkpoints,
    /`ABORT` included and `BLOCKED-USER` excepted – its round is recorded once, on the return of the dispatch consuming its answer/,
    'the record step skips a BLOCKED-USER return',
  );
  assert.match(
    checkpoints,
    /the dispatch consuming an `iterate-approval` answer keeps the `before` stored for the dispatch that returned the question/,
    'the re-dispatched round keeps its original head before dispatch',
  );
  assert.match(
    receiver,
    /On any other return a missing or unparseable line is never guessed/,
    'the missing-line rule is confined to the other returns',
  );
  assert.match(
    flat(scopeReturn),
    /on every `DONE` and every `ABORT` after Phase 0 of such a run\. A Phase-0 refusal `ABORT` and a `BLOCKED-USER` return made no edit and carry neither/,
    'the writer side states the same exemption',
  );
  assert.match(
    lazyPointers(iterate).get('delegated-scope-return') ?? '',
    /by `DONE` or by an `ABORT` after Phase 0/,
    'iterate loads the return format only for returns that carry the lines',
  );
});

// Invariant: the gate builds no git command from a returned string. A lagging forge head is
// detected from the helper's own `record` result and corrected by recording the same round again,
// which the helper accepts only for that one uncertainty reason.
test('a lagging forge head is re-read from the record result, never from returned SHAs', () => {
  const recordStep = flat(step(section(delegatedRun, '#### Repair checkpoints'), 3));
  assert.ok(
    !/git merge-base --is-ancestor <sha>/.test(flat(delegatedRun)),
    'no ancestry command may be built from a returned SHA',
  );
  assert.match(
    recordStep,
    /Where `data\.round\.reasons` is exactly `\["returned-outside-range"\]`[^.]*re-read `pr-status-read` once and, on a moved `headSha`, repeat fetch 2 and run the same `record` again with it as `after`/,
    'the re-read is triggered by the record result and re-runs record',
  );
});

// Invariant: every scope refusal in iterate, at any of its checkpoints, leaves the item's paths
// rejected and uncommitted, so Phase 4 never validates or commits a refused item's partial hunks.
test("iterate rejects a refused item's paths at every scope checkpoint", () => {
  const phase3 = section(iterate, '### Phase 3: Implementation');
  const declaration = flat(phase3.slice(0, phase3.indexOf('\n1. ')));
  assert.match(
    declaration,
    /Anything else refuses the item: edit nothing more, commit nothing, record `data\.outside`[^.]*its paths in the wisdom file as rejected and left uncommitted/,
    'every refusal rejects the paths',
  );
  assert.match(
    declaration,
    /record `data\.outside` and the `undetermined` paths/,
    'a path the check could not decide is declared like an outside one',
  );
  assert.match(declaration, /"cwd":"<this run's execution root>"/, 'scope-check reads the tree');
  assert.match(
    flat(section(iterate, '### Phase 4: Validation')),
    /correction item through the scope check of Phase 3 "Authorized scope" on its planned paths/,
    'a correction item is scope-checked in Phase 4',
  );
});
