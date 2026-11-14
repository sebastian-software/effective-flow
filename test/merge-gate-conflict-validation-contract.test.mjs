import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  EVIDENCE_NOT_YET_REASONS,
  QUICK_MARKER_KEY,
  QUICK_MARKER_VALUE,
  hasQuickMarker,
} from '../src/scripts/conflict-validation-core.mjs';

// Contract tests for proportionate merge-gate conflict validation: the effective mode decides how
// the conflict-merge commit is validated, environment failures stop instead of causing reruns, and
// a `quick`-validated commit merges only on CI evidence. Each test reads the source prose that
// ships to every target and names the invariant it protects.

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

const fragment = readSource('shared', 'merge-gate-conflict-resolution.md');
const delegatedRun = readSource('shared', 'merge-gate-delegated-run.md');
const resolver = readSource('agents', 'merge-conflict-resolver.md');
const validator = readSource('agents', 'code-validator.md');

const AD7_RULE =
  'on an environment signature, report the check and its diagnostic; no suite split, no base comparison, no rerun';

const resolverHandoff = prose(
  slice(fragment, 'Hand `{{AGENT:merge-conflict-resolver}}`:', 'Consume from it:', 'fragment'),
);
const validatorHandoff = prose(
  slice(
    fragment,
    '  Hand `{{AGENT:code-validator}}`:',
    "**`{{AGENT:code-validator}}`'s own result",
    'fragment',
  ),
);
const modeSection = prose(slice(fragment, '#### Conflict validation mode', null, 'fragment'));
const resolverValidation = prose(slice(resolver, '## Validation', '\n## Staging', 'resolver'));

// Invariant: under effective `quick` the resolver runs targeted checks only, so the combined gate
// runs at most once, in the validator; a high-risk classification returns it to `full`.
test('effective quick limits the resolver to targeted checks and returns high risk to full', () => {
  assert.match(
    resolverHandoff,
    /under `quick`, targeted checks for the conflicted and adjacent paths only, and `full` validation as soon as it classifies a conflicted path high-risk/,
  );
  assert.match(
    resolverValidation,
    /Under the validation mode `quick`, run targeted checks only:\*\* the established checks for the conflicted and adjacent paths, never the combined or top-level gate, which the independent validator runs once\. As soon as you classify a conflicted path high-risk, validate as under `full`\./,
  );
});

// Invariant: under effective `quick` the validator excludes only the detected CI test commands and
// still requires every other established check, with a combined gate split into its remaining
// subcommands or else `full`.
test('effective quick excludes only the detected test commands from the validator scope', () => {
  assert.match(
    modeSection,
    /names every command in `data\.testCommands` as an excluded command: exclude only those, by normalized script identity; require every other established check the repository's instructions or CI define for this change; replace a mandated combined gate that contains an excluded command by its remaining established subcommands\. Where those cannot run separately, the validator runs `full` and says so, and the effective mode is `full`\./,
  );
  const scope = prose(
    slice(validator, 'A **conflict-commit scope**', '**On an environment', 'validator'),
  );
  assert.match(scope, /skip only the named excluded test command, by normalized script identity/);
  assert.match(scope, /run every other established check for the assigned buckets/);
  assert.match(
    scope,
    /replace a mandated combined gate that contains the excluded command by its remaining established subcommands\. Where those cannot run separately, run `full`/,
  );
  // No new result state: the skip uses the owner's `SKIPPED (<reason>)` form.
  assert.match(scope, /as `SKIPPED \(covered by CI\)`/);
  assert.doesNotMatch(validator, /\bDEFERRED\b|\bENVIRONMENT\b/);
});

// Invariant: under effective `full` nothing that a non-opted-in repository relies on changes: the
// resolver keeps the combined-gate rule and the validator gets `full`.
test('effective full keeps the resolver combined gate and the validator full mode', () => {
  assert.match(
    resolverValidation,
    /Where the repository mandates a combined or top-level gate .* honor it in full whatever the roles of the conflicted files are\./,
  );
  assert.match(
    resolverValidation,
    /Under `full`, or with no mode handed, the rules above apply unchanged\./,
  );
  assert.match(
    validatorHandoff,
    /`full`, because this commit has no other pre-commit gate \(see "Git write boundary"\) and `full` is the mode that preserves a repository-mandated combined or top-level gate – or, only where the effective mode of "Conflict validation mode" is `quick`, the \*\*conflict-commit scope\*\*/,
  );
  assert.match(
    prose(validator),
    /`full`: ask the owner to run every applicable established check for the assigned buckets while preserving a repository-mandated combined or top-level gate\./,
  );
});

