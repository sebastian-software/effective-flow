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
// helper before any edit, at both ownership checkpoints by the bound `runId`, and `commit create`
// enforces the same bound scope before its commit; a refused manifest item returns `unassessed`,
// which the set-aside confirmation cannot clear.
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
    /run the scope check by `runId` on it/,
    'step 1 must check analyzed paths against the bound scope',
  );
  assert.match(
    flat(step(phase3, 2)),
    /Run the scope check by `runId` on it, then add the path to the item's actual ownership/,
    'step 2 must check an outside path against the bound scope before adding it to ownership',
  );
  const integrity = flat(section(iterate, '#### Commit integrity for parallel items'));
  ordered(
    integrity,
    '1. **Inspect the diff**',
    '`commit create` enforces the scope Phase 0 step 12 bound on the listed paths',
    'before it locks or stages anything',
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
    /[Rr]un `record`\s+with `scope`, `dispatch` and `before` from step 2, `round` the current round, `after`/,
    'record carries the dispatch it is keyed by, and the round as data',
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
    /Immediately before each dispatch, mint its `dispatch` number[^.]*and record it with the `headSha` of one fresh `pr-status-read` as `before`/,
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
    /the caller ends the run on a missing `Scope expansion:` line after one line request/,
    'the return format names the consequence',
  );
  assert.equal(MAINTAINER_DECISIONS['scope-line-missing'], 'verify-returned-commits');
  assert.match(
    flat(repairReport),
    /without a parseable `Scope expansion:` line, still missing after any line request \(`scope-line-missing`\)/,
    'the repair report names the missing-line stop as one that survived the line request',
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
    /A `BLOCKED-USER` return and a Phase-0 refusal[^.]*`duplicated control line`, `manifest and body mismatch`, a reason starting `unparseable` or one starting `scope bind refused`[^.]*carry neither line and edited nothing/,
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
    /`ABORT` included and `BLOCKED-USER` excepted – its dispatch is recorded once, on the return of the dispatch consuming its answer/,
    'the record step skips a BLOCKED-USER return',
  );
  assert.match(
    checkpoints,
    /The dispatch consuming an `iterate-approval` answer mints none: it keeps the `dispatch` and the `before` stored for the dispatch that returned the question/,
    'the re-dispatched round keeps its original dispatch and head before dispatch',
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
    /Where `data\.round\.reasons` is exactly `\["returned-outside-range"\]`[^.]*re-read `pr-status-read` once and, on a moved `headSha`, repeat fetch 2 and run the same `record` again – the same `dispatch` and `before` – with it as `after`/,
    'the re-read is triggered by the record result and re-runs record under the same dispatch',
  );
});

// Invariant: a repair record is keyed by its dispatch, never by the gate round. A Phase 2 step 3 CI
// repair and the Phase 3 reviewer delegations of one round share the round counter; keyed by round,
// a moved head would be refused and an unmoved one replayed past the later dispatch's own checks.
test('every dispatch mints its own record identity immediately before it is sent', () => {
  const headStep = flat(step(section(delegatedRun, '#### Repair checkpoints'), 2));
  assert.match(
    headStep,
    /Immediately before each dispatch, mint its `dispatch` number – one more than the last this run minted, `1` for the first – and record it with the `headSha` of one fresh `pr-status-read` as `before`/,
    'the dispatch number is minted per run and stored with the head before dispatch',
  );
  assert.match(
    headStep,
    /a Phase 2 step 3 CI repair and each Phase 3 reviewer delegation of the same round are recorded apart/,
    'dispatches of one round get separate records',
  );
  assert.match(
    flat(section(delegatedRun, '## Wisdom accumulation')),
    /per dispatch its `dispatch` number, its `before` and `after` heads/,
    'the wisdom file keeps the dispatch number beside its heads, so a resume reuses it',
  );
  assert.match(
    flat(section(delegatedRun, '## Rules')),
    /record every dispatch under its own `dispatch` number/,
    'the rule names the record identity',
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
    /correction item through the scope check by `runId` of Phase 3 "Authorized scope" on its planned paths/,
    'a correction item is scope-checked in Phase 4',
  );
});

const fallback = source('src/shared/iterate-commit-fallback.md');
const LINE_REQUEST =
  'State the missing `Returned commits:` and `Scope expansion:` lines of your final return per `delegated-scope-return`.';

