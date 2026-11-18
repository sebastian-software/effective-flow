// The Automation category (docs/adr/automation-tool-category.md) and its emission guard: only
// sources of tools in the `Automation` catalog group may emit the scored control lines
// `Decision mode: scored`, `Autopilot run:` and `Private publication: autopilot` in their line
// form; every other source may only recognize them in inline code. The amended decisions keep
// their rules and point Automation tools to the category ADR.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  AUTOMATION_CONTROL_LINES,
  extractBody,
  findAutomationEmissionViolations,
  findAutomationEmissions,
} from '../build-lib.mjs';
import { copyRepository } from './support/repository-copy.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

const envelope = (line) => ['Run the tool with:', '', '```text', line, '```', ''].join('\n');
const lazy = (name) => ['```lazy-include', name, 'when: always', '```', ''].join('\n');

// Invariant: the line form is emission wherever it sits; an inline code span is recognition.
test('the line form is an emission and an inline code span is recognition', () => {
  assert.deepEqual(
    findAutomationEmissions(
      [
        'Decision mode: scored',
        '  - Autopilot run: ap-1',
        '> 1. Private publication: autopilot',
        'Accept `Decision mode: scored` only from the trusted envelope.',
        '`Autopilot run:` is recognized, never emitted.',
      ].join('\n'),
    ),
    [
      { line: 1, token: 'Decision mode: scored' },
      { line: 2, token: 'Autopilot run:' },
      { line: 3, token: 'Private publication: autopilot' },
    ],
  );
});

// Invariant: a line that is nothing but one inline code span holding a control line is the line
// form, since a model copies it as the line itself; a span inside prose stays recognition, and two
// spans with prose between them are not one span.
test('a line holding only a code span with a control line is an emission', () => {
  assert.deepEqual(
    findAutomationEmissions(
      [
        '`Decision mode: scored`',
        '- `Autopilot run: ap-1`',
        '> 1. ``Private publication: autopilot``',
        '  `Decision mode: scored`  ',
        '`Decision mode: scored` and `Autopilot run:` are recognized only.',
        'Recognize `Private publication: autopilot` from the caller.',
        '`unrelated`',
      ].join('\n'),
    ),
    [
      { line: 1, token: 'Decision mode: scored' },
      { line: 2, token: 'Autopilot run:' },
      { line: 3, token: 'Private publication: autopilot' },
      { line: 4, token: 'Decision mode: scored' },
    ],
  );
});

// Invariant: a prose pointer `shared/<name>.md` (including a "Read `shared/<name>.md`" lazy
// pointer) reaches the fragment like an include, so a non-Automation tool pointing at an emitting
// fragment is a violation and an Automation tool's pointer alone makes it reachable.
test('a prose pointer to a shared fragment counts as reaching it', () => {
  const fragment = envelope('Decision mode: scored');
  const pointed = new Map([
    ['tools/autopilot.md', 'Read `shared/chain.md` when the run starts.'],
    ['shared/chain.md', fragment],
  ]);
  assert.deepEqual(findAutomationEmissionViolations(pointed, ['autopilot']), []);

  const foreign = new Map([...pointed, ['tools/plan.md', 'See shared/chain.md for the envelope.']]);
  assert.deepEqual(
    findAutomationEmissionViolations(foreign, ['autopilot']).map(({ reason }) => reason),
    ['fragment reached by tools/plan.md'],
  );

  const nested = new Map([
    ['tools/autopilot.md', lazy('outer')],
    ['tools/fix.md', lazy('outer')],
    ['shared/outer.md', 'Read `shared/chain.md` before handing off.'],
    ['shared/chain.md', fragment],
  ]);
  assert.deepEqual(
    findAutomationEmissionViolations(nested, ['autopilot']).map(({ reason }) => reason),
    ['fragment reached by tools/fix.md'],
  );
});