// Invariant: both handoffs and both receiving roles carry the environment rule verbatim, so no
// role splits a suite, compares against the base or reruns on an environment failure.
test('both handoffs and both roles carry the environment-signature rule', () => {
  for (const [label, text] of [
    ['resolver handoff', resolverHandoff],
    ['validator handoff', validatorHandoff],
    ['resolver', prose(resolver)],
    ['validator', prose(validator)],
  ]) {
    assert.ok(
      text.toLowerCase().includes(AD7_RULE),
      `${label} must carry "${AD7_RULE}" so the classification happens before any rerun`,
    );
  }
});

// Invariant: an environment signature under effective `full` stops the round before the commit and
// the push; only the excluded test command under `quick` is deferred to CI.
test('an environment signature under full stops before the push', () => {
  assert.match(
    modeSection,
    /A check with one counts as not executed, and the round ends as a stop before the commit and the push that reports the signature class and the affected checks\. Under effective `full` that holds with or without CI\./,
  );
  assert.match(
    modeSection,
    /Under effective `quick` only the excluded test command is deferred to CI/,
  );
  for (const signature of [
    "the execution environment's own wall-clock limit",
    'no space left on device',
    'version control unavailable for a check that needs it',
    'process termination unconfirmed',
  ]) {
    assert.ok(modeSection.includes(signature), `the classification must name: ${signature}`);
  }
  assert.match(
    prose(fragment),
    /A check either role reports with an \*\*environment signature\*\* counts as not executed/,
    'the fail-closed rule must count an environment check as not executed',
  );
});

// Invariant: a host-tool timeout or an unattributable timeout is no environment signature, so
// repositories with long suites keep today's path rather than stopping.
test('a host-tool timeout is not a stop signature', () => {
  assert.match(
    modeSection,
    /A timeout of a role's own host tool, and any timeout it cannot attribute, is no environment signature and keeps today's path\./,
  );
  for (const [label, text] of [
    ['resolver', prose(resolver)],
    ['validator', prose(validator)],
  ]) {
    assert.match(
      text,
      /A timeout of your own host tool, or one you cannot attribute, is none of these\./,
      label,
    );
  }
});

// Invariant: the configured value is a ceiling confirmed by the base; anything unconfirmed is full.
test('the ceiling is quick only when the base confirms the row', () => {
  assert.match(
    modeSection,
    /`node <skill-root>\/scripts\/config-resolve\.mjs conflict-validation <<< '\{"cwd":"<checkout>","tool":"merge-gate","baseRef":"<base>"\}'`/,
  );
  assert.match(
    modeSection,
    /`data\.conflictValidation\.baseComparison` is `equal` or `hidden-self`; a missing, invalid or base-unconfirmed value and a failed call are `full`\./,
  );
  assert.match(
    modeSection,
    /resolver's record classifies no conflicted path high-risk, and `ci-integrity` holds again on the staged index; otherwise `full`\./,
  );
});

// Invariant: a quick-validated conflict commit merges only on fresh CI evidence for
// VERIFIED_HEAD_SHA; nothing else satisfies the condition and there is no local fallback.
test('Phase 4 requires CI evidence for a quick-validated conflict commit', () => {
  const condition = prose(
    slice(
      delegatedRun,
      '11. where the wisdom file records a quick-validated',
      '#### The set-aside confirmation',
      'delegated run',
    ),
  );
  assert.match(condition, /its status read carries `includeCheckIdentity: true`/);
  assert.match(
    condition,
    /ci-integrity <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","baseRef":"<baseRef>","tree":"<VERIFIED_HEAD_SHA>"\}'/,
  );
  assert.match(condition, /conflict-validation\.mjs ci-evidence-match <<< /);
  assert.match(condition, /the waiver and the no-CI policy never satisfy this condition/);
  assert.match(
    condition,
    /leaves the pushed commit in place: no force push and no local `full` run/,
  );
  assert.match(condition, /check-wait timeout path is unchanged/);
});