// Invariant: a scoped iterate run binds its scope once in Phase 0, by `runId`, and every later
// scope check reads that bound scope instead of one the run builds itself: a run that checked a
// self-built scope committed paths the line's scope never authorized. A bind failure aborts before
// Phase 1, with a shape refusal kept apart from every other refusal.
test('iterate binds its scope in Phase 0 and checks every scoped path by runId', () => {
  const phase0 = section(iterate, '### Phase 0: Target detection and input parsing');
  const bindStep = flat(step(phase0, 12));
  assert.match(
    bindStep,
    /`node <skill-root>\/scripts\/repair-attempt\.mjs scope-bind`/,
    'Phase 0 binds the scope through the helper',
  );
  assert.ok(
    bindStep.includes(
      '`{"stateRoot":"<RUNTIME_STATE_ROOT>","runId":"<runId>","authorizedScope":<the line\'s JSON verbatim>}`',
    ),
    'the bind takes the runtime root, the run identity and the line verbatim',
  );
  assert.match(
    bindStep,
    /Only the refusal code `AUTHORIZED_SCOPE_INVALID` returns `ABORT: unparseable authorized scope`; any other result than `ok: true` returns `ABORT: scope bind refused: <CODE>`/,
    'only a shape refusal reads as unparseable; every other bind failure names its code',
  );
  ordered(flat(phase0), '11. **Run identity.**', '12. **Scope bind.**');
  const phase3 = section(iterate, '### Phase 3: Implementation');
  const declaration = flat(phase3.slice(0, phase3.indexOf('\n1. ')));
  assert.ok(
    declaration.includes(
      '"cwd":"<this run\'s execution root>","stateRoot":"<RUNTIME_STATE_ROOT>","runId":"<runId>","changes"',
    ),
    'the general scope-check call shape reads the bound scope by runId',
  );
  assert.ok(
    !iterate.includes('"scope":<the line\'s scope>'),
    'no scope-check call shape passes the scope by value',
  );
  assert.match(
    declaration,
    /`SCOPE_RECORD_MISSING` or `SCOPE_RECORD_INVALID` ends the run per Commit integrity step 3/,
    'a missing or invalid bound scope ends the run instead of refusing one item',
  );
  assert.match(
    declaration,
    /\(after a call that returned no envelope, the checked paths\)/,
    'only a call without an envelope declares the checked paths',
  );
});

// Invariant: `commit create` enforces the bound scope, and iterate handles its refusal by cause: only
// an `outside` refusal declares paths, and exactly the reported ones; a moved head is retried once
// and a read timeout is no expansion, so neither declares an in-scope path; a missing or invalid
// record ends the whole run. The commit timeout covers the helper's full bounded duration.
test('iterate handles a commit-time scope refusal by cause and gives the commit call 420000 ms', () => {
  const integrity = section(iterate, '#### Commit integrity for parallel items');
  const handle = flat(step(integrity, 3));
  assert.match(
    handle,
    /`SCOPE_REFUSED`, with nothing locked or staged, by `outcome\.reason`: `outside` refuses the item per "Authorized scope", declaring exactly `outcome\.outside` and the `outcome\.undetermined` paths/,
    'an outside refusal declares exactly the reported paths and maps to unassessed',
  );
  assert.match(
    handle,
    /`head-moved` inspects the item again and repeats the call once, and a recurrence returns the item `unassessed` with no scope expansion/,
    'a moved head is retried once and then unassessed without expansion',
  );
  assert.match(
    handle,
    /`scope-read-timeout` returns the item `unassessed` with no scope expansion/,
    'a read timeout is unassessed without expansion',
  );
  assert.match(
    handle,
    /`SCOPE_REFUSED` reason `scope-record-invalid`, or `SCOPE_RECORD_MISSING` or `SCOPE_RECORD_INVALID` from either helper: end the whole run with `ABORT: scope record unavailable`/,
    'an unavailable record ends the whole run',
  );
  const commitStep = flat(step(integrity, 2));
  assert.match(
    commitStep,
    /an explicit timeout of 420000 ms/,
    'the commit call gets the full bound',
  );
  for (const term of [
    '300000 ms commit bound',
    '20 s of filters',
    '30 s lock wait with its final acquire attempt',
    'lock-guard wait for acquire and for release',
    '10 s scope read budget',
    'unbounded git reads at their measured worst case',
  ]) {
    assert.ok(commitStep.includes(term), `the timeout sum names ${term}`);
  }
  assert.ok(!iterate.includes('360000 ms'), 'the old commit timeout is gone');
  assert.match(
    flat(fallback),
    /after its paths passed the bound scope check of a scoped run, which precedes the hook trust check/,
    'the HOOKS_UNTRUSTED fallback commits only scope-checked paths',
  );
});

// Invariant: a scoped run names its return lines at the point it composes its final `DONE`, while
// the format stays in its lazy owner, and it releases the bound scope only in Phase 6: a release
// anywhere earlier would leave the run's later commits unchecked.
test('iterate names the scoped return lines in Phase 6 and releases the bound scope only there', () => {
  const phase6 = section(iterate, '### Phase 6: Summary');
  assert.match(
    flat(step(phase6, 4)),
    /On a run whose Phase 0 recorded an `Authorized scope:` line, that final `DONE` return states `Returned commits:` and `Scope expansion:` per `delegated-scope-return`/,
    'the final DONE names both return lines',
  );
  const release = flat(step(phase6, 1));
  assert.ok(
    release.includes(
      '`node <skill-root>/scripts/repair-attempt.mjs scope-release` with `{"stateRoot":"<RUNTIME_STATE_ROOT>","runId":"<runId>"}`',
    ),
    'Phase 6 releases the bound scope through the helper',
  );
  assert.match(release, /This is its only release point/, 'Phase 6 is the only release point');
  ordered(flat(phase6), 'scope-release', '2. Run the worktree-record exit self-check');
  assert.equal(
    iterate.split('scope-release').length - 1,
    1,
    'scope-release is called nowhere but Phase 6',
  );
  assert.match(
    lazyPointers(iterate).get('delegated-scope-return') ?? '',
    /or answers a request for its missing `Returned commits:` and `Scope expansion:` lines/,
    'the return format also loads when the run answers a line request',
  );
});

