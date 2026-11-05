import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildPortableSkill } from '../evals/_scaffold/build-identity.mjs';
import { provisionSlot } from '../evals/_scaffold/scaffold.mjs';
import {
  BEHAVIOURS,
  HOST_KEY_SETS,
  ITEM_TYPES_BY_VIEW,
  SELF_REPORT_PROJECTION,
  STUB_PROTOCOL,
} from '../evals/_scaffold/session-shapes.mjs';

// The focus session stub (`evals/_scaffold/session-stub.mjs`), as ordinary tests over ordinary files.
// Nothing here runs a model, a host or a peer session: the stub is imported for in-process calls
// and spawned for the CLI protocol, always against a fixture the test writes or copies.

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const SCAFFOLD_ROOT = join(REPOSITORY_ROOT, 'evals', '_scaffold');
const STUB = join(SCAFFOLD_ROOT, 'session-stub.mjs');
const SHAPES = join(SCAFFOLD_ROOT, 'session-shapes.mjs');
const TRACKER_STUB = join(SCAFFOLD_ROOT, 'remote-tracker.mjs');
const ADDENDUM = join(
  REPOSITORY_ROOT,
  'docs',
  'developer-guide',
  'focus-session-shape-observations.md',
);
const SECOND_ADDENDUM = join(
  REPOSITORY_ROOT,
  'docs',
  'developer-guide',
  'focus-session-shape-observations-2.md',
);
const DATA_ROOT = join(import.meta.dirname, 'fixtures', 'session-stub-suite');
const BASE = JSON.parse(readFileSync(join(DATA_ROOT, 'fixtures', 'smoke.json'), 'utf8'));

process.env.EVAL_SESSION_NO_MAIN = '1';
const stub = await import(pathToFileURL(STUB).href);
delete process.env.EVAL_SESSION_NO_MAIN;

const CODES = STUB_PROTOCOL.errorCodes;
const NONCE_A = 'focus-0123456789abcdef0123456789abcdef';
const NONCE_B = 'focus-fedcba9876543210fedcba9876543210';
const MAIN = 't-main';

const scratchDirs = [];
function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function cloneSession() {
  return structuredClone(BASE.session);
}

// A bench is a temporary fixture and trace; `call` runs the stub in process, exactly as `main` runs
// it for a spawned CLI, returning the parsed envelope and the exit code it would set.
function bench(session = cloneSession(), fixtureOverride = null) {
  const dir = scratch('session-stub-');
  const fixture = join(dir, 'fixture.json');
  writeFileSync(fixture, JSON.stringify(fixtureOverride ?? { ...BASE, session }));
  const log = join(dir, 'trace', 'session-calls.jsonl');
  return {
    dir,
    fixture,
    log,
    async call(operation, input = {}) {
      let out = '';
      let exitCode = 0;
      await stub.main([operation], {
        stdout: {
          write(chunk, callback) {
            out += chunk;
            callback();
          },
        },
        paths: { fixture, log },
        input,
        setExitCode(code) {
          exitCode = code;
        },
      });
      assert.equal(out.endsWith('\n'), true, 'the envelope is not one newline-terminated line');
      assert.equal(out.trimEnd().includes('\n'), false, 'the envelope is not exactly one line');
      return { envelope: JSON.parse(out), exitCode };
    },
    read(extra = {}, threadId = MAIN) {
      return this.call('thread-read', { threadId, runLimit: 1, ...extra });
    },
    records() {
      return traceRecords(log);
    },
  };
}

function traceRecords(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

function sendInput(nonce = NONCE_A) {
  return { to: 'target-session', message: `Report your progress and echo ${nonce}.` };
}

function resultOf({ envelope, exitCode }) {
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  assert.equal(exitCode, 0);
  return envelope.result;
}

function failureOf({ envelope, exitCode }, code, label = '') {
  const context = `${label}${label ? ': ' : ''}${JSON.stringify(envelope)}`;
  assert.equal(envelope.ok, false, context);
  assert.equal(exitCode, 1, `${label} a failed envelope must set a non-zero exit code`);
  assert.equal(envelope.error.code, code, context);
  return envelope.error;
}

function unrecordedBy(outcome, parameter, behaviour, label = '') {
  const error = failureOf(outcome, CODES.unrecorded, label);
  assert.equal(error.details.parameter, parameter, label);
  assert.equal(error.details.behaviour, behaviour, label);
}

function sortedKeys(object) {
  return Object.keys(object).sort();
}

function jsonBlockOf(path) {
  const blocks = [...readFileSync(path, 'utf8').matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, `${path} must hold exactly one machine-readable json block`);
  return JSON.parse(blocks[0][1]);
}

function addendumBlock() {
  return jsonBlockOf(ADDENDUM);
}

function secondAddendumBlock() {
  return jsonBlockOf(SECOND_ADDENDUM);
}

// The merge rule both addenda state, written out here independently of the shapes module: a
// second-block entry replaces the first-block entry of the same name in its place, and every other
// second-block entry follows in block order.
function mergedBehaviours(first, second) {
  const result = first.map((entry) => second.find((other) => other.name === entry.name) ?? entry);
  for (const entry of second) {
    if (!first.some((other) => other.name === entry.name)) result.push(entry);
  }
  return result;
}

function texts(result) {
  return result.items.map((item) => item.text);
}

function positions(result) {
  return result.items.map((item) => item.position);
}

// --- Two-run targets and the running observer, built in code from the smoke thread ---------------

const TWO = 't-two';
const OBSERVER = 't-observer';
const OBSERVER_LATEST_RUN = 't-observer-run-57';
const ITEM_TWO_0 = 't-two-item-0';
const TWO_ITEM_0_TEXT = 'x'.repeat(300);
const LONG_TEXT = 'abcdefghij'.repeat(60);
const OBSERVER_ITEM_0_TEXT = 'o'.repeat(400);
const HISTORY_READ = { limit: 10, maxCharsPerItem: 1500, runLimit: 2 };

function fixtureItem(threadId, position, type, runId, text) {
  const isMessage = ITEM_TYPES_BY_VIEW.messages.includes(type);
  return {
    position,
    visibility: 'visible',
    sourceThreadId: threadId,
    itemId: `${threadId}-item-${position}`,
    runId,
    messageId: isMessage ? `${threadId}-message-${position}` : null,
    createdBy: type === 'user_message' ? 'user' : 'agent',
    creationSource: 'mcp',
    type,
    status: 'completed',
    title: null,
    text,
    updatedAt: '2026-11-03T09:00:00.000Z',
    ...(type === 'user_message' ? { senderThreadId: 't-parent' } : {}),
  };
}

function fixtureRun(runId, ordinal, overrides = {}) {
  return {
    ...structuredClone(BASE.session.threads[MAIN].recentRuns[0]),
    runId,
    ordinal,
    ...overrides,
  };
}

function fixtureThread(threadId, overrides) {
  return { ...structuredClone(BASE.session.threads[MAIN].thread), threadId, ...overrides };
}

// A completed target with the second addendum's two runs: positions continue across them, and the
// fixture lists its runs ascending so that the served descending order is the stub's, not the data's.
function twoRunTarget() {
  const run1 = `${TWO}-run-1`;
  const run2 = `${TWO}-run-2`;
  const items = [
    [0, 'user_message', run1, TWO_ITEM_0_TEXT],
    [1, 'command_execution', run1, 'mkdir -p work'],
    [2, 'reasoning', run1, 'Planning the paragraphs.'],
    [3, 'assistant_message', run1, LONG_TEXT],
    [4, 'command_execution', run1, 'echo one'],
    [5, 'assistant_message', run1, LONG_TEXT],
    [6, 'user_message', run2, 'Write two more paragraphs and run one echo command.'],
    [7, 'assistant_message', run2, LONG_TEXT],
    [8, 'command_execution', run2, 'echo three'],
    [9, 'assistant_message', run2, 'Done.'],
  ].map(([position, type, runId, text]) => fixtureItem(TWO, position, type, runId, text));
  return {
    thread: fixtureThread(TWO, { latestRunId: run2, runCount: 2, itemCount: 10 }),
    recentRuns: [fixtureRun(run1, 1), fixtureRun(run2, 2)],
    items,
  };
}

// The observer's own running top-level thread as read form (c) saw it: its runCount (55) below the
// latest run's ordinal (57), and only its running latest run in recentRuns.
function runningObserver() {
  const earlier = 't-observer-run-1';
  return {
    thread: fixtureThread(OBSERVER, {
      status: 'running',
      latestRunId: OBSERVER_LATEST_RUN,
      activeRunId: OBSERVER_LATEST_RUN,
      runCount: 55,
      itemCount: 120,
      settled: false,
      settledAt: null,
    }),
    recentRuns: [fixtureRun(OBSERVER_LATEST_RUN, 57, { status: 'running', completedAt: null })],
    items: [
      fixtureItem(OBSERVER, 0, 'user_message', earlier, OBSERVER_ITEM_0_TEXT),
      fixtureItem(OBSERVER, 1, 'assistant_message', earlier, LONG_TEXT),
      fixtureItem(OBSERVER, 2, 'command_execution', OBSERVER_LATEST_RUN, 'echo four'),
    ],
  };
}

function withTwoRunTarget(session) {
  session.threads[TWO] = twoRunTarget();
  return session;
}

function withObserver(session) {
  withTwoRunTarget(session);
  session.threads[OBSERVER] = runningObserver();
  session.observerThreadId = OBSERVER;
  return session;
}

function observerRead(extra = {}) {
  return { threadId: OBSERVER, ...stub.OBSERVER_READ_FORM, ...extra };
}

function ordinals(result) {
  return result.recentRuns.map((runRecord) => runRecord.ordinal);
}

// --- The scaffold-slot proof ----------------------------------------------------------------------

// The minimal binding `provisionSlot` and the identity functions read. It is built in code because
// the data directory may hold no `.mjs` file, which `node --test` would load as a test.
function smokeSuite() {
  return {
    root: DATA_ROOT,
    trackerStub: { source: TRACKER_STUB },
    loadSetSeeds: ['SKILL.md'],
    instrumentFiles: [STUB, SHAPES],
    overlay: {
      applies: (scenario) => scenario === 'smoke',
      apply(_scenario, skillRoot) {
        mkdirSync(join(skillRoot, 'scripts'), { recursive: true });
        copyFileSync(STUB, join(skillRoot, 'scripts', 'session-stub.mjs'));
        copyFileSync(SHAPES, join(skillRoot, 'scripts', 'session-shapes.mjs'));
      },
      extraSeeds: () => [],
    },
    scenarioSetup: () => ({ projectSetupRows: [] }),
    projectDocuments: () => ({ agents: '# AGENTS\n', setupAdr: '# Setup ADR\n' }),
    auxiliaryEvidence: null,
  };
}

let provisioned = null;
function slot() {
  if (provisioned === null) {
    const root = scratch('session-stub-slot-');
    const built = buildPortableSkill(join(root, 'build'));
    provisioned = provisionSlot(smokeSuite(), {
      roundRoot: join(root, 'round'),
      scenario: 'smoke',
      slot: 1,
      attempt: 1,
      builtSkillRoot: built,
      profile: { toolPolicy: 'test-policy' },
    });
  }
  return provisioned;
}

function cleanEnv() {
  const env = { ...process.env };
  for (const key of ['EVAL_SESSION_NO_MAIN', 'EVAL_SESSION_FIXTURE', 'EVAL_SESSION_LOG']) {
    delete env[key];
  }
  return env;
}

function runCli(script, args, input, { cwd, env = cleanEnv() } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  });
  return { ...result, envelope: result.stdout.trim() === '' ? null : JSON.parse(result.stdout) };
}

