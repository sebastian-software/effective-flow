import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { limitationText } from '../src/scripts/build-run-core.mjs';

// Contract tests for an unsupported validation environment: when the project's test entrypoint
// stops at its own preflight, no test-executing role substitutes a preflight-bypassing full-suite
// run, and build and iterate record limited evidence before they continue on the PR lane or stop.
// Each test reads the source prose that ships to every target and names the invariant it protects.

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

const VALIDATOR_FRAGMENT = 'validation-environment-unsupported';
const CONTINUATION_FRAGMENT = 'validation-environment-continuation';

const unsupported = prose(readSource('shared', `${VALIDATOR_FRAGMENT}.md`));
const continuation = prose(readSource('shared', `${CONTINUATION_FRAGMENT}.md`));
const buildRun = readSource('shared', 'build-delegated-run.md');
const iterate = readSource('tools', 'iterate.md');

const lazyFragments = (text) =>
  [...text.matchAll(/```(lazy-include|include)\n([^\n]+)\n/g)].map((match) => match[2].trim());

// Every source that loads a fragment, eagerly or lazily, keyed by its path below src/.
function consumers(fragment) {
  const found = [];
  for (const directory of ['agents', 'shared', 'tools']) {
    for (const name of readdirSync(join(ROOT_DIR, 'src', directory))) {
      if (!name.endsWith('.md')) continue;
      if (lazyFragments(readSource(directory, name)).includes(fragment))
        found.push(`${directory}/${name}`);
    }
  }
  return found.sort();
}

// Invariant: the trigger is observable behaviour, a structured preflight report or the version
// control signature; an ordinary early exit and a self-inflicted preflight failure stay product
// failures, so a broken test script is never excused as an environment result.
test('the trigger needs a structured preflight report and excludes self-inflicted failures', () => {
  assert.match(
    unsupported,
    /the project's test entrypoint exits before any test runs with a structured preflight report that names a failed check id/,
  );
  assert.match(
    unsupported,
    /a check fails with the environment signature "version control unavailable for a check that needs it"/,
  );
  assert.match(
    unsupported,
    /\*\*Not a trigger, but a product failure:\*\* an ordinary early exit without such a report, such as a missing install or a broken script, and any preflight failure when the change under validation touches the test entrypoint, the preflight, or their configuration\./,
  );
});

// Invariant: no role routes around the preflight: no suite-equivalent run outside the entrypoint,
// no edit to the probe or test script, and no change to the Git environment variables.
test('the forbidden substitutes cover bypass runs, preflight edits and the Git environment', () => {
  const forbidden = prose(slice(unsupported, '**Forbidden substitutes.**', '**Permitted', 'rule'));
  assert.match(
    forbidden,
    /run the full suite, or a suite-equivalent selection, outside the project's entrypoint, such as a bare `node --test` or `node --test` over a directory or glob that covers the suite/,
  );
  assert.match(forbidden, /neutralize the preflight by editing the probe or the test script/);
  assert.match(forbidden, /set, unset or alter `GIT_DIR` or `GIT_WORK_TREE`/);
});

// Invariant: targeted evidence stays bounded to named test files that touch a changed path; a
// suite-covering directory or glob is never targeted, and a missing prerequisite never repairs.
test('targeted evidence is bounded to named files and environment results never repair', () => {
  assert.match(
    unsupported,
    /the underlying runner limited to named test files that directly name or import a changed path, never a suite-covering directory or glob/,
  );
  assert.match(unsupported, /whole-repository checks that do not need the failed prerequisite/);
  assert.match(
    unsupported,
    /an environment result reported with its diagnostic: never a product failure, never a repair item, and never a reason for a full-suite rerun/,
  );
  assert.match(
    unsupported,
    /Report the suite as `SKIPPED \(environment: <prerequisite id>\)` and each targeted run as its own entry/,
  );
});

// Invariant: limited evidence never reads as a full pass, and forge-visible text carries only the
// prerequisite id and reason class, never the probe message with its absolute paths.
test('reporting never claims a full pass and keeps the probe message off the forge', () => {
  assert.match(unsupported, /never "all passed"/);
  assert.match(continuation, /Never report validation as fully passed/);
  assert.match(
    continuation,
    /The full probe message can carry absolute paths, so it appears only in the local run report\. Every forge-visible text carries only the prerequisite id and reason class: pull-request comments, the verification-evidence record, and text handed back under `Summary comment: suppressed`\./,
  );
  // The helper's DONE disclosure is the same "no local full-suite evidence" wording.
  assert.equal(
    limitationText('git-checkout'),
    'no local full-suite evidence (environment: git-checkout)',
  );
  assert.match(continuation, /Record "no local full-suite evidence" with the prerequisite id/);
});

// Invariant: every test-executing role reaches the validator fragment, while only build and
// iterate reach the continuation decision; the validator itself never owns a lane decision.
test('the test-executing roles reach the validator fragment and only build and iterate the continuation', () => {
  assert.deepEqual(consumers(VALIDATOR_FRAGMENT), [
    'agents/code-validator.md',
    'agents/test-writer.md',
    'shared/build-delegated-run.md',
    'tools/deliver.md',
    'tools/iterate.md',
  ]);
  assert.deepEqual(consumers(CONTINUATION_FRAGMENT), [
    'shared/build-delegated-run.md',
    'tools/iterate.md',
  ]);
  assert.doesNotMatch(readSource('agents', 'code-validator.md'), new RegExp(CONTINUATION_FRAGMENT));
  assert.doesNotMatch(unsupported, /\blanes?\b/i);
  // Deliver's pointer sits at step 4.3, where deliver runs its own validation.
  assert.match(
    readSource('tools', 'deliver.md'),
    /3\. Run the repository's established pre-commit validation[^\n]*\n[^\n]*\n\n```lazy-include\nvalidation-environment-unsupported\nwhen: step 4\.3's test entrypoint/,
  );
});

