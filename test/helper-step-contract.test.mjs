import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMIT_TIMEOUT_MS } from '../src/scripts/effective-flow-state-commit-core.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

const iterate = readSource('tools', 'iterate.md');
const fallback = readSource('shared', 'iterate-commit-fallback.md');
const commitLock = readSource('shared', 'commit-lock-contract.md');
const review = readSource('tools', 'review.md');
const commitCore = readFileSync(
  join(SOURCE_DIR, 'scripts', 'effective-flow-state-commit-core.mjs'),
  'utf8',
);

const section = (text, start, end) => {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing section start ${start}`);
  const to = text.indexOf(end, from);
  assert.notEqual(to, -1, `missing section end ${end}`);
  return text.slice(from, to);
};
const commitSection = section(iterate, '#### Commit integrity for parallel items', '### Phase 4:');
const outcomeMap = section(commitSection, '3. **Handle the result**', '```include');

// Invariant: realistic runs committed without `iterate-commit.lock` when the commit was a prose
// sequence, so `iterate` commits an item only through `commit create`; the prose `git add`/`git
// commit` sequence and its `lock acquire` live only in the lazy `HOOKS_UNTRUSTED` fallback.
test('iterate has no item commit path outside commit create except the HOOKS_UNTRUSTED fallback', () => {
  const gitWrites = iterate
    .split('\n')
    .filter((line) => /`git (?:add|commit)\b/.test(line) && !/commit --amend/.test(line));
  assert.deepEqual(gitWrites, [
    '**No `git add` or `git commit` for an item runs outside `commit create`, inline items included;',
  ]);
  assert.match(
    flat(commitSection),
    /\*\*No `git add` or `git commit` for an item runs outside `commit create`, inline items included; the only exception is the `HOOKS_UNTRUSTED` fallback\.\*\*/,
  );
  assert.doesNotMatch(iterate, /effective-flow-state\.mjs lock acquire/);
  assert.match(
    fallback,
    /effective-flow-state\.mjs lock acquire <<< '\{[^\n]*"lock":"iterate-commit"/,
  );
  assert.match(
    commitSection,
    /```lazy-include\niterate-commit-fallback\nwhen: `commit create` returned `HOOKS_UNTRUSTED` for an item\n```/,
  );
  assert.match(
    commitSection,
    /node <skill-root>\/scripts\/effective-flow-state\.mjs commit create <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","worktree":"<EXECUTION_ROOT>","lock":"iterate-commit",[^\n]*"expect":[^\n]*"hookBase":[^\n]*"sameRepository":[^\n]*"message":/,
  );
});

// Invariant: every outcome `commit create` can return is mapped, so no outcome leaves an item
// half-committed or a lock held without an instruction; the map is closed against the core.
test('iterate maps every commit create outcome', () => {
  const coreCodes = new Set(
    [...commitCore.matchAll(/(?:StateOutcome|unstaged)\('([A-Z_]+)'/g)].map((match) => match[1]),
  );
  const codes = [...coreCodes, 'LOCK_HELD', 'INVALID_INPUT'];
  for (const code of codes) {
    assert.ok(outcomeMap.includes(`\`${code}\``), `the outcome map names ${code}`);
  }
  const text = flat(outcomeMap);
  assert.match(
    text,
    /`HOOKS_UNTRUSTED`: report `outcome\.reason`, and the orchestrator commits this item through the prose sequence of the fallback loaded below/,
  );
  assert.match(
    text,
    /`COMMIT_UNVERIFIED`: mark the item failed with `outcome\.commit`, perform no amend, reset or rebase, and stop delivery for reconciliation/,
  );
  assert.match(text, /`SANDBOX_DENIED`: `ABORT` with the diagnostics and no retry/);
  // An interrupted call whose commit landed is unverified, so it is never a plain abort.
  assert.match(
    text,
    /`INTERRUPTED`: with `outcome\.commit` set, the commit landed unverified: handle it as `COMMIT_UNVERIFIED`\. Without it, report it and `ABORT` the item/,
  );
  // `heldLock` appears only when the internal release failed, so the one retry is conditional
  // and its lost-ownership results end the handling. An `error` envelope can carry it too, so the
  // retry precedes every `ABORT` of the map.
  assert.match(
    text,
    /Any envelope carrying `heldLock` at `result`, `outcome` or `error` \(the internal release did not succeed, so the lock may still be held\), before any `ABORT` below: retry `lock release` once/,
  );
  assert.match(
    text,
    /a retry result `NOT_HELD` or `NOT_OWNER` is reported and needs no further action/,
  );
  assert.match(text, /`leftoverTombstone`/);
});