// Invariant: a quick-validated conflict commit carries its own proof: the trailer the helper scans
// for is written into the commit before the push, and a pre-push scan that does not list the commit
// stops the round without pushing.
test('a quick conflict commit carries the scanned trailer before the push, self-checked pre-push', () => {
  const trailer = `${QUICK_MARKER_KEY}: ${QUICK_MARKER_VALUE}`;
  assert.equal(trailer, 'Effective-Flow-Conflict-Validation: quick');
  assert.ok(
    modeSection.includes(
      `under effective \`quick\` its message is Git's default one followed by one blank line and the trailer line \`${trailer}\` as its last line, written into the commit before the push and never amended in afterwards.`,
    ),
    'the prose must name the exact trailer the helper scans for, written before the push',
  );
  assert.ok(
    hasQuickMarker(`Merge remote-tracking branch 'origin/develop' into feature\n\n${trailer}\n`),
    'the message shape the prose prescribes must be one the helper recognizes',
  );
  assert.match(
    modeSection,
    /Before the push, `node <skill-root>\/scripts\/conflict-validation\.mjs quick-marker-scan <<< '\{"cwd":"<checkout>","baseRef":"<base>","headSha":"<merge commit>"\}'` must list that commit in `data\.commits`; otherwise stop as on a rejected push, pushing nothing\./,
  );
});

// Invariant: the quick-marker scan runs in every gate run whose base-confirmed ceiling is `quick`,
// also one that never saw the conflict, so the CI-evidence condition outlives the run that recorded
// it; a failed fetch or scan fails closed as found. Any other ceiling, a failed ceiling call
// included, fetches and scans nothing, so a non-opted-in repository pays no extra fetch.
test("Phase 4 scans for the quick marker only under a quick ceiling or the run's own record", () => {
  assert.match(
    modeSection,
    /Phase 4 of every gate run whose base-confirmed ceiling is `quick` – this one, a later one, or one that never saw the conflict – runs the same scan on `VERIFIED_HEAD_SHA` \(`data\.found`; a failed call, such as `shallow-repository`, counts as found\)/,
  );
  const phase4 = prose(
    slice(
      delegatedRun,
      '### Phase 4: Merge preconditions',
      'Only after that fresh status',
      'delegated run',
    ),
  );
  assert.match(
    phase4,
    /where the wisdom file records a quick-validated conflict commit, that read carries `includeCheckIdentity: true`\./,
  );
  assert.match(
    phase4,
    /Condition 11 applies where the wisdom file records such a commit\. Otherwise call `node <skill-root>\/scripts\/config-resolve\.mjs conflict-validation <<< '\{"cwd":"<checkout>","tool":"merge-gate","baseRef":"<base>"\}'`/,
  );
  assert.match(
    phase4,
    /only where its `data\.conflictValidation\.ceiling` is `quick`, run the ancestry check's two fetches \(Phase 2 step 1\) for this pull request and `<base>`, unless this round already made them for that base, then, rooted in `RUNTIME_STATE_ROOT`, `node <skill-root>\/scripts\/conflict-validation\.mjs quick-marker-scan <<< '\{"cwd":"<RUNTIME_STATE_ROOT>","baseRef":"<base>","headSha":"<VERIFIED_HEAD_SHA>"\}'`: condition 11 applies where `data\.found` is `true`, and a failed fetch or scan counts as found\./,
  );
  assert.match(
    phase4,
    /Any other ceiling, a failed ceiling call included, fetches and scans nothing, and condition 11 does not apply\./,
  );
  assert.match(
    phase4,
    /Where it applies and the read carried no `includeCheckIdentity: true`, one new `pr-status-read` that carries it replaces that read in this batch\./,
  );
});

