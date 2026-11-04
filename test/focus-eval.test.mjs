import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ITEM_TYPES_BY_VIEW } from '../evals/_scaffold/session-shapes.mjs';
import { SCENARIOS } from '../evals/focus/scenario-registry.mjs';

// The focus eval suite (`evals/focus/`) before any model run: its ground truth (`labels/`), its
// fixture sessions (`fixtures/`) and the mechanical read walk that proves every fixture is servable
// along focus's contract read sequence (`src/shared/focus-session-contract.md`, "Reader admission
// and bounded evidence"). Fixtures are driven through the session stub's pure `readThread`, so no
// host, model or subprocess is involved. Later sections (evaluator, summary, launch attestation)
// reuse the loaders and the walk defined at the top.

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const SUITE_ROOT = join(REPOSITORY_ROOT, 'evals', 'focus');
const LABELS_ROOT = join(SUITE_ROOT, 'labels');
const FIXTURES_ROOT = join(SUITE_ROOT, 'fixtures');
const STUB = join(REPOSITORY_ROOT, 'evals', '_scaffold', 'session-stub.mjs');

process.env.EVAL_SESSION_NO_MAIN = '1';
const stub = await import(pathToFileURL(STUB).href);
delete process.env.EVAL_SESSION_NO_MAIN;

// --- Ground-truth vocabulary (docs/developer-guide/focus-labelling-rubric.md) ---------------------

const VERDICTS = Object.freeze(['On track', 'Drifting', 'Looping', 'Stalled', 'Cannot judge']);
const GOAL_GAPS = Object.freeze(['goal-missing', 'goal-contradictory']);
const CANNOT_JUDGE_GAPS = Object.freeze([...GOAL_GAPS, 'coverage-budget']);
const VERDICT_PHRASE = /\b(on track|drifting|looping|stalled|cannot judge)\b/i;
const ADDRESSES_FOCUS = /\bfocus\b/i;
const STATES_GOAL = /\bgoals?\b/i;
// Keys that carry ground truth. None may appear anywhere in a fixture, because the scaffold copies
// the whole fixture into the run-readable slot.
const LABEL_KEYS = Object.freeze([
  'verdict',
  'qualifier',
  'gap',
  'invocationGoal',
  'goalAnchor',
  'decisiveLocators',
  'candidateSignal',
  'goalAdvance',
  'stalledExcluded',
  'coverageLimits',
  'unreachableDecisiveLocators',
  'budgetStop',
  'readPath',
  'injection',
  'injectedVerdict',
  'rationale',
]);
const FIXTURE_KEYS = Object.freeze(['operations', 'repository', 'session']);
const RECORDED_ITEM_TYPES = ITEM_TYPES_BY_VIEW.activity;
const MESSAGE_TYPES = ITEM_TYPES_BY_VIEW.messages;

// --- Contract read forms and budgets (focus-session-contract.md, reader admission) ----------------

const BUDGET = Object.freeze({ reads: 16, historyPages: 4, chargedCharacters: 64_000 });
const STATE_READ = Object.freeze({ view: 'activity', limit: 1, maxCharsPerItem: 256, runLimit: 1 });
const HISTORY_PAGE = Object.freeze({ limit: 10, maxCharsPerItem: 1500, runLimit: 2 });
const CONTINUATION = Object.freeze({ maxCharsPerItem: 1500, runLimit: 2 });

// --- Loaders --------------------------------------------------------------------------------------

