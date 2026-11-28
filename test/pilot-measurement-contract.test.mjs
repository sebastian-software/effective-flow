import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { UNSAFE_RUNTIME_ROOT_REASONS } from '../src/scripts/pilot-measurement-core.mjs';
import { mergeGateWithDelegatedRun } from './support/merge-gate-source.mjs';

const ROOT = new URL('..', import.meta.url);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const fragment = source('src/shared/pilot-measurement.md');
// The gate as a delegated run reads it: the caller core, then the deferred delegated-run fragment.
const mergeGate = mergeGateWithDelegatedRun(ROOT);
const cli = source('src/scripts/pilot-measurement.mjs');
const core = source('src/scripts/pilot-measurement-core.mjs');

function ordered(text, ...needles) {
  let previous = -1;
  for (const needle of needles) {
    const current = text.indexOf(needle, previous + 1);
    assert.notEqual(current, -1, `missing ordered fragment: ${needle}`);
    assert.ok(current > previous, `out-of-order fragment: ${needle}`);
    previous = current;
  }
}

// Invariant: the observation never links a record, leaks identity or content, or alters the gate result.
test('the workflow contract keeps observation local, anonymous, and unable to change the gate result', () => {
  const normalizedFragment = fragment.replace(/\s+/g, ' ');
  for (const clause of [
    'It never selects an execution profile',
    'links an observation to a pull request or workflow record',
    "changes the merge gate's result",
    "the helper keeps the observation's capability in its own capability file and never returns it",
    'are non-secret references',
    'Keep them out of chat, delegation messages, and pull-request artifacts',
    'observer-only execution never invokes this operation',
    'never turn an observation failure into a merge blocker',
  ]) {
    assert.match(
      normalizedFragment,
      new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    );
  }
  assert.match(fragment, /Diagnostics and pilot\s+control alerts are value-free/);
  assert.doesNotMatch(
    fragment,
    /(?:prompt|diff|source excerpt|stdout|stderr).*(?:persist|record)/i,
  );
});

