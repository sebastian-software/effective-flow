import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('..', import.meta.url);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const fragment = source('src/shared/pilot-measurement.md');
const mergeGate = source('src/tools/merge-gate.md');
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

test('the workflow contract keeps observation local, anonymous, and unable to change the gate result', () => {
  const normalizedFragment = fragment.replace(/\s+/g, ' ');
  for (const clause of [
    'It never selects an execution profile',
    'links an observation to a pull request or workflow record',
    "changes the merge gate's result",
    'Never place the raw capability or observation identifier',
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

test('reservation, correction counters, and exactly-once finalization are placed at observable boundaries', () => {
  ordered(
    mergeGate,
    'resolve the completion mode',
    '```lazy-include\npilot-measurement',
    '### Phase 1:',
  );
  ordered(
    mergeGate,
    '### Phase 6: Summary',
    'Phase 6 observation finalization',
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

test('report-mode readiness excludes only merge authorization and preserves the check-list waiver', () => {
  assert.match(fragment, /projection of Phase-4 conditions 2–10/);
  assert.match(fragment, /existing no-check-list waiver semantics/);
  assert.match(fragment, /Condition 1 remains the real merge-authorization condition/);
  assert.match(fragment, /excluded only from this measurement projection/);
  assert.match(fragment, /`reported-ready`/);
  assert.match(fragment, /`reported-blocked`/);
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

test('mutations route through the Git/runtime guard and deletion remains generation-scoped', () => {
  assert.match(core, /gitCall\(deps\.runner, root, \['ls-files', '--', '\.effective-flow\/'\]\)/);
  assert.match(core, /\['check-ignore', '--no-index', '-q', '--', target\]/);
  assert.match(core, /runtimeMigration\?\.directory\?\.version !== 1/);
  assert.match(core, /await repositoryGuard\(context\.input, deps, \{ mutation: true \}\);/);
  assert.match(core, /path\.dirname\(target\) !== parent/);
  assert.match(core, /path\.basename\(target\)\.startsWith\(`\$\{input\.generationId\}-`\)/);
  assert.doesNotMatch(core, /rm\([^\n]*(?:runtimeDirectory|\.effective-flow)/);
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
