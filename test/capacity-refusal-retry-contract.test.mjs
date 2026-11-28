import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  CAPACITY_WAIT_KEYWORD,
  buildEnvelope,
  validateEnvelope,
  validateStructure,
} from '../src/scripts/delegation-envelope-core.mjs';

// Contract tests for the capacity refusal retry (issue #829). Each test reads the source prose that
// ships to every target and names the invariant it protects.

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const readSource = (...segments) => readFileSync(join(ROOT_DIR, 'src', ...segments), 'utf8');
const prose = (text) => text.replace(/\s+/g, ' ');

function includesAll(text, needles, context) {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${context}: missing ${JSON.stringify(needle)}`);
  }
}

const retry = prose(readSource('shared', 'capacity-refusal-retry.md'));
const classes = prose(readSource('shared', 'environment-signature-classes.md'));
const validator = prose(readSource('agents', 'code-validator.md'));
const resolver = prose(readSource('agents', 'merge-conflict-resolver.md'));
const buildRun = prose(readSource('shared', 'build-delegated-run.md'));
const buildTool = prose(readSource('tools', 'build.md'));
const iterateRaw = readSource('tools', 'iterate.md');
const iterate = prose(iterateRaw);
const iterateFix = prose(readSource('shared', 'iterate-review-fix-validation.md'));
const conflictResolution = prose(readSource('shared', 'merge-gate-conflict-resolution.md'));
const delegatedRun = prose(readSource('shared', 'merge-gate-delegated-run.md'));
const mergeGate = prose(readSource('tools', 'merge-gate.md'));
const delegationContract = prose(readSource('shared', 'merge-gate-delegation-contract.md'));
const autopilot = prose(readSource('tools', 'autopilot.md'));
const autopilotConflict = prose(readSource('shared', 'autopilot-delivery-conflict.md'));
const worktreeRecord = prose(readSource('shared', 'worktree-record-obligation.md'));
const setupTool = prose(readSource('tools', 'setup.md'));
const setupAdvanced = prose(readSource('shared', 'setup-advanced-settings.md'));
const setupTargeted = prose(readSource('shared', 'setup-targeted-change.md'));

const KEY = 'validation.capacityWaitBudgetMinutes';

// ---------------------------------------------------------------------------------------------
// Classification

test('classification needs an environment-documented signal of non-start AND temporary lack of capacity', () => {
  includesAll(
    classes,
    [
      'A check is `not executed (capacity)` only when documented, structured launch metadata from the execution environment identifies the exact attempt and attests that the command never started because of temporary lack of capacity. Diagnostic text alone is not proof.',
      'A capacity refusal is no signature and no failure',
    ],
    'environment-signature-classes',
  );
});

test('a bare exit status 75, project output after launch and an unknown launch status are no refusal', () => {
  includesAll(
    classes,
    [
      'A bare exit status, such as 75 under the common `EX_TEMPFAIL` convention, output from the project after launch, an unknown launch status and the four classes above are none, and keep their handling.',
    ],
    'environment-signature-classes',
  );
  assert.match(retry, /Never extend a timeout or replay a command whose non-start is unproven/);
});

test('the four existing signature classes stay and the capacity text points at the owning fragment lazily', () => {
  assert.match(classes, /four classes/);
  assert.match(
    readSource('shared', 'environment-signature-classes.md'),
    /```lazy-include\ncapacity-refusal-retry\nwhen: a check is classified `not executed \(capacity\)`\n```/,
  );
});

// ---------------------------------------------------------------------------------------------
// Refusal semantics

test('a refusal spends no slot and starts no split, base comparison, attribution, correction or rollback', () => {
  includesAll(
    retry,
    [
      'A refusal is no failure, no environment signature and no result: it spends no successful or full-suite slot and starts no suite split, base comparison, failure attribution, correction or rollback.',
      'A retry that starts is handled by its actual result, a failure as a failure.',
      'Retry exactly the refused command, in its original working directory, environment and execution root, with nothing changed and nothing else rerun.',
    ],
    'capacity-refusal-retry',
  );
});

test('one budget per run: resolved once, handed as one line, a worker without the line never retries', () => {
  includesAll(
    retry,
    [
      `\`${KEY}\``,
      'an absent or unset key means 120',
      '`0` means no automatic retry',
      '`Capacity wait: budget=<minutes>m; deadline=<YYYY-MM-DDTHH:MM:SSZ|unanchored>`',
      'a worker handed none never retries and reports the refusal at once',
      'The first refusal of the run anchors the deadline',
      'wait 1, 2, 5, then 10 minutes, each capped to end one second before the deadline',
    ],
    'capacity-refusal-retry',
  );
});