// Invariant: a dispatched scoped round whose final return lacks a return line gets exactly one
// targeted line request before the run stops on `scope-line-missing`. The request is a fixed
// sentence, the only instruction ever sent to the delegated run; it never replaces a declared
// expansion, and the round is recorded once, after it.
test('merge-gate sends one bounded line request before a missing return line stops the run', () => {
  const receiver = section(contract, '## Returned outcome record');
  assert.equal(
    contract.split(LINE_REQUEST).length - 1,
    1,
    'the literal line-request sentence is stated once',
  );
  assert.ok(receiver.includes(`\`\`\`text\n${LINE_REQUEST}\n\`\`\``), 'the sentence is literal');
  const rule = flat(receiver);
  assert.match(
    rule,
    /final return carries `DONE` or an `ABORT` after Phase 0 but lacks a `Scope expansion:` label or a parseable `Returned commits:` line first gets the line request below; after it, or where the spawn cannot be continued: without a parseable `Scope expansion:` line/,
    'only a line the answer could supply triggers the request, which precedes the unchanged fallback',
  );
  const request = flat(
    receiver.split(/\n\s*\n/).find((block) => block.startsWith('**The line request**')) ?? '',
  );
  assert.match(
    request,
    /the one bounded exception to "never an instruction to the delegated run"/,
    'the request is the stated exception to the principle',
  );
  assert.match(
    request,
    /carries exactly this sentence and nothing else – no control keyword, no `Item:` line or item text/,
    'the request carries nothing but the sentence',
  );
  const terms = flat(receiver.slice(receiver.indexOf(LINE_REQUEST)));
  for (const [pattern, label] of [
    [/follows any keyword-less resume below and is sent at most once/, 'once, after the resume'],
    [
      /a Phase 2 step 3 CI repair and each Phase 3 reviewer dispatch of one gate round count separately/,
      'counted per dispatch',
    ],
    [/does not advance the round counter and mints no new `dispatch`/, 'no round, no dispatch'],
    [
      /An inline round, a Phase-0 refusal and a `BLOCKED-USER` return get none/,
      'never inline, after a Phase-0 refusal or for a question',
    ],
    [
      /a `Scope expansion:` label present there counts as carried, parseable or not, and is never taken from the answer/,
      'a declared expansion line is never replaced',
    ],
    [
      /`Returned commits:` is taken from the answer only where the final return had no parseable one/,
      'only a lacking commit line is taken',
    ],
    [
      /The keyword, the outcome record and any `Review-fix validation result:` line stay with that final return, and nothing else in the answer counts/,
      'everything else stays with the final return',
    ],
  ]) {
    assert.match(terms, pattern, `the line request: ${label}`);
  }
  assert.match(
    flat(section(contract, '## Returned outcome record')),
    /The resume does not advance the round counter and mints no new `dispatch`/,
    'the resume, like the line request, mints no dispatch',
  );
  assert.equal(
    (flat(contract).match(/keyword-less resume below/g) ?? []).length,
    1,
    'the order of resume and line request is stated once, in the line request',
  );
  assert.match(
    flat(step(section(delegatedRun, '#### Repair checkpoints'), 3)),
    /only after any line request of the delegation contract's receiver rule was answered or could not be sent, never on the return that prompted it/,
    'the round is recorded once, after the line request',
  );
});

// Invariant: iterate answers a line request with the requested lines and its keyword only, from
// commits it made itself: an answer that edited, pushed or carried a validation result would let the
// interim turn change what the gate already read, and a guessed SHA would attribute a foreign commit.
test('iterate answers a line request with the lines only, from its own commits', () => {
  const answer = flat(
    scopeReturn
      .split(/\n\s*\n/)
      .find((block) => block.startsWith('**Answering a line request.**')) ?? '',
  );
  for (const [pattern, label] of [
    [/gets only the requested lines, then the same keyword line again/, 'lines, then keyword'],
    [/no `Review-fix validation result:` line/, 'no validation result line'],
    [/no edit, commit, push, reply or resolve/, 'no write'],
    [/from this run's own `commit create` results/, 'own commit results'],
    [/never from the wisdom file/, 'not the wisdom file'],
    [/read-only with `git log <head before the run>\.\.HEAD`/, 'read-only confirmation'],
    [/never name a SHA this run did not create/, 'no foreign SHA'],
    [
      /Without certainty about that mapping, omit `Returned commits:`[^.]*and still state `Scope expansion:`/,
      'omit the commit line if uncertain, never the expansion line',
    ],
  ]) {
    assert.match(answer, pattern, `the answer rule: ${label}`);
  }
  assert.match(
    flat(scopeReturn),
    /or the checked paths after a call that returned no envelope; a well-formed refusal declares only what it reports/,
    'only a call without an envelope declares the checked paths',
  );
});