test('a fixture thread is read through the stub inside a slot provisioned by provisionSlot, so a scaffold run reaches fixtures through one subprocess', () => {
  const { paths, prompt } = slot();
  const script = join(paths.skillRoot, 'scripts', 'session-stub.mjs');
  assert.equal(existsSync(join(paths.skillRoot, 'scripts', 'session-shapes.mjs')), true);
  assert.equal(
    readFileSync(script, 'utf8'),
    readFileSync(STUB, 'utf8'),
    'the overlay must install the stub byte for byte',
  );
  // The slot's fixture keeps the keys the other scaffold consumers need beside the stub's `session`.
  const slotFixture = JSON.parse(readFileSync(paths.fixture, 'utf8'));
  assert.deepEqual(slotFixture.operations, {});
  assert.deepEqual(sortedKeys(slotFixture.repository), ['host', 'owner', 'repository']);
  assert.equal(prompt.includes(paths.skillRoot), true);
  assert.equal(prompt.includes(paths.projectRoot), true);

  const request = { threadId: MAIN, view: 'messages', limit: 3, maxCharsPerItem: 60, runLimit: 1 };
  const result = runCli(script, ['thread-read'], request, { cwd: paths.projectRoot });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.envelope.ok, true);
  assert.equal(result.envelope.operation, 'thread-read');
  assert.deepEqual(positions(result.envelope.result), [0, 2, 5]);
  assert.equal(result.envelope.result.nextPosition, 5);
  assert.equal(result.envelope.result.hasMore, true);
  assert.equal(result.envelope.result.thread.threadId, MAIN);

  const trace = traceRecords(join(paths.traceDir, 'session-calls.jsonl'));
  assert.equal(trace.length, 1);
  assert.deepEqual(sortedKeys(trace[0]), ['at', 'input', 'operation', 'seq']);
  assert.equal(trace[0].seq, 1);
  assert.equal(trace[0].operation, 'thread-read');
  assert.deepEqual(trace[0].input, request);
  assert.equal(Number.isNaN(Date.parse(trace[0].at)), false);

  // A second read records the next sequence number in the same slot trace.
  const activity = runCli(script, ['thread-read'], { ...request, view: 'activity' });
  assert.equal(activity.envelope.ok, true);
  assert.deepEqual(
    traceRecords(join(paths.traceDir, 'session-calls.jsonl')).map((record) => record.seq),
    [1, 2],
  );
});

// --- Shapes against the evidence ------------------------------------------------------------------

test('session-shapes.mjs deep-equals the first addendum block merged by name with the second, so the stub serves exactly the recorded evidence and nothing beside it', () => {
  const block = addendumBlock();
  const second = secondAddendumBlock();
  assert.deepEqual(
    { ...HOST_KEY_SETS },
    block.hostKeySets,
    'host key sets differ from the addendum block',
  );
  // The second block records behaviours only; key sets, item types by view (so `checkpoint` stays
  // outside fixtures) and the self-report projection come from the first block alone.
  assert.deepEqual(sortedKeys(second), ['behaviours']);
  assert.deepEqual({ ...ITEM_TYPES_BY_VIEW }, block.itemTypesByView);
  assert.deepEqual([...BEHAVIOURS], mergedBehaviours(block.behaviours, second.behaviours));
  assert.deepEqual({ ...SELF_REPORT_PROJECTION }, block.selfReportProjection);
  assert.deepEqual(
    sortedKeys(block),
    ['behaviours', 'hostKeySets', 'itemTypesByView', 'selfReportProjection'],
    'the block carries a part the shapes module does not export',
  );
  // The protocol keys are the stub's own and stay out of the evidence blocks.
  for (const each of [block, second]) {
    assert.equal(JSON.stringify(each).includes('noReplyYet'), false);
    assert.equal(JSON.stringify(each).includes('fixture-invalid'), false);
  }
});

test('the second addendum block holds only new or overriding entries, each named once, so the merge has exactly one reading', () => {
  const first = addendumBlock().behaviours;
  const names = new Set();
  for (const entry of secondAddendumBlock().behaviours) {
    assert.equal(names.has(entry.name), false, `duplicate behaviour ${entry.name}`);
    names.add(entry.name);
    const replaced = first.find((other) => other.name === entry.name);
    if (replaced) assert.notDeepEqual(entry, replaced, `${entry.name} restates its first entry`);
  }
  // The overrides the plan names: the final chunk is now observed, and the two catch-all entries
  // stay unrecorded while naming every value beyond the recorded ones.
  const merged = Object.fromEntries(BEHAVIOURS.map((entry) => [entry.name, entry]));
  assert.equal(merged.textOffsetFinalChunk.recorded, true);
  assert.equal(merged.runLimitAboveOne.recorded, false);
  assert.equal(merged.runCountOtherThanOne.recorded, false);
  assert.equal(merged.unobservedItemType.recorded, false);
});

test('every behaviour-list entry is well formed, so an unrecorded entry can never carry an observed result', () => {
  const names = new Set();
  for (const entry of BEHAVIOURS) {
    assert.deepEqual(sortedKeys(entry), ['name', 'observedResult', 'recorded', 'source']);
    assert.equal(names.has(entry.name), false, `duplicate behaviour ${entry.name}`);
    names.add(entry.name);
    assert.equal(typeof entry.source, 'string');
    if (entry.recorded) assert.equal(typeof entry.observedResult, 'string', entry.name);
    else assert.equal(entry.observedResult, null, entry.name);
  }
});

test('the fixture thread carries exactly the recorded key sets, so a served object can never gain a key the host never served', () => {
  const required = HOST_KEY_SETS.item.filter(
    (key) => !['textTruncated', 'nextTextOffset'].includes(key),
  );
  for (const entry of Object.values(BASE.session.threads)) {
    assert.deepEqual(sortedKeys(entry.thread), [...HOST_KEY_SETS.thread].sort());
    for (const runRecord of entry.recentRuns) {
      assert.deepEqual(sortedKeys(runRecord), [...HOST_KEY_SETS.run].sort());
    }
    for (const item of entry.items) {
      const optional = Object.keys(item).filter((key) =>
        HOST_KEY_SETS.optionalItemKeys.includes(key),
      );
      assert.deepEqual(sortedKeys(item), [...required, ...optional].sort());
    }
  }
  // Non-contiguous positions are what the recorded messages view showed; the fixture keeps the gap.
  assert.deepEqual(
    BASE.session.threads[MAIN].items.map((item) => item.position),
    [0, 1, 2, 3, 4, 5, 7],
  );
  const covered = new Set(BASE.session.threads[MAIN].items.map((item) => item.type));
  assert.deepEqual([...covered].sort(), [...ITEM_TYPES_BY_VIEW.activity].sort());
});