// Invariant: CI that has not reported on the pushed head yet is a wait, not a stop, for exactly the
// helper's not-yet reasons: `missing` waits once inside the round and then stops naming that
// reason, while `pending` starts a new Phase-2 round bounded by the check wait and
// `mergeGate.maxRounds`. Condition 11 never performs a Phase-3 return, so a returning condition
// takes precedence and the round count stays bounded.
test('a missing CI evidence reason waits in the round and a pending one starts a bounded Phase-2 round', () => {
  assert.deepEqual([...EVIDENCE_NOT_YET_REASONS], ['missing', 'pending']);
  const condition = prose(
    slice(
      delegatedRun,
      '11. where the wisdom file records a quick-validated',
      '#### The set-aside confirmation',
      'delegated run',
    ),
  );
  assert.match(
    condition,
    /Two `ci-evidence-match` `data\.reason` values are not yet satisfied, and are handled only where conditions 7 and 10 are met, per "Round accounting"\./,
  );
  assert.match(
    condition,
    /`missing` – the expected instances have not registered on this head yet, as right after the push – waits inside this round: run Phase 2 step 2's check wait once, counting the missing instances as pending on its `host-pr-watch` path, then evaluate Phase 4 again on a new batch\. Still `missing` then, the run stops naming that reason, not exhausted rounds\./,
  );
  assert.match(
    condition,
    /`pending` is a still-pending check: it ends this evaluation and starts a new Phase-2 round, so step 2's check wait and `mergeGate\.maxRounds` bound it\./,
  );
  const accounting = prose(
    slice(
      delegatedRun,
      '#### Round accounting',
      '### Phase 3: Automatic reviewer round',
      'delegated run',
    ),
  );
  assert.match(
    accounting,
    /\*\*Condition 11 performs no return\.\*\* An unmet returning condition takes precedence over it: the return carries no condition-11 item, and the next Phase-4 evaluation decides condition 11 afresh\./,
  );
  assert.match(
    accounting,
    /Its `missing` wait and the evaluation after it happen once per round and open no round; its `pending` result starts a Phase-2 round, counted like any other\./,
  );
});

// Invariant: the presence marker is released before the wisdom file holding its token is deleted,
// so no completed run leaves a live marker behind; the two keeping returns keep both.
test('Phase 6 releases the presence marker before deleting the wisdom file', () => {
  const presence = prose(
    slice(delegatedRun, '### Run presence', '## `effective-delivery`', 'delegated run'),
  );
  assert.match(
    presence,
    /`release` \(the same input without `head`\) runs in Phase 6 step 1 before the wisdom file is deleted, except on a `BLOCKED-USER` or `SUSPENDED host-pr-watch` return\./,
  );
  const step1 = prose(
    slice(
      delegatedRun,
      '1. Delete the wisdom file',
      '2. Run the worktree-record exit self-check.',
      'delegated run',
    ),
  );
  assert.match(
    step1,
    /Before that deletion, `release` the presence marker with the token the wisdom file holds, under the same exception\./,
  );
});

// Invariant: the long-command execution fact ships in no build until the host check confirmed it
// at the depth the roles run at; the delegated resolver runs one level deeper than the depth the
// Claude Code check proved, so neither handoff nor role carries it on any target.
test('the long-command execution fact is carried by no build', () => {
  for (const [label, text] of [
    ['fragment', fragment],
    ['delegated run', delegatedRun],
    ['resolver', resolver],
    ['validator', validator],
  ]) {
    assert.doesNotMatch(
      prose(text),
      /run long commands through the host's background mechanism/,
      `${label} must not carry the unconfirmed execution fact`,
    );
  }
  assert.doesNotMatch(modeSection, /\{\{BUILD_TARGET\}\}/);
  const adr = prose(
    readFileSync(join(ROOT_DIR, 'docs', 'adr', 'merge-gate-conflict-validation.md'), 'utf8'),
  );
  assert.match(adr, /No build carries it yet\./);
  assert.match(adr, /the fact is not carried in any build until then\./);
});

// Invariant: the presence marker is registered only after Entry steps 1 to 3, which write nothing,
// and survives the returns that keep the wisdom file.
test('the presence marker lifecycle follows the wisdom file', () => {
  const presence = prose(
    slice(delegatedRun, '### Run presence', '## `effective-delivery`', 'delegated run'),
  );
  assert.match(presence, /never a message to a session/);
  assert.match(presence, /`register` runs once Entry step 4's read completed/);
  assert.match(presence, /except on a `BLOCKED-USER` or `SUSPENDED host-pr-watch` return/);
  assert.match(presence, /pass none of its fields to a command/);
  assert.match(presence, /`git diff --name-only origin\/<base>\.\.\.<head>` for each run/);
  assert.match(presence, /"possibly stale" with its age, never active/);
});