// Invariant: the fallback is loaded once, by its pointer at the decision point right after the
// outcome map; a second hand-written load sentence would read it twice.
test('iterate loads the HOOKS_UNTRUSTED fallback only through its lazy-include pointer', () => {
  assert.doesNotMatch(iterate, /iterate-commit-fallback\.md/);
  assert.match(outcomeMap, /```lazy-include\niterate-commit-fallback\nwhen: [^\n]*\n```\n\n$/);
});

// Invariant: the item commit follows that item's deep pre-commit review, so the delegation commits
// nothing and returns its paths and message uncommitted; the orchestrator issues the one
// `commit create` call itself. The call outlives a slow hook only with an explicit Bash timeout
// above the helper's commit bound; Codex escalates before the call.
test('the iterate orchestrator commits each item after its review; the delegation commits nothing', () => {
  const handoff = flat(
    section(
      iterate,
      'Each delegation **commits nothing**',
      'Each delegation receives its analyzed owned paths',
    ),
  );
  assert.match(
    handoff,
    /it carries the literal lines `Commit: caller-owned` and `Execution root: <this run's execution root>`, receives verbatim the bolded ban on other commit paths, and returns `DONE` with its actual paths/,
  );
  assert.match(
    flat(commitSection),
    /The orchestrator issues the call itself through the absolute helper path `<skill-root>\/scripts\/effective-flow-state\.mjs`/,
  );
  const text = flat(commitSection);
  // The inspection before the review fixes the call's `expect`, so the committed content is the
  // reviewed content.
  assert.match(text, /the OIDs are the call's `expect`/);
  assert.match(text, /These OIDs pin the reviewed content/);
  assert.match(
    text,
    /hash a symlink's link text \(`readlink -n <path>` into `git hash-object --stdin`\), never its target, and take a gitlink's checked-out commit/,
  );
  assert.match(text, /`item` is the caller-supplied identifier when it matches/);
  assert.match(
    text,
    /`hookBase` is the full SHA of `git merge-base HEAD origin\/<base>` in PR mode, after an explicit `git fetch origin <base>`/,
  );
  assert.match(
    text,
    /The orchestrator resolves `worktree`, `hookBase` and `sameRepository` as concrete values/,
  );
  const bound = /above the helper's (\d+) ms commit bound, for example (\d+) ms/.exec(text);
  assert.ok(bound, 'an explicit Bash timeout above the commit bound');
  assert.equal(Number(bound[1]), COMMIT_TIMEOUT_MS);
  assert.ok(Number(bound[2]) > COMMIT_TIMEOUT_MS);
  assert.match(text, /In Codex, request sandbox escalation for this call up front/);
});

// Invariant: the commit-lock contract stays shared with `apply-review`; for `iterate` its acquire
// and critical-section wording means the unchanged `commit create` call, and the in-section
// ownership check binds only the prose sequences.
test('the commit-lock contract carries the commit create sentence and scopes the prose steps', () => {
  const text = flat(commitLock);
  assert.ok(
    text.includes(
      'For `iterate`, "re-invoke `lock acquire`" and "the commit critical section" mean the unchanged `commit create` call, whose `LOCK_HELD` carries the same owner and identity details as `lock acquire`.',
    ),
  );
  assert.match(
    text,
    /This bullet binds the prose sequences only, `apply-review`'s and `iterate`'s `HOOKS_UNTRUSTED` fallback; `commit create` performs both steps itself/,
  );
});

// Invariant: realistic `review` runs answered inline and skipped reservation and report, so the
// always-loaded core gates every finding presentation on its persistence step, per review path,
// including the appendix-only and empty paths; in local mode that step is one `write-report` call.
test('review carries the per-path persistence gate', () => {
  const gate = flat(section(review, '**Persistence gate.**', '#### Local mode'));
  assert.match(
    gate,
    /No finding appears in chat or is published before its IDs are reserved and its artifact exists/,
  );
  for (const pattern of [
    /\*\*Local mode:\*\* with at least one admitted finding, one `review write-report` call \(local step 2\) reserves the IDs, writes the report and returns `ok: true` with `result\.summary` \(overflow: its fragment\), the only chat presentation of its findings/,
    /\*\*Publishing target:\*\* `memory reserve` \(step 4\) before any tracker write; the only local artifact is the security report/,
    /\*\*Pull-request special case:\*\* `memory reserve` before anything is published onto the pull request; the only local artifact is the security report for withheld `local-only` findings/,
    /A chat-only outcome \(hidden mode, a closed or foreign pull request reported read-only, a declined publication\) has the chat report itself as its artifact, presented after `memory reserve`/,
    /\*\*Plan-file and concept-file special cases:\*\* no IDs and no report/,
    /\*\*Standalone-audit appendix only\*\* \(no admitted finding, an eligible appendix entry\): local mode allocates the path alone through `name-allocate`, reserves nothing, and writes the appendix-only report/,
    /\*\*No admitted finding and no appendix entry:\*\* nothing is reserved or written on any path/,
  ]) {
    assert.match(gate, pattern);
  }
  assert.match(review, /^```include\nhelper-call-shape\n```$/m);
});

const localMode = section(review, '#### Local mode', '#### Publishing target');
const localStep = section(localMode, '2. With at least one admitted finding', '3. If the active');

// Invariant: the helper renders the report from structured input, so local step 2 shows one
// literal `write-report` call whose invocation prefix is the build placeholder (runtime scripts
// cannot know the target) and names every required input key, so no run hand-writes the report.
test('review local step 2 shows the literal write-report call and its input keys', () => {
  assert.match(
    localStep,
    /^ {3}node <skill-root>\/scripts\/effective-flow-state\.mjs review write-report <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","owner":\{"workflow":"review"\},"language":"<language>","invocationPrefix":"\{\{FLOW\}\}","scope":"<scope>","projectType":"<project type>","findings":\[<finding>,…\]\}'$/m,
  );
  const text = flat(localStep);
  for (const key of [
    'title',
    'severity',
    'complexity',
    'area',
    'file',
    'problem',
    'recommendation',
    'action',
    'admissionReason',
    'evidence',
    'evidenceDigest',
    'currentReachability',
    'rootCauseSignature',
    'scopeAndContainment',
    'whyNow',
    'completionCondition',
    'security',
    'promptSuggestion',
    'skipped',
    'closedObservations',
    'notesFiltered',
    'validationSkipped',
  ]) {
    assert.ok(text.includes(`\`${key}\``), `step 2 names the input key ${key}`);
  }
  assert.match(text, /once IDs are reserved, never call `review write-report` again/);
  assert.ok(
    !text.includes('`developerNote`'),
    'review never fills developerNote, so step 2 omits it',
  );
  assert.match(
    text,
    /The JSON stays on one line: a multi-line value writes its line breaks as `\\n`, a `'` as `'\\''`/,
  );
  assert.match(
    text,
    /`security`: the Phase-3 exposure marking, `external` or `internal`, for every `local-only` finding and `none` for a `publishable` one/,
  );
  for (const shape of [
    '`admissionReason` (`material-harm` or `irreversible-commitment`)',
    'items `{finding, designDecision, source}`',
    'items `{title, reason}`',
  ]) {
    assert.ok(text.includes(shape), `step 2 names ${shape}`);
  }
});

// Invariant: every `write-report` outcome has one bounded instruction, so a run neither loops on
// retries nor falls back to chat-only findings; the overflow path is the only route to
// `open-report`. `write-report` runs a missing migration itself, so review keeps no local
// MIGRATION_REQUIRED branch, while the overflow path's `open-report` keeps its retry.
test('review local step 2 maps the write-report outcomes', () => {
  const text = flat(localStep);
  assert.doesNotMatch(review, /MIGRATION_REQUIRED/);
  assert.match(
    flat(readSource('shared', 'review-write-report-fallback.md')),
    /only its `MIGRATION_REQUIRED` retry repeats the call before one/,
  );
  for (const pattern of [
    /`INVALID_INPUT` \(nothing reserved\): correct the named key once and retry; a second one stops the run, naming the key/,
    /A stop below \(`REPORT_WRITE_FAILED`, a second `INVALID_INPUT`\) keeps the wisdom file; a re-run reserves a new range/,
    /`INPUT_TOO_LARGE`, or the shell refuses the command with "Argument list too long": take the overflow path loaded below/,
    /`REPORT_WRITE_FAILED`: stop, naming its reserved range as a permanent ID gap and its failing step\. A guard code there, like any runtime-state guard refusal, preserves all state and directs the user to `\{\{SKILL:setup\}\}`/,
  ]) {
    assert.match(text, pattern);
  }
  assert.match(
    localMode,
    /\n```lazy-include\nreview-write-report-fallback\nwhen: `review write-report` returned `INPUT_TOO_LARGE` or the shell refused it with "Argument list too long"\n```\n/,
  );
});

// Invariant: a migration `write-report` ran or failed in its call reaches the owner of its handling
// and report through a second lazy trigger, and that owner states that its steps 1 and 2 already
// ran, so review neither misses the migration report nor migrates a second time.
test('review loads the migration owner when write-report reports its migration', () => {
  assert.match(
    localMode,
    /\n```lazy-include\neffective-flow-dir-migration\nwhen: `write-report`'s result carries `migration\.performed: true` or `migration\.failed: true`\n```\n/,
  );
  const migration = flat(readSource('shared', 'effective-flow-dir-migration.md'));
  assert.match(
    migration,
    /3\. \*\*Handle the outcome\.\*\* `review write-report` runs this prerequisite in the same call: when its `result\.migration` has `performed: true` or `failed: true`, steps 1 and 2 already ran and are not repeated; read the success fields \(`source`, `copiedCount`, `keptCount`, `skipped`\) from `result\.migration`\./,
  );
});

// Invariant: `open-report` plus a hand-written report is the overflow path only, so the
// always-loaded core never offers it; the lazy fragment carries its literal call, its re-check and
// its own presentation, which shows the path and severity counts only after the file exists.
test('review reaches open-report only through the lazy overflow fragment', () => {
  assert.doesNotMatch(review, /open-report/);
  assert.doesNotMatch(review, /review-write-report-fallback\.md/);
  const overflow = flat(readSource('shared', 'review-write-report-fallback.md'));
  assert.ok(
    overflow.includes(
      `node <skill-root>/scripts/effective-flow-state.mjs review open-report <<< '{"cwd":"<RUNTIME_STATE_ROOT>","owner":{"workflow":"review"},"count":<N>}'`,
    ),
  );
  assert.match(
    overflow,
    /re-check that `reportPath` is still absent; if it is present, re-allocate the path alone through local mode's path-only allocation and keep the reserved IDs/,
  );
  assert.match(
    overflow,
    /After a successful reservation, never call `review open-report` again; only its `MIGRATION_REQUIRED` retry repeats the call before one/,
  );
  assert.match(
    overflow,
    /\*\*Presentation:\*\* only after the report file exists, present its path and the severity counts, and no finding, title or location; then the remaining local steps follow/,
  );
  assert.match(
    overflow,
    /a report holding at least one `local-only` finding carries the disclosure banner\s+directly below the header fields/,
  );
});

// Invariant: realistic runs decided right after reading the top of `review` that a small, inline
// review ends with chat-only findings, so the Goal states before the workflow body that local
// findings reach chat only as `result.summary`, after `write-report` returns, naming the small-diff
// inline review; the per-path detail stays in the gate. Its only exceptions are the in-call
// migration report and, on a failed migration, a counts-only line without finding content.
test('review states the summary-only presentation in its Goal and covers inline reviews', () => {
  const goal = flat(section(review, '## Goal', '```'));
  assert.match(
    goal,
    /\*\*In local mode \(the `local` target outside the pull-request special case\), review presents no finding, finding title or severity count before `review write-report` returns `ok: true` \(overflow: its fragment\), also when the review itself runs inline because the change is small: skipping workers, the validator or the fan-out never skips that call\. The chat presentation is `result\.summary` as returned, followed only by framing without finding content \(no restated finding, title, severity or location\) and the next-steps block\.\*\*/,
  );
  assert.match(
    goal,
    /\*\* Exceptions: the migration report of `shared\/effective-flow-dir-migration\.md` step 3 may precede it; on `migration\.failed: true` only "N findings not persisted: `<code>`" with the severity counts plus that report, and no finding content, title or location\. Other paths: "Persistence gate"\./,
  );
  assert.ok(review.indexOf('## Goal') < review.indexOf('**Persistence gate.**'));
  const text = flat(localMode);
  assert.match(
    text,
    /6\. Present `result\.summary` as returned; the overflow path presents as its fragment states\./,
  );
  assert.match(
    text,
    /8\. If the report contains at least one admitted finding, emit the next-step block per `next-steps` as the last element of the report presented in chat\./,
  );
  assert.doesNotMatch(text, /Present the most important findings/);
});

// Invariant: the persistence step is visible as its own task and the run cannot report complete
// while an admitted finding lacks its ID or its local report entry.
test('review lists the persistence task and extends its completion condition', () => {
  assert.match(
    review,
    / {3}- "Phase 3: Aggregation and design-decision filter"\n {3}- "Reserve IDs and persist the findings"\n {3}- "Phase 4: Report"/,
  );
  assert.match(
    flat(review),
    /The run is incomplete while an admitted finding has no reserved ID or, in local mode, no report entry\./,
  );
});

// Invariant: review runs no runtime-state probe of its own before a state-helper call and calls the
// helper as one bare command, because both a manual memory.json probe and a `cd … &&` prefix
// prompted in default mode in the work package 9 measurement (round 1).
test('review leaves helper-owned guards to the helper and calls it as one bare command', () => {
  const review = readFileSync(new URL('../src/tools/review.md', import.meta.url), 'utf8');
  const trigger =
    'when: a wisdom, cache, or tracker-marker mutation outside a state-helper call is imminent; the helper guards its own memory, report and migration writes and detects legacy state itself, so run no probe of your own before it';
  for (const fragment of ['runtime-state-safety', 'effective-flow-dir-migration']) {
    assert.ok(review.includes(`\`\`\`lazy-include\n${fragment}\n${trigger}\n`), fragment);
  }
  assert.match(
    review,
    /Run exactly this one command from any directory: no `cd`, no other command around it\./,
  );
});

// Invariant: the router itself carries the bare-command helper-call rule and review's presentation
// rule with its two migration exceptions, so both reach a run before any tool file is read (work
// package 9, fix round 2).
test('the router states the bare helper-call rule and review presentation rule', () => {
  const router = readFileSync(new URL('../src/SKILL.md', import.meta.url), 'utf8');
  assert.match(
    router,
    /Every bundled helper call is one bare command, `node <skill-root>\/scripts\/<helper>\.mjs <argv> <<< '<json>'`, run from any directory: no `cd`, `&&`, `;` or pipe around it\./,
  );
  assert.match(
    router,
    /`review` presents local findings only as the `result\.summary` of its `review write-report` call, also when it reviews a small diff inline\. Two exceptions: the migration report of `shared\/effective-flow-dir-migration\.md` step 3 may precede it, and on `migration\.failed: true` review presents only "N findings not persisted: `<code>`" with the severity counts plus that migration report, and no finding content, title or location\./,
  );
});