test('each served object key set equals its recorded host key set, in the order the host served it', async () => {
  const block = addendumBlock().hostKeySets;
  const b = bench();
  const cases = [
    { view: 'activity', limit: 10, maxCharsPerItem: 40 },
    { view: 'messages', limit: 10, maxCharsPerItem: 40 },
    { itemId: 't-main-item-7', maxCharsPerItem: 100 },
    { itemId: 't-main-item-7', textOffset: 100, maxCharsPerItem: 100 },
    { itemId: 't-main-item-7', textOffset: 100000 },
    { view: 'activity', limit: 3, afterPosition: 20 },
  ];
  for (const extra of cases) {
    const result = resultOf(await b.read(extra));
    assert.deepEqual(Object.keys(result), block.response, JSON.stringify(extra));
    assert.deepEqual(Object.keys(result.thread), block.thread);
    for (const runRecord of result.recentRuns) assert.deepEqual(Object.keys(runRecord), block.run);
    for (const item of result.items) {
      const optional = Object.keys(item).filter((key) => block.optionalItemKeys.includes(key));
      assert.deepEqual(
        sortedKeys(item),
        [...block.item, ...optional].sort(),
        `${JSON.stringify(extra)} position ${item.position}`,
      );
    }
  }
  // The one optional key accompanies only the item that carries it.
  const first = resultOf(await b.read({ view: 'activity', limit: 2, maxCharsPerItem: 40 }));
  assert.equal(Object.hasOwn(first.items[0], 'senderThreadId'), true);
  assert.equal(Object.hasOwn(first.items[1], 'senderThreadId'), false);
});

test('a fixture whose thread, run or item key set differs from the recorded one is rejected, so the fidelity check cannot be bypassed by data', async () => {
  const mutations = {
    'a thread key is missing': (s) => delete s.threads[MAIN].thread.branch,
    'a thread gains a key': (s) => (s.threads[MAIN].thread.extra = 1),
    'a run gains a key': (s) => (s.threads[MAIN].recentRuns[0].extra = 1),
    'an item loses a key': (s) => delete s.threads[MAIN].items[1].title,
    'an item gains a key': (s) => (s.threads[MAIN].items[1].extra = 1),
    'an item carries a computed key': (s) => (s.threads[MAIN].items[1].textTruncated = false),
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const session = cloneSession();
    mutate(session);
    const b = bench(session);
    failureOf(
      await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 40 }),
      CODES.fixtureInvalid,
      label,
    );
  }
});

test('a fixture that contradicts the recorded completed-thread state is rejected, so a fixture cannot serve a thread the evidence never showed', async () => {
  const mutations = {
    'a completed thread keeps an active run': (s) => (s.threads[MAIN].thread.activeRunId = 'r'),
    'a completed thread holds a running run': (s) =>
      (s.threads[MAIN].recentRuns[0].status = 'running'),
    'itemCount is below the fixture items': (s) => (s.threads[MAIN].thread.itemCount = 3),
    'itemCount is not an integer': (s) => (s.threads[MAIN].thread.itemCount = null),
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const session = cloneSession();
    mutate(session);
    failureOf(
      await bench(session).read({ view: 'activity', limit: 3, maxCharsPerItem: 40 }),
      CODES.fixtureInvalid,
      label,
    );
  }
  // itemCount above the fixture items stays valid: a fixture may model unserved positions.
  const larger = cloneSession();
  larger.threads[MAIN].thread.itemCount = 9;
  resultOf(await bench(larger).read({ view: 'activity', limit: 3, maxCharsPerItem: 40 }));
});

// --- The behaviour list ---------------------------------------------------------------------------

const ITEM_7 = 't-main-item-7';