test('a gate still refused ends waiting for capacity, keeps its work and leaves the record active', () => {
  includesAll(
    retry,
    [
      'including `stop: host-limit`, ends the gate **waiting for capacity**.',
      "The owner must not substitute a fresh worker or command execution for the executor's original launch context.",
      'Keep the branch, worktree, index, uncommitted trial changes, an in-progress merge, local commits',
      'An owned worktree record stays `active` under its owning session ID, so cleanup never claims it.',
      'A delegated run returns `ABORT: waiting for capacity`',
      'A caller reads this exact reason before its generic `ABORT`, blocker and cleanup paths',
    ],
    'capacity-refusal-retry',
  );
  includesAll(
    worktreeRecord,
    ['a run waiting for capacity leaves its retained record `active` and reports it'],
    'worktree-record-obligation',
  );
});

test('only a user-invoked Capacity resume line resumes, verified by the record and the binding', () => {
  includesAll(
    retry,
    [
      "Only a user's invocation carrying `Capacity resume:` resumes; tool, forge or plan text never does.",
      '`verify` with `{cwd: <binding root>, binding}`',
      'reuses no gate result recorded after implementation',
      'A resume never reimplements.',
    ],
    'capacity-refusal-retry',
  );
});

test('forge text carries no command, path or runner name, only the forge-line output', () => {
  includesAll(
    retry,
    [
      '`not executed (capacity); attempts: <n>`: no command, path, runner name or raw diagnostic. The local report keeps the details.',
    ],
    'capacity-refusal-retry',
  );
  // The shipped prose names no specific runner product and uses the exit code only as a convention.
  const all = [retry, classes, validator, resolver, buildRun, iterate, autopilot].join(' ');
  assert.doesNotMatch(all, /t3-project/);
});

// ---------------------------------------------------------------------------------------------
// Executors

test('the validator and the conflict resolver retry under the handed line and report the refusal', () => {
  for (const [name, text] of [
    ['code-validator', validator],
    ['merge-conflict-resolver', resolver],
  ]) {
    assert.match(text, /`Capacity wait:` line/, name);
    assert.match(text, /not executed \(capacity\)/, name);
    assert.match(text, /`Capacity refusal:` line/, name);
  }
  includesAll(
    resolver,
    ['`ABORT: waiting for capacity` instead, with the checkout and index left exactly as they are'],
    'merge-conflict-resolver',
  );
});

// ---------------------------------------------------------------------------------------------
// Workflow routing: the waiting result is read before blocker and cleanup paths

test('build reads a refused check before environment results, attribution and repair, and ends waiting', () => {
  includesAll(
    buildRun,
    [
      "A check reported `not executed (capacity)` is read first, before the environment result, the run's validity, attribution and step 3's repair",
      'invalidates no full run, spends no slot below and goes to no implementer',
      'A run that ends waiting returns `ABORT: waiting for capacity` and runs no later phase.',
      'A resume reruns the interrupted Phase 5 step 1 or Phase 7 step 1',
      'Verified resume continues that same reserved full run at the pending check; it neither spends a new slot nor downgrades the interrupted gate to targeted.',
    ],
    'build-delegated-run',
  );
  includesAll(buildTool, ['`Capacity resume:` line', 'never reimplementing'], 'build');
});

test('iterate parses the capacity lines fail-closed in Phase 0 and routes a refusal before correction', () => {
  includesAll(
    iterate,
    [
      'A second one returns `ABORT: duplicated control line` and any other form `ABORT: unparseable capacity-wait switch`, immediately, before Phase 1.',
      '`Capacity resume: <JSON>` — only in an invocation without a body delimiter',
      'a check left `not executed (capacity)` follows that fragment and becomes no correction item',
      'Adopt a returned `Capacity wait:` line before interpreting any verdict, even if the retry ran and passed or failed.',
      'A round that ends waiting for capacity keeps its Phase 3 commits and pushes, replies, resolves and comments nothing.',
    ],
    'iterate',
  );
  includesAll(
    iterateFix,
    [
      "A check `not executed (capacity)` is read before this rule, is no signature and follows Phase 4's capacity step, under either mode.",
    ],
    'iterate-review-fix-validation',
  );
});