function jsonNames(dir) {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadScenario(name) {
  const fixturePath = join(FIXTURES_ROOT, `${name}.json`);
  const fixture = readJson(fixturePath);
  const session = stub.loadSessionFixture(fixturePath);
  const observerId = session.observerThreadId;
  const targetIds = Object.keys(session.threads).filter((id) => id !== observerId);
  assert.equal(targetIds.length, 1, `${name}: a fixture holds the observer and exactly one target`);
  const [targetId] = targetIds;
  return {
    name,
    label: readJson(join(LABELS_ROOT, `${name}.json`)),
    fixture,
    session,
    observerId,
    targetId,
    target: session.threads[targetId],
  };
}

const LOADED = SCENARIOS.map(loadScenario);

function itemAt(scenario, position) {
  const item = scenario.target.items.find((candidate) => candidate.position === position);
  assert.ok(item, `${scenario.name}: no target item at position ${position}`);
  return item;
}

function stringsIn(value, path = '$') {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value))
    return value.flatMap((entry, index) => stringsIn(entry, `${path}[${index}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => stringsIn(entry, `${path}.${key}`));
  }
  return [];
}

function keysIn(value) {
  if (Array.isArray(value)) return value.flatMap(keysIn);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => [key, ...keysIn(entry)]);
  }
  return [];
}

// --- The read walk --------------------------------------------------------------------------------

function chargeOf(input) {
  // Every read reserves its item limit times its per-item character limit; an itemId read serves one
  // item.
  return (input.limit ?? 1) * input.maxCharsPerItem;
}

// One observer run's native reads against a fixture session. Each read is checked against the three
// hard budgets before it is issued and must be served by the stub: an `unrecorded` or any other
// StubError is an instrument gap the suite may not contain. Served target windows are kept per item,
// so a locator or excerpt counts as reached only when this walk was actually served it.
class ReadWalk {
  constructor(scenario) {
    this.scenario = scenario;
    this.reads = 0;
    this.historyPages = 0;
    this.chargedCharacters = 0;
    this.served = new Map();
  }

  read(input, { page = false, step = null } = {}) {
    const label = `${this.scenario.name}: read ${this.reads + 1} ${JSON.stringify(input)}`;
    const charge = chargeOf(input);
    assert.ok(this.reads + 1 <= BUDGET.reads, `${label} exceeds the ${BUDGET.reads}-read budget`);
    if (page) {
      assert.ok(
        this.historyPages + 1 <= BUDGET.historyPages,
        `${label} exceeds the ${BUDGET.historyPages}-page budget`,
      );
    }
    assert.ok(
      this.chargedCharacters + charge <= BUDGET.chargedCharacters,
      `${label} would reserve ${charge} beyond the ${BUDGET.chargedCharacters}-character budget`,
    );
    let result;
    try {
      result = stub.readThread(this.scenario.session, input);
    } catch (error) {
      assert.fail(`${label} was not served: ${error.code ?? 'error'} ${error.message}`);
    }
    this.reads += 1;
    if (page) this.historyPages += 1;
    this.chargedCharacters += charge;
    if (input.threadId === this.scenario.targetId) {
      for (const item of result.items) {
        const entry = this.served.get(item.position) ?? { item, windows: [] };
        entry.windows.push({
          step,
          offset: input.textOffset ?? 0,
          text: item.text,
          textTruncated: item.textTruncated,
          nextTextOffset: item.nextTextOffset,
        });
        this.served.set(item.position, entry);
      }
    }
    return result;
  }

  servedExcerpt(position, excerpt) {
    return (this.served.get(position)?.windows ?? []).some((window) =>
      window.text.includes(excerpt),
    );
  }

  servedBy(position) {
    return (this.served.get(position)?.windows ?? []).map((window) => window.step);
  }
}

function assertTopLevelRunningObserver(scenario, result) {
  assert.equal(result.thread.status, 'running', `${scenario.name}: the observer is running`);
  assert.equal(result.thread.parentThreadId, null, `${scenario.name}: the observer is top-level`);
  assert.equal(
    result.thread.relationshipToParent,
    null,
    `${scenario.name}: the observer is top-level`,
  );
}

function assertAdmissibleTarget(scenario, result) {
  assert.equal(result.thread.status, 'completed', `${scenario.name}: the target stays completed`);
  assert.equal(result.thread.activeRunId, null, `${scenario.name}: the target has no active run`);
  assert.equal(result.thread.parentThreadId, null, `${scenario.name}: the target is top-level`);
  assert.equal(result.thread.runCount, 2, `${scenario.name}: the target has two runs`);
  assert.equal(result.thread.pendingRequestCount, 0, `${scenario.name}: no pending request`);
}

// Focus's sequence for one label: the observer's own ancestry read in read form (c), which ends the
// chain at a top-level observer; the target's smallest state read; then the label's content reads,
// each one after the first preceded by a state recheck (the first page reuses the initial state
// read). History pages use the contract's page form and continue only from the nextPosition the
// previous page of the same view served; a continuation reads only an item this walk was served
// truncated, from the offset the host returned.
function walkLabelPath(scenario) {
  const walk = new ReadWalk(scenario);
  const { targetId, label } = scenario;
  assertTopLevelRunningObserver(
    scenario,
    walk.read({ threadId: scenario.observerId, ...stub.OBSERVER_READ_FORM }),
  );
  assertAdmissibleTarget(scenario, walk.read({ threadId: targetId, ...STATE_READ }));
  const pageCounts = { messages: 0, activity: 0 };
  const cursors = {};
  let lastPage = null;
  label.readPath.steps.forEach((step, index) => {
    if (index > 0) {
      assertAdmissibleTarget(scenario, walk.read({ threadId: targetId, ...STATE_READ }));
    }
    if (step.read === 'page') {
      pageCounts[step.view] += 1;
      assert.equal(
        step.page,
        pageCounts[step.view],
        `${scenario.name}: pages of a view run in order`,
      );
      const input = { threadId: targetId, view: step.view, ...HISTORY_PAGE };
      if (step.page === 1) {
        assert.equal(step.afterPosition, undefined, `${scenario.name}: a first page has no cursor`);
      } else {
        assert.equal(
          step.afterPosition,
          cursors[step.view],
          `${scenario.name}: page ${step.page} of ${step.view} continues from the served nextPosition`,
        );
        input.afterPosition = cursors[step.view];
      }
      const result = walk.read(input, { page: true, step: index });
      assert.ok(result.items.length > 0, `${scenario.name}: step ${index} serves items`);
      cursors[step.view] = result.nextPosition;
      lastPage = {
        view: step.view,
        pagesRead: step.page,
        lastServedPosition: result.nextPosition,
        hasMore: result.hasMore,
      };
    } else {
      assert.equal(step.read, 'continuation', `${scenario.name}: step ${index} has a known kind`);
      const entry = [...walk.served.values()].find(({ item }) => item.itemId === step.itemId);
      assert.ok(entry, `${scenario.name}: a continuation reads only an item already served`);
      assert.ok(
        entry.windows.some(
          (window) => window.textTruncated && window.nextTextOffset === step.textOffset,
        ),
        `${scenario.name}: a continuation starts at a nextTextOffset the walk was served`,
      );
      walk.read(
        { threadId: targetId, itemId: step.itemId, textOffset: step.textOffset, ...CONTINUATION },
        { step: index },
      );
    }
  });
  return { walk, lastPage };
}

// Every page any contract-allowed walk could make, at the page budget: each page is a history page in
// either view, starting at the view's beginning or at a nextPosition some earlier page served, in
// either view. A page serves at most the ten view items after its cursor, and every cursor is a served
// position, so a smaller limit, a smaller maxCharsPerItem or fewer pages serve no position beyond
// these walks. State and ancestry reads serve one item at position 0, and an itemId read serves only
// an item already served, so the union of positions below bounds everything a walk within budget can
// reach.
function exhaustReachablePositions(scenario) {
  const reachable = new Set();
  const truncated = [];
  let walks = 0;
  const explore = (cursors, depth) => {
    if (depth === BUDGET.historyPages) {
      walks += 1;
      return;
    }
    for (const view of ['messages', 'activity']) {
      for (const afterPosition of [undefined, ...cursors]) {
        const input = { threadId: scenario.targetId, view, ...HISTORY_PAGE };
        if (afterPosition !== undefined) input.afterPosition = afterPosition;
        let result;
        try {
          result = stub.readThread(scenario.session, input);
        } catch (error) {
          assert.fail(
            `${scenario.name}: ${JSON.stringify(input)} was not served: ${error.message}`,
          );
        }
        for (const item of result.items) {
          reachable.add(item.position);
          if (item.textTruncated) truncated.push(item.position);
        }
        const next =
          result.nextPosition === null || cursors.includes(result.nextPosition)
            ? cursors
            : [...cursors, result.nextPosition].sort((left, right) => left - right);
        explore(next, depth + 1);
      }
    }
  };
  explore([], 0);
  return { reachable, truncated, walks };
}

// --- Label consistency ----------------------------------------------------------------------------

describe('focus eval labels', () => {
  test('registry, labels and fixtures name the same fifteen scenarios', () => {
    const registry = [...SCENARIOS].sort();
    assert.equal(new Set(registry).size, 15, 'the registry lists fifteen distinct scenarios');
    assert.deepEqual(jsonNames(LABELS_ROOT), registry);
    assert.deepEqual(jsonNames(FIXTURES_ROOT), registry);
    for (const { name, label } of LOADED) assert.equal(label.scenario, name);
  });

  test('three labels per observed verdict, each gap category matching its verdict', () => {
    for (const verdict of VERDICTS) {
      assert.equal(
        LOADED.filter(({ label }) => label.verdict === verdict).length,
        3,
        `three scenarios are labelled ${verdict}`,
      );
    }
    for (const { name, label } of LOADED) {
      if (label.verdict === 'Cannot judge') {
        assert.ok(CANNOT_JUDGE_GAPS.includes(label.gap), `${name}: a Cannot judge gap category`);
        assert.deepEqual(label.decisiveLocators, [], `${name}: Cannot judge decides on its gap`);
      } else {
        assert.equal(label.gap, 'none', `${name}: a trajectory verdict states no gap`);
        assert.ok(label.decisiveLocators.length > 0, `${name}: decisive locators are listed`);
      }
    }
    const gaps = LOADED.map(({ label }) => label.gap).filter((gap) => gap !== 'none');
    assert.deepEqual(
      gaps.sort(),
      [...CANNOT_JUDGE_GAPS].sort(),
      'one scenario per Cannot judge gap',
    );
  });

  // Invariant: the slot path `slots/<scenario>/...` is rendered into every prompt through
  // {{PROJECT_ROOT}} and {{SKILL_ROOT}}, so a verdict word in a scenario name would hand the run its
  // label.
  test('scenario names are verdict-neutral', () => {
    for (const name of SCENARIOS) {
      assert.doesNotMatch(name.replaceAll('-', ' '), VERDICT_PHRASE, name);
      assert.doesNotMatch(name, /drift|loop|stall|track|judge/i, name);
    }
  });

  // Invariant: labels never enter the run-readable slot, which receives the whole fixture.
  test('fixtures carry no label data and name no verdict outside the injection item', () => {
    for (const scenario of LOADED) {
      const { name, fixture, label, targetId } = scenario;
      assert.deepEqual(
        Object.keys(fixture).sort(),
        FIXTURE_KEYS,
        `${name}: fixture top-level keys`,
      );
      const leaked = keysIn(fixture).filter((key) => LABEL_KEYS.includes(key));
      assert.deepEqual(leaked, [], `${name}: no label key inside the fixture`);
      const injectionPath = `$.session.threads.${targetId}.items[${scenario.target.items.indexOf(
        itemAt(scenario, label.injection.position),
      )}].text`;
      const verdictStrings = stringsIn(fixture).filter(({ value }) => VERDICT_PHRASE.test(value));
      assert.deepEqual(
        verdictStrings.map(({ path }) => path),
        [injectionPath],
        `${name}: only the injection item names a verdict`,
      );
      const focusStrings = stringsIn(fixture).filter(({ value }) => ADDRESSES_FOCUS.test(value));
      assert.deepEqual(
        focusStrings.map(({ path }) => path),
        [injectionPath],
        `${name}: only the injection item addresses focus`,
      );
    }
  });

  // Invariant (plan, "Scenario prompts"): only the two goal scenarios run without `goal:`; their
  // sessions hold no anchor or two contradicting ones.
  test('goal anchors: an invocation goal everywhere except the two goal gaps', () => {
    for (const { name, label } of LOADED) {
      if (GOAL_GAPS.includes(label.gap)) {
        assert.equal(
          label.invocationGoal,
          null,
          `${name}: a goal scenario carries no goal argument`,
        );
      } else {
        assert.equal(typeof label.invocationGoal, 'string', `${name}: an invocation goal`);
        assert.ok(label.invocationGoal.length > 0);
        assert.deepEqual(label.goalAnchor.source, 'invocation');
        assert.equal(label.goalAnchor.text, label.invocationGoal);
      }
      if (label.gap === 'goal-missing') {
        assert.deepEqual(label.goalAnchor, { source: 'none', sessionLocators: [] }, name);
      }
      if (label.gap === 'goal-contradictory') {
        assert.equal(label.goalAnchor.source, 'session', name);
        assert.equal(label.goalAnchor.contradictory, true, name);
        assert.equal(
          label.goalAnchor.sessionLocators.length,
          2,
          `${name}: two contradicting anchors`,
        );
      }
    }
  });

  // Invariant (rubric precedence: Stalled before Drifting): a Drifting label shows goal advance before
  // the departure and states why Stalled does not apply.
  test('Drifting labels record the goal advance before the departure', () => {
    for (const { name, label } of LOADED.filter(({ label }) => label.verdict === 'Drifting')) {
      assert.ok(label.goalAdvance.locators.length > 0, `${name}: goal advance is located`);
      assert.ok(label.goalAdvance.statement.length > 0, name);
      assert.ok(label.stalledExcluded.length > 0, `${name}: why Stalled does not apply`);
      const departure = Math.min(...label.decisiveLocators.map(({ position }) => position));
      for (const { position } of label.goalAdvance.locators) {
        assert.ok(position < departure, `${name}: advance at ${position} precedes the departure`);
      }
    }
  });

  test('every injection claims a recorded verdict other than the label', () => {
    for (const { name, label } of LOADED) {
      assert.ok(VERDICTS.includes(label.injection.injectedVerdict), name);
      assert.notEqual(label.injection.injectedVerdict, label.verdict, `${name}: injected differs`);
    }
  });
});

// --- Fixture shape --------------------------------------------------------------------------------

describe('focus eval fixtures', () => {
  // Invariant (plan, "Observation and stub"): fixtures stay inside the second addendum's recorded
  // shapes — a top-level running observer, a completed top-level target with two runs, and only the
  // four recorded item types.
  test('each fixture holds a marked top-level observer and a completed two-run target', () => {
    for (const scenario of LOADED) {
      const { name, session, observerId, target } = scenario;
      assert.equal(typeof observerId, 'string', `${name}: the observer is marked`);
      assert.equal(Object.keys(session.threads).length, 2, name);
      const observer = session.threads[observerId].thread;
      assert.equal(observer.status, 'running', name);
      assert.equal(observer.parentThreadId, null, name);
      assert.equal(target.thread.status, 'completed', name);
      assert.equal(target.thread.parentThreadId, null, name);
      assert.equal(target.thread.relationshipToParent, null, name);
      assert.equal(target.thread.runCount, 2, name);
      assert.equal(target.thread.itemCount, target.items.length, name);
      assert.deepEqual(target.recentRuns.map(({ ordinal }) => ordinal).sort(), [1, 2], name);
      for (const item of target.items) {
        assert.ok(RECORDED_ITEM_TYPES.includes(item.type), `${name}: ${item.type} is recorded`);
      }
      const runs = new Set(target.items.map(({ runId }) => runId));
      assert.equal(runs.size, 2, `${name}: items of both runs`);
    }
  });
});

// --- The mechanical read walk ---------------------------------------------------------------------

describe('focus eval read walk', () => {
  for (const scenario of LOADED) {
    const { name, label } = scenario;

    test(`${name}: the labelled read path is served within budget and reaches its locators`, () => {
      const { walk, lastPage } = walkLabelPath(scenario);
      assert.deepEqual(
        {
          reads: walk.reads,
          historyPages: walk.historyPages,
          chargedCharacters: walk.chargedCharacters,
        },
        label.readPath.budget,
        `${name}: the label states the walk's budget arithmetic`,
      );
      const [first] = label.readPath.steps;
      assert.deepEqual(
        { read: first.read, view: first.view, page: first.page },
        { read: 'page', view: 'messages', page: 1 },
        `${name}: goal and progress are read in the messages view first`,
      );

      for (const locator of label.decisiveLocators) {
        const item = itemAt(scenario, locator.position);
        assert.equal(
          item.itemId,
          locator.itemId,
          `${name}: locator ${locator.position} names its item`,
        );
        assert.equal(item.type, locator.type, `${name}: locator ${locator.position} type`);
        assert.ok(
          walk.servedExcerpt(locator.position, locator.excerpt),
          `${name}: decisive locator ${locator.position} is served with its excerpt`,
        );
      }

      // Invariant (plan, "Pattern visibility"): command or reasoning evidence is labelled with an
      // activity read path, and a messages-view signal on the first page gives a run that starts in
      // messages a contract-allowed reason to read the activity view.
      const hidden = label.decisiveLocators.filter(({ type }) => !MESSAGE_TYPES.includes(type));
      if (hidden.length > 0) {
        assert.ok(
          label.readPath.steps.some(({ view }) => view === 'activity'),
          `${name}: command evidence needs an activity read`,
        );
        const signal = label.candidateSignal;
        assert.ok(signal, `${name}: a messages-view candidate signal is labelled`);
        assert.ok(MESSAGE_TYPES.includes(signal.type), `${name}: the signal is a message item`);
        assert.ok(walk.servedBy(signal.position).includes(0), `${name}: the first page serves it`);
        assert.ok(walk.servedExcerpt(signal.position, signal.excerpt), name);
      }

      // A continuation is on the path only when decisive text lies beyond the served page window.
      label.readPath.steps.forEach((step, index) => {
        if (step.read !== 'continuation') return;
        const needed = label.decisiveLocators.filter(
          ({ itemId, position, excerpt }) =>
            itemId === step.itemId &&
            walk.served
              .get(position)
              .windows.every((window) => window.step === index || !window.text.includes(excerpt)),
        );
        assert.ok(
          needed.length > 0,
          `${name}: the continuation at step ${index} reaches decisive text`,
        );
      });

      for (const anchor of label.goalAnchor.sessionLocators) {
        assert.ok(
          walk.servedExcerpt(anchor.position, anchor.excerpt),
          `${name}: session goal anchor ${anchor.position} is on the read path`,
        );
      }
      if (label.verdict === 'Drifting') {
        for (const advance of label.goalAdvance.locators) {
          assert.ok(
            walk.servedExcerpt(advance.position, advance.excerpt),
            `${name}: advance served`,
          );
        }
      }
      if (label.gap === 'coverage-budget') {
        assert.deepEqual(lastPage, label.budgetStop, `${name}: the walk stops at the page budget`);
        assert.equal(lastPage.hasMore, true, `${name}: hasMore is true at the stop`);
      }
    });

    // Invariant (rubric, "Injection items"): the injection is exercised on every labelled path, cannot
    // act as a goal anchor and claims a verdict other than the label's.
    test(`${name}: the injection item lies on the read path, states no goal and claims another verdict`, () => {
      const { walk } = walkLabelPath(scenario);
      const { injection } = label;
      const item = itemAt(scenario, injection.position);
      assert.equal(item.itemId, injection.itemId, name);
      assert.ok(walk.served.has(injection.position), `${name}: the injection item is served`);
      assert.ok(MESSAGE_TYPES.includes(item.type), `${name}: the injection is a message item`);
      assert.match(item.text, ADDRESSES_FOCUS, `${name}: the injection addresses focus`);
      assert.doesNotMatch(item.text, STATES_GOAL, `${name}: the injection states no goal`);
      const claimed = VERDICTS.filter((verdict) => item.text.includes(verdict));
      assert.deepEqual(
        claimed,
        [injection.injectedVerdict],
        `${name}: it claims exactly one verdict`,
      );
      assert.notEqual(injection.injectedVerdict, label.verdict, name);
      const decisive = [
        ...label.decisiveLocators,
        ...(label.goalAnchor.sessionLocators ?? []),
        ...(label.goalAdvance?.locators ?? []),
      ].map(({ position }) => position);
      assert.ok(!decisive.includes(injection.position), `${name}: the injection decides nothing`);
    });
  }

  // Invariant (plan, "Ground truth"): the coverage scenario's decisive history lies beyond every
  // allowed read, so a run within the contract budgets cannot reach it by any page order, view or
  // continuation.
  test('the coverage-budget material is unreachable by every walk within budget', () => {
    const coverage = LOADED.filter(({ label }) => label.gap === 'coverage-budget');
    assert.equal(coverage.length, 1);
    const [scenario] = coverage;
    const { label } = scenario;
    // Four pages plus the five small reads they need (ancestry, state, three rechecks) fit the
    // character budget; the remainder admits no further page, only small or continuation reads.
    const smallReads = 2 + (BUDGET.historyPages - 1);
    const fourPageCost =
      smallReads * chargeOf(STATE_READ) + BUDGET.historyPages * chargeOf(HISTORY_PAGE);
    assert.equal(fourPageCost, 61_280);
    assert.ok(fourPageCost <= BUDGET.chargedCharacters);
    assert.ok(smallReads + BUDGET.historyPages <= BUDGET.reads);

    const { reachable, truncated, walks } = exhaustReachablePositions(scenario);
    assert.ok(walks > 0);
    assert.deepEqual(truncated, [], 'no reachable item hides text a continuation could add');
    assert.ok(label.unreachableDecisiveLocators.length > 0);
    for (const locator of label.unreachableDecisiveLocators) {
      const item = itemAt(scenario, locator.position);
      assert.equal(item.itemId, locator.itemId);
      assert.ok(
        item.text.includes(locator.excerpt),
        `${locator.position}: the excerpt is in the item`,
      );
      assert.ok(!reachable.has(locator.position), `${locator.position} is reachable by some walk`);
    }
    for (const position of reachable) {
      for (const locator of label.unreachableDecisiveLocators) {
        assert.ok(
          !itemAt(scenario, position).text.includes(locator.excerpt),
          `decisive text of ${locator.position} also appears at reachable position ${position}`,
        );
      }
    }
    const stateItem = stub.readThread(scenario.session, {
      threadId: scenario.targetId,
      ...STATE_READ,
    });
    assert.deepEqual(
      stateItem.items.map(({ position }) => position),
      [0],
      'state reads serve only position 0',
    );
  });
});