// One probe per behaviour-list entry. `kind` says how the entry is honoured: `ok` for a recorded
// entry served as observed, `unrecorded` for an entry with recorded false, and `stand-in` for the
// two reply behaviours the stub reaches through declared variants rather than a read.
const PROBES = {
  activityViewServesAllTypes: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(await b.read({ view: 'activity', limit: 10, maxCharsPerItem: 1000 }));
      assert.deepEqual(positions(result), [0, 1, 2, 3, 4, 5, 7]);
      assert.deepEqual(
        result.items.map((item) => item.type),
        [
          'user_message',
          'command_execution',
          'assistant_message',
          'command_execution',
          'reasoning',
          'assistant_message',
          'assistant_message',
        ],
      );
      assert.equal(result.hasMore, false);
      assert.equal(result.nextPosition, 7);
    },
  },
  messagesViewFiltersTypes: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(await b.read({ view: 'messages', limit: 10, maxCharsPerItem: 1000 }));
      assert.deepEqual(positions(result), [0, 2, 5, 7]);
      for (const item of result.items) {
        assert.equal(ITEM_TYPES_BY_VIEW.messages.includes(item.type), true, item.type);
      }
    },
  },
  limitCapsPage: {
    kind: 'ok',
    async run(b) {
      const capped = resultOf(await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 20 }));
      assert.deepEqual(positions(capped), [0, 1, 2]);
      const wide = resultOf(await b.read({ view: 'activity', limit: 100, maxCharsPerItem: 20 }));
      assert.equal(wide.items.length, 7);
    },
  },
  nextPositionIsLastServed: {
    kind: 'ok',
    async run(b) {
      const activity = resultOf(await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 20 }));
      assert.equal(activity.nextPosition, 2);
      const messages = resultOf(await b.read({ view: 'messages', limit: 3, maxCharsPerItem: 20 }));
      assert.equal(messages.nextPosition, 5);
      const single = resultOf(await b.read({ itemId: ITEM_7, maxCharsPerItem: 20 }));
      assert.equal(single.nextPosition, 7);
    },
  },
  hasMoreWhenViewContinues: {
    kind: 'ok',
    async run(b) {
      const more = resultOf(await b.read({ view: 'messages', limit: 3, maxCharsPerItem: 20 }));
      assert.equal(more.hasMore, true);
      const done = resultOf(await b.read({ view: 'messages', limit: 4, maxCharsPerItem: 20 }));
      assert.equal(done.hasMore, false);
      assert.deepEqual(positions(done), [0, 2, 5, 7]);
    },
  },
  afterPositionExclusive: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 20, afterPosition: 2 }),
      );
      assert.deepEqual(positions(result), [3, 4, 5]);
      assert.equal(result.nextPosition, 5);
      assert.equal(result.hasMore, true);
    },
  },
  afterPositionBetweenPositions: {
    kind: 'ok',
    async run(b) {
      const messages = resultOf(
        await b.read({ view: 'messages', limit: 2, maxCharsPerItem: 20, afterPosition: 3 }),
      );
      assert.deepEqual(positions(messages), [5, 7]);
      assert.equal(messages.nextPosition, 7);
      assert.equal(messages.hasMore, false);
      // Position 6 holds no item at all: the next served position is 7.
      const activity = resultOf(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 20, afterPosition: 6 }),
      );
      assert.deepEqual(positions(activity), [7]);
    },
  },
  emptyPage: {
    kind: 'ok',
    async run(b) {
      for (const afterPosition of [20, 7]) {
        const result = resultOf(await b.read({ view: 'activity', limit: 3, afterPosition }));
        assert.deepEqual(result.items, []);
        assert.equal(result.nextPosition, null);
        assert.equal(result.hasMore, false);
      }
    },
  },
  itemTextTruncation: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 60 }));
      const long = result.items[2];
      assert.equal(long.text, '0123456789'.repeat(25).slice(0, 60));
      assert.equal(long.textTruncated, true);
      assert.equal(long.nextTextOffset, 60);
      const short = result.items[1];
      assert.equal(short.text, 'mkdir -p work');
      assert.equal(short.textTruncated, false);
      assert.equal(short.nextTextOffset, null);
    },
  },
  itemIdSingleItemRead: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(await b.read({ itemId: ITEM_7, maxCharsPerItem: 100 }));
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].itemId, ITEM_7);
      assert.equal(result.items[0].text, '0123456789'.repeat(30).slice(0, 100));
      assert.equal(result.items[0].textTruncated, true);
      assert.equal(result.items[0].nextTextOffset, 100);
      assert.equal(result.nextPosition, 7);
      assert.equal(result.hasMore, false);
    },
  },
  textOffsetContinuation: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(
        await b.read({ itemId: ITEM_7, textOffset: 100, maxCharsPerItem: 100 }),
      );
      assert.equal(result.items[0].text, '0123456789'.repeat(30).slice(100, 200));
      assert.equal(result.items[0].textTruncated, true);
      assert.equal(result.items[0].nextTextOffset, 200);
      assert.equal(result.nextPosition, 7);
      assert.equal(result.hasMore, false);
    },
  },
  textOffsetPastEnd: {
    kind: 'ok',
    async run(b) {
      for (const extra of [{}, { maxCharsPerItem: 100 }]) {
        const result = resultOf(await b.read({ itemId: ITEM_7, textOffset: 100000, ...extra }));
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].text, '');
        assert.equal(result.items[0].textTruncated, false);
        assert.equal(result.items[0].nextTextOffset, null);
        assert.equal(result.hasMore, false);
      }
    },
  },
  runLimitOne: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 20 }));
      assert.equal(result.recentRuns.length, 1);
      assert.equal(result.recentRuns[0].runId, 't-main-run-1');
    },
  },
  completedTarget: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 20 }));
      assert.equal(result.thread.status, 'completed');
    },
  },
  limitOutOfRange: {
    kind: 'unrecorded',
    async run(b) {
      // The schema enforces only the minimum; the described maximum has no recorded host behaviour.
      unrecordedBy(
        await b.read({ view: 'activity', limit: 101, maxCharsPerItem: 10 }),
        'limit',
        'limitOutOfRange',
      );
      const error = failureOf(await b.read({ view: 'activity', limit: 0 }), CODES.invalidInput);
      assert.equal(error.details.parameter, 'limit');
    },
  },
  maxCharsPerItemOutOfRange: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 50001 }),
        'maxCharsPerItem',
        'maxCharsPerItemOutOfRange',
      );
      resultOf(await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 50000 }));
      const error = failureOf(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 0 }),
        CODES.invalidInput,
      );
      assert.equal(error.details.parameter, 'maxCharsPerItem');
    },
  },
  maxCharsPerItemEqualsTextLength: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ itemId: ITEM_7, maxCharsPerItem: 300 }),
        'maxCharsPerItem',
        'maxCharsPerItemEqualsTextLength',
      );
    },
  },
  textOffsetFinalChunk: {
    kind: 'ok',
    async run(b) {
      const result = resultOf(
        await b.read({ itemId: ITEM_7, textOffset: 150, maxCharsPerItem: 200 }),
      );
      assert.equal(result.items[0].text, '0123456789'.repeat(30).slice(150));
      assert.equal(result.items[0].textTruncated, false);
      assert.equal(result.items[0].nextTextOffset, null);
      assert.equal(result.nextPosition, 7);
      assert.equal(result.hasMore, false);
    },
  },
  textOffsetRemainingEqualsMaxCharsPerItem: {
    kind: 'unrecorded',
    async run(b) {
      // 300 characters from offset 200 leave exactly 100: neither the final chunk nor a cut.
      unrecordedBy(
        await b.read({ itemId: ITEM_7, textOffset: 200, maxCharsPerItem: 100 }),
        'maxCharsPerItem',
        'textOffsetRemainingEqualsMaxCharsPerItem',
      );
    },
  },
  textOffsetAtEnd: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ itemId: ITEM_7, textOffset: 300, maxCharsPerItem: 100 }),
        'textOffset',
        'textOffsetAtEnd',
      );
    },
  },
  textOffsetWithoutItemId: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 50, textOffset: 10 }),
        'textOffset',
        'textOffsetWithoutItemId',
      );
    },
  },
  textOffsetZero: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ itemId: ITEM_7, textOffset: 0, maxCharsPerItem: 100 }),
        'textOffset',
        'textOffsetZero',
      );
    },
  },
  itemIdWithListParameters: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ itemId: ITEM_7, view: 'activity', maxCharsPerItem: 50 }),
        'view',
        'itemIdWithListParameters',
      );
      unrecordedBy(
        await b.read({ itemId: ITEM_7, limit: 2, maxCharsPerItem: 50 }),
        'limit',
        'itemIdWithListParameters',
      );
      unrecordedBy(
        await b.read({ itemId: ITEM_7, afterPosition: 1, maxCharsPerItem: 50 }),
        'afterPosition',
        'itemIdWithListParameters',
      );
    },
  },
  afterPositionBeforeFirstViewPosition: {
    kind: 'unrecorded',
    async run(b) {
      // Thread t-offset serves its first position at 2, so afterPosition 1 precedes the whole view.
      unrecordedBy(
        await b.read(
          { view: 'activity', limit: 3, maxCharsPerItem: 20, afterPosition: 1 },
          't-offset',
        ),
        'afterPosition',
        'afterPositionBeforeFirstViewPosition',
      );
    },
  },
  emptyView: {
    kind: 'unrecorded',
    session(session) {
      // Only command and reasoning items remain, so the messages view holds no item at all.
      const thread = session.threads[MAIN];
      thread.items = thread.items.filter(
        (item) => !ITEM_TYPES_BY_VIEW.messages.includes(item.type),
      );
    },
    async run(b) {
      // An empty view stays unrecorded with afterPosition given too: the recorded empty page
      // followed a non-empty view.
      for (const extra of [{}, { afterPosition: 0 }]) {
        unrecordedBy(
          await b.read({ view: 'messages', limit: 3, maxCharsPerItem: 10, ...extra }),
          'view',
          'emptyView',
          JSON.stringify(extra),
        );
      }
    },
  },
  unknownItemId: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ itemId: 'no-such-item', maxCharsPerItem: 20 }),
        'itemId',
        'unknownItemId',
      );
    },
  },
  omittedView: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(await b.read({ limit: 3, maxCharsPerItem: 10 }), 'view', 'omittedView');
    },
  },
  omittedLimit: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', maxCharsPerItem: 10 }),
        'limit',
        'omittedLimit',
      );
    },
  },
  omittedMaxCharsPerItem: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3 }),
        'maxCharsPerItem',
        'omittedMaxCharsPerItem',
      );
    },
  },
  omittedRunLimit: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.call('thread-read', {
          threadId: MAIN,
          view: 'activity',
          limit: 3,
          maxCharsPerItem: 10,
        }),
        'runLimit',
        'omittedRunLimit',
      );
    },
  },
  runLimitAboveOne: {
    kind: 'unrecorded',
    session: withTwoRunTarget,
    async run(b) {
      // Since the second addendum the entry names every runLimit beyond the recorded 1 and 2.
      for (const [runLimit, threadId] of [
        [3, TWO],
        [51, TWO],
        [3, MAIN],
      ]) {
        unrecordedBy(
          await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10, runLimit }, threadId),
          'runLimit',
          'runLimitAboveOne',
          `runLimit ${runLimit} on ${threadId}`,
        );
      }
      failureOf(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10, runLimit: 0 }),
        CODES.invalidInput,
      );
    },
  },
  runCountOtherThanOne: {
    kind: 'unrecorded',
    session(session) {
      // Three runs: since the second addendum the entry names every count beyond 1 and 2.
      const target = withTwoRunTarget(session).threads[TWO];
      target.recentRuns.push(fixtureRun(`${TWO}-run-3`, 3));
      target.thread.runCount = 3;
    },
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }, TWO),
        'thread.runCount',
        'runCountOtherThanOne',
      );
      // recentRuns is gated as well, even when the thread's runCount is a recorded one.
      const session = withTwoRunTarget(cloneSession());
      session.threads[TWO].recentRuns.push(fixtureRun(`${TWO}-run-3`, 3));
      unrecordedBy(
        await bench(session).read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }, TWO),
        'recentRuns',
        'runCountOtherThanOne',
      );
    },
  },
  runCountTwo: {
    kind: 'ok',
    session: withTwoRunTarget,
    async run(b) {
      const result = resultOf(await b.read({ view: 'activity', ...HISTORY_READ }, TWO));
      assert.equal(result.thread.runCount, 2);
      assert.deepEqual([...ordinals(result)].sort(), [1, 2]);
    },
  },
  runLimitTwo: {
    kind: 'ok',
    session: withTwoRunTarget,
    async run(b) {
      // Observation (a): both runs, ordinal descending, in either view.
      for (const view of ['messages', 'activity']) {
        const result = resultOf(await b.read({ view, ...HISTORY_READ }, TWO));
        assert.deepEqual(ordinals(result), [2, 1], view);
        assert.deepEqual(
          result.recentRuns.map((runRecord) => runRecord.runId),
          [`${TWO}-run-2`, `${TWO}-run-1`],
        );
        for (const runRecord of result.recentRuns) {
          assert.deepEqual(Object.keys(runRecord), HOST_KEY_SETS.run);
          assert.equal(runRecord.status, 'completed');
        }
      }
    },
  },
  runLimitOneLatestRun: {
    kind: 'ok',
    session: withTwoRunTarget,
    async run(b) {
      // Observation (b): the state read and the continuation both serve only the latest run.
      const state = resultOf(
        await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 256, runLimit: 1 }, TWO),
      );
      assert.deepEqual(ordinals(state), [2]);
      assert.equal(state.thread.runCount, 2);
      const continuation = resultOf(
        await b.read({ itemId: ITEM_TWO_0, textOffset: 256, maxCharsPerItem: 256 }, TWO),
      );
      assert.deepEqual(ordinals(continuation), [2]);
    },
  },
  itemsNotRestrictedByRunLimit: {
    kind: 'ok',
    session: withTwoRunTarget,
    async run(b) {
      const state = resultOf(
        await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 256, runLimit: 1 }, TWO),
      );
      assert.deepEqual(positions(state), [0]);
      assert.equal(state.items[0].runId, `${TWO}-run-1`, 'an item of the earlier run is served');
    },
  },
  positionsContinueAcrossRuns: {
    kind: 'ok',
    session: withTwoRunTarget,
    async run(b) {
      const all = resultOf(await b.read({ view: 'activity', ...HISTORY_READ }, TWO));
      assert.deepEqual(positions(all), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      assert.deepEqual(
        all.items.map((item) => item.runId.slice(-1)),
        ['1', '1', '1', '1', '1', '1', '2', '2', '2', '2'],
      );
    },
  },
  runLimitAboveRunCount: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10, runLimit: 2 }),
        'runLimit',
        'runLimitAboveRunCount',
      );
    },
  },
  runningObserverStateRead: {
    kind: 'ok',
    session: withObserver,
    async run(b) {
      const result = resultOf(await b.call('thread-read', observerRead()));
      assert.equal(result.thread.status, 'running');
      assert.equal(result.thread.activeRunId, result.thread.latestRunId);
      assert.equal(result.thread.parentThreadId, null);
      assert.equal(result.thread.relationshipToParent, null);
      assert.equal(result.thread.pendingRequestCount, 0);
      assert.equal(result.recentRuns.length, 1);
      assert.equal(result.recentRuns[0].status, 'running');
      assert.equal(result.recentRuns[0].completedAt, null);
    },
  },
  runningObserverOtherReadForm: {
    kind: 'unrecorded',
    session: withObserver,
    async run(b) {
      unrecordedBy(
        await b.call('thread-read', observerRead({ maxCharsPerItem: 1500 })),
        'maxCharsPerItem',
        'runningObserverOtherReadForm',
      );
    },
  },
  parentedObserver: {
    kind: 'unrecorded',
    session(session) {
      withObserver(session).threads[OBSERVER].thread.parentThreadId = 't-parent';
    },
    async run(b) {
      unrecordedBy(
        await b.call('thread-read', observerRead()),
        'thread.parentThreadId',
        'parentedObserver',
      );
    },
  },
  runningObserverPendingRequest: {
    kind: 'unrecorded',
    session(session) {
      withObserver(session).threads[OBSERVER].thread.pendingRequestCount = 1;
    },
    async run(b) {
      unrecordedBy(
        await b.call('thread-read', observerRead()),
        'thread.pendingRequestCount',
        'runningObserverPendingRequest',
      );
    },
  },
  environmentId: {
    kind: 'unrecorded',
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10, environmentId: 'env-1' }),
        'environmentId',
        'environmentId',
      );
      // An empty environment id names no other environment and reads the local fixture.
      resultOf(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10, environmentId: '' }),
      );
    },
  },
  unobservedItemType: {
    kind: 'unrecorded',
    session(session) {
      session.threads[MAIN].items[1].type = 'tool_call';
    },
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }),
        'items[1].type',
        'unobservedItemType',
      );
      // The second addendum observed `checkpoint` in the activity view, yet fixtures keep to the
      // first addendum's four types, on a two-run target and on the observer alike.
      for (const threadId of [TWO, OBSERVER]) {
        const session = withObserver(cloneSession());
        session.threads[threadId].items[1].type = 'checkpoint';
        const read =
          threadId === OBSERVER
            ? bench(session).call('thread-read', observerRead())
            : bench(session).read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }, TWO);
        unrecordedBy(await read, 'items[1].type', 'unobservedItemType', threadId);
      }
    },
  },
  senderThreadIdOnOtherItemType: {
    kind: 'unrecorded',
    session(session) {
      session.threads[MAIN].items[1].senderThreadId = 't-parent';
    },
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }),
        'items[1].senderThreadId',
        'senderThreadIdOnOtherItemType',
      );
    },
  },
  runningTarget: {
    kind: 'unrecorded',
    session(session) {
      session.threads[MAIN].thread.status = 'running';
    },
    async run(b) {
      unrecordedBy(
        await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }),
        'thread.status',
        'runningTarget',
      );
      // A running thread the fixture does not mark as the observer stays a running target, even in
      // the observer's own read form and beside a marked observer.
      const session = withObserver(cloneSession());
      session.threads[MAIN].thread.status = 'running';
      unrecordedBy(
        await bench(session).call('thread-read', { ...observerRead(), threadId: MAIN }),
        'thread.status',
        'runningTarget',
      );
    },
  },
  heldReply: {
    kind: 'stand-in',
    session(session) {
      session.replies = [{ variant: 'none' }];
    },
    async run(b) {
      // A hold is target-side state the observer cannot see: it is served as no reply.
      resultOf(await b.call('send-message', sendInput()));
      assert.deepEqual(resultOf(await b.call('await-reply')), STUB_PROTOCOL.noReplyYet);
    },
  },
  lateReply: {
    kind: 'stand-in',
    session(session) {
      session.replies = [{ ...session.replies.at(-1), polls: 2 }];
    },
    async run(b) {
      resultOf(await b.call('send-message', sendInput()));
      assert.deepEqual(resultOf(await b.call('await-reply')), STUB_PROTOCOL.noReplyYet);
      assert.deepEqual(resultOf(await b.call('await-reply')), STUB_PROTOCOL.noReplyYet);
      assert.equal(resultOf(await b.call('await-reply'))['from-name'], 'target-session');
    },
  },
  agentRowBusyIdleState: {
    kind: 'unrecorded',
    session(session) {
      session.listAgents.sequence[0].rows[0].busy = true;
    },
    async run(b) {
      unrecordedBy(await b.call('list-agents'), 'rows[0].busy', 'agentRowBusyIdleState');
    },
  },
};