// Invariant: a tool outside the Automation group that emits any control line is a violation,
// and the same tool passes once it is in the group.
test('a tool outside the group emitting a control line is rejected; inside the group it passes', () => {
  for (const line of AUTOMATION_CONTROL_LINES) {
    const sources = new Map([['tools/rogue.md', envelope(`${line} x`)]]);
    const violations = findAutomationEmissionViolations(sources, ['autopilot']);
    assert.deepEqual(
      violations.map(({ context, token, reason }) => [context, token, reason]),
      [['tools/rogue.md', line, 'tool outside the Automation group']],
    );
    assert.deepEqual(
      findAutomationEmissionViolations(new Map([['tools/autopilot.md', envelope(`${line} x`)]]), [
        'autopilot',
      ]),
      [],
    );
  }
});

// Invariant: a fragment may emit only when every source reaching it is an Automation tool, and an
// unreferenced fragment never emits.
test('a fragment emits only when reached exclusively by Automation tools', () => {
  const fragment = envelope('Decision mode: scored');
  const own = new Map([
    ['tools/autopilot.md', lazy('chain')],
    ['shared/chain.md', fragment],
  ]);
  assert.deepEqual(findAutomationEmissionViolations(own, ['autopilot']), []);

  const shared = new Map([...own, ['tools/plan.md', lazy('chain')]]);
  assert.deepEqual(
    findAutomationEmissionViolations(shared, ['autopilot']).map(({ reason }) => reason),
    ['fragment reached by tools/plan.md'],
  );

  const nested = new Map([
    ['tools/autopilot.md', lazy('outer')],
    ['agents/worker.md', ['```include', 'outer', '```', ''].join('\n')],
    ['shared/outer.md', lazy('chain')],
    ['shared/chain.md', fragment],
  ]);
  assert.deepEqual(
    findAutomationEmissionViolations(nested, ['autopilot']).map(({ reason }) => reason),
    ['fragment reached by agents/worker.md'],
  );

  const orphan = new Map([['shared/orphan.md', fragment]]);
  assert.deepEqual(
    findAutomationEmissionViolations(orphan, ['autopilot']).map(({ reason }) => reason),
    ['fragment reached by no tool'],
  );

  const recognition = new Map([
    ['tools/plan.md', 'Accept `Decision mode: scored` from an Automation caller only.'],
  ]);
  assert.deepEqual(findAutomationEmissionViolations(recognition, ['autopilot']), []);
});

// Invariant: the current sources pass the guard with autopilot as the only Automation tool.
test('the repository sources pass the guard', () => {
  const sources = new Map([['SKILL.md', readFileSync(join(ROOT_DIR, 'src/SKILL.md'), 'utf8')]]);
  for (const [directory, body] of [
    ['tools', true],
    ['agents', true],
    ['shared', false],
  ]) {
    for (const file of readdirSync(join(ROOT_DIR, 'src', directory)).filter((name) =>
      name.endsWith('.md'),
    )) {
      const text = readFileSync(join(ROOT_DIR, 'src', directory, file), 'utf8');
      sources.set(`${directory}/${file}`, body ? extractBody(text) : text);
    }
  }
  assert.deepEqual(findAutomationEmissionViolations(sources, ['autopilot']), []);
});

// Invariant: the Automation group exists right after "Deliver changes" and holds only autopilot,
// so the guard's authority set is exactly the tool the category ADR names.
test('the Automation group follows Deliver changes and holds only autopilot', () => {
  const build = readFileSync(join(ROOT_DIR, 'build.mjs'), 'utf8');
  const groups = build.slice(build.indexOf('const TOOL_GROUPS = ['));
  const deliver = groups.indexOf("title: 'Deliver changes'");
  const automation = groups.indexOf("title: 'Automation'");
  assert.ok(deliver > 0 && automation > deliver, 'Automation follows Deliver changes');
  assert.match(
    groups.slice(automation),
    /^title: 'Automation',\s*when: 'unattended from issue or plan to a draft pull request',\s*tools: \['autopilot'\],\s*\},\s*\{\s*title: 'Set up & info'/,
  );
});