// Invariant: the helper keeps the observation capability, so the finalize payload the workflow
// sends carries none and the core reads it back from the capability file (issue #813).
test('finalization sends no capability and the core authenticates from its capability file', () => {
  const finalization = fragment.slice(fragment.indexOf('### Phase 6 observation finalization'));
  const payload = finalization.slice(
    finalization.indexOf('```json'),
    finalization.indexOf('```', finalization.indexOf('```json') + 7),
  );
  assert.match(payload, /"observationId"/);
  assert.doesNotMatch(payload, /capability/);
  assert.match(core, /authenticate\(handle\.capability, reservation\.capabilityHash\)/);
  assert.doesNotMatch(core, /authenticate\(input\.capability/);
});

// Invariant: reservation precedes gate work and every ending finalizes once before wisdom deletion.
test('reservation, correction counters, and exactly-once finalization are placed at observable boundaries', () => {
  ordered(
    mergeGate,
    'resolve the completion mode',
    '```lazy-include\npilot-measurement',
    '### Phase 1:',
  );
  ordered(
    mergeGate.replace(/\s+/g, ' '),
    '### Phase 6: Summary',
    'finalize a reserved or restored pilot observation only if it has not already been finalized',
    "per `pilot-measurement`'s Phase 6",
    'Delete the wisdom file',
  );
  assert.match(fragment, /Run this section only after Phase 0 has resolved a non-observer/);
  assert.match(fragment, /before Phase 1 performs gate work/);
  assert.match(
    fragment.replace(/\s+/g, ' '),
    /every normal, controlled, or early ending passes this section exactly once/,
  );
  assert.match(fragment, /unexpected workflow failure[\s\S]*terminal outcome `failed`/);
  assert.match(fragment, /finalization failure leaves the current merge\/report result unchanged/);
});

test('the gate retries only explicit pending handle cleanup without changing the outcome', () => {
  const finalization = fragment
    .slice(fragment.indexOf('### Phase 6 observation finalization'))
    .replace(/\s+/g, ' ');
  ordered(
    finalization,
    '`finalized-cleanup-pending` confirms the record is durable but not the handle invalidation',
    'In this case only, repeat the identical request once',
    'If the retry does not confirm cleanup, say so without identifiers',
    'This does not change the merge/report result or imply a pilot suspension',
    'Do not retry an ambiguous mutation',
  );
});

// Invariant: only an actually dispatched correction increments a counter.
test('correction counters exclude waits, resumes, assessment-only work, and undispatched attempts', () => {
  const counterSection = fragment.slice(
    fragment.indexOf('### Correction counters'),
    fragment.indexOf('### Phase 6 observation finalization'),
  );
  assert.match(counterSection, /after the corresponding correction work was actually dispatched/);
  assert.match(counterSection, /pending-check wait/);
  assert.match(counterSection, /keyword-less\s+resume is zero/);
  assert.match(counterSection, /triggers, assessments, deferred\/rejected items/);
  assert.match(counterSection, /a clean merge, `off`, an unanswered gate/);
  assert.match(counterSection, /dispatch\/start event itself is the only\s+counter authority/);
});

// Invariant: report-mode readiness drops merge authorization from the measurement only, never from the gate.
test('report-mode readiness excludes only merge authorization and preserves the check-list waiver', () => {
  assert.match(fragment, /projection of Phase-4 conditions 2–10/);
  assert.match(fragment, /existing no-check-list waiver semantics/);
  assert.match(fragment, /Condition 1 remains the real merge-authorization condition/);
  assert.match(fragment, /excluded only from this measurement projection/);
  assert.match(fragment, /`reported-ready`/);
  assert.match(fragment, /`reported-blocked`/);
});

// Invariant: a BLOCKED-USER return of the delegated merge-gate run is a controlled ending that
// finalizes its reservation as `reported-blocked` with unavailable evidence in either mode, keeps
// observation identity out of the returned question, and leaves each re-dispatch its own
// reservation; the rule is stated once, in this fragment.
test('a BLOCKED-USER return finalizes the reservation as reported-blocked and re-dispatch reserves afresh', () => {
  const finalization = fragment
    .slice(fragment.indexOf('### Phase 6 observation finalization'))
    .replace(/\s+/g, ' ');
  for (const clause of [
    'a `BLOCKED-USER` return of the delegated run before a verified merge records `reported-blocked` in either mode',
    'the unavailable check evidence above',
    'its stable blocker, retained as above, is `relayed-user-decision`',
    'The returned question carries no observation identity, and its re-dispatch reserves afresh',
    'did not reach a verified merge and ended other than through `BLOCKED-USER`',
  ]) {
    assert.ok(finalization.includes(clause), `missing BLOCKED-USER clause: ${clause}`);
  }
  assert.match(fragment, /it is not part of the closed helper\s+payload/);
  assert.doesNotMatch(core, /relayed-user-decision/);
  assert.equal(mergeGate.includes('relayed-user-decision'), false);
});

test('the CLI is thin and maps every failure to one non-echoing envelope and stderr code', () => {
  assert.match(cli, /argv\.length !== 1/);
  assert.match(cli, /PILOT_MEASUREMENT_OPERATIONS\.includes\(operation\)/);
  assert.match(cli, /stdout\.write\(`\$\{JSON\.stringify\(envelope\)\}\\n`\)/);
  assert.match(
    cli,
    /stderr\.write\(`\$\{envelope\.error\.code\}: \$\{envelope\.error\.message\}\\n`\)/,
  );
  assert.doesNotMatch(
    cli,
    /console\.(?:log|error)|JSON\.stringify\(input\)|stderr\.write\([^\n]*input/,
  );
});

// Invariant: deletion removes only the requested generation directory plus that generation's
// capability-file directory `pilot-observation-handles/<opaque generationId>/`, the latter by
// `unlink` and `rmdir` alone, never by a recursive `rm`.
test('mutations route through the Git/runtime guard and deletion remains generation-scoped', () => {
  assert.match(core, /gitCall\(deps\.runner, root, \['ls-files', '--', '\.effective-flow\/'\]\)/);
  assert.match(core, /\['check-ignore', '--no-index', '-q', '--', target\]/);
  assert.match(core, /runtimeMigration\?\.directory\?\.version !== 1/);
  assert.match(core, /await repositoryGuard\(context\.input, deps, \{ mutation: true \}\);/);
  assert.match(core, /path\.dirname\(target\) !== parent/);
  assert.match(core, /path\.basename\(target\)\.startsWith\(`\$\{input\.generationId\}-`\)/);
  assert.doesNotMatch(core, /rm\([^\n]*(?:runtimeDirectory|\.effective-flow)/);
  assert.match(
    core,
    /return path\.join\(observationHandleRoot\(context\), opaque\(generationId\)\);/,
  );
  assert.match(
    core,
    /'check-ignore', '--no-index', '-q', '--', `\.effective-flow\/\$\{HANDLE_ROOT\}`/,
  );
  const removal = core.slice(
    core.indexOf('async function removeObservationHandles('),
    core.indexOf('\n}\n', core.indexOf('async function removeObservationHandles(')),
  );
  assert.match(removal, /observationHandleDirectory\(context, generationId\)/);
  assert.match(removal, /await unlink\(path\.join\(directory, name\)\)/);
  assert.match(removal, /await rmdir\(directory\)/);
  assert.doesNotMatch(removal, /\brm\(|recursive/);
});

test('closed schemas reject unknown keys and final records omit raw timing continuity material', () => {
  assert.match(
    core,
    /keys\.some\(\(key\) => !required\.includes\(key\) && !optional\.includes\(key\)\)/,
  );
  assert.match(core, /workflowCapabilityHash: hashCapability\(workflowCapability\)/);
  assert.match(core, /packetCapabilityHash: hashCapability\(packetCapability\)/);
  assert.match(core, /await unlink\(timingTarget\)/);
  const finalizedRecord = core.slice(
    core.indexOf('const finalized = {'),
    core.indexOf('if (detailOptIn) {', core.indexOf('const finalized = {')),
  );
  for (const forbidden of [
    'startWallMs',
    'startMonotonicNs',
    'startBootEstimateMs',
    'hostFingerprint',
    'hostname',
    'salt',
    'packetCapability',
  ]) {
    assert.doesNotMatch(finalizedRecord, new RegExp(forbidden));
  }
});

// Invariant: the protocol guide lists exactly UNSAFE_RUNTIME_ROOT_REASONS, so its copy of the
// closed reason set cannot drift from the export.
test('the protocol guide lists exactly the exported UNSAFE_RUNTIME_ROOT_REASONS', () => {
  const guide = source('docs/developer-guide/model-tiering-pilot-protocol.md').replace(/\s+/g, ' ');
  const listed = guide.match(/one closed value from `UNSAFE_RUNTIME_ROOT_REASONS`: ([^.]+)\./);
  assert.ok(listed, 'the guide must list the closed runtime-root reasons');
  assert.deepEqual(
    [...listed[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]),
    [...UNSAFE_RUNTIME_ROOT_REASONS],
  );
});