test('every behaviour-list entry has exactly one probe whose kind matches its recorded flag, so a new entry cannot go unchecked', () => {
  assert.deepEqual(Object.keys(PROBES).sort(), BEHAVIOURS.map((entry) => entry.name).sort());
  for (const entry of BEHAVIOURS) {
    const { kind } = PROBES[entry.name];
    if (entry.recorded) assert.equal(kind, 'ok', entry.name);
    else assert.notEqual(kind, 'ok', entry.name);
  }
});

for (const entry of BEHAVIOURS) {
  const probe = PROBES[entry.name];
  test(`behaviour ${entry.name} is honoured as ${entry.recorded ? 'its observed result' : 'an unrecorded or declared stand-in outcome'}, so the stub never serves behaviour the evidence does not record`, async () => {
    const session = cloneSession();
    probe.session?.(session);
    await probe.run(bench(session));
  });
}

// --- The second addendum's observations (a) to (c) -----------------------------------------------

test('observation (a): runLimit 2 history reads of a two-run target serve both runs descending and page across the run boundary, as the second addendum recorded', async () => {
  const b = bench(withTwoRunTarget(cloneSession()));
  const messages = resultOf(await b.read({ view: 'messages', ...HISTORY_READ }, TWO));
  assert.deepEqual(positions(messages), [0, 3, 5, 6, 7, 9]);
  assert.equal(messages.nextPosition, 9);
  assert.equal(messages.hasMore, false);
  assert.equal(
    messages.items.some((item) => item.textTruncated),
    false,
    'no text exceeds 1500 characters',
  );
  assert.deepEqual(ordinals(messages), [2, 1]);

  const firstPage = resultOf(await b.read({ view: 'activity', ...HISTORY_READ, limit: 6 }, TWO));
  assert.deepEqual(positions(firstPage), [0, 1, 2, 3, 4, 5]);
  assert.equal(firstPage.nextPosition, 5);
  assert.equal(firstPage.hasMore, true);
  const secondPage = resultOf(
    await b.read({ view: 'activity', ...HISTORY_READ, limit: 6, afterPosition: 5 }, TWO),
  );
  assert.deepEqual(positions(secondPage), [6, 7, 8, 9]);
  assert.equal(secondPage.nextPosition, 9);
  assert.equal(secondPage.hasMore, false);
  assert.deepEqual(ordinals(secondPage), [2, 1]);

  // Call 4's shape: a short messages page after the earlier run's last message crosses into run 2.
  const crossing = resultOf(
    await b.read(
      { view: 'messages', limit: 2, maxCharsPerItem: 60, runLimit: 2, afterPosition: 5 },
      TWO,
    ),
  );
  assert.deepEqual(positions(crossing), [6, 7]);
  assert.equal(crossing.nextPosition, 7);
  assert.equal(crossing.hasMore, true);
  for (const item of crossing.items) assert.equal(item.runId, `${TWO}-run-2`);
  assert.equal(crossing.items[1].textTruncated, true);
  assert.equal(crossing.items[1].nextTextOffset, 60);
});

test('observation (b): runLimit 1 state and continuation reads of a two-run target serve only the latest run while runCount stays 2, and the final chunk ends the text', async () => {
  const b = bench(withTwoRunTarget(cloneSession()));
  const state = resultOf(
    await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 256, runLimit: 1 }, TWO),
  );
  assert.deepEqual(positions(state), [0]);
  assert.equal(state.items[0].textTruncated, true);
  assert.equal(state.items[0].nextTextOffset, 256);
  assert.equal(state.nextPosition, 0);
  assert.equal(state.hasMore, true);
  assert.equal(state.thread.runCount, 2);
  assert.deepEqual(
    state.recentRuns.map((runRecord) => runRecord.runId),
    [`${TWO}-run-2`],
  );

  const continuation = resultOf(
    await b.read({ itemId: ITEM_TWO_0, textOffset: 256, maxCharsPerItem: 256, runLimit: 1 }, TWO),
  );
  assert.deepEqual(positions(continuation), [0]);
  assert.equal(continuation.items[0].text, TWO_ITEM_0_TEXT.slice(256));
  assert.equal(continuation.items[0].textTruncated, false);
  assert.equal(continuation.items[0].nextTextOffset, null);
  assert.equal(continuation.nextPosition, 0);
  assert.equal(continuation.hasMore, false);
  assert.deepEqual(
    continuation.recentRuns.map((runRecord) => runRecord.runId),
    [`${TWO}-run-2`],
  );
});

test('observation (c): the marked observer is served in its one read form with the recorded running state and key sets, its first activity item, and no claim that runCount is an ordinal', async () => {
  const block = addendumBlock().hostKeySets;
  const b = bench(withObserver(cloneSession()));
  const result = resultOf(await b.call('thread-read', observerRead()));
  assert.deepEqual(Object.keys(result), block.response);
  assert.deepEqual(Object.keys(result.thread), block.thread);
  assert.deepEqual(Object.keys(result.recentRuns[0]), block.run);
  assert.equal(result.thread.status, 'running');
  assert.equal(result.thread.activeRunId, OBSERVER_LATEST_RUN);
  assert.equal(result.thread.latestRunId, OBSERVER_LATEST_RUN);
  assert.equal(result.thread.runCount, 55);
  assert.notEqual(result.thread.runCount, result.recentRuns[0].ordinal);
  assert.equal(result.recentRuns.length, 1);
  assert.equal(result.recentRuns[0].runId, OBSERVER_LATEST_RUN);
  assert.notEqual(result.recentRuns[0].startedAt, null);
  assert.deepEqual(positions(result), [0]);
  assert.equal(result.items[0].type, 'user_message');
  assert.equal(result.items[0].text, OBSERVER_ITEM_0_TEXT.slice(0, 256));
  assert.equal(result.items[0].textTruncated, true);
  assert.equal(result.items[0].nextTextOffset, 256);
  assert.equal(result.nextPosition, 0);
  assert.equal(result.hasMore, true);
  // The read is traced like any other, so a replay of the trace reaches the same answer.
  const [record] = b.records();
  assert.deepEqual(record.input, observerRead());
  assert.deepEqual(stub.readThread(withObserver(cloneSession()), record.input), result);
});