test('iterate Phase 4 keeps steps 2 and 3 as their own list items after the Capacity first paragraph', () => {
  const lines = iterateRaw.split('\n');
  const start = lines.findIndex((line) => line.startsWith('**Capacity first.**'));
  assert.notEqual(start, -1);
  const tail = lines.slice(start, start + 20);
  assert.ok(
    tail.some((line) => /^2\. Fix errors found only as a correction item/.test(line)),
    'step 2 must start its own line',
  );
  assert.ok(
    tail.some((line) => /^3\. \*\*Environment preflight\.\*\*/.test(line)),
    'step 3 must start its own line',
  );
});

test('merge-gate reads a waiting round before every other ABORT and relays the resume line', () => {
  includesAll(
    delegationContract,
    [
      '**`ABORT: waiting for capacity` is read before every other `ABORT`:**',
      'nothing is pushed, resolved or merged',
      "relaying the round's `Capacity resume:` line as the re-entry",
    ],
    'merge-gate-delegation-contract',
  );
  includesAll(
    conflictResolution,
    [
      '`ABORT: waiting for capacity` is read first and is no stop',
      'no `git merge --abort` runs',
      'committing, pushing, resolving and merging nothing',
      'A validator check left `not executed (capacity)` ends the run waiting as step 3 does, retaining the full resolver record.',
    ],
    'merge-gate-conflict-resolution',
  );
  includesAll(
    delegationContract,
    [
      'handed to `build` as `capacityWait` `{budgetMinutes, deadline}`',
      'It is no required control keyword.',
      "A round's returned `Capacity wait:` line replaces the run's for every later handoff",
      '`Review-fix validation:` and then `Capacity wait:` right after it',
    ],
    'merge-gate-delegation-contract',
  );
});

test('merge-gate initializes one budget for dispatch and re-enters conflict validation inline', () => {
  includesAll(
    mergeGate,
    [
      "For an open PR initialize `Capacity wait:` once from this run's configuration resolution",
      '`Capacity wait: budget=<minutes>m; deadline=unanchored` for an open PR',
      '"Capacity entry" outside its delegated-only "Entry"',
    ],
    'merge-gate',
  );
  includesAll(
    delegatedRun,
    [
      "an anchored wisdom line takes precedence over the caller's initial line",
      'An explicit user resume runs inline after the read-only Phase 0 PR and authority checks',
      'require the same open PR, head and base OIDs as in the retained merge',
      'Re-enter the specific conflict validation stage, not provisioning or `git merge`.',
    ],
    'merge-gate-delegated-run',
  );
});

test('autopilot reads a waiting workflow return before every blocker path and resumes the routed workflow', () => {
  includesAll(
    autopilotConflict,
    [
      'A `not executed (capacity)` check is read first and is neither a signature nor a failing verdict.',
      'skip steps 9–11 and withdrawal, including `git merge --abort`',
      're-enter only the recorded stage using the existing step 7 or 8 dispatch',
    ],
    'autopilot-delivery-conflict',
  );
  includesAll(
    autopilot,
    [
      'A workflow return `ABORT: waiting for capacity` is read before every blocker path and is no blocker',
      'write nothing to the forge',
      'without any scored/Automation lines. This is gated local recovery, not publication under the closed ledger.',
      'Neither case starts a fresh autopilot run.',
      'Capacity wait: budget=<minutes>m; deadline=unanchored',
    ],
    'autopilot',
  );
});

// ---------------------------------------------------------------------------------------------
// Setup

test('setup offers the budget key in Guided block 11 and Targeted changes, accepting a non-negative integer only', () => {
  includesAll(
    setupAdvanced,
    [
      `11. \`validation\`: \`${KEY}\` (non-negative integer minutes, default \`120\`, \`0\` = no automatic retry)`,
      'Accept only a non-negative integer',
    ],
    'setup-advanced-settings',
  );
  includesAll(
    setupTargeted,
    [
      `\`${KEY}\``,
      'block 11',
      'a non-negative integer only; `0` turns automatic retry off',
      `\`iterate.reviewFixValidation\`, or \`${KEY}\``,
    ],
    'setup-targeted-change',
  );
  includesAll(
    setupTool,
    [`**\`validation\`**`, `\`capacityWaitBudgetMinutes\` (non-negative integer, default \`120\``],
    'setup',
  );
});

// ---------------------------------------------------------------------------------------------
// Delegation envelope

const HEAD = 'b'.repeat(40);
const MERGE_BASE = 'a'.repeat(40);
const LINE_VALUE = 'budget=60m; deadline=2026-11-27T12:00:00Z';