// Invariant: build decides the lane at Phase 7 step 1, before completion preparation and the
// handback commit; PR and plan-PR continue, every no-PR lane stops, an unresolved row is asked
// there, and an unanswerable non-interactive run counts as no-PR.
test('build decides the environment lane at Phase 7 before the completion commit', () => {
  const step = prose(
    slice(buildRun, '**Environment lane.**', '\n2. For delegated execution', 'build'),
  );
  assert.ok(
    buildRun.indexOf('**Environment lane.**') < buildRun.indexOf('`prepare-completion`. Document'),
  );
  assert.match(step, /decide here, before `prepare-completion` and the handback commit/);
  assert.match(
    step,
    /The lane is the explicit run override, else `delivery\.completion`: `pr`, or continuing an existing plan pull request, continues; `merge`, `branch`, an unset row \(default `merge`\) and in-place without delivery stop;/,
  );
  assert.match(
    step,
    /a `null` or invalid row is asked now, in a delegated run through `question` with origin `delivery-choice`, and the answer is recorded in the "Determine mode" slot of `worktree-integration`, so handback step 3 does not ask again\./,
  );
  assert.match(step, /A non-interactive run that cannot be answered counts as no-PR\./);
  assert.match(
    step,
    /The stop is a terminal `ABORT` naming the prerequisite id: keep and report the owned worktree and branch, finalize the pilot record with `completionStatus: aborted`, and recover through a fresh run once the prerequisite holds\./,
  );
  assert.match(
    step,
    /Under `Commit: caller-owned` decide nothing: return `DONE` with the limitation and let the caller decide\./,
  );
  assert.match(
    prose(readSource('shared', 'worktree-integration.md')),
    /A completion answer obtained later in this run, such as build's environment-lane question at Phase 7 step 1, is recorded in this slot as the explicit action/,
  );
});

// Invariant: Phase 5 records an environment result as provisional limited evidence and never
// hands it to an implementer as a repair.
test('build Phase 5 sends no environment result to the implementer', () => {
  const phase = prose(slice(buildRun, '### Phase 5: Validation', '### Phase 6: Review', 'build'));
  assert.match(
    phase,
    /record the `validation` gate as provisionally `limited` with that id; Phase 7 step 1 decides whether the run continues\./,
  );
  assert.match(
    phase,
    /If errors are found: delegate the repair to the routed Quality implementer\. An environment result is no error and goes to no implementer\./,
  );
});

// Invariant: iterate continues in PR mode with the redacted limitation and ends in local mode with
// its commits kept; its direct project-wide gate is a test-executing role too.
test('iterate continues in PR mode and stops in local mode, including its direct gate', () => {
  const step = prose(
    slice(iterate, '3. **Environment preflight.**', '### Phase 5: Delivery back', 'iterate'),
  );
  assert.match(
    step,
    /When the validator, or the project-wide gate step 1 started directly, reports the suite stopped at the project's own environment preflight, both fragments below apply; step 1's gate is then a test-executing role, and no environment result becomes a correction item\./,
  );
  assert.match(
    step,
    /In PR mode the round continues to Phase 5 with the redacted limitation in its report or summary comment\./,
  );
  assert.match(
    step,
    /In local mode the run ends reporting the blocked prerequisite; the Phase 3 commits stay and nothing is pushed\./,
  );
  for (const fragment of [VALIDATOR_FRAGMENT, CONTINUATION_FRAGMENT])
    assert.match(
      slice(iterate, '3. **Environment preflight.**', '### Phase 5: Delivery back', 'iterate'),
      new RegExp('```lazy-include\\n' + fragment + '\\nwhen: '),
    );
});

// Invariant: a handed merge-gate environment rule and protected validation take precedence over
// the targeted fallback and the lane decision.
test('merge-gate rules and protected validation take precedence', () => {
  assert.match(
    unsupported,
    /A caller's handed environment rule, such as the merge gate's "on an environment signature, report the check and its diagnostic; no suite split, no base comparison, no rerun", governs the signature classes it names; the targeted runs above apply only where the caller hands no rule\. The forbidden substitutes bind in every case\./,
  );
  assert.match(
    continuation,
    /Under protected validation a local probe failure is recorded as `protected-validation` already requires\. It yields neither a stop nor a `limited` outcome, because remote full-preflight proof stays required\./,
  );
  assert.match(
    prose(slice(buildRun, '**Environment lane.**', '\n2. For delegated execution', 'build')),
    /Under protected validation this decision does not apply\./,
  );
  assert.match(
    prose(slice(iterate, '3. **Environment preflight.**', '```lazy-include', 'iterate')),
    /A rule handed under step 5 of `iterate-review-fix-validation` governs the signature classes it names instead\./,
  );
});