test('the still-refused neighbours of (a) to (c) answer unrecorded, so the stub serves no read form the second addendum did not observe', async () => {
  const b = bench(withObserver(cloneSession()));
  // runLimit 3 on the two-run target.
  unrecordedBy(
    await b.read({ view: 'messages', ...HISTORY_READ, runLimit: 3 }, TWO),
    'runLimit',
    'runLimitAboveOne',
  );
  // A running observer at a history read form, and at every other departure from read form (c).
  for (const [extra, parameter] of [
    [{ view: 'messages', ...HISTORY_READ }, 'view'],
    [{ view: 'activity', ...HISTORY_READ }, 'limit'],
    [{ limit: 2 }, 'limit'],
    [{ maxCharsPerItem: 255 }, 'maxCharsPerItem'],
    [{ runLimit: 2 }, 'runLimit'],
    [{ runLimit: undefined }, 'runLimit'],
    [{ afterPosition: 0 }, 'afterPosition'],
    [{ itemId: `${OBSERVER}-item-0`, textOffset: 256 }, 'itemId'],
  ]) {
    const input = { ...observerRead(), ...extra };
    if (extra.runLimit === undefined && 'runLimit' in extra) delete input.runLimit;
    if (extra.itemId !== undefined) {
      delete input.view;
      delete input.limit;
    }
    unrecordedBy(
      await b.call('thread-read', input),
      parameter,
      'runningObserverOtherReadForm',
      JSON.stringify(extra),
    );
  }
  // A running non-observer: the two-run target itself running, beside the marked observer.
  const running = withObserver(cloneSession());
  running.threads[TWO].thread.status = 'running';
  unrecordedBy(
    await bench(running).read({ view: 'messages', ...HISTORY_READ }, TWO),
    'thread.status',
    'runningTarget',
  );
  // A running observer without the fixture's marker is a running target too.
  const unmarked = withObserver(cloneSession());
  delete unmarked.observerThreadId;
  unrecordedBy(
    await bench(unmarked).call('thread-read', observerRead()),
    'thread.status',
    'runningTarget',
  );
});

test('a fixture that contradicts the recorded two-run or running-observer state is rejected, so a fixture cannot serve a thread the second addendum never showed', async () => {
  const targetMutations = {
    'the two runs do not carry ordinals 1 and 2': (s) => (s.threads[TWO].recentRuns[1].ordinal = 3),
    'runCount 2 lists one run': (s) => s.threads[TWO].recentRuns.pop(),
    'runCount 1 lists two runs': (s) => (s.threads[TWO].thread.runCount = 1),
    'an item names no run of the thread': (s) => (s.threads[TWO].items[3].runId = 'elsewhere'),
    'an earlier-run item follows a later-run item': (s) =>
      (s.threads[TWO].items[9].runId = `${TWO}-run-1`),
  };
  for (const [label, mutate] of Object.entries(targetMutations)) {
    const session = withObserver(cloneSession());
    mutate(session);
    failureOf(
      await bench(session).read({ view: 'activity', ...HISTORY_READ }, TWO),
      CODES.fixtureInvalid,
      label,
    );
  }
  const observerMutations = {
    'the observer is not running': (s) => (s.threads[OBSERVER].thread.status = 'completed'),
    'the observer has no active run': (s) => (s.threads[OBSERVER].thread.activeRunId = null),
    'the active run is not the latest': (s) => (s.threads[OBSERVER].thread.latestRunId = 'other'),
    'the observer lists two runs': (s) =>
      s.threads[OBSERVER].recentRuns.push(fixtureRun('t-observer-run-56', 56)),
    'the listed run is completed': (s) => {
      s.threads[OBSERVER].recentRuns[0].status = 'completed';
    },
    'the listed run has a completedAt': (s) => {
      s.threads[OBSERVER].recentRuns[0].completedAt = '2026-11-03T09:00:00.000Z';
    },
    'the listed run is not the active run': (s) => {
      s.threads[OBSERVER].recentRuns[0].runId = 'other';
    },
    'the observer runCount is not a positive integer': (s) => {
      s.threads[OBSERVER].thread.runCount = 0;
    },
    'observerThreadId names no thread': (s) => (s.observerThreadId = 't-missing'),
    'observerThreadId is not a string': (s) => (s.observerThreadId = 7),
  };
  for (const [label, mutate] of Object.entries(observerMutations)) {
    const session = withObserver(cloneSession());
    mutate(session);
    failureOf(
      await bench(session).call('thread-read', observerRead()),
      CODES.fixtureInvalid,
      label,
    );
  }
  // A marked observer leaves every completed target's reads as they were.
  resultOf(
    await bench(withObserver(cloneSession())).read({
      view: 'activity',
      limit: 3,
      maxCharsPerItem: 40,
    }),
  );
});

test('thread-read edge cases: an undefined thread names the defined ones, an unknown input key and a bad view are stub input errors, and a fixture without a session fails loudly', async () => {
  const b = bench();
  const missing = failureOf(
    await b.read({ view: 'activity' }, 't-missing'),
    CODES.undefinedInFixture,
  );
  assert.deepEqual(missing.details.definedThreads, ['t-main', 't-offset']);
  // Inherited object keys are no fixture threads.
  for (const threadId of ['constructor', '__proto__', 'toString']) {
    failureOf(
      await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }, threadId),
      CODES.undefinedInFixture,
      threadId,
    );
  }
  failureOf(await b.read({ view: 'activity', bogus: 1 }), CODES.invalidInput);
  failureOf(await b.read({ view: 'everything', limit: 3 }), CODES.invalidInput);
  failureOf(await b.call('thread-read', { runLimit: 1 }), CODES.invalidInput);
  const error = failureOf(await b.call('frobnicate', {}), CODES.undefinedInFixture);
  assert.deepEqual(error.details.definedOperations, [...stub.SESSION_OPERATIONS]);

  const noSession = bench(undefined, { repository: BASE.repository, operations: {} });
  failureOf(await noSession.read({ view: 'activity', limit: 3 }), CODES.fixtureInvalid);
  failureOf(await noSession.call('list-agents'), CODES.fixtureInvalid);
});

test('a thread without self-report data does not break reads, and a self-report operation without its fixture entry fails loudly instead of inventing one', async () => {
  const session = cloneSession();
  delete session.listAgents;
  delete session.send;
  delete session.replies;
  const b = bench(session);
  resultOf(await b.read({ view: 'activity', limit: 3, maxCharsPerItem: 10 }));
  failureOf(await b.call('list-agents'), CODES.undefinedInFixture);
  failureOf(await b.call('send-message', sendInput()), CODES.undefinedInFixture);
});

// --- Self-report surfaces -------------------------------------------------------------------------

test('list-agents serves the fixture header and rows in the projected shape and sequences them per call, so a post-reply lookup can show a missing or duplicated name', async () => {
  const b = bench();
  const first = resultOf(await b.call('list-agents'));
  assert.deepEqual(Object.keys(first), ['header', 'rows']);
  assert.deepEqual(
    sortedKeys(first.header),
    Object.keys(SELF_REPORT_PROJECTION.listAgentsHeader).sort(),
  );
  assert.equal(first.rows.length, 1);
  assert.deepEqual(
    sortedKeys(first.rows[0]),
    Object.keys(SELF_REPORT_PROJECTION.listAgentsRow).sort(),
  );
  assert.equal(first.rows[0].mode, 'interactive');
  assert.match(first.header.ref, /^[0-9a-fA-F]{6}$/);
  const second = resultOf(await b.call('list-agents'));
  assert.deepEqual(
    second.rows.map((row) => row.name),
    ['target-session', 'target-session'],
  );
  assert.notEqual(second.rows[0].ref, first.rows[0].ref);
  // The sequence holds two elements: a third call is not defined and does not repeat silently.
  failureOf(await b.call('list-agents'), CODES.undefinedInFixture);
  failureOf(await b.call('list-agents', { all: true }), CODES.invalidInput);

  const repeating = cloneSession();
  repeating.listAgents.repeatLast = true;
  const r = bench(repeating);
  await r.call('list-agents');
  await r.call('list-agents');
  assert.deepEqual(resultOf(await r.call('list-agents')), second);
});

test('list-agents rejects a value outside the recorded projection, so an unobserved mode or malformed ref cannot be served', async () => {
  const mode = cloneSession();
  mode.listAgents.sequence[0].rows[0].mode = 'background';
  unrecordedBy(await bench(mode).call('list-agents'), 'rows[0].mode', null);
  const ref = cloneSession();
  ref.listAgents.sequence[0].rows[0].ref = 'xyz';
  failureOf(await bench(ref).call('list-agents'), CODES.fixtureInvalid);
});