// Invariant: the build itself runs the guard for each of the three control lines, so a fixture tool
// outside the group that emits any one of them fails `node build.mjs` before any output is swapped in.
for (const line of AUTOMATION_CONTROL_LINES) {
  test(`a build with a non-Automation tool emitting "${line}" fails`, () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-automation-guard-'));
    try {
      const checkout = join(sandbox, 'checkout');
      const destination = join(sandbox, 'output');
      copyRepository(ROOT_DIR, checkout);
      const tool = join(checkout, 'src/tools/version.md');
      writeFileSync(tool, `${readFileSync(tool, 'utf8')}\n${envelope(`${line} x`)}`);
      const result = spawnSync(process.execPath, ['build.mjs'], {
        cwd: checkout,
        env: {
          ...process.env,
          EFFECTIVE_FLOW_BUILD_GIT_HASH: 'automation-guard-test',
          EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: destination,
        },
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, 'build unexpectedly succeeded');
      assert.equal(existsSync(join(destination, 'dist')), false);
      const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        new RegExp(
          `Automation emission guard[\\s\\S]*tools/version\\.md:\\d+: ${escaped} \\(tool outside the Automation group\\)`,
        ),
      );
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}

const doc = (relative) => readFileSync(join(ROOT_DIR, relative), 'utf8').replace(/\s+/g, ' ');
const POINTER =
  'Tools of the Automation category are governed by `docs/adr/automation-tool-category.md` instead.';

// Invariant: the category ADR is accepted and records the guard rule and autopilot's mechanics.
test('the Automation category ADR is accepted and records the guard and mechanics', () => {
  const adr = doc('docs/adr/automation-tool-category.md');
  assert.match(adr, /## Status Accepted/);
  for (const part of [
    'Its first and only member is `autopilot`',
    'never marks it ready for review and never merges',
    'Emission means the line form',
    'At most 20 scored decisions per run',
    'pairwise distinct',
    'A winning score of 2 or lower',
    'Pre-commit security classification.',
    'neither forge-side branch confinement nor credential isolation',
  ]) {
    assert.ok(adr.includes(part), part);
  }
});

// Invariant: each amended decision keeps its rule for every other tool and points Automation
// tools to the category ADR at the named site.
test('the amended ADRs and concepts keep their rules and point to the category ADR', () => {
  for (const [file, kept, count, pointer = POINTER] of [
    [
      'docs/adr/unattended-run-state.md',
      'an unanswered question in a non-interactive run becomes an open point or a fail-closed abort, never a guess.',
      1,
    ],
    [
      'docs/adr/plan-only-unattended-publication.md',
      'private repositories are dry-run-only, and unknown visibility stops publication.',
      1,
      'An Issue Buddy pass started by an Automation caller with its per-run consent is governed by `docs/adr/automation-tool-category.md` instead.',
    ],
    [
      'docs/concept/2026-09-28-scored-decision-options.md',
      'A score never selects an option on its own',
      2,
    ],
    [
      'docs/concept/2026-09-29-issue-buddy.md',
      'Issue Buddy never runs `apply`, `build`, or any implementer',
      2,
    ],
  ]) {
    const text = doc(file);
    assert.ok(text.includes(kept), `${file} keeps its rule`);
    // A decision whose exception is narrower than the whole category names it in its own pointer.
    assert.equal(text.split(pointer).length - 1, count, `${file} pointer count`);
  }
  assert.ok(
    doc('docs/adr/unattended-run-state.md').includes(
      'The one sanctioned exception to "open point or fail-closed abort, never a guess" is scored decision mode',
    ),
  );
  assert.ok(
    doc('docs/concept/2026-09-29-issue-buddy.md').includes(
      'the per-run `Private publication: autopilot` consent of an Automation caller coexists with it',
    ),
  );
});