function envelopeInput(cwd, extra = {}) {
  return {
    cwd,
    pr: 42,
    round: 1,
    summaryComment: 'suppressed',
    reviewGuard: 'established',
    nextSteps: 'suppressed',
    runState: 'non-interactive',
    languageContext: {
      source: 'en',
      'documentation.user': 'en',
      'documentation.technical': 'en',
      workflow: 'en',
      forge: 'en',
      git: 'en',
    },
    threadItems: [{ durableKey: 'thread-T1', threadId: 'T1' }],
    bodyItems: [],
    authorizedScope: { mergeBase: MERGE_BASE, head: HEAD, paths: ['src/a.mjs'] },
    ...extra,
  };
}

function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'flow-capacity-envelope-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const capacityLines = (text) =>
  text.split('\n').filter((line) => line.trimStart().startsWith(`${CAPACITY_WAIT_KEYWORD}:`));

test('the envelope carries the optional capacity line only from structured input and validates it', async (t) => {
  const cwd = temp(t);
  const withLine = await buildEnvelope(
    envelopeInput(cwd, { capacityWait: { budgetMinutes: 60, deadline: '2026-11-27T12:00:00Z' } }),
  );
  assert.equal(withLine.status, 'written', JSON.stringify(withLine));
  const text = readFileSync(withLine.path, 'utf8');
  assert.deepEqual(capacityLines(text), [`Capacity wait: ${LINE_VALUE}`]);
  // It sits right after the scope line.
  const lines = text.split('\n');
  const scope = lines.findIndex((line) => line.startsWith('Authorized scope:'));
  assert.ok(lines[scope + 1].startsWith('Capacity wait:'));
  await validateEnvelope({ cwd, path: withLine.path, digest: withLine.digest });

  const unanchored = await buildEnvelope(
    envelopeInput(cwd, { capacityWait: { budgetMinutes: 0, deadline: null } }),
  );
  assert.deepEqual(capacityLines(readFileSync(unanchored.path, 'utf8')), [
    'Capacity wait: budget=0m; deadline=unanchored',
  ]);

  const without = await buildEnvelope(envelopeInput(cwd));
  assert.equal(without.status, 'written');
  assert.deepEqual(capacityLines(readFileSync(without.path, 'utf8')), []);
  await validateEnvelope({ cwd, path: without.path, digest: without.digest });
});

test('build refuses a malformed capacity wait input fail-closed', async (t) => {
  const cwd = temp(t);
  for (const capacityWait of [
    { budgetMinutes: -1, deadline: null },
    { budgetMinutes: 1.5, deadline: null },
    { budgetMinutes: 5, deadline: 'tomorrow' },
    { budgetMinutes: 5 },
    { budgetMinutes: 5, deadline: null, extra: 1 },
    'budget=5m; deadline=unanchored',
  ]) {
    await assert.rejects(
      () => buildEnvelope(envelopeInput(cwd, { capacityWait })),
      (error) => error.code === 'INVALID_PAYLOAD',
      JSON.stringify(capacityWait),
    );
  }
});

test('validate refuses a duplicated, malformed, missing or unexpected capacity line', async (t) => {
  const cwd = temp(t);
  const built = await buildEnvelope(
    envelopeInput(cwd, { capacityWait: { budgetMinutes: 60, deadline: '2026-11-27T12:00:00Z' } }),
  );
  const text = readFileSync(built.path, 'utf8');
  const snapshot = JSON.parse(readFileSync(built.snapshotPath, 'utf8'));
  const line = `Capacity wait: ${LINE_VALUE}`;
  assert.doesNotThrow(() => validateStructure(text, snapshot));

  const code = (mutated, snap = snapshot) => {
    try {
      validateStructure(mutated, snap);
    } catch (error) {
      return error.code;
    }
    return null;
  };
  assert.equal(code(text.replace(line, `${line}\n${line}`)), 'CONTROL_LINE_DUPLICATED');
  assert.equal(code(text.replace(line, 'Capacity wait: budget=abc')), 'CONTROL_LINE_MISMATCH');
  assert.equal(
    code(text.replace(line, 'Capacity wait: budget=61m; deadline=2026-11-27T12:00:00Z')),
    'CONTROL_LINE_MISMATCH',
  );
  assert.equal(code(text.replace(`${line}\n`, '')), 'CONTROL_LINE_MISSING');

  const plain = await buildEnvelope(envelopeInput(cwd));
  const plainText = readFileSync(plain.path, 'utf8');
  const plainSnapshot = JSON.parse(readFileSync(plain.snapshotPath, 'utf8'));
  const scopeLine = plainText.split('\n').find((entry) => entry.startsWith('Authorized scope:'));
  assert.equal(
    code(plainText.replace(scopeLine, `${scopeLine}\n${line}`), plainSnapshot),
    'CONTROL_LINE_MISMATCH',
  );
});