test('send-message returns the accepted shape and, for the restart-notice variant, the notice on the send result', async () => {
  const b = bench();
  const accepted = resultOf(await b.call('send-message', sendInput()));
  assert.deepEqual(Object.keys(accepted), ['messageId', 'status']);
  assert.equal(accepted.messageId, 'msg-0001');
  const restarted = resultOf(await b.call('send-message', sendInput(NONCE_B)));
  assert.deepEqual(Object.keys(restarted), ['messageId', 'status', 'notice']);
  assert.equal(restarted.messageId, 'msg-0002');
  assert.equal(typeof restarted.notice, 'string');

  // An explicit accepted variant is the default under its own name; a notice on it is invalid.
  const explicit = cloneSession();
  explicit.send = { variant: 'accepted', messageId: 'msg-9', status: 'queued' };
  assert.deepEqual(resultOf(await bench(explicit).call('send-message', sendInput())), {
    messageId: 'msg-9',
    status: 'queued',
  });
  const stray = cloneSession();
  stray.send = { variant: 'accepted', messageId: 'msg-9', status: 'queued', notice: 'x' };
  failureOf(await bench(stray).call('send-message', sendInput()), CODES.fixtureInvalid);
  const unknown = cloneSession();
  unknown.send = { variant: 'delayed', messageId: 'msg-9', status: 'queued' };
  const error = failureOf(
    await bench(unknown).call('send-message', sendInput()),
    CODES.undefinedInFixture,
  );
  assert.deepEqual(error.details.definedVariants, ['accepted', 'restart-notice']);
});

test('send-message rejects zero or several nonces and a malformed request, so a reply can never be matched against an ambiguous challenge', async () => {
  const b = bench();
  const none = failureOf(
    await b.call('send-message', { to: 'target-session', message: 'Report your progress.' }),
    CODES.invalidInput,
  );
  assert.equal(none.details.nonceCount, 0);
  const short = failureOf(
    await b.call('send-message', { to: 'target-session', message: 'echo focus-0123456789abcdef' }),
    CODES.invalidInput,
  );
  assert.equal(short.details.nonceCount, 0);
  const several = failureOf(
    await b.call('send-message', {
      to: 'target-session',
      message: `first ${NONCE_A} then ${NONCE_B}`,
    }),
    CODES.invalidInput,
  );
  assert.equal(several.details.nonceCount, 2);
  failureOf(await b.call('send-message', { message: `echo ${NONCE_A}` }), CODES.invalidInput);
  failureOf(
    await b.call('send-message', { to: 't', message: `echo ${NONCE_A}`, extra: 1 }),
    CODES.invalidInput,
  );
  // None of the rejected sends set a nonce, so nothing can be awaited yet.
  failureOf(await b.call('await-reply'), CODES.invalidInput);
});

test('await-reply before any send is an error envelope, because there is no nonce to echo', async () => {
  const b = bench();
  const error = failureOf(await b.call('await-reply'), CODES.invalidInput);
  assert.match(error.message, /no nonce/);
  assert.equal(b.records().length, 1, 'the refused call is still traced');
});

const REPLY_EXPECTATIONS = [
  ['none', null],
  ['delivered', 'delivered'],
  ['refused', 'refused'],
  ['narration-only', 'narration-only'],
  ['wrong-nonce', 'wrong-nonce'],
  ['name-mismatch', 'name-mismatch'],
  ['foreign', 'foreign'],
  ['malformed', 'malformed'],
  ['late-wait', null],
  ['late', 'late'],
];

test('await-reply serves each declared variant in its declared shape, one poll at a time, with {{NONCE}} replaced by the last sent nonce', async () => {
  const b = bench();
  resultOf(await b.call('send-message', sendInput()));
  const declared = BASE.session.replies.filter((entry) => entry.variant !== 'none');
  for (const [label, variant] of REPLY_EXPECTATIONS) {
    const result = resultOf(await b.call('await-reply'));
    if (variant === null) {
      assert.deepEqual(result, STUB_PROTOCOL.noReplyYet, label);
      continue;
    }
    const entry = declared.find((candidate) => candidate.variant === variant);
    assert.deepEqual(Object.keys(result), Object.keys(SELF_REPORT_PROJECTION.reply), label);
    const { variant: _variant, polls: _polls, ...fields } = entry;
    assert.deepEqual(
      result,
      { ...fields, text: entry.text.replaceAll('{{NONCE}}', NONCE_A) },
      label,
    );
    assert.equal(result.text.includes('{{NONCE}}'), false, label);
    assert.match(result.from, /^uds:\/tmp\/cc-socks\/[0-9]+\.sock$/);
    assert.equal(result['from-mode'], 'prompting');
  }
  // The timeline is exhausted: every further poll finds no reply.
  assert.deepEqual(resultOf(await b.call('await-reply')), STUB_PROTOCOL.noReplyYet);
});

test('the smoke fixture serves each reply variant through the stub with the signal it declares, so a verdict on a served reply can be traced to that signal', async () => {
  const b = bench();
  resultOf(await b.call('send-message', sendInput()));
  const replies = {};
  for (const [, variant] of REPLY_EXPECTATIONS) {
    const result = resultOf(await b.call('await-reply'));
    if (variant !== null) replies[variant] = result;
  }
  const nonceOf = (reply) => [...reply.text.matchAll(/focus-[0-9a-f]{32}/g)].map((m) => m[0]);
  assert.deepEqual(nonceOf(replies.delivered), [NONCE_A]);
  assert.deepEqual(nonceOf(replies['name-mismatch']), [NONCE_A]);
  assert.deepEqual(nonceOf(replies.late), [NONCE_A]);
  assert.notEqual(replies['name-mismatch']['from-name'], replies.delivered['from-name']);
  assert.deepEqual(nonceOf(replies.refused), []);
  assert.deepEqual(nonceOf(replies['narration-only']), []);
  assert.equal(nonceOf(replies['wrong-nonce']).length, 1);
  assert.notEqual(nonceOf(replies['wrong-nonce'])[0], NONCE_A);
  assert.notEqual(replies.foreign['from-name'], replies.delivered['from-name']);
  assert.deepEqual(nonceOf(replies.foreign), []);
  assert.deepEqual(nonceOf(replies.malformed), []);
  assert.match(replies.malformed.text, /focus-/);
});

test('a send that failed sets no nonce and takes no sequence position, so await-reply echoes only the last successful send', async () => {
  const absent = cloneSession();
  delete absent.send;
  const a = bench(absent);
  failureOf(await a.call('send-message', sendInput()), CODES.undefinedInFixture);
  assert.match(failureOf(await a.call('await-reply'), CODES.invalidInput).message, /no nonce/);

  const single = cloneSession();
  single.send = { sequence: [{ messageId: 'msg-1', status: 'queued' }] };
  single.replies = single.replies.filter((entry) => entry.variant === 'delivered');
  const b = bench(single);
  resultOf(await b.call('send-message', sendInput(NONCE_A)));
  failureOf(await b.call('send-message', sendInput(NONCE_B)), CODES.undefinedInFixture);
  const reply = resultOf(await b.call('await-reply'));
  assert.match(reply.text, new RegExp(NONCE_A));
  assert.doesNotMatch(reply.text, new RegExp(NONCE_B));
});

test('an await-reply poll with invalid input consumes no reply, so only valid polls advance the timeline', async () => {
  const session = cloneSession();
  session.replies = session.replies.filter((entry) => entry.variant === 'delivered');
  const b = bench(session);
  resultOf(await b.call('send-message', sendInput()));
  failureOf(await b.call('await-reply', { wait: 1 }), CODES.invalidInput);
  assert.equal(resultOf(await b.call('await-reply'))['from-name'], 'target-session');
  assert.deepEqual(resultOf(await b.call('await-reply')), STUB_PROTOCOL.noReplyYet);
});

test('a second send replaces the nonce an await-reply echoes, so a stale reply needs the explicit wrong-nonce variant', async () => {
  const session = cloneSession();
  session.replies = session.replies.filter((entry) => entry.variant === 'delivered');
  const b = bench(session);
  resultOf(await b.call('send-message', sendInput(NONCE_A)));
  resultOf(await b.call('send-message', sendInput(NONCE_B)));
  assert.match(resultOf(await b.call('await-reply')).text, new RegExp(NONCE_B));
});

test('await-reply fixture entries that contradict their variant are rejected, so a fixture cannot mislabel its reply', async () => {
  const cases = {
    'delivered without the nonce token': { variant: 'delivered', text: 'no token' },
    'wrong-nonce echoing the sent nonce': { variant: 'wrong-nonce', text: NONCE_A },
    'wrong-nonce without any nonce': { variant: 'wrong-nonce', text: 'plain' },
    'foreign echoing the sent nonce': { variant: 'foreign', text: NONCE_A },
    'malformed with a parsable nonce': { variant: 'malformed', text: NONCE_B },
    'late without polls': { variant: 'late', text: '{{NONCE}}' },
    'delivered under a name other than the sent one': {
      variant: 'delivered',
      'from-name': 'renamed-session',
      text: '{{NONCE}}',
    },
    'late under a name other than the sent one': {
      variant: 'late',
      polls: 1,
      'from-name': 'renamed-session',
      text: '{{NONCE}}',
    },
    // The template's from-name equals the send's `to` (target-session).
    'name-mismatch under the sent name': { variant: 'name-mismatch', text: '{{NONCE}}' },
    'name-mismatch without the nonce token': {
      variant: 'name-mismatch',
      'from-name': 'renamed-session',
      text: 'no token',
    },
    'foreign under the sent name': { variant: 'foreign', text: 'Hello.' },
    'refused echoing the nonce token': { variant: 'refused', text: '{{NONCE}} no' },
    'narration-only carrying a literal nonce': { variant: 'narration-only', text: NONCE_B },
  };
  const template = BASE.session.replies.find((entry) => entry.variant === 'delivered');
  const { variant: _delivered, ...rest } = template;
  for (const [label, override] of Object.entries(cases)) {
    const session = cloneSession();
    session.replies = [{ ...rest, ...override }];
    const b = bench(session);
    resultOf(await b.call('send-message', sendInput(NONCE_A)));
    failureOf(await b.call('await-reply'), CODES.fixtureInvalid, label);
  }
  const unknown = cloneSession();
  unknown.replies = [{ variant: 'sulking' }];
  const b = bench(unknown);
  resultOf(await b.call('send-message', sendInput()));
  const error = failureOf(await b.call('await-reply'), CODES.undefinedInFixture);
  assert.deepEqual(error.details.definedVariants, [...stub.REPLY_VARIANTS]);
});

test('a send to a [ref] checks delivered and late from-names against the name the last list-agents rows give that ref, and skips the check when no rows resolve it', async () => {
  const template = BASE.session.replies.find((entry) => entry.variant === 'delivered');
  const { variant: _delivered, ...rest } = template;
  const withReply = (fromName, variant = 'delivered') => {
    const session = cloneSession();
    const extra = variant === 'late' ? { polls: 1 } : {};
    session.replies = [{ ...rest, ...extra, variant, 'from-name': fromName }];
    return session;
  };
  const toRef = (ref) => ({ to: ref, message: `Report your progress and echo ${NONCE_A}.` });
  const firstPoll = async (b, variant) => {
    if (variant === 'late')
      assert.deepEqual(resultOf(await b.call('await-reply')), STUB_PROTOCOL.noReplyYet);
    return b.call('await-reply');
  };

  for (const variant of ['delivered', 'late']) {
    // The first list-agents element gives ref 0f1e2d the name target-session.
    const matching = bench(withReply('target-session', variant));
    resultOf(await matching.call('list-agents'));
    resultOf(await matching.call('send-message', toRef('0f1e2d')));
    assert.equal(resultOf(await firstPoll(matching, variant))['from-name'], 'target-session');

    const mislabelled = bench(withReply('renamed-session', variant));
    resultOf(await mislabelled.call('list-agents'));
    resultOf(await mislabelled.call('send-message', toRef('0f1e2d')));
    failureOf(await mislabelled.call('await-reply'), CODES.fixtureInvalid, variant);
  }

  // The rows of the last list-agents call before the send decide: the second element knows ffeedd.
  const second = bench(withReply('renamed-session'));
  resultOf(await second.call('list-agents'));
  resultOf(await second.call('list-agents'));
  resultOf(await second.call('send-message', toRef('ffeedd')));
  failureOf(await second.call('await-reply'), CODES.fixtureInvalid, 'second list element');

  // No list-agents call before the send, or a ref no row carries: the name is unknown, so the
  // check is skipped rather than guessed.
  const unlisted = bench(withReply('renamed-session'));
  resultOf(await unlisted.call('send-message', toRef('0f1e2d')));
  assert.equal(resultOf(await unlisted.call('await-reply'))['from-name'], 'renamed-session');
  const unknownRef = bench(withReply('renamed-session'));
  resultOf(await unknownRef.call('list-agents'));
  resultOf(await unknownRef.call('send-message', toRef('abcdef')));
  assert.equal(resultOf(await unknownRef.call('await-reply'))['from-name'], 'renamed-session');

  // A plain listAgents entry answers every call, so it resolves a ref without a prior call.
  const plain = withReply('renamed-session');
  plain.listAgents = plain.listAgents.sequence[0];
  const direct = bench(plain);
  resultOf(await direct.call('send-message', toRef('0f1e2d')));
  failureOf(await direct.call('await-reply'), CODES.fixtureInvalid, 'plain listAgents entry');
});

test('the stub refuses --apply and extra arguments before reading input or recording anything, because it performs no mutation', () => {
  const dir = scratch('session-stub-argv-');
  const fixture = join(dir, 'fixture.json');
  const log = join(dir, 'trace', 'session-calls.jsonl');
  writeFileSync(fixture, JSON.stringify(BASE));
  const env = { ...cleanEnv(), EVAL_SESSION_FIXTURE: fixture, EVAL_SESSION_LOG: log };
  for (const args of [['thread-read', '--apply'], ['thread-read', 'extra'], ['--apply'], []]) {
    const result = runCli(STUB, args, { threadId: MAIN }, { env });
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.envelope.ok, false);
    assert.equal(result.envelope.error.code, CODES.invalidInput);
  }
  const apply = runCli(STUB, ['thread-read', '--apply'], { threadId: MAIN }, { env });
  assert.match(apply.envelope.error.message, /--apply is refused/);
  assert.equal(existsSync(log), false, 'a refused invocation must record nothing');
});

test('the stub environment overrides redirect the fixture and the trace, and stdin that is not one JSON object is an input error', () => {
  const dir = scratch('session-stub-env-');
  const fixture = join(dir, 'fixture.json');
  const log = join(dir, 'elsewhere', 'calls.jsonl');
  writeFileSync(fixture, JSON.stringify(BASE));
  const env = { ...cleanEnv(), EVAL_SESSION_FIXTURE: fixture, EVAL_SESSION_LOG: log };
  const ok = runCli(
    STUB,
    ['thread-read'],
    { threadId: MAIN, runLimit: 1, view: 'messages', limit: 1, maxCharsPerItem: 5 },
    { env },
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim().split('\n').length, 1);
  assert.equal(traceRecords(log).length, 1);
  const bad = runCli(STUB, ['thread-read'], '[1, 2]', { env });
  assert.equal(bad.status, 1);
  assert.equal(bad.envelope.error.code, CODES.invalidInput);
  const garbage = runCli(STUB, ['thread-read'], 'not json', { env });
  assert.equal(garbage.status, 1);
  assert.equal(garbage.envelope.error.code, CODES.invalidInput);
});

// --- The trace ------------------------------------------------------------------------------------

test('every call is traced with its sequence number, operation, input and time, including the calls that fail', async () => {
  const b = bench();
  await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 5 });
  await b.call('await-reply');
  await b.call('list-agents');
  const records = b.records();
  assert.deepEqual(
    records.map((record) => [record.seq, record.operation]),
    [
      [1, 'thread-read'],
      [2, 'await-reply'],
      [3, 'list-agents'],
    ],
  );
  for (const record of records) {
    assert.deepEqual(sortedKeys(record), ['at', 'input', 'operation', 'seq']);
    assert.equal(Number.isNaN(Date.parse(record.at)), false);
  }
  assert.deepEqual(records[0].input, {
    threadId: MAIN,
    runLimit: 1,
    view: 'activity',
    limit: 1,
    maxCharsPerItem: 5,
  });
});

test('a trace directory that cannot be created fails the call as trace-unavailable, not as an unexpected or fixture error', async () => {
  const b = bench();
  writeFileSync(dirname(b.log), 'a file where the trace directory belongs');
  const error = failureOf(
    await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 5 }),
    CODES.traceUnavailable,
  );
  assert.match(error.message, /trace directory/);
});

test(
  'a read-only trace directory fails the call as trace-unavailable at once, so a lock that can never be created is not retried until the deadline',
  { skip: process.getuid?.() === 0 ? 'root ignores directory permissions' : false },
  async () => {
    const b = bench();
    const traceDir = dirname(b.log);
    mkdirSync(traceDir);
    chmodSync(traceDir, 0o555);
    try {
      const started = Date.now();
      const error = failureOf(
        await b.read({ view: 'activity', limit: 1, maxCharsPerItem: 5 }),
        CODES.traceUnavailable,
      );
      assert.match(error.message, /cannot be created/);
      assert.ok(
        Date.now() - started < 1000,
        'the lock loop must not wait for a non-EEXIST failure',
      );
    } finally {
      chmodSync(traceDir, 0o755);
    }
  },
);

function spawnAsync(args, input, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [STUB, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test('8 concurrent stub calls leave 8 well-formed trace records with distinct sequence numbers and no lock behind', async () => {
  const dir = scratch('session-stub-concurrent-');
  const fixture = join(dir, 'fixture.json');
  const log = join(dir, 'trace', 'session-calls.jsonl');
  writeFileSync(fixture, JSON.stringify(BASE));
  const env = { ...cleanEnv(), EVAL_SESSION_FIXTURE: fixture, EVAL_SESSION_LOG: log };
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      spawnAsync(
        ['thread-read'],
        {
          threadId: MAIN,
          runLimit: 1,
          view: 'activity',
          limit: 1 + (index % 3),
          maxCharsPerItem: 10,
        },
        env,
      ),
    ),
  );
  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  }
  const lines = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
  assert.equal(lines.length, 8, 'records interleaved or went missing');
  const records = lines.map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((record) => record.seq).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  for (const record of records) {
    assert.deepEqual(sortedKeys(record), ['at', 'input', 'operation', 'seq']);
    assert.equal(record.operation, 'thread-read');
    assert.equal(record.input.threadId, MAIN);
  }
  assert.deepEqual(
    readdirSync(join(dir, 'trace')).filter((name) => name.endsWith('.lock')),
    [],
  );
});
