import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assertNoUnresolvedEagerIncludes,
  collectIncludeNames,
  findNextStepsDocViolations,
  LAZY_INCLUDE_RE,
  parseNextStepsTable,
  renderBody,
  resolveEagerIncludes,
  resolveLazyIncludes,
} from '../build-lib.mjs';

const repositoryRoot = new URL('..', import.meta.url);

function source(path) {
  return readFileSync(new URL(path, repositoryRoot), 'utf8');
}

function ordered(text, ...fragments) {
  let position = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, position + 1);
    assert.notEqual(next, -1, `missing ordered fragment: ${fragment}`);
    assert.ok(next > position, `fragment is out of order: ${fragment}`);
    position = next;
  }
}

// Slices one Markdown section so a row assertion cannot be satisfied by an
// identically named row that moved into a neighboring (e.g. optional) table.
function section(text, heading, stop = '\n### ') {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section heading: ${heading}`);
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf(stop);
  return end === -1 ? rest : rest.slice(0, end);
}

// Slices one workflow step so a step-level assertion cannot be satisfied by text
// that happens to sit in a neighboring step.
function workflowStep(text, name) {
  const marker = `      - name: ${name}`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const rest = text.slice(start + marker.length);
  const end = rest.search(/\n(?: {6}- | {2}\S)/);
  return end === -1 ? rest : rest.slice(0, end);
}

// Slices one shell function body out of a workflow `run:` block so a "retried as one
// unit" assertion cannot be satisfied by two separately guarded commands that merely
// happen to sit in the same step. Bounded by indentation, which is what a YAML block
// scalar guarantees and what the shell in these workflows already follows.
//
// The opening accepts every spelling of the same definition — `name() {`, `name(){`,
// `name ()  {`, and `function name {`. Requiring exactly one space before the brace made
// a merely reformatted function abort with `missing shell function`, reporting a rename
// or a deletion that never happened.
function shellFunction(text, name) {
  const opening = text.match(
    new RegExp(
      `^([ \\t]*)(?:function[ \\t]+${name}(?:[ \\t]*\\([ \\t]*\\))?|${name}[ \\t]*\\([ \\t]*\\))[ \\t]*\\{$`,
      'm',
    ),
  );
  assert.ok(opening, `missing shell function: ${name}`);
  const rest = text.slice(opening.index + opening[0].length);
  const end = rest.search(new RegExp(`^${opening[1]}\\}$`, 'm'));
  assert.notEqual(end, -1, `unterminated shell function: ${name}`);
  return rest.slice(0, end);
}

// Blanks out shell comments while keeping every line and its indentation. Rationale
// comments in a `run:` block quote the very forms a negative assertion forbids, so a
// prohibition must be checked against executable text only — and a positive assertion
// must not be satisfiable by prose that merely mentions the command.
//
// Every line is right-trimmed afterwards. The replacement re-inserts the character in
// front of the `#`, so blanking a trailing comment would otherwise leave the line ending
// in a space: `git fetch origin main # refresh` becomes `git fetch origin main ` and
// `/^\s*git fetch origin main$/m` stops matching it. The guard would then report "no
// unguarded fetch" for a genuinely unguarded one — silently, and only in the direction
// that matters.
//
// Known limitation: this is line-based and quote-unaware, so a `#` preceded by whitespace
// starts a comment even inside a quoted string — `git commit -m "chore: closes #278"` is
// blanked from the `#` onwards and the assertions never see the rest of the line. A `#`
// without a preceding space is untouched, which covers URL fragments, `${#var}`, and
// `${var#prefix}`. Widen this only when a workflow actually needs such a line.
function shellCode(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, '$1').trimEnd())
    .join('\n');
}

// First column of every Markdown table row in the given text, compared
// literally so no cell value is reinterpreted as a regular expression.
function firstColumnCells(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1].trim());
}

function tableRow(text, cell) {
  const row = text
    .split('\n')
    .find((line) => line.startsWith('|') && line.split('|')[1].trim() === cell);
  assert.ok(row, `missing table row: ${cell}`);
  return row;
}

// The trimmed cells of one Markdown table row.
function rowCells(row) {
  return row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

// The Default cell of one row, located through the column index the table's own header
// gives. Matching a default against the whole row is not an assertion at all where the
// Values column repeats the same literal: `| `auto`` is true of
// `| `conflictResolution` | `off` / `ask` / `auto` | `off` |` as well, so a flipped
// default survives. Reading the named column instead makes the flip fail, and locating
// that column through the header keeps a reordered table honest.
function defaultCell(text, cell) {
  const lines = text.split('\n');
  const rowIndex = lines.findIndex((line) => line.startsWith('|') && rowCells(line)[0] === cell);
  assert.notEqual(rowIndex, -1, `missing table row: ${cell}`);
  const header = lines
    .slice(0, rowIndex)
    .reverse()
    .find((line) => line.startsWith('|') && rowCells(line).includes('Default'));
  assert.ok(header, `missing a Default column header above the table row: ${cell}`);
  return rowCells(lines[rowIndex])[rowCells(header).indexOf('Default')];
}

function flat(text) {
  return text.replace(/\s+/g, ' ');
}

// Prose pins run against this. `oxfmt` reflows Markdown, so a newline sits
// wherever it decides a line ends, and emphasis around a word is an editorial
// choice rather than a contract. Collapsing whitespace and dropping emphasis
// markers keeps a pin on the wording instead of on the layout - the earlier
// `fails **open**` pin forced a source author to rewrap a sentence by hand
// purely to keep two words on one line.
function prose(text) {
  return flat(text).replace(/\*+/g, '');
}

// Two contract tokens inside one bounded window, in either order. Used where the contract is
// that the two belong together — a rule and its rationale, an exclusion and the marker it
// names — but not which of them an editor puts first. A reworded paragraph therefore stays
// green while a dropped half still fails.
function near(first, second, span = 300) {
  return new RegExp(
    `(?:${first}[\\s\\S]{0,${span}}?${second}|${second}[\\s\\S]{0,${span}}?${first})`,
    'i',
  );
}

// The Phase-4 merge preconditions, cut out as one array of numbered conditions, plus the prose that
// follows them. The cut ends at the first blank line followed by a line that is neither indented (a
// condition's own continuation) nor numbered (the next condition); without it the last condition
// absorbs every trailing paragraph of the phase, and an assertion about that condition passes on
// prose that sits outside it — which is exactly how the login-rule assertion below went vacuous
// while reading its own copy of this logic.
//
// The tail comes back from the same cut rather than from a second hand-rolled one. The reports that
// deliberately are **not** merge preconditions live there, so a test asserting about them needs the
// same boundary; two copies of one boundary is how the copies drift.
function mergeConditionsAndTail(gate) {
  const phase4 = section(gate, '### Phase 4');
  const listStart = phase4.search(/\n\d+\.\s/);
  assert.notEqual(listStart, -1, 'Phase 4 must carry its merge preconditions as a numbered list');
  const list = phase4.slice(listStart);
  const listEnd = list.search(/\n\n(?![ \t])(?!\d+\.)/);
  assert.notEqual(listEnd, -1, 'Phase 4 must carry prose after its numbered preconditions');
  return {
    conditions: list.slice(0, listEnd).split(/(?=\n\d+\.\s)/),
    afterList: list.slice(listEnd),
  };
}

function mergeConditions(gate) {
  return mergeConditionsAndTail(gate).conditions;
}

// One numbered Phase-4 condition, selected by its **ordinal** and never by first match on a word
// several conditions share: conditions 7 and 10 both carry "assessed", so a first-match selector
// would check one of them twice and the other never.
function mergeCondition(conditions, number) {
  const index = conditions.findIndex((item) => item.trimStart().startsWith(`${number}.`));
  assert.notEqual(index, -1, `Phase 4 must carry a condition ${number}`);
  return conditions[index];
}

test('plan routes an unambiguous issue through Stage A and exits before local planning', () => {
  const plan = source('src/tools/plan.md');
  const gateway = source('src/shared/plan-input-gateway.md');
  const renderedGateway = resolveEagerIncludes(gateway, {
    context: 'shared/plan-input-gateway.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  assert.match(plan, /lazy-include\nplan-input-gateway/);
  assert.match(gateway, /```include\napply-source-detection\n```/);
  assert.doesNotMatch(renderedGateway, /```include|shared\/apply-source-detection\.md/);
  assert.match(renderedGateway, /A four-digit number without a path is always a/);
  ordered(
    gateway,
    'Read the project-setup ADR',
    'Use the included source-detection contract and execute **Stage A only**',
    'If Stage A returns `issue-reference`',
    'delegate to `{{SKILL:plan-issue}}` with the complete\n   original argument unchanged',
    'end the local\n   `{{SKILL:plan}}` workflow immediately',
  );
  assert.match(gateway, /Do not inspect tracker state, create or migrate a plan/);
});

test('plan gateway preserves local-input and legacy-plan precedence', () => {
  const gateway = source('src/shared/plan-input-gateway.md');
  const detection = source('src/shared/apply-source-detection.md');

  ordered(detection, '**Plan reference**', '**Issue reference**', '**Otherwise**');
  assert.match(detection, /full path \(`<plan\.dir>\/YYYY-MM-DD-…md`\)/);
  assert.match(
    detection,
    /A four-digit number without a path is always a\n\(legacy\) plan reference, never an issue reference\./,
  );
  assert.match(
    gateway.replace(/\s+/g, ' '),
    /For `none`, `plan`, `review-report`, or `ambiguous`, do not infer an issue\.[\s\S]*Natural-language requirement text therefore retains the existing local-plan behavior\./,
  );
});

test('the session-title contract ships in the router and stays out of the budgeted tools', () => {
  const router = source('src/SKILL.md');
  const fragment = source('src/shared/session-title.md');
  const renderedRouter = resolveEagerIncludes(router, {
    context: 'SKILL.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  // The router is the only carrier: `build` and `plan` sit at the 700-line context
  // budget, so even a lazy-include pointer per tool would fail the build.
  assert.match(router, /```include\nsession-title\n```/);
  assert.equal(router.match(/```include\nsession-title\n```/g).length, 1);
  assert.doesNotMatch(renderedRouter, /```include/);
  assert.match(renderedRouter, /\*\*Suggested session title:\*\* <title>/);
  for (const directory of ['src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      const content = source(`${directory}/${file}`);
      assert.doesNotMatch(
        content,
        /```include\nsession-title\n```|^## Session title$/m,
        `${directory}/${file} must not duplicate the eagerly loaded session-title contract`,
      );
    }
  }

  // Load-bearing clauses: only the explicitly established app-native path may
  // target the caller, arbitrary cross-session renames stay forbidden, and the
  // title remains a single subject-first emission. This is an instruction
  // contract; it does not claim to execute the Desktop operation.
  const contract = prose(fragment);
  assert.match(contract, near('app-native current-task path', 'takes no task id', 200));
  assert.match(contract, /apply the title silently instead of proposing it/);
  assert.match(contract, /never retitle another session/);
  assert.match(contract, /never probe speculatively/);
  assert.match(contract, near('later automatic title', 'replace one the user set manually', 200));
  assert.match(contract, /a delegate never repeats a subject its parent already proposed/);
  assert.match(contract, /at most 60 characters/);

  // V6: the butler carve-out is what makes an unmandated session refuse. An
  // unmandated session declines a cross-session rename request on two grounds,
  // one of them this very contract - so without this clause every butler on
  // every harness declines too, while the ADR, the mechanism fragment and each
  // assertion above survive untouched. Pinned on the rendered router because
  // that is the copy which actually ships to every user, which also proves the
  // clause survives eager-include rendering.
  assert.match(
    prose(renderedRouter),
    near('own user.s standing rename mandate', 'rename request for the session that asked', 400),
  );
  for (const silent of ['version', 'open-plans', 'setup', 'cleanup', 'commit', 'pr']) {
    assert.match(
      fragment,
      new RegExp(`\`${silent}\``),
      `${silent} must stay listed as a silent tool`,
    );
  }
  ordered(
    fragment,
    '## Session title',
    'Only where sessions carry titles',
    'Only from work-subject tools',
    'Once, as soon as the subject exists',
    'Subject first',
    'One line, never blocking',
  );
});

// R1: the router resolves eager includes only, so a lazy `session-rename` pointer must sit in
// each work-subject tool itself rather than in the router - a router-side pointer would ship
// nothing. The sixteen tool names are read from the contract's own "Only from work-subject
// tools" list rather than duplicated here, so a future tool added to that list without its own
// pointer fails this test instead of silently missing it - the regression the plan calls out.
test('every work-subject tool carries the session-rename lazy pointer and silent tools carry none', () => {
  const fragment = source('src/shared/session-title.md');

  const workSubjectSection = fragment.match(
    /Only from work-subject tools:\*\*([\s\S]*?)\.\s*`version`/,
  );
  assert.ok(
    workSubjectSection,
    'could not locate the "Only from work-subject tools" list in src/shared/session-title.md',
  );
  const workSubjectTools = [...workSubjectSection[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
  assert.equal(
    workSubjectTools.length,
    16,
    `expected sixteen work-subject tools, found ${workSubjectTools.length}: ${workSubjectTools.join(', ')}`,
  );

  const silentSection = fragment.match(/`version`([\s\S]*?)stay silent/);
  assert.ok(silentSection, 'could not locate the silent-tool list in src/shared/session-title.md');
  const silentTools = [
    'version',
    ...[...silentSection[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]),
  ];
  assert.deepEqual(
    silentTools,
    ['version', 'open-plans', 'setup', 'cleanup', 'commit', 'pr'],
    'the silent-tool list drifted from the six documented silent tools',
  );

  const lazyPointer = /```lazy-include\nsession-rename\n/;
  for (const tool of workSubjectTools) {
    const toolSource = source(`src/tools/${tool}.md`);
    assert.match(
      toolSource,
      lazyPointer,
      `src/tools/${tool}.md must carry the session-rename lazy-include pointer`,
    );
    for (const match of toolSource.matchAll(
      /```lazy-include\n(?:runtime-state-safety|effective-flow-dir-migration)\nwhen:[\s\S]*?\n```/g,
    )) {
      assert.doesNotMatch(
        match[0],
        /session rename/i,
        `src/tools/${tool}.md must not load runtime-state guidance for a session rename`,
      );
    }
  }
  for (const tool of silentTools) {
    assert.doesNotMatch(
      source(`src/tools/${tool}.md`),
      lazyPointer,
      `src/tools/${tool}.md must not carry the session-rename lazy-include pointer`,
    );
  }

  assert.ok(
    existsSync(new URL('src/shared/session-rename.md', repositoryRoot)),
    'src/shared/session-rename.md must exist',
  );
  assert.ok(
    source('src/shared/session-rename.md').trim().length > 0,
    'src/shared/session-rename.md must not be empty',
  );
});

// The old architecture routed the umbrella host name "Codex" into the hook
// transport. Pin the narrower table cells so that restoring that generic row,
// or accidentally routing Codex CLI into the app-only operation, fails even if
// both host names still occur elsewhere in the prose.
test('session-rename dispatches only the ChatGPT Desktop Codex tab to the native path', () => {
  const fragment = source('src/shared/session-rename.md');
  const dispatch = section(fragment, '## Session rename');

  const hosts = firstColumnCells(dispatch);
  assert.deepEqual(
    hosts.filter((host) => !/^[-:]+$/.test(host)),
    ['Host', 'ChatGPT Desktop, Codex tab', 'Claude Code', 'Codex CLI or any other running host'],
  );
  assert.match(tableRow(dispatch, 'ChatGPT Desktop, Codex tab'), /calling task directly/);
  assert.match(tableRow(dispatch, 'Claude Code'), /mandated butler/);
  assert.match(tableRow(dispatch, 'Codex CLI or any other running host'), /read no further/);
  assert.doesNotMatch(dispatch, /^\| Codex\s+\|/m);
});

test('the Desktop section requires one title-only current-task call and visible failure fallback', () => {
  const fragment = source('src/shared/session-rename.md');
  const desktop = section(
    fragment,
    '### ChatGPT Desktop: rename the calling task directly',
    '\n### ',
  );
  const contract = prose(desktop);

  // These pins describe what a run must ask the host to do. They deliberately
  // do not mock or simulate codex_app__set_thread_title and therefore prove no
  // app-side behavior.
  assert.match(contract, /currently `codex_app__set_thread_title`/);
  assert.match(contract, near('Call it once', 'with exactly the already-cut `title`', 200));
  assert.match(contract, near('Omit `threadId`', 'targets the calling task', 200));
  assert.match(contract, /Never list tasks/);
  assert.match(contract, /resolve or supply an id/);
  assert.match(contract, /target another task/);
  assert.match(contract, /retry with this or another title/);
  assert.match(contract, near('call succeeded', 'stay silent', 200));
  assert.match(contract, near('capability is absent or denied', 'Suggested session title', 400));
  assert.match(contract, near('call errors', 'Do not block', 400));
  assert.match(contract, /without `threadId`/);

  for (const retired of [
    /session-title\.mjs/,
    /hooks\.Stop/,
    /session-title\.json/,
    /session-title-hook\.json/,
    /codex app-server/i,
  ]) {
    assert.doesNotMatch(desktop, retired);
  }
});

test('setup probes the Desktop capability directly without reinstalling the retired hook path', () => {
  const setup = source('src/tools/setup.md');
  const step = section(setup, '### Step 7: Session rename capability (optional)', '\n### Step 8');
  const desktop = section(
    step,
    '#### ChatGPT Desktop, Codex tab: the native capability needs no installation',
    '\n#### ',
  );
  const contract = prose(desktop);

  assert.match(contract, /currently `codex_app__set_thread_title`/);
  assert.match(contract, near('call the native operation once', 'only the literal title', 300));
  assert.match(contract, near('Effective Flow setup check', 'omit `threadId`', 200));
  assert.match(contract, /never list or resolve tasks/);
  assert.match(contract, /never retry/);
  assert.match(contract, near('successful call proves the path', 'absent, denied or failed', 300));
  assert.match(
    contract,
    near('remove only that matching handler', 'preserving unrelated handlers', 300),
  );
  assert.doesNotMatch(desktop, /"hooks"\s*:|\[\[hooks\.Stop\]\]|statusMessage/);
});

test('setup No and a failed Desktop probe never persistently disable later rename attempts', () => {
  const setup = source('src/tools/setup.md');
  const step = section(setup, '### Step 7: Session rename capability (optional)', '\n### Step 8');
  const contract = prose(step);
  const askBlock = step.match(/```ask\n([\s\S]*?)\n```/);
  assert.ok(askBlock, 'missing the Step 7 capability-check question');

  assert.match(
    prose(askBlock[1]),
    near('label: No', 'Skip only this visible capability check', 300),
  );
  assert.match(contract, near('not part of the configuration', 'declares no key', 200));
  assert.match(
    contract,
    near(
      'For "No", note that setup skips only this visible check',
      'later eligible runs still attempt the native operation',
      300,
    ),
  );
  assert.match(contract, near('fall back independently', "each call's result", 150));
  assert.match(
    contract,
    near('this setup probe failed', 'Later eligible runs still attempt the operation', 200),
  );
  assert.match(
    contract,
    near(
      'setup neither prepares nor verifies a butler',
      'later runs keep emitting the suggestion line',
      300,
    ),
  );
});

test('the delivered setup guide keeps Desktop probe outcomes call-local', () => {
  const guide = source('docs/user-guide/tools-setup.md');
  const contract = prose(
    section(
      guide,
      'After the configuration write, setup offers an optional session-rename capability step.',
      '\n`setup` is the only repair path',
    ),
  );

  assert.match(
    contract,
    near(
      '(?:Declining the (?:step|check)|Choosing No)',
      'skips only this visible setup check',
      200,
    ),
  );
  assert.match(
    contract,
    near('failed (?:capability|probe)', 'means only that this probe failed', 200),
  );
  assert.match(
    contract,
    near('later (?:eligible )?Desktop runs still (?:attempt|try)', 'individual call', 250),
  );
  assert.match(
    contract,
    near('suggestion-only', 'Claude Code without (?:an? )?(?:configured|working) butler', 300),
  );
  assert.match(contract, near('suggestion-only', 'Codex CLI', 300));
  assert.match(
    contract,
    near('suggestion-only', 'other host without a (?:supported|established)(?: title)? path', 300),
  );
});

test('active title surfaces contain no retired transport signatures outside precise removal guidance', () => {
  const activeSurfaces = [
    'build.mjs',
    'src/shared/session-title.md',
    'src/shared/session-rename.md',
    'src/tools/setup.md',
    'docs/user-guide/getting-started.md',
    'docs/user-guide/tools-setup.md',
    'docs/developer-guide/build-system.md',
    'docs/developer-guide/release-and-installation.md',
    'docs/adr/session-rename-butler.md',
  ];
  const removalGuides = new Set([
    'src/tools/setup.md',
    'docs/user-guide/getting-started.md',
    'docs/user-guide/tools-setup.md',
  ]);

  for (const path of activeSurfaces) {
    const content = source(path);
    for (const retired of [
      /hooks\.Stop/,
      /codex app-server/i,
      /session-title\.json/,
      /session-title-hook\.json/,
    ]) {
      assert.doesNotMatch(content, retired, `${path} still carries a retired title transport`);
    }

    const commandReferences = content.match(/session-title\.mjs apply/g) ?? [];
    if (removalGuides.has(path)) {
      assert.equal(commandReferences.length, 1, `${path} must name one exact stale-hook command`);
      assert.match(
        prose(content),
        near('remove only', 'session-title.mjs apply', 400),
        `${path} may name the retired command only as precise removal guidance`,
      );
    } else {
      assert.equal(commandReferences.length, 0, `${path} must not name the retired command`);
    }
  }

  for (const path of [
    'src/scripts/session-title.mjs',
    'src/scripts/session-title-core.mjs',
    'test/session-title.test.mjs',
  ]) {
    assert.equal(existsSync(new URL(path, repositoryRoot)), false, `${path} must stay retired`);
  }
});

test('the Claude Code butler section carries its load-bearing clauses', () => {
  const fragment = source('src/shared/session-rename.md');
  const claudeSection = section(fragment, '### Claude Code: a mandated butler renames on request');

  // The pasteable mandate block: `{{SKILL:setup}}` prints this fenced block
  // verbatim for the user to paste, so losing the fence or the standing-mandate
  // opener would silently ship a broken paste target. The info string is a
  // cosmetic choice and deliberately not pinned.
  const mandateBlock = claudeSection.match(
    /```[a-z]*\n(Standing mandate for this session[\s\S]*?)\n```/,
  );
  assert.ok(mandateBlock, 'missing the fenced standing-mandate block');
  // Every clause below is pinned inside that block rather than in the
  // maintainer-facing rationale bullets above it. Only the block reaches a
  // butler, and shortening a block that `setup` prints verbatim to a user is
  // the likelier edit of the two - a bullet-only pin stays green through
  // exactly the regression these assertions exist to catch.
  const mandate = prose(mandateBlock[1]);

  // V16: a butler asked to rename the session that had just messaged it
  // refused, believing the target was itself. The mandate answers that
  // categorically - the id to rename and the id that messaged are the same id
  // on every ordinary request - and without it the path fails on every run
  // while looking like correct caution, the hardest failure to diagnose.
  assert.match(mandate, near('are the same id, always', 'target is therefore never you', 600));

  // V15: the butler reports what it read, it never judges it. The observed
  // value is the only thing that separates an applied rename from a title the
  // host kept, and a live butler wrote a verdict in its own chat while
  // correctly replying with the value - so this rule carries the contract, not
  // the butler's disposition. The three example words beside it in the source
  // are illustration and stay unpinned, as does their punctuation.
  assert.match(mandate, /report the value, never a verdict/i);

  // The marker title is the entire discovery mechanism, and `setup.md` names
  // the same literal (see the sibling assertion on that file below). Scoped to
  // the discovery rule because the literal also opens the mandate block, which
  // would keep a drifted discovery rule green.
  const discovery = section(
    fragment,
    '#### Discovery is the marker title, and nothing else',
    '\n#### ',
  );
  assert.match(prose(discovery), /Effective Flow rename butler/);

  const butlerDegradation = section(fragment, '#### Degradation on the butler path', '\n#### ');

  // Every reply defect - absent, stale, malformed, refused - must fail open to
  // the suggestion line; none of them may produce silence.
  assert.match(prose(butlerDegradation), near('fails open', 'may produce silence', 300));

  // The single row that contradicts the fail-open rule above, and therefore the
  // one a later reader is likeliest to "fix" into printing a suggestion line
  // for consistency: a title differing from the one the request carried is one
  // this session's own user chose, where neither a rename nor a notice is
  // wanted. The live tests exist to justify exactly this row.
  assert.match(
    tableRow(
      butlerDegradation,
      'bare title reported, differing from the title that earlier request carried',
    ),
    /emit nothing/,
  );
});

// setup.md must name the same literal marker title the fragment defines, so a
// butler set up per the instructions is actually discoverable - and must reach
// the mandate itself by reference. A hand-copied mandate ships a second wording
// that drifts from the fragment's while every other assertion here stays green.
test('setup names the fragment-owned marker title and takes the mandate by reference', () => {
  const setup = prose(source('src/tools/setup.md'));
  assert.match(setup, /Effective Flow rename butler/);
  assert.match(setup, /shared\/session-rename\.md/);
  assert.doesNotMatch(setup, /Standing mandate for this session/);
});

test('the session-rename-butler ADR exists and is marked Active', () => {
  assert.ok(
    existsSync(new URL('docs/adr/session-rename-butler.md', repositoryRoot)),
    'docs/adr/session-rename-butler.md must exist',
  );
  const adr = source('docs/adr/session-rename-butler.md');
  assert.ok(adr.trim().length > 0, 'docs/adr/session-rename-butler.md must not be empty');
  // The Status block itself, not the word somewhere below the heading: an
  // ordered-fragment pin stays green for a superseded ADR whose Consequences
  // prose happens to contain "Active".
  assert.match(adr, /^## Status$\s+^Active$/m);
});

// The plan's "ships into all three dist/{claude,codex,portable}/…/shared/"
// criterion is owned elsewhere by design: the lazy-include guard (#99) in
// build.mjs throws when a referenced fragment is missing from a shipped skill
// directory, and `pnpm test:distribution` checks the built output. Neither half
// belongs here - `pnpm test` runs before `node build.mjs`, and a clean checkout
// has no dist/ to read. What this owns is the build's own precondition, for
// every fragment rather than for one: a lazy name a tool references must have a
// source for the build to ship and for the guard to then cover.
test('every lazy-include fragment referenced by a tool has a source in src/shared', () => {
  const toolFiles = readdirSync(new URL('src/tools/', repositoryRoot)).filter((entry) =>
    entry.endsWith('.md'),
  );
  const lazyNames = new Set();
  for (const file of toolFiles) {
    const { lazy } = collectIncludeNames(source(`src/tools/${file}`));
    for (const name of lazy) lazyNames.add(name);
  }
  assert.ok(lazyNames.size > 0, 'no lazy-include names were collected from src/tools');
  for (const name of lazyNames) {
    assert.ok(
      existsSync(new URL(`src/shared/${name}.md`, repositoryRoot)),
      `src/tools references the lazy include ${name}, but src/shared/${name}.md does not exist`,
    );
  }
});

test('plan-issue runs the full quality baseline before its per-issue deep-review gate', () => {
  const planIssue = source('src/tools/plan-issue.md');

  ordered(
    planIssue,
    '### Phase 3: Automatic quality baseline per issue',
    'generic gap judgment',
    'validation judgment',
    'internal plan-review judgment',
    'do **not** offer the deep review yet',
    '### Phase 4: Persist, deep-review gate, and readiness',
    'question: Start the deep interactive plan review now?',
  );
  assert.match(planIssue, /Do not reuse this answer for any other selected issue\./);
  assert.match(
    planIssue,
    /On \*\*Yes\*\*, read `\{\{SKILL:plan-review\}\}` and invoke it in \*\*issue mode\*\*/,
  );
  // The `No` branch still owes the user both halves of the old guarantee: no fabricated open
  // point, and a later re-entry that stays available. Only the second half moved — out of this
  // sentence and into the machine-checked edge table — so it is asserted there instead of being
  // allowed to disappear.
  assert.match(
    flat(planIssue),
    /On \*\*No\*\*, retain the approved automatic baseline and record no artificial open point/,
  );
  const edges = parseNextStepsTable(source('src/shared/next-steps.md'), {
    context: 'src/shared/next-steps.md',
  });
  assert.ok(
    edges.some(
      (edge) =>
        edge.tool === 'plan-issue' && [edge.then, edge.or].includes('{{SKILL:plan-issue}} <issue>'),
    ),
    'plan-issue must keep the optional later re-entry as a next-steps edge',
  );
});

test('plan-issue completes readiness sequentially and never releases blocked artifacts', () => {
  const planIssue = source('src/tools/plan-issue.md');

  assert.match(
    planIssue,
    /Complete this entire phase for the active issue before starting another issue/,
  );
  const normalized = planIssue.replace(/\s+/g, ' ');
  ordered(
    normalized,
    'If the deep review is ended, deferred after it starts, fails to persist, or returns a blocking',
    'keep or add `effective-flow-needs-planning`',
    'Otherwise remove `effective-flow-needs-planning`',
    'continue with the next selected issue',
  );
  assert.match(
    planIssue,
    /One blocked issue must not prevent the remaining issues from[\s\S]*their own baseline, question, comment update, and label decision/,
  );
  assert.match(planIssue, /A nonempty open-points section is implementation-blocking/);
});

test('plan-issue persists and approves an exact native-child set before sequential creation', () => {
  const planIssue = source('src/tools/plan-issue.md');
  const phase2 = prose(section(planIssue, '### Phase 2: Planning per issue (interactive)'));
  const phase3 = prose(section(planIssue, '### Phase 3: Automatic quality baseline per issue'));
  const phase4 = prose(section(planIssue, '### Phase 4: Persist, deep-review gate, and readiness'));
  const target = prose(section(source('src/shared/tracker-target.md'), '### Container mechanism'));

  assert.match(
    phase2,
    /external target proves the full native-container contract plus atomic create-under-parent/,
  );
  assert.match(
    target,
    /native parent\/sub-issue relation.*write native sub-item completion.*atomically create under a supplied parent/,
  );
  assert.match(
    phase3,
    /include its exact child records, titles, workflows, and publishable bodies in the canonical comment before any approval or create operation/,
  );
  ordered(
    phase4,
    'Persist the self-contained baseline comment',
    're-read that exact comment and confirm its body hash',
    'before showing the parent and every exact child title',
    'Ask whether to create that exact set as native children of this parent',
    'After approval, re-read the parent and canonical comment',
    'For each approved draft in order',
    "Match the draft's stable key",
    'preview the parent-aware create',
    'guardedly update the canonical comment',
  );
  assert.match(phase4, /An unanswered or rejected prompt creates nothing/);
  assert.match(phase4, /Never call `issue-create`, create first and link later, or fall back/);
});

test('plan-issue reconciles every stable key and preserves partial creation before readiness', () => {
  const planIssue = prose(source('src/tools/plan-issue.md'));

  assert.match(
    planIssue,
    /exactly one valid match is reused; zero permits a preview; multiple matches stop before a write/,
  );
  assert.match(
    planIssue,
    /mutationMayHaveSucceeded.*issue-sub-issues-read.*unique valid key match recovers the result; zero, multiple, or marker-error matches remain blocked and are never blindly retried/i,
  );
  assert.match(
    planIssue,
    /If any later child fails, preserve created children, mark all missing or unknown drafts explicitly in the canonical comment/,
  );
  ordered(
    planIssue,
    'If any later child fails',
    'retain `effective-flow-needs-planning`',
    'After either branch, apply the readiness decision',
    'readiness also requires a fresh `decomposition-container-compare`',
  );
  assert.match(
    planIssue,
    /Child creation is legal only through `issue-sub-issue-create` with the active parent supplied/,
  );
  assert.match(
    planIssue,
    /Generic `issue-create`, a create-then-link sequence, sibling creation, and checklist degradation are forbidden/,
  );
});

test('plan-issue re-reads native children before preview, apply, and post-create persistence', () => {
  const phase4 = prose(
    section(
      source('src/tools/plan-issue.md'),
      '### Phase 4: Persist, deep-review gate, and readiness',
    ),
  );
  const perChild = phase4.slice(phase4.indexOf('For each approved draft in order'));
  assert.notEqual(perChild.length, phase4.length, 'missing per-child creation loop');
  ordered(
    perChild,
    'immediately before the create preview, call `issue-sub-issues-read`',
    'replace the local reconciliation state with that fresh list',
    'preview the parent-aware create',
    'Immediately before apply, call `issue-sub-issues-read` again',
    'replace the local reconciliation state',
    'zero permits applying the unchanged previewed operation',
    'after success or unique-key recovery, call `issue-sub-issues-read` once more',
    'require exactly one valid same-parent match for the key',
    'A concurrently visible duplicate fails closed before the comment update',
    'guardedly update the canonical comment',
  );
  assert.match(
    perChild,
    /One now-matching child is recovered without applying.*multiple matches or any marker\/integrity error stop before a write/,
  );
  assert.match(
    phase4,
    /forge comment update is a non-atomic read-then-PATCH.*simultaneous writers can still race after the last (?:pre-create )?read.*duplicate or uncertain result becomes visible, stop and reconcile rather than retrying/,
  );
});

test('plan-review exposes file and issue adapters while issue mode stays comment-only', () => {
  const review = source('src/tools/plan-review.md');

  assert.match(review, /\*\*File mode:\*\*/);
  assert.match(review, /\*\*Issue mode:\*\*/);
  assert.match(review, /open points exists at the end of the active\n\s*artifact/);
  assert.match(review, /In file mode, retain the existing end-of-plan contract/);
  assert.match(review, /\*\*File adapter:\*\* write only the resolved plan file back/);
  assert.match(
    review,
    /\*\*Issue adapter:\*\* preserve the leading `<!-- effective-flow-plan-issues -->` marker/,
  );
  assert.match(review, /call\n\s*`issue-comment-update` for only the supplied comment ID/);
  assert.match(
    review,
    /In issue mode, creating a plan file, adding a comment, updating another comment, changing the\n\s*issue body, or independently resolving a tracker\/issue is forbidden/,
  );
  assert.match(review, /never suggest the public `review`\n\s*gateway for an issue/);
});

test('issue planning updates one comment fail-closed and apply rejects blocking open points', () => {
  const tracker = source('src/shared/issue-tracker.md');
  const applyIssues = source('src/tools/apply-issues.md');

  assert.match(tracker, /targeted issue-comment update operation is `issue-comment-update`/);
  assert.match(tracker, /positive `commentId`/);
  assert.match(tracker, /reads the issue comments again/);
  assert.match(tracker, /must not fall back to `issue-comment` and create a competing comment/);
  assert.match(tracker, /abort with `UNSUPPORTED_CAPABILITY`\n\s*before a write/);

  assert.match(
    applyIssues,
    /planning artifact,\n\s*even if the original body is thin; it is \*\*not automatically sufficient\*\*/,
  );
  assert.match(
    applyIssues,
    /`### Open points` \/ `### Offene Punkte` section is nonempty[\s\S]*treat the issue as `insufficient`/,
  );
  assert.match(
    applyIssues,
    /review assumption explicitly marked as implementation-blocking as `insufficient`/,
  );
  assert.match(applyIssues, /never route it to\n\s*implementation/);
});

test('security findings stay local until the review publication gate is confirmed', () => {
  const review = source('src/tools/review.md');
  const gate = source('src/shared/security-disclosure-gate.md');
  const tracker = source('src/shared/issue-tracker.md');

  // review.md orchestrates: it loads the gate and classifies before it publishes anything.
  assert.match(review, /```lazy-include\nsecurity-disclosure-gate\n/);
  assert.match(review, /\*\*Central security classification:\*\*/);
  ordered(
    review,
    '**Dedup withheld findings:**',
    '**Reserve IDs:**',
    '**Run the security disclosure gate:**',
    '**Create finding issues:**',
  );
  assert.match(review, /must finish before the reservation, so a finding already recorded/);
  assert.match(review, /in that order and before any tracker mutation/);
  assert.match(
    review,
    /plus the withheld findings only when the gate returned an explicit publication confirmation/,
  );

  // The gate classifies conservatively and never weakens the reviewer signal.
  assert.match(
    gate,
    /`local-only` for every security-relevant finding, `publishable` for every other finding/,
  );
  assert.match(gate, /never\*\* de-escalate one marked `external`/);
  assert.match(gate, /uncertain value classifies as `local-only`/);

  // The gate persists the withheld findings before any tracker mutation, and only then asks.
  ordered(
    gate,
    '### Local dedup',
    '### Local-first persistence',
    'review-report-YYYY-MM-DD-security[-N].md',
    '### Publication offer',
    'header: Security',
    '🔓 Published as #<issue number>',
    '### Silence in public artifacts',
  );
  assert.match(gate, /an unanswered, skipped, or\nnon-interactive run publishes nothing/);
  assert.match(
    gate,
    /epic body and every issue body contain no count, title, signature, ID, or other reference/,
  );

  // A blocked report never blocks the unrelated findings, and never silently publishes.
  assert.match(
    gate,
    /\*\*If the report cannot be written\*\*, publish the `publishable` findings as usual, publish\n\s*nothing from the withheld set/,
  );

  // The gate binds every publisher and cannot be configured away. That it binds an
  // external target too is asserted once, in the tracker-target security test below.
  assert.match(tracker, /### Security disclosure gate/);
  assert.match(
    flat(tracker),
    /never\*\* written to a tracker without an explicit per-run confirmation/,
  );
  assert.match(
    flat(tracker),
    /does not sanitize branch names, commit subjects, or pull request bodies/,
  );

  // Every reviewer supplies the signal the classification consumes.
  for (const agent of [
    'frontend-reviewer',
    'nodejs-reviewer',
    'rust-reviewer',
    'generic-product-reviewer',
  ]) {
    const reviewer = source(`src/agents/${agent}.md`);
    assert.match(reviewer, /- Security relevance: `external`, `internal`, or `none`/);
    assert.match(reviewer, /when unsure, report the stronger value/);
  }

  // The local report route must not implement a finding that was published as an issue,
  // and must hand it over instead of dropping it — a report file cannot enter remote mode.
  const applyReview = source('src/tools/apply-review.md');
  assert.match(
    applyReview,
    /\*\*Already published as an issue:\*\*[\s\S]*do not implement it from the report/,
  );
  assert.match(applyReview, /\| Already published \(→ issue\) \| P \|/);
  assert.match(
    applyReview,
    /\*\*Hand over published findings:\*\*[\s\S]*`\{\{SKILL:apply\}\} #<nr> \[#<nr> …\]`/,
  );
  assert.match(applyReview, /Never drop them silently/);
  assert.match(
    applyReview,
    /a report consisting only of published findings ends with an executable next step/,
  );
});

test('release exposes verified delivery state to the disabled catalog job', () => {
  const release = source('.github/workflows/release.yml');

  assert.match(
    release,
    /outputs:\n\s+release_created: \$\{\{ steps\.release\.outputs\.release_created \}\}\n\s+tag_name: \$\{\{ steps\.release\.outputs\.tag_name \}\}\n\s+delivery_commit: \$\{\{ steps\.deliver\.outputs\.commit \}\}/,
  );
  ordered(
    release,
    'name: Release Please',
    'name: Deliver portable skill, consumer docs, and trusted automation to main',
    'name: Verify delivered commit',
    'update-team-catalog:',
    'needs: release',
    'if: false',
    'name: Update Effective Flow team-catalog pin',
  );
  // The catalog job is statically disabled while the catalog side does not resolve
  // `effective-flow` as a Dalo source. Its wiring stays intact so re-enabling is a one-line
  // change, but no created-release gate may quietly put the failing job back on the release
  // path without this contract being updated too.
  assert.doesNotMatch(release, /if: \$\{\{[^}]*needs\.release\.outputs\.release_created[^}]*\}\}/);
  assert.match(release, /--delivery-commit "\$\{\{ needs\.release\.outputs\.delivery_commit \}\}"/);
  assert.match(release, /--release-tag "\$\{\{ needs\.release\.outputs\.tag_name \}\}"/);
});

test('release delegates the licensed develop-to-main payload to central staging', () => {
  const release = source('.github/workflows/release.yml');
  const staging = source('scripts/stage-delivery.mjs');

  assert.match(release, /on:\n\s+push:\n\s+branches: \[develop\]/);
  assert.match(release, /target-branch: develop/);
  ordered(
    staging,
    "'effective-flow',\n    'LICENSE',",
    "cpSync(join(root, 'LICENSE'), join(work, 'LICENSE'));",
    "cpSync(portableSkill, join(work, 'effective-flow'), { recursive: true });",
  );
  ordered(
    release,
    'git fetch origin main',
    'git worktree add --force "$work" origin/main',
    'node scripts/stage-delivery.mjs "$work" "$GITHUB_REPOSITORY" develop',
    'node scripts/distribution-smoke.mjs delivery "$work"',
    'git -C "$work" push "https://x-access-token:${DELIVERY_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:main',
    'git fetch origin main',
    'test "$(git rev-parse origin/main)" = "${{ steps.deliver.outputs.commit }}"',
    'node scripts/distribution-smoke.mjs delivery "$verify_work"',
  );
  assert.doesNotMatch(release, /^\s*(?:cp|install|rsync)\b[^\n]*\bLICENSE\b[^\n]*$/m);

  // The delivery push authenticates with a dedicated delivery GitHub App token so that app
  // is the sole bypass identity once the `main` ruleset restricts direct pushes (issue #143).
  ordered(
    release,
    'name: Create delivery token',
    'uses: actions/create-github-app-token@',
    'client-id: ${{ vars.DELIVERY_APP_CLIENT_ID }}',
    'private-key: ${{ secrets.DELIVERY_APP_PRIVATE_KEY }}',
    'permission-contents: write',
    'DELIVERY_TOKEN: ${{ steps.delivery-token.outputs.token }}',
  );
  // `app-id` is deprecated in actions/create-github-app-token; guard the whole workflow so the
  // deprecated input cannot creep back in (issue #254).
  assert.doesNotMatch(release, /^\s*app-id:/m);
});

// Regression guard for the 2026-08-19 delivery of v1.60.1: one transient HTTP 403 on the
// push stranded a released version permanently, because there is deliberately no
// re-delivery path (issue #278). Every network operation on the delivery path — the
// pre-fetch, the push, and the verify fetch-and-compare — must therefore survive a
// transient failure on its own.
//
// A sibling test rather than an addition to the payload test above: this is a resilience
// contract, not a payload contract, and it must be able to fail under its own name.
// Every assertion is scoped to one step with workflowStep() and never matched against
// the whole file. `ordered()` advances its search window by a single character, so a
// whole-file fragment can be satisfied by a neighboring step; a step slice cannot.
test('the release delivery retries every network operation on its path', () => {
  const release = source('.github/workflows/release.yml');
  const deliverName = 'Deliver portable skill, consumer docs, and trusted automation to main';
  const deliver = shellCode(workflowStep(release, deliverName));
  const verify = shellCode(workflowStep(release, 'Verify delivered commit'));

  for (const [name, step] of [
    [deliverName, deliver],
    ['Verify delivered commit', verify],
  ]) {
    // Each `run:` block is its own shell, so no step can borrow another step's helper:
    // every step that retries defines its own.
    const retry = shellFunction(step, 'retry');

    // The bound is a single literal per block. Two hand-synchronized integers would
    // either cap the attempts silently or let the loop fall through with exit 0 — in
    // which case the step would succeed with nothing pushed.
    assert.deepEqual(
      step.match(/attempts=\d+/g),
      ['attempts=3'],
      `${name}: the retry bound must be the literal 3, exactly once per run block`,
    );
    // Assigning the bound is not retrying. Without the three assertions below, a helper
    // whose `while :; do` became `if false; then`, whose test compares against a literal
    // instead of `$attempts`, or that never advances `n` still carries `attempts=3` and
    // still passes a test named "retries every network operation" while retrying zero
    // times. Pin the loop, the consumed bound, and the advancing counter instead.
    assert.match(
      retry,
      /^\s*(?:while|until)\b[^\n]*\bdo$/m,
      `${name}: the retry helper must loop over its attempts`,
    );
    assert.match(
      retry,
      /"?\$\{?n\}?"?\s*-(?:ge|gt|eq)\s*"?\$\{?attempts\}?"?/,
      `${name}: the attempt counter must be tested against the retry bound, not a literal`,
    );
    assert.match(
      retry,
      /\bn=\$\(\(\s*n\s*\+\s*1\s*\)\)|\(\(\s*n\+\+\s*\)\)|\bn\+=1\b/,
      `${name}: the attempt counter must advance, or the bound is never reached`,
    );
    // Three attempts sleeping 5 s and then 15 s: long enough to ride out a GitHub-side
    // blip, short enough that a failed delivery still alarms promptly. One order-aware
    // assertion rather than two existence checks: `sleep $(( n == 1 ? 15 : 5 ))` satisfies
    // both halves of a split pair, so a reversed backoff used to pass under messages that
    // claimed first 5 s and then 15 s. The arithmetic spelling stays free.
    assert.match(
      retry,
      /sleep[^\n]*\b5\b[^\n]*\b15\b/,
      `${name}: the backoff must sleep 5 s on the first retry and 15 s on the second`,
    );

    // The retried command runs in an `if` test position, never as a bare `cmd && break`.
    // This is a legibility contract, not an `errexit` one: inside this helper `"$@" &&
    // return 0` recovers and reports exhaustion exactly like `if "$@"; then return 0; fi`,
    // on bash 3.2 and 5.2 alike, and swallows nothing the `if` form would catch. The `if`
    // form earns the assertion because it makes the exempt test position syntactically
    // obvious instead of resting on the reader knowing the AND-list rule, and because it
    // reads the same as the guarded returns in `confirm_delivered_commit`.
    assert.match(
      retry,
      /\bif (?:! )?"\$@"; then/,
      `${name}: the retried command must run in an if test position`,
    );
    assert.doesNotMatch(step, /&&\s*break\b/, `${name}: no bare cmd && break`);
    assert.doesNotMatch(step, /\|\|\s*break\b/, `${name}: no bare cmd || break`);

    // Exhausting the attempts must leave the step nonzero so `Report a failed delivery`
    // still fires on a permanently broken delivery.
    assert.match(retry, /\b(?:return|exit) 1\b/, `${name}: exhausted attempts must return nonzero`);
    // git's own stderr stays visible: swallowing it would turn a diagnosable 403 into an
    // anonymous "delivery failed" and make the next investigation impossible.
    assert.doesNotMatch(retry, /2>\/dev\/null/, `${name}: git stderr must stay visible`);
    // The retried command itself is never echoed. `retry` is called with the push, whose
    // URL carries the delivery App installation token, and Actions masking must not be the
    // only barrier keeping that token out of the run log. The obvious debugging addition —
    // `echo "attempt $n failed, retrying: $*"` — would print it verbatim, which is why the
    // prohibition is asserted rather than left to the rationale comment in the workflow.
    assert.doesNotMatch(
      retry,
      /\b(?:echo|printf)\b[^\n]*\$[@*]/,
      `${name}: the retry helper must not echo the retried command — the push URL carries the delivery App installation token`,
    );
    // Same reason from the other direction: tracing prints every retried command.
    assert.doesNotMatch(
      step,
      /^\s*set\s+-\w*x\b/m,
      `${name}: no shell tracing — it would print the token-bearing push URL`,
    );
  }

  // Both network operations in the delivery step go through the helper, and no unguarded
  // copy of either survives. The push string itself is unchanged, so the `ordered()`
  // contract above still binds it as one contiguous single-line substring.
  assert.match(
    deliver,
    /^\s*retry git fetch origin main$/m,
    'the delivery pre-fetch must go through the retry helper',
  );
  assert.doesNotMatch(
    deliver,
    /^\s*git fetch origin main$/m,
    'no unguarded delivery pre-fetch may survive next to the retried one',
  );
  assert.match(
    deliver,
    /^\s*retry git -C "\$work" push "https:\/\/x-access-token:\$\{DELIVERY_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git" HEAD:main$/m,
    'the delivery push must go through the retry helper, unchanged',
  );
  assert.doesNotMatch(
    deliver,
    /^\s*git -C "\$work" push /m,
    'no unguarded delivery push may survive next to the retried one',
  );

  // `Verify delivered commit` retries the fetch and the equality check as ONE unit. A
  // read-after-write lag on `origin/main` would otherwise fail the comparison for a
  // delivery that actually landed and open a `delivery-failed` alarm for a healthy
  // release, contradicting the alarm's premise that an open alarm always means real,
  // current drift. Retrying the fetch on its own would leave that hole open, so the
  // retried argument must be a named unit and both operations must live inside it.
  const unitCall = verify.match(/^[ \t]*retry (?!git\b)([A-Za-z_]\w*)[ \t]*$/m);
  assert.ok(unitCall, 'Verify delivered commit must retry one named unit, not a bare git command');
  const unit = shellFunction(verify, unitCall[1]);
  assert.match(
    unit,
    /^\s*(?:if ! )?git fetch origin main\b/m,
    `the retried unit ${unitCall[1]} must contain the verify fetch`,
  );
  assert.match(
    unit,
    /test "\$\(git rev-parse origin\/main\)" = "\$\{\{ steps\.deliver\.outputs\.commit \}\}"/,
    `the retried unit ${unitCall[1]} must contain the delivered-commit comparison`,
  );
  assert.doesNotMatch(verify, /^\s*retry git fetch origin main$/m);
  // Not `git fetch … && test …`: an AND-list as the unit's last command trips `errexit`.
  assert.doesNotMatch(verify, /git fetch origin main &&/);
});

test('release-please opens its pull request with an explicit non-default token', () => {
  const release = source('.github/workflows/release.yml');

  // The action defaults `token` to `${{ github.token }}`, and GitHub restricts what events
  // raised by the default token may start, so the release pull request's CI parks in
  // `action_required` and never runs. Omitting the input again would be silent, so the
  // assertion is scoped to the step and anchored at the `with:` key indent rather than
  // matching anywhere in the file (issue #279).
  const step = workflowStep(release, 'Release Please');
  assert.match(step, /^ {8}uses: googleapis\/release-please-action@/m);
  assert.match(step, /^ {10}token: \$\{\{ steps\.release-token\.outputs\.token \}\}$/m);
  assert.match(step, /^ {10}target-branch: develop$/m);
  assert.doesNotMatch(release, /^\s*token: \$\{\{ github\.token \}\}$/m);

  // The token is a short-lived App installation token rather than a long-lived personal
  // access token, so no credential on the release path expires or belongs to a person.
  // It must be minted before release-please consumes it, hence the ordering assertion.
  const mint = workflowStep(release, 'Create release token');
  // Matched without the ref: that this step runs a pinned implementation is asserted once, by
  // the workflow-pinning test below, so a Renovate digest bump touches no assertion at all.
  assert.match(mint, /^ {8}uses: actions\/create-github-app-token@/m);
  assert.match(mint, /^ {10}client-id: \$\{\{ vars\.RELEASE_APP_CLIENT_ID \}\}$/m);
  assert.match(mint, /^ {10}private-key: \$\{\{ secrets\.RELEASE_APP_PRIVATE_KEY \}\}$/m);
  // release-please needs both, and the token is scoped down to exactly those.
  assert.match(mint, /^ {10}permission-contents: write$/m);
  assert.match(mint, /^ {10}permission-pull-requests: write$/m);
  ordered(release, 'name: Create release token', 'name: Release Please');
});

test('the delivery push keeps the delivery app identity', () => {
  const release = source('.github/workflows/release.yml');

  // A persisted GITHUB_TOKEN lands in the git config as an extraheader that outranks the
  // delivery App token in the push URL and is inherited by `git worktree`, so the push would
  // run as github-actions[bot] — not a ruleset bypass actor — and `main` would reject it.
  // That is how v1.53.0 and v1.54.0 failed to reach `main` (issue #274).
  // Matched without the ref so a re-pin cannot quietly turn this into `undefined === undefined`
  // and take the guard with it. The invariant is the count, not which version is referenced;
  // the pinning convention itself is asserted once, in the workflow-pinning test below.
  assert.equal(
    release.match(/^\s*-?\s*uses: actions\/checkout@/gm)?.length,
    release.match(/^\s*persist-credentials: false$/gm)?.length,
  );
  // Second, independent mechanism, because the delivery identity is only observable on a real
  // release and no pre-merge check would catch a regression: any surviving header is cleared
  // before the push. The unset must tolerate a missing key — `git config --unset-all` exits 5
  // for one and the step runs under `bash -e`.
  assert.match(
    release,
    /git config --unset-all http\.https:\/\/github\.com\/\.extraheader \|\| true/,
  );
});

test('delivery stages the canonical Renovate config from the repository root', () => {
  const renovate = JSON.parse(source('renovate.json'));
  const staging = source('scripts/stage-delivery.mjs');
  const smoke = source('scripts/distribution-smoke.mjs');
  const release = source('.github/workflows/release.yml');
  const retiredConfig = new URL('scripts/delivery-renovate.json', repositoryRoot);

  assert.equal(renovate.$schema, 'https://docs.renovatebot.com/renovate-schema.json');
  assert.deepEqual(renovate.extends, ['local>sebastian-software/renovate-config']);
  assert.deepEqual(renovate.baseBranchPatterns, ['develop']);
  assert.equal(renovate.baseBranches, undefined);
  assert.match(staging, /cpSync\(join\(root, 'renovate\.json'\), join\(work, 'renovate\.json'\)\)/);
  assert.match(smoke, /'delivered Renovate config'/);
  assert.equal(existsSync(retiredConfig), false);
  for (const contents of [staging, smoke, release]) {
    assert.doesNotMatch(contents, /delivery-renovate\.json/);
  }
});

test('catalog job uses scoped app tokens and a checksum-pinned Dalo binary', () => {
  const release = source('.github/workflows/release.yml');

  assert.match(release, /actions\/create-github-app-token@/g);
  assert.equal(
    release.match(/client-id: \$\{\{ vars\.DALO_CATALOG_APP_CLIENT_ID \}\}/g)?.length,
    2,
  );
  assert.equal(
    release.match(/private-key: \$\{\{ secrets\.DALO_CATALOG_APP_PRIVATE_KEY \}\}/g)?.length,
    2,
  );
  assert.match(release, /repositories: effective-flow\n\s+permission-contents: read/);
  assert.match(
    release,
    /repositories: skills\.sebastian-software\.com\n\s+permission-contents: write\n\s+permission-pull-requests: write/,
  );
  assert.match(
    release,
    /repository: sebastian-software\/skills\.sebastian-software\.com[\s\S]*?persist-credentials: false[\s\S]*?path: team-catalog/,
  );
  assert.match(release, /dalo-0\.9\.2-x86_64-unknown-linux-musl/);
  assert.match(release, /7f7b7b4948a5cd156948bb0a8ceaa4889c09cd6d53397c07370c663bac1343ef/);
  ordered(release, 'curl --fail', 'sha256sum --check --strict', 'tar -xzf', 'install -m 0755');
  assert.match(release, /DALO_SOURCE_TOKEN: \$\{\{ steps\.source-token\.outputs\.token \}\}/);
  assert.match(release, /GH_TOKEN: \$\{\{ steps\.target-token\.outputs\.token \}\}/);
  assert.match(release, /node scripts\/update-team-catalog\.mjs/);
});

test('the tracker config keys document three modes in source, setup, and user guide', () => {
  const tracker = source('src/shared/issue-tracker.md');
  const setup = source('src/tools/setup.md');
  const docs = source('docs/user-guide/configuration.md');

  // Schema and defaults of the two new keys live in the tracker fragment. The JSON
  // keys are matched independently so the assertion does not pin their order.
  assert.match(tracker, /"externalTool": null/);
  assert.match(tracker, /"externalToolHint": null/);
  assert.match(tracker, /- `tracker\.externalTool`: `null`/);
  assert.match(tracker, /- `tracker\.externalToolHint`: `null`/);
  const flatTracker = flat(tracker);
  assert.match(flatTracker, /- `tracker\.mode`: `"local"`, `"remote"`, `"external"`/);
  assert.match(flatTracker, /Required when the mode is `external`\./);
  assert.match(flatTracker, /There is \*\*no\*\* whitelist/);
  assert.match(
    flatTracker,
    /`tracker\.externalToolHint`: free text that lets the run-time agent pick the right connection/,
  );
  assert.match(flatTracker, /It names a \*\*forge\*\* CLI and stays forge-only\./);

  // setup owns the interview that pins them, and asks for the same three modes.
  const flatSetup = flat(setup);
  for (const mode of ['local', 'remote', 'external']) {
    assert.match(
      flatSetup,
      new RegExp(`tracker\\.mode = ${mode}`),
      `the setup interview must offer tracker.mode = ${mode}`,
    );
  }
  assert.match(flatSetup, /`tracker\.externalTool` – the short, stable identifier/);
  assert.match(flatSetup, /It is required for this mode, there is no list of supported tools/);
  assert.match(flatSetup, /`tracker\.externalToolHint` – optional free text/);
  assert.match(flatSetup, /`tracker\.remoteToolOverride` stays a forge setting/);

  // The user guide carries the contract in its own `tracker` block, not in a passing
  // mention elsewhere. Its defaults are presented as `(unset)` rather than `null`.
  const trackerBlock = section(docs, '## Block `tracker`', '\n## ');
  const modeRow = tableRow(trackerBlock, '`mode`');
  for (const mode of ['local', 'remote', 'external']) {
    assert.match(modeRow, new RegExp(`\`${mode}\``), `the mode row must list ${mode}`);
  }
  assert.match(tableRow(trackerBlock, '`externalTool`'), /required for `mode: external`/);
  assert.match(tableRow(trackerBlock, '`externalTool`'), /no whitelist/);
  assert.match(tableRow(trackerBlock, '`externalToolHint`'), /connection/);
  assert.match(
    flat(trackerBlock),
    /A `mode: external` without a non-empty `externalTool` is invalid configuration: the run aborts instead of falling back to the forge or to `local`\./,
  );
});

test('an external tracker target fails closed on all four connection failures', () => {
  const target = source('src/shared/tracker-target.md');
  const tracker = source('src/shared/issue-tracker.md');
  const discovery = section(target, '### Connection discovery');
  const flatDiscovery = flat(discovery);

  assert.match(discovery, /\*\*Fail closed\.\*\*/);
  const classes = firstColumnCells(discovery);
  for (const failure of [
    'missing tool identifier',
    'no connection',
    'ambiguous connection',
    'missing capability',
  ]) {
    assert.ok(
      classes.includes(failure),
      `failure class must stay in the fail-closed table of "Connection discovery": ${failure}`,
    );
  }
  assert.match(
    flatDiscovery,
    /aborts the run before its first write, with a remediation hint and every workflow artifact preserved/,
  );
  assert.match(flatDiscovery, /There is no silent fallback\./);
  assert.match(
    flatDiscovery,
    /Publishing to the forge instead would scatter[\s\S]*degrading to a local report would hide work the user asked to publish/,
  );
  assert.match(flatDiscovery, /an unanswered or non-interactive run publishes nothing/);

  // The always-loaded fragment states the same closure for the missing identifier.
  assert.match(
    flat(tracker),
    /Never guess a tool, and never fall back to the forge or to `local`\./,
  );
});

test('the external capability gate aborts before the first write and keeps the relation conditional', () => {
  const target = source('src/shared/tracker-target.md');
  const required = section(target, '### Required capabilities');
  const flatRequired = flat(required);

  const capabilities = firstColumnCells(required);
  for (const capability of [
    'read one issue',
    'list or search issues',
    'create an issue',
    'read comments',
    'create a comment',
    'update a comment by its ID',
    'add and remove a classification',
    'patch an exact block or checklist',
  ]) {
    assert.ok(
      capabilities.includes(capability),
      `capability must stay in the required table of "Required capabilities": ${capability}`,
    );
  }
  assert.match(
    flatRequired,
    /abort before the first write and name the missing capability — the external equivalent of `UNSUPPORTED_CAPABILITY`/,
  );
  // Exactly one capability may be missing without aborting, and it is the relation —
  // but only together with the write that makes it usable. Gating the native mechanism on
  // the relation's mere existence let a read-only relation reach delivery and fail to mark
  // completion after the pull request existed.
  assert.match(
    flatRequired,
    /One capability is \*\*conditional\*\*: a native parent\/sub-issue relation \*\*whose sub-item completion state this connection can write\*\*/,
  );
  assert.match(
    flatRequired,
    /Discovery must prove that write, not merely that the relation exists/,
  );
  assert.match(
    flatRequired,
    /An unproven or missing completion write never aborts: the run selects the checklist fallback/,
  );
  // Capabilities come from the resolved connection, never from the tool's name.
  assert.match(
    flat(section(target, '### Connection discovery')),
    /Establish the coverage from the resolved connection itself, not from the tool's name/,
  );
});

test('the external container mechanism is chosen once, reported, and never mixed', () => {
  const target = source('src/shared/tracker-target.md');
  const container = flat(section(target, '### Container mechanism'));

  assert.match(
    container,
    /exactly one mechanism, decided once per run from the resolved connection and named in the run summary/,
  );
  ordered(
    container,
    '**Native relation (preferred).**',
    'If the connection exposes a parent/sub-issue relation',
    '**Checklist fallback.**',
  );
  assert.match(
    container,
    /Never mix the two within one container, and never downgrade a native relation to a checklist mid-run/,
  );

  // The native mechanism must be gated on the completion *write*, not on the relation's
  // existence. Otherwise a read-only relation is selected, the run creates a PR, and only
  // then fails to mark completion — after the first write, and leaving a work item the next
  // run implements again.
  assert.match(
    container,
    /parent\/sub-issue relation \*\*and\*\* discovery proved that it can write a sub-item's completion state/,
  );
  assert.match(
    container,
    /a relation whose completion state this connection cannot write — carry the/,
  );
  assert.match(
    container,
    /Selecting the fallback because the completion write could not be proven is part of that one decision, not a downgrade/,
  );

  // The conditional capability and its degrade-not-abort rule are pinned once, by the
  // capability-gate test above.
  // Both flows that tick off only after a PR exists must settle the mechanism in preflight.
  for (const path of ['src/tools/apply-issues.md', 'src/tools/apply-review-remote.md']) {
    assert.match(
      flat(source(path)),
      /only when the connection proves it can write a sub-item's completion state/,
      `${path} must settle the container mechanism before delivery`,
    );
  }
});

test('Stage B and apply-issues reconcile canonical containers before legacy expansion', () => {
  const detection = prose(source('src/shared/apply-source-detection.md'));
  const expansion = prose(
    section(source('src/tools/apply-issues.md'), '### Phase 2: Expansion & work list'),
  );

  assert.match(
    detection,
    /obtain native-child evidence only through the helper operation `issue-sub-issues-read` with the candidate issue as `parent`/,
  );
  assert.match(detection, /GitHub's normalized result is the authoritative native-child list/);
  assert.match(
    detection,
    /active canonical decomposition exists.*body contains a sub-issue checklist.*or the issue has native sub-items.*→ `container-issue`/,
  );
  assert.match(detection, /`container-issue` even when the native list is empty/);
  assert.match(detection, /all-`declined` record set is inactive/);

  ordered(
    expansion,
    'parse its records through `decomposition-records-parse`',
    'call `issue-sub-issues-read` with this issue as the parent',
    'compare it with the fresh normalized children through `decomposition-container-compare`',
    '`containerOnly: true` means the parent is never a work item',
    'any malformed record',
    'expand neither children nor parent',
    'Without an active canonical decomposition, preserve the legacy behavior',
    'a nonempty normalized native-child list classifies the issue as a container before checklist expansion',
    'expand only children whose normalized state is not terminal',
    'Deduplicate the work list',
  );
  assert.match(
    expansion,
    /if both signals exist, the verified native relation wins and the checklist is not mixed/i,
  );
  assert.match(
    expansion,
    /for a checklist container, expand to the open.*skip done.*read each open child fresh/,
  );
  assert.match(expansion, /If neither exists, the issue itself is a single work item/);
});

test('decomposition parsers derive their exact matcher from the versioned prefix contract', () => {
  const core = source('src/scripts/remote-tracker-core.mjs');
  assert.match(
    core,
    /const DECOMPOSITION_KEY_PREFIX = `\$\{DECOMPOSITION_KEY_MARKER\}:\$\{DECOMPOSITION_KEY_VERSION\}`/,
  );
  assert.match(
    core,
    /const DECOMPOSITION_RECORD_PREFIX = `\$\{DECOMPOSITION_RECORD_MARKER\}:\$\{DECOMPOSITION_RECORD_VERSION\}`/,
  );
  assert.match(
    core,
    /const DECOMPOSITION_SECTION_PREFIX = `\$\{DECOMPOSITION_SECTION_MARKER\}:\$\{DECOMPOSITION_SECTION_VERSION\}`/,
  );

  const keyParser = core.slice(
    core.indexOf('function inspectDecompositionKey'),
    core.indexOf('export function parseDecompositionKey'),
  );
  const recordParser = core.slice(
    core.indexOf('export function parseDecompositionRecords'),
    core.indexOf('function decompositionChildIdentity'),
  );
  assert.match(keyParser, /escapeRegExp\(DECOMPOSITION_KEY_PREFIX\)/);
  assert.match(recordParser, /escapeRegExp\(DECOMPOSITION_RECORD_PREFIX\)/);
  assert.match(recordParser, /escapeRegExp\(DECOMPOSITION_SECTION_PREFIX\)/);
  assert.doesNotMatch(keyParser, /effective-flow-decomposition-key:v1/);
  assert.doesNotMatch(recordParser, /effective-flow-decomposition-child:v1/);
});

test('stable-key persistence is proven by the bounded post-create check, not by discovery', () => {
  const planIssue = prose(source('src/tools/plan-issue.md'));
  assert.match(
    planIssue,
    /The just-created child's key being absent from that fresh list is marker non-persistence, not a failed create/,
  );
  assert.match(
    planIssue,
    /the run stops after at most one child, before any sibling is created and before the canonical comment is updated/,
  );
  assert.match(planIssue, /there is no pre-flight capability probe for it/);
  assert.match(planIssue, /`decomposition-key-build` produces the exact child body for the create/);
  assert.match(
    planIssue,
    /`decomposition-key-parse` performs the post-create key match against the freshly re-read child body/,
  );

  const trackerTarget = prose(source('src/shared/tracker-target.md'));
  assert.match(
    trackerTarget,
    /Persistence of that stable key is not a fourth discovered capability/,
  );
  assert.match(
    trackerTarget,
    /proven instead by the bounded post-create check in `\{\{SKILL:plan-issue\}\}` Phase 4/,
  );
  assert.match(
    trackerTarget,
    /`decomposition-key-build` writes the child body carrying the target-aware key marker/,
  );
  assert.match(
    trackerTarget,
    /`decomposition-key-parse` performs the post-create key match against the re-read child body/,
  );
});

test('plan files stay committed and pull requests stay on the forge in every tracker target', () => {
  const target = source('src/shared/tracker-target.md');
  const prComments = source('src/shared/pr-review-comments.md');
  const boundary = flat(section(target, '### Forge boundary'));

  // Plan-file invariant: no target introduces an external publication path.
  assert.match(
    boundary,
    /`\{\{SKILL:plan\}\}` keeps writing a committed Markdown file below `plan\.dir` in every target, and no target introduces an external publication path for plan files/,
  );
  assert.match(
    boundary,
    /Investigations likewise stay local below `\.effective-flow\/investigation\/` in every target/,
  );

  // Forge boundary: code-host objects never follow the tracker target.
  assert.match(
    boundary,
    /Pull requests, PR comments, and PR review threads are code-host objects and stay with the forge behind `origin`, whatever the tracker target is/,
  );
  assert.match(boundary, /the PR body references the external issue identifier/);
  assert.match(
    flat(prComments),
    /Pull requests, PR comments, and PR review threads are code-host objects and stay with the forge behind `origin` even when the tracker target is `external`; a tracker target never redirects them/,
  );
});

test('the security disclosure gate binds every publisher on every tracker target', () => {
  const tracker = source('src/shared/issue-tracker.md');
  const gate = flat(section(tracker, '### Security disclosure gate'));

  assert.match(
    gate,
    /This gate binds every publisher of review findings and overrides `tracker\.mode`/,
  );
  assert.match(gate, /there is no configuration key that switches it off/);
  assert.match(
    gate,
    /Publication to a third-party tracker is a disclosure with the same consequences as publication to a public forge, so the gate binds a forge target and an external target alike/,
  );
  assert.match(gate, /Rules for every publisher, on whichever tracker target the run resolved/);
  // The AI-attribution ban generalizes the same way.
  assert.match(
    flat(section(tracker, '### No AI attribution in issue bodies and comments')),
    /This binds every publisher on every tracker target, the forge and an external tool alike/,
  );
});

test('every source embedding issue-tracker also loads the tracker-target fragment', () => {
  const fence =
    '```lazy-include\ntracker-target\nwhen: the resolved tracker target is `external`\n```';

  // The consumer set is derived, not listed: a seventh tool that embeds the tracker
  // integration without this pointer would otherwise ship without the external contract.
  function includeClosure(body) {
    const names = new Set();
    const pending = [body];
    while (pending.length > 0) {
      const { eager, lazy } = collectIncludeNames(pending.pop());
      for (const name of [...eager, ...lazy]) {
        if (names.has(name)) continue;
        names.add(name);
        pending.push(source(`src/shared/${name}.md`));
      }
    }
    return names;
  }

  // One documented exemption. `cleanup.md` embeds the tracker integration only to decide
  // whether its `firmo-` label class runs at all; it performs no tracker write and skips that
  // class entirely on an external target, so the contract would be pure context cost there.
  // Exemptions are listed, never inferred — adding one has to be a deliberate edit, and an
  // exempt source must both omit the pointer and say why.
  const exempt = new Set(['src/tools/cleanup.md']);

  const consumers = [];
  for (const directory of ['src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      const path = `${directory}/${file}`;
      const body = source(path);
      // Eager and lazy embedding count alike: `review.md` defers `issue-tracker` itself.
      if (!includeClosure(body).has('issue-tracker')) continue;
      consumers.push(path);
      if (exempt.has(path)) {
        assert.equal(
          body.split(fence).length - 1,
          0,
          `${path} is exempt and must not carry the tracker-target load pointer`,
        );
        assert.match(
          flat(body),
          /deliberately carries \*\*no\*\* deferred `tracker-target` pointer/,
          `${path} must state why it is exempt`,
        );
        continue;
      }
      assert.equal(
        body.split(fence).length - 1,
        1,
        `${path} must carry the tracker-target load pointer exactly once`,
      );
    }
  }
  assert.ok(consumers.length > 0, 'no source embeds issue-tracker — derivation is vacuous');
  for (const path of exempt) {
    assert.ok(consumers.includes(path), `stale exemption: ${path} no longer embeds issue-tracker`);
  }
  assert.ok(
    consumers.includes('src/tools/review.md'),
    'review.md lazily embeds issue-tracker and must be part of the derived consumer set',
  );

  // A nested lazy fence inside this fragment is no longer a hazard: the standalone
  // shipping path resolves lazy fences too, and `assertNoUnresolvedLazyIncludes` fails
  // the build if one ever survives into a rendered artifact. Whether the fence lives here
  // or in the deferring tool is now purely an authoring choice.
  const tracker = source('src/shared/issue-tracker.md');
  const flatTracker = flat(tracker);
  assert.match(flatTracker, /lives in the `tracker-target` fragment\./);
  assert.match(
    flatTracker,
    /Every source that embeds this fragment \*\*must\*\* carry its own deferred pointer to `tracker-target`/,
  );
  assert.match(flatTracker, /as soon as the resolved target is `external`/);
});

// --- Next-step recommendations ---

// Tools outside the emission contract, listed with the reason they can never be the run the
// user is looking at when it ends. Listed, never inferred: an exemption has to be a deliberate
// edit, and build.mjs holds the same list (asserted below), so neither side can drift alone.
const NEXT_STEPS_EXEMPT = new Set([
  'version', // informational output; there is no run state to continue from
  'pr-review', // deprecated forwarder; the tool it forwards to emits
  'apply-plan', // not user-invocable; its end states live on `apply`
  'apply-review', // not user-invocable; its end states live on `apply`
  'apply-issues', // not user-invocable; its end states live on `apply`
  'plan-review', // not user-invocable; its end states live on `review` and `plan`
  'concept-review', // not user-invocable; its end states live on `review` and `concept`
  'apply-review-remote', // internal sub-file of apply-review with no completion phase
  'apply-review-commit-mechanics', // internal sub-file of apply-review with no completion phase
]);

function lazyFragmentNames(body) {
  return [...body.matchAll(LAZY_INCLUDE_RE)].map((match) => match[1].trim());
}

test('every emitting tool defers next-steps exactly once and every exemption stays live', () => {
  // The consumer set is derived — `count(src/tools/*.md) - |exemptions|`, never a hard-coded
  // number — so a newly added tool fails the build until it opts in or is exempted, instead of
  // silently inheriting "no recommendation".
  const toolFiles = readdirSync(new URL('src/tools/', repositoryRoot))
    .filter((entry) => entry.endsWith('.md'))
    .sort();
  assert.ok(toolFiles.length > 0, 'src/tools must contain sources to check');

  const emitting = [];
  for (const file of toolFiles) {
    const name = file.replace(/\.md$/, '');
    const body = source(`src/tools/${file}`);
    const fences = lazyFragmentNames(body).filter((fragment) => fragment === 'next-steps').length;
    const { eager } = collectIncludeNames(body);
    if (NEXT_STEPS_EXEMPT.has(name)) {
      assert.equal(fences, 0, `${name} is exempt and must not defer next-steps`);
      assert.equal(eager.has('next-steps'), false, `${name} is exempt and must not inline it`);
      continue;
    }
    emitting.push(name);
    // Deferred, never eager: `review.md` renders at 675 of its 700 budgeted lines, so an eager
    // include of the ~40-row table would break the context budget outright.
    assert.equal(
      eager.has('next-steps'),
      false,
      `src/tools/${file} must defer next-steps, not inline it`,
    );
    assert.equal(
      fences,
      1,
      `src/tools/${file} must carry the next-steps load pointer exactly once`,
    );
  }

  assert.ok(emitting.length > 0, 'no tool loads next-steps — derivation is vacuous');
  assert.equal(
    emitting.length,
    toolFiles.length - NEXT_STEPS_EXEMPT.size,
    'the emitting set must be every tool source minus the exemptions',
  );
  for (const name of NEXT_STEPS_EXEMPT) {
    assert.ok(
      existsSync(new URL(`src/tools/${name}.md`, repositoryRoot)),
      `stale exemption: src/tools/${name}.md no longer exists`,
    );
  }

  // build.mjs derives its guard from the same list; a one-sided edit must fail here. Each entry
  // is matched line-anchored rather than by scanning the block for quote pairs: an apostrophe in
  // one of the trailing comments would otherwise pair across it and invent an entry.
  const declared = section(
    source('build.mjs'),
    'const NEXT_STEPS_EXEMPT_TOOLS = new Set([',
    '\n]);',
  );
  assert.deepEqual(
    [...declared.matchAll(/^\s*'([^']+)',/gm)].map((match) => match[1]).sort(),
    [...NEXT_STEPS_EXEMPT].sort(),
    'build.mjs and this contract must share one exemption set',
  );

  // Two-way coverage on the live table: every emitting tool has a row and no row names a tool
  // outside the derived set.
  const edges = parseNextStepsTable(source('src/shared/next-steps.md'), {
    context: 'src/shared/next-steps.md',
  });
  assert.deepEqual(
    [...new Set(edges.map((edge) => edge.tool))].sort(),
    [...emitting].sort(),
    'the edge table and the derived emitting set must cover each other',
  );

  // The published mirror is otherwise only reconciled by `node build.mjs`, so a drifted user
  // guide would stay green through the whole test suite.
  assert.deepEqual(
    findNextStepsDocViolations(source('docs/user-guide/tool-flow.md'), edges, {
      context: 'docs/user-guide/tool-flow.md',
    }),
    [],
    'the user-guide table must mirror the fragment in its rendered invocation form',
  );
});

test('the next-steps fragment ships standalone and states the emission rule', () => {
  const fragment = source('src/shared/next-steps.md');

  const flatFragment = flat(fragment);
  assert.match(
    flatFragment,
    /last user-invocable tool of a run emits/i,
    'the fragment must state which run of a delegation chain emits',
  );
  assert.match(
    flatFragment,
    near('Next steps: suppressed', 'emits nothing'),
    'the fragment must tie the suppression signal to emitting nothing',
  );
});

test('every returning delegation announces the next-step suppression', () => {
  // A delegation whose result returns to its caller is marked; a handoff that gives the
  // receiving tool the rest of the run is not. The distinction is mechanical, so it can be
  // asserted here per call site rather than inferred at runtime.
  const sites = [
    { file: 'src/tools/plan.md', delegates: ['plan-review'] },
    { file: 'src/tools/review.md', delegates: ['plan-review', 'concept-review'] },
    { file: 'src/tools/concept.md', delegates: ['concept-review'] },
    { file: 'src/tools/plan-issue.md', delegates: ['plan-review'] },
    { file: 'src/tools/apply.md', delegates: ['apply-plan', 'apply-review', 'apply-issues'] },
    { file: 'src/tools/merge-gate.md', delegates: ['iterate'] },
    // The remaining returning delegations: the worktree completion action that hands delivery to
    // `pr`, the per-finding and per-issue sub-agent payloads, and the per-item delegation of
    // `iterate`. Each of these receivers hands its result back, so the caller closes the run.
    { file: 'src/shared/worktree-integration.md', delegates: ['pr'] },
    { file: 'src/tools/apply-review.md', delegates: ['fix', 'refactor', 'build', 'docs'] },
    { file: 'src/tools/apply-issues.md', delegates: ['build', 'fix', 'refactor', 'docs', 'pr'] },
    { file: 'src/tools/iterate.md', delegates: ['fix', 'refactor', 'build', 'docs'] },
  ];

  // What the window proves and what it does not: `near` searches the whole flattened file, so it
  // shows that the literal and the delegation reference exist together in one region — not that
  // this particular reference is the one the sentence addresses. Where several delegations share
  // one announcement (`apply.md`: "Every one of those three delegations …"), a single literal
  // legitimately satisfies all of them, which is why the assertion is not sliced per delegation:
  // a per-delegate slice would demand a per-delegate sentence the sources deliberately do not
  // have. The stronger per-run guarantee is the build-time contract in build.mjs, not this test.
  for (const { file, delegates } of sites) {
    const body = flat(source(file));
    assert.match(body, /Next steps: suppressed/, `${file} must carry the suppression literal`);
    for (const delegate of delegates) {
      assert.match(
        body,
        near(`\\{\\{SKILL:${delegate}\\}\\}`, 'Next steps: suppressed', 900),
        `${file} must announce the suppression at its ${delegate} delegation`,
      );
    }
  }
});

test('the apply-plan handoff to the implementation tools carries no suppression line', () => {
  const applyPlan = source('src/tools/apply-plan.md');

  // A handoff gives the receiving tool the rest of the run, so that tool is the one that emits.
  // Explaining the omission is expected; carrying the literal as a payload line is not.
  for (const line of applyPlan.split('\n')) {
    const payload = line
      .trim()
      .replace(/^[-*>\s]+/, '')
      .replaceAll('`', '')
      .trim();
    assert.notEqual(
      payload,
      'Next steps: suppressed',
      `apply-plan must not hand its receiver a suppression line: ${line}`,
    );
  }

  const flatApplyPlan = flat(applyPlan);
  const mentions = [...flatApplyPlan.matchAll(/suppress\w*/gi)];
  assert.ok(
    mentions.length > 0,
    'apply-plan must state why its handoff carries no suppression line',
  );
  for (const mention of mentions) {
    assert.match(
      flatApplyPlan.slice(Math.max(0, mention.index - 240), mention.index + 240),
      /\b(?:no|not|never|without|omits?|omitted|omission|absent)\b/i,
      'every suppression mention in apply-plan must be an explicit omission',
    );
  }
});

test('the plan gateway hands plan-issue the run instead of suppressing its block', () => {
  // The gateway ends the plan run immediately (see plan-input-gateway), so plan-issue closes in
  // front of the user and must emit for itself. Suppressing it there would silence both sides.
  const plan = flat(source('src/tools/plan.md'));
  // Capture the index first: `indexOf` returns -1 for a vanished reference, and `slice(-1)` would
  // hand the assertions a one-character string that passes every check below.
  const handoffIndex = plan.indexOf('{{SKILL:plan-issue}}');
  assert.notEqual(handoffIndex, -1, 'plan must delegate an issue reference to plan-issue');
  const handoff = plan.slice(handoffIndex);
  assert.doesNotMatch(
    handoff.slice(0, 400),
    /(?<!no\s|not\s|never\s)carries the literal line `Next steps: suppressed`/,
    'plan must not suppress the next-step block of the plan-issue run it hands off to',
  );

  // plan-issue is an exposed tool, so it carries the fence and is expected to emit.
  const { lazy } = collectIncludeNames(source('src/tools/plan-issue.md'));
  assert.ok(lazy.has('next-steps'), 'plan-issue must load next-steps to emit for itself');
});

test('plan stops naming an implementation tool at completion but keeps the template field', () => {
  const plan = source('src/tools/plan.md');

  // `apply <plan-file>` re-reads the plan's own recommendation at invocation time, so the run
  // no longer has to guess the workflow twice.
  const completion = section(plan, '### Phase 7: Completion', '\n## ');
  for (const tool of ['build', 'fix', 'refactor', 'docs']) {
    assert.doesNotMatch(
      completion,
      new RegExp(`\\{\\{SKILL:${tool}\\}\\}`),
      `plan.md must not recommend ${tool} at completion`,
    );
  }
  assert.match(completion, /next-step/i, 'the completion phase must emit the next-step block');

  // The header field itself stays: `apply-plan` routes on it and `open-plans` renders it.
  const workflowLine = plan
    .split('\n')
    .find((line) => line.startsWith('**Recommended workflow:**'));
  assert.ok(workflowLine, 'the plan template must keep the **Recommended workflow:** field');
  for (const [category, tool] of [
    ['Feature', 'build'],
    ['Bugfix', 'fix'],
    ['Refactoring', 'refactor'],
    ['Documentation', 'docs'],
  ]) {
    assert.ok(workflowLine.includes(category), `the template must keep the ${category} category`);
    assert.ok(
      workflowLine.includes(`{{SKILL:${tool}}}`),
      `the template must keep ${tool} as the ${category} workflow`,
    );
  }
});

test('the revision-mode move back from the archive never touches the Git index', () => {
  const plan = source('src/tools/plan.md');
  const flat = (text) => text.replace(/\s+/g, ' ');

  // `plan` creates no commit, so a staged rename would outlive the run in the user's index and
  // ride along with the next unrelated commit. The move back is a plain filesystem move, and the
  // rules block states that instead of contradicting it. Both mentions of the command are
  // clauses about not using it — one forbidding it, one explaining the safety it took away.
  assert.deepEqual(
    plan.match(/git mv/g) ?? [],
    ['git mv', 'git mv'],
    'plan.md may mention git mv only in the clauses that forbid it and explain its loss',
  );
  assert.match(plan, /never with `git mv`/);
  assert.match(plan, /`git mv` refuses to\s+clobber an existing file without `-f`/);

  const revision = flat(section(plan, 'On a revision run:', '\n5. '));
  assert.match(revision, /moves back from `<plan\.dir>\/archive\/` to `<plan\.dir>\/`/);
  assert.match(revision, /\*\*plain filesystem move\*\*, never with `git mv`/);

  // The consumers of the moved file read the working tree; that is what makes an unstaged move
  // sufficient, and it is the reason this rule can differ from the archive-forward handshake.
  ordered(
    revision,
    '`{{SKILL:open-plans}}` lists the top level of `<plan.dir>/` from the file system',
    'the plan-reference rule resolves against `<plan.dir>/` and `<plan.dir>/archive/`',
  );

  // Fail-closed tracked-state detection in the house style: one explicit command, an explicit
  // reading of every result, and no guess on a nonzero exit. The probe covers BOTH paths — the
  // destination can be tracked while the archived source never was, so a source-only probe would
  // report a restored tracked path as untracked.
  assert.match(
    revision,
    /git -C <project root> ls-files -z -- ':\(literal\)<archived path>' ':\(literal\)<plan\.dir>\/<file>'/,
  );
  ordered(
    revision,
    'Establish the Git state of **both** paths first',
    'match each path against the NUL-separated entries',
    '`-z` is load-bearing rather than tidy',
    '`:(literal)` is what makes the arguments paths rather than patterns',
    '`--` only separates paths from revisions and does not disable pathspec globbing',
    'Either one omitted lets the probe read a tracked file as untracked',
    '**Never infer one side from the other either:**',
    'a listed destination means the move restored a tracked path',
    'Any nonzero exit or command-launch error',
    'is not permission to guess',
  );
  assert.match(
    revision,
    /an unlisted one means the plan is now untracked at `<plan\.dir>\/<file>`/,
  );

  // Ordering is the real guarantee: the move lands before the status reset, so a refused move
  // cannot strand an archived file rewritten to the open status. Assert the two in sequence —
  // a reversed pair is exactly the defect, and neither clause alone would catch it.
  ordered(
    revision,
    '**For an archived plan the move comes first, and the status reset follows on the file at its final path.**',
    'reset first and a move that is then refused strands an archived file marked open',
    'the run writes nothing at all until the plan is at its new path',
    '**Ask everything before the move; after the move, only write.**',
    '**The destination must be absent, and the move itself has to enforce that.**',
    '**On a collision, stop having written nothing.**',
    'the status reset happens only after the move has been confirmed',
  );

  // The general rule the orderings are instances of: a decline is safe at every point because
  // nothing is written before the questions are answered. Both questions are named, and the
  // unclear-status bullet points back at it — a rule stated once but applied nowhere would drift.
  ordered(
    revision,
    'the revision question above, and the unclear-status confirmation below',
    'is asked and answered before the plan is moved',
    'no question is posed once it has been',
    'before the move a decline changes nothing because nothing has been written',
  );
  assert.match(
    revision,
    /Obtain it \*\*before the move\*\*, per the ask-before-the-move rule above/,
  );
  assert.match(
    revision,
    /a decline then ends the run with the plan untouched in `<plan\.dir>\/archive\/`/,
  );

  // A check and a move are two steps, so the no-overwrite guarantee has to live in the move
  // primitive rather than in a check that precedes it.
  ordered(
    revision,
    'A check alone cannot carry it',
    '`mv -n` or an equivalent no-overwrite move',
    'may report success while silently skipping',
    'a skipped move is the collision case, not a completed one',
  );
  assert.match(revision, /Report both paths, revise nothing, and stop/);

  // The retired wording put the check before the status reset instead of moving the reset after
  // the move; a revert to it would reopen the half-applied-revision window.
  assert.doesNotMatch(revision, /checked before any write/);
  assert.doesNotMatch(revision, /before the status reset as well as before the move/);

  // The ask block promises exactly the behavior the run performs.
  const ask = flat(section(plan, '```ask\nwhen: the revision target was resolved', '```'));
  assert.match(ask, /move an archived plan file back to <plan\.dir>\/ without staging that move/);

  // The rules block carries the boundary, so no later reader has to infer it from
  // "Do not create any commits." alone.
  const rules = flat(section(plan, '## Rules', '\n## '));
  ordered(
    rules,
    'Do not create any commits.',
    'Do not stage anything or otherwise write to the Git index.',
    'plain filesystem move',
  );

  // The leftover working-tree change is part of the completion report, not a silent side effect.
  const completion = flat(section(plan, '### Phase 7: Completion', '\n## '));
  assert.match(completion, /the unstaged move and its Git effect/);

  // The archive convention states both directions, so a reader who arrives at the staged
  // forward move does not carry it over to the reverse one.
  const archive = flat(
    section(source('src/shared/plan-numbering.md'), '### Archive of implemented plans'),
  );
  ordered(
    archive,
    'The move is coupled to the **delivery event**',
    'moves the file via `git mv` to `<plan.dir>/archive/`',
    'The **reverse** move is not coupled to a delivery event and therefore not staged',
    'plain filesystem move, never with `git mv`',
    '`{{SKILL:plan}}` creates no commit',
  );
});

test('no source cites the non-existent "Host and CLI detection" section', () => {
  // AC4: the section never existed in `issue-tracker.md`; the surviving references were
  // broken across lines, so the sweep normalizes whitespace and Markdown emphasis.
  const tracker = source('src/shared/issue-tracker.md');
  assert.doesNotMatch(
    tracker,
    /^#+ .*host and cli detection/im,
    'issue-tracker.md must not gain the section this sweep forbids citing',
  );

  for (const directory of ['src/shared', 'src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      const normalized = flat(source(`${directory}/${file}`).replaceAll('*', ''));
      assert.doesNotMatch(
        normalized,
        /host and CLI detection/i,
        `${directory}/${file} must not reference the non-existent "Host and CLI detection" section`,
      );
    }
  }
});

test('the pr-review-integration fragment resolves through the build into all three targets', () => {
  const fragment = source('src/shared/pr-review-integration.md');

  // The fragment ships once per harness as a lazily loaded shared/pr-review-integration.md
  // (build.mjs's #99 guard). That path resolves nested eager includes — the fragment loads
  // `pr-review-comments` and `security-disclosure-gate` that way — and, since the shipped-fragment
  // path gained the lazy resolver, nested lazy fences as well.
  const knownTools = new Set(
    readdirSync(new URL('src/tools/', repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, '')),
  );
  const knownAgents = new Set(
    readdirSync(new URL('src/agents/', repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, '')),
  );
  const refConfig = {
    exposedTools: [...knownTools],
    agentPrefix: 'effective-flow-',
    skillName: 'effective-flow',
    knownTools,
    knownAgents,
  };

  const resolved = resolveEagerIncludes(fragment, {
    context: 'shared/pr-review-integration.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  for (const harness of ['claude', 'codex', 'portable']) {
    const context = `shared/pr-review-integration.md (${harness})`;
    const rendered = renderBody(resolved, harness, { ...refConfig, context });
    assertNoUnresolvedEagerIncludes(rendered, { context });
    assert.match(rendered, /review-create/, harness);
    assert.match(rendered, /<!-- effective-flow-pr-review -->/, harness);
    assert.match(rendered, /Never approve and never request changes/, harness);

    // The security gate on this published surface is unconditional: making it switchable by a
    // configuration key must not ship green. Pinned as the rule rather than as one sentence —
    // any wording is accepted as long as it still binds the gate, states that no configuration
    // key changes it, and names `delivery.prReview` as included in that.
    const gateRule = rendered.split(/\n{2,}/).find((block) => /no configuration key/i.test(block));
    assert.ok(
      gateRule,
      `${harness}: the fragment must state that no configuration key changes the security gate`,
    );
    assert.match(gateRule, /gate|security/i, harness);
    assert.match(gateRule, /delivery\.prReview/, harness);
  }
});

test('every one of the three delivery call sites and review.md load the pr-review-integration fragment exactly once', () => {
  const callSites = [
    'src/shared/worktree-integration.md',
    'src/tools/apply-review-remote.md',
    'src/tools/apply-issues.md',
    'src/tools/review.md',
  ];

  for (const path of callSites) {
    const body = source(path);
    const { eager, lazy } = collectIncludeNames(body);
    assert.equal(eager.has('pr-review-integration'), false, `${path} must not eager-include it`);
    assert.ok(lazy.has('pr-review-integration'), `${path} must reference pr-review-integration`);

    const { names } = resolveLazyIncludes(body, { context: path });
    assert.equal(
      names.filter((name) => name === 'pr-review-integration').length,
      1,
      `${path} must load pr-review-integration exactly once`,
    );
  }
});

test('review.md keeps the plan-file special case before the pull-request special case', () => {
  const review = source('src/tools/review.md');
  ordered(
    review,
    '### Plan-file special case',
    '### Pull-request special case',
    'a bare four-digit value stays a\nlegacy plan reference',
  );

  // The bare four-digit precedence is stated explicitly, right at the pull-request
  // branch, not only implied by section order — a re-ordering that kept the words but
  // moved the section would still be caught by `ordered` above.
  assert.match(
    review,
    /Evaluated \*\*after\*\* the plan-file special case and never before it: a bare four-digit value stays a\s*\nlegacy plan reference and is never read as a pull request\./,
  );
});

test('the documentation sync gate is a fixed, blocking part of every implementation tool', () => {
  const consumers = ['build', 'fix', 'refactor', 'maintain'];
  for (const tool of consumers) {
    const { eager, lazy } = collectIncludeNames(source(`src/tools/${tool}.md`));
    assert.ok(
      eager.has('documentation-sync'),
      `tools/${tool}.md must embed documentation-sync eagerly, so the phase cannot be deferred away`,
    );
    assert.ok(!lazy.has('documentation-sync'), `tools/${tool}.md must not lazy-load the gate core`);
  }

  // The eager core carries the mandate; only the detail contract is deferred.
  const core = source('src/shared/documentation-sync.md');
  assert.match(flat(core), /mandatory/i);
  assert.match(flat(core), /not skippable|unskippable/i);
  assert.ok(
    collectIncludeNames(core).lazy.has('documentation-sync-contract'),
    'the eager core must lazy-load its detail contract',
  );

  const contract = source('src/shared/documentation-sync-contract.md');
  for (const verdict of ['`updated`', '`no impact`', '`blocked`']) {
    assert.ok(contract.includes(verdict), `missing verdict state: ${verdict}`);
  }
  // A bare "not relevant" must not satisfy the gate, otherwise `no impact`
  // degrades into the skip clause this change removes.
  assert.match(flat(contract), /not relevant.{0,80}does not satisfy/i);
  // Both blocking branches: escalate interactively, hand off as a finding when
  // delegated non-interactively.
  ordered(flat(contract), 'interactive', 'non-interactive delegation');
  assert.match(flat(contract), /non-interactive delegation.{0,400}do not abort/i);
  assert.match(contract, /Action: \{\{SKILL:docs\}\}/);

  // The clauses that made documentation optional are gone.
  assert.doesNotMatch(source('src/tools/build.md'), /Skip user docs only with a short/);
  assert.doesNotMatch(
    source('src/tools/refactor.md'),
    /do not introduce a documentation phase if the refactoring/,
  );
  assert.doesNotMatch(
    source('docs/user-guide/tools-implement.md'),
    /Introduces no documentation phase when no public behavior/,
  );
});

test('the concept workflows keep their write boundary at the concept directory', () => {
  const concept = source('src/tools/concept.md');
  const conceptReview = source('src/tools/concept-review.md');

  // Neither workflow may produce the artifacts of a neighboring lifecycle: a plan file
  // would make an unimplementable concept look implementable, an ADR would break the
  // single-file write boundary, and code would leave the analysis phase entirely.
  assert.match(
    flat(concept),
    /Only analysis, follow-up questions, and one new file under `<concept\.dir>\/` are allowed\./,
  );
  assert.match(flat(concept), /no plan file under `<plan\.dir>\/` and no ADR under `docs\/adr\/`/);
  assert.match(concept, /Do not start any implementation phase and create no plan file\./);

  assert.match(
    flat(conceptReview),
    /changes to exactly one referenced concept file under `<concept\.dir>\/` are allowed\./,
  );
  assert.match(
    flat(conceptReview),
    /create no plan file under `<plan\.dir>\/` and no ADR under `docs\/adr\/`/,
  );
  assert.match(conceptReview, /Change only the one referenced concept file\./);
});

test('review evaluates the concept-file special case after the plan-file special case', () => {
  const review = source('src/tools/review.md');

  ordered(
    review,
    '### Plan-file special case',
    '### Concept-file special case',
    '### Phase 1: Scope',
  );

  // The precedence is stated explicitly at the concept branch, not merely implied by
  // section order: a reordering that kept the words would still be caught by `ordered`,
  // but a silently dropped precedence sentence would not.
  assert.match(
    review,
    /Evaluated \*\*after\*\* the plan-file special case and never before it: a bare four-digit value stays a\s*\nlegacy plan reference and is never read as a concept reference\./,
  );
  assert.match(review, /Read the internal instruction `\{\{SKILL:concept-review\}\}`/);

  // The plan branch ends the workflow as soon as it matches, so the cross-artifact
  // ambiguity rule only takes effect if it is decided inside that branch, before it acts.
  // Stated in the concept branch alone it would be unreachable for exactly the ambiguous
  // argument it exists for.
  const planCase = review.slice(
    review.indexOf('### Plan-file special case'),
    review.indexOf('### Concept-file special case'),
  );
  assert.match(
    flat(planCase),
    /first resolve the same argument against `<concept\.dir>\/` per the concept-file special case below/,
  );
  assert.match(
    flat(planCase),
    /\*\*Plan match and concept match:\*\* the argument is ambiguous\. Name both interpretations, ask which artifact was meant, and start neither review\./,
  );
  assert.match(
    flat(planCase),
    /Only a bare file name or a title slug can be ambiguous — a full path names its directory, and a bare four-digit value stays a legacy plan reference\./,
  );
});

test('a new concept follows the configured workflow language, not an existing corpus', () => {
  const concept = source('src/tools/concept.md');

  // Adopting the corpus language unconditionally would let one German concept silently
  // flip an `language.workflow: en` project's next concept to German.
  assert.match(
    flat(concept),
    /Their language is \*\*not\*\* adopted: a new concept follows the resolved `language\.workflow`/,
  );
  assert.match(
    flat(concept),
    /an existing concept corpus is not a language signal and never overrides it/,
  );
  assert.match(
    flat(concept),
    /Only when editing an existing concept do you preserve its clearly recognizable complete language/,
  );
});

test('every concept consumer loads the concept contract exactly once and lazily', () => {
  for (const path of [
    'src/tools/concept.md',
    'src/tools/concept-review.md',
    'src/tools/review.md',
  ]) {
    const body = source(path);
    const { eager, lazy } = collectIncludeNames(body);
    assert.equal(eager.has('concept-contract'), false, `${path} must not eager-include it`);
    assert.ok(lazy.has('concept-contract'), `${path} must reference concept-contract`);

    const occurrences = [...body.matchAll(/```lazy-include\nconcept-contract\n/g)].length;
    assert.equal(occurrences, 1, `${path} must load concept-contract exactly once`);
  }
});

test('the concept contract pins its four status forms and separates concept from plan directory', () => {
  const contract = source('src/shared/concept-contract.md');

  for (const marker of [
    '**Konzeptstatus:** Entwurf',
    '**Konzeptstatus:** Ausgearbeitet',
    '**Concept status:** Draft',
    '**Concept status:** Elaborated',
  ]) {
    assert.ok(contract.includes(marker), `concept-contract must declare ${marker}`);
  }

  // A concept directory that resolves onto the plan directory would make a plan
  // reference and a concept reference indistinguishable for the review router, so it
  // fails closed. String inequality is not enough: `docs/plan` and `./docs/plan` are the
  // same directory, and a concept directory nested inside the plan directory is still
  // enumerated by the plan resolvers.
  assert.match(
    flat(contract),
    /must be \*\*separate directories\*\*, compared as canonical paths rather than as configured strings/,
  );
  assert.match(flat(contract), /physically canonicalize them/);
  assert.match(
    flat(contract),
    /Reject a configuration where the two resolve to the same directory \*\*or\*\* where one contains the other/,
  );
  assert.match(flat(contract), /A bare four-digit value is never a concept reference/);
  assert.match(flat(contract), /Concepts have no archive and no implemented state\./);
});

test('the concept review gates the elaborated status and leaves the re-entry to its caller', () => {
  const conceptReview = source('src/tools/concept-review.md');

  assert.match(
    flat(conceptReview),
    /Set `\*\*Concept status:\*\* Elaborated` \(German: `\*\*Konzeptstatus:\*\* Ausgearbeitet`\) exactly when no critical finding and no blocking open point remains/,
  );
  assert.match(flat(conceptReview), /Otherwise the status stays `Draft`\/`Entwurf`/);

  // `concept-review` is not user-invocable, so it can never be the run the user is looking at:
  // it returns its result and the invoking tool closes the run. The re-entry it used to name
  // itself did not disappear — it became a machine-checked row of the next-steps edge table on
  // both invoking tools, which is a stronger guarantee than the prose assertion it replaces.
  assert.doesNotMatch(
    // Flattened like the assertions above: on raw source a line-wrapped occurrence would slip
    // past this negative match.
    flat(conceptReview),
    /\{\{SKILL:review\}\} <concept-file>/,
    'concept-review must not name a re-entry its caller already emits',
  );
  const edges = parseNextStepsTable(source('src/shared/next-steps.md'), {
    context: 'src/shared/next-steps.md',
  });
  for (const tool of ['concept', 'review']) {
    assert.ok(
      edges.some(
        (edge) =>
          edge.tool === tool && [edge.then, edge.or].includes('{{SKILL:review}} <concept-file>'),
      ),
      `${tool} must carry the concept re-entry edge`,
    );
  }
});

test('the concept handoff stays self-contained text and marks ADR candidates only', () => {
  const contract = source('src/shared/concept-contract.md');
  const conceptReview = source('src/tools/concept-review.md');

  // The handoff is a convention, not a coupling: the plan gateway knows plans, review
  // reports and issue references, so a concept path reaches it as free-text requirement.
  assert.match(
    flat(contract),
    /The handoff is \*\*self-contained text\*\*: a complete `\{\{SKILL:plan\}\}` call whose requirement string names the work package and the concept file/,
  );
  assert.match(flat(contract), /the concept keeps no list of the plans derived from it/);
  assert.match(
    flat(contract),
    /Neither concept workflow writes an ADR, and neither asks for one\./,
  );

  assert.match(
    flat(conceptReview),
    /Create no plan file, maintain no list of derived plans, and change nothing about the routing of `\{\{SKILL:plan\}\}`\./,
  );
  assert.match(
    flat(conceptReview),
    /Mark durable decisions in the concept as ADR candidates with a one-line rationale\. Write no ADR/,
  );
});

test('pr never repeats a creation whose mutation may already have succeeded', () => {
  const pr = flat(source('src/tools/pr.md'));

  assert.match(pr, /Never re-run PR creation after `mutationMayHaveSucceeded`/);
  assert.match(pr, /repeating the mutation would create a duplicate for the same head/);
  // The prescribed response must be a lookup, not another create. It has to be the head/base
  // lookup: this failure path never received a PR number, so a number-keyed read cannot run.
  assert.match(pr, /Resolve it by repeating the step 8 existing-PR lookup/);
  assert.match(pr, /identifies a pull request by head and base rather than by a number/);
  assert.match(pr, /Retrying the creation is forbidden on every provider/);
});

test('a failed delivery is surfaced as an assigned issue that closes itself', () => {
  const release = source('.github/workflows/release.yml');
  const alarm = section(release, '- name: Report a failed delivery', '\n  update-team-catalog');
  const close = section(
    release,
    '- name: Close a resolved delivery alarm',
    '\n      - name: Report a failed delivery',
  );

  // The gate is the whole point: an ordinary red run creates no release and therefore no
  // drift, and an alarm that cries wolf gets ignored — the failure mode #278 is about.
  assert.match(
    alarm,
    /if: \$\{\{ failure\(\) && steps\.release\.outputs\.release_created == 'true' \}\}/,
  );
  // failure() excludes cancellation; always() would not.
  assert.doesNotMatch(alarm, /always\(\)/);

  // github.repository_owner is the sebastian-software organization, which GitHub rejects
  // as an assignee. The actor is the person whose push produced the release.
  assert.match(alarm, /--add-assignee "\$ACTOR"/);
  assert.match(alarm, /ACTOR: \$\{\{ github\.actor \}\}/);
  // The prose comment names repository_owner to explain why it is wrong, so assert on the
  // expression form: the value must never be interpolated into this step.
  assert.doesNotMatch(alarm, /\$\{\{ github\.repository_owner \}\}/);
  // A rejected assignee must not cost the alarm itself.
  assert.match(alarm, /\|\| echo "Could not assign/);

  // Needs only issues: write — never the delivery app credentials.
  assert.match(alarm, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  for (const secret of [/DELIVERY_APP_PRIVATE_KEY/, /DELIVERY_APP_CLIENT_ID/]) {
    assert.doesNotMatch(alarm, secret);
    assert.doesNotMatch(close, secret);
  }

  // One open alarm at a time, so consecutive failures do not accumulate duplicates.
  assert.match(alarm, /gh issue list --label delivery-failed --state open/);
  assert.match(alarm, /gh issue comment "\$existing"/);

  // A green delivery resolves the alarm, and a failure to close never reddens that run.
  // success() is explicit: relying on the implicit rule would risk a false success comment
  // on a live alarm if it were ever misread or changed.
  assert.match(
    close,
    /if: \$\{\{ success\(\) && steps\.release\.outputs\.release_created == 'true' \}\}/,
  );
  assert.match(close, /continue-on-error: true/);
  // Every open alarm is closed: without a concurrency group two failing runs can each open
  // one, and closing a single issue would strand the other permanently.
  assert.match(close, /--limit 50 --json number --jq '\.\[\]\.number'/);
  assert.match(close, /gh issue close "\$number"/);

  // Both steps run after delivery and its verification.
  ordered(
    release,
    '- name: Deliver portable skill, consumer docs, and trusted automation to main',
    '- name: Verify delivered commit',
    '- name: Close a resolved delivery alarm',
    '- name: Report a failed delivery',
  );

  // Re-delivery stays rejected: nothing new may reach the default branch.
  const stageDelivery = source('scripts/stage-delivery.mjs');
  assert.match(
    stageDelivery,
    /const TRUSTED_AUTOMATION = \[\n\s+join\('\.github', 'workflows', 'close-develop-issues\.yml'\),\n\s+join\('\.github', 'scripts', 'close-develop-issues\.mjs'\),\n\];/,
  );
});

test('apply-issues carries the worktree lifecycle contract instead of referring to it', () => {
  const applyIssues = source('src/tools/apply-issues.md');

  // The defect this pins: Phase 4 pointed at apply-review's copy by analogy, so an agent
  // following apply-issues alone never learned to write a record — and cleanup, whose only
  // ownership proof is that record, could then never remove the worktree it had created.
  assert.match(applyIssues, /```include\nworktree-lifecycle\n```/);
  assert.match(applyIssues, /a reference by analogy is not a contract/);

  // Both ends of the lifecycle have to be instructed, not just the format.
  assert.match(
    flat(applyIssues),
    /Write the record immediately after the `effective-flow-created` receipt is verified/,
  );
  assert.match(applyIssues, /transition its lifecycle record from `active` to `cleanup-ready`/);
  // Every exit from the phase ends in a status, so no record is stranded at `active`.
  // Post-delegation failures count: a rejected push or a failed PR creation must also land.
  // Matched on flattened prose so a reflow by the formatter cannot break these.
  const flatIssues = flat(applyIssues);
  assert.match(
    flatIssues,
    /a failed delegation, a rejected push and a failed pull-request creation all set `failed`/,
  );
  assert.match(flatIssues, /A record must never be left at `active` once the issue is done with/);
  assert.match(
    flatIssues,
    /transition its lifecycle record to `failed` with the exact reason, whether the failure happened during delegation or afterwards during push or pull-request creation/,
  );

  // The fragment must actually resolve, so the rendered tool carries the record path.
  const rendered = resolveEagerIncludes(applyIssues, {
    context: 'tools/apply-issues.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });
  assert.match(rendered, /\.effective-flow\/worktree-runs\/<RECORD_ID>\.json/);
  assertNoUnresolvedEagerIncludes(rendered, 'tools/apply-issues.md');
});

// The two pull-request markers `iterate` and the outbound publication write.
// Pinned in one place so every assertion below reads the same contract.
const PULL_REQUEST_MARKERS = [
  '<!-- effective-flow-iterate -->', // iterate's own replies on a pull request
  '<!-- effective-flow-pr-review -->', // Effective Flow's published review findings
];

// The merge gate writes none. Its human-comment guard reads no body at all — it excludes an item
// its own account wrote by that author record alone — and the one place that still compares a body
// is Phase 3's trigger idempotency, which matches the configured trigger text from this gate's own
// account for the current head and needs no marker for it either. A marker would only put the
// tool's name into a body posted under the operator's own account.
//
// The retired literal is read out of the marker contract that documents its removal instead of
// being pinned here. Pinning it is what let the token rot through the rename: a marker
// reintroduced today would be spelled after the tool's current name, and a token frozen on the
// old spelling cannot see it. The current name is therefore covered too, and the enumeration
// below makes the spelling question moot for anything shaped like a marker.
function gateMarkerToken() {
  const contract = source('src/shared/pr-review-comments.md');
  const [, retired] = contract.match(/former third marker \(`(effective-flow-[a-z0-9-]+)`\)/) ?? [];
  assert.ok(retired, 'the marker contract must still name the retired gate marker it removed');
  return new RegExp(`${retired}|effective-flow-merge-gate`);
}

// Every HTML marker a source stamps or reads, as that source spells it.
function markersIn(text) {
  return new Set(
    Array.from(text.matchAll(/<!-- (effective-flow-[a-z0-9-]+) -->/g), ([, name]) => name),
  );
}

test('the merge gate is exposed in the "Deliver changes" group', () => {
  assert.ok(
    existsSync(new URL('src/tools/merge-gate.md', repositoryRoot)),
    'the exposed merge gate needs its own tool source',
  );

  // `TOOL_GROUPS` cannot be imported: build.mjs runs the entire build on load. The group is
  // sliced instead, so a `merge-gate` entry that drifted into a neighboring intent group
  // cannot satisfy this — the duplicate case is already covered by build.mjs's own guard.
  // The gate belongs beside `commit` and `pr`: it drives an existing pull request to merge,
  // it produces no findings of its own, and grouping it under "Ensure quality" is what made
  // it read as a reviewer.
  //
  // Membership is not enough: the router renders a group's members in array order, and
  // `commit` → `pr` → `merge-gate` is the delivery chain in the order it is walked. A gate
  // listed first would present the group as "merge, then commit", which is the reading the
  // group move exists to remove. The whole sequence is therefore pinned.
  const deliver = section(source('build.mjs'), "title: 'Deliver changes',", '\n  {');
  assert.match(deliver, /tools: \['commit', 'pr', 'merge-gate'\]/);

  // And the group it left keeps only the tool that actually reviews.
  const quality = section(source('build.mjs'), "title: 'Ensure quality',", '\n  {');
  assert.match(quality, /tools: \[[^\]]*'review'[^\]]*\]/);
  assert.doesNotMatch(quality, /'merge-gate'/);
});

test('the two pull-request markers stay distinct and free of substring collisions', () => {
  // Distinctness alone is not enough. Every consumer decides idempotency by an exact string
  // match, so if one marker contained another, a check for the shorter one would also fire
  // on a comment carrying the longer one and the wrong consumer would treat the thread as
  // already handled.
  assert.equal(
    new Set(PULL_REQUEST_MARKERS).size,
    PULL_REQUEST_MARKERS.length,
    'the pull-request markers must be pairwise distinct',
  );

  // The comparison set is derived from the sources rather than listed, so a third marker
  // cannot be introduced with a colliding name either. Collecting it also keeps the pinned
  // literals honest: a rename in the sources drops the marker from `used` and fails here.
  const used = new Set();
  for (const directory of ['src/shared', 'src/tools', 'src/agents']) {
    const sources = readdirSync(new URL(`${directory}/`, repositoryRoot)).filter((entry) =>
      entry.endsWith('.md'),
    );
    assert.ok(sources.length > 0, `${directory} must contain sources to check`);
    for (const file of sources) {
      for (const [marker] of source(`${directory}/${file}`).matchAll(
        /<!-- effective-flow-[a-z0-9-]+ -->/g,
      )) {
        used.add(marker);
      }
    }
  }

  for (const marker of PULL_REQUEST_MARKERS) {
    assert.ok(used.has(marker), `pinned pull-request marker is used by no source: ${marker}`);
    for (const other of used) {
      if (other === marker) continue;
      assert.equal(other.includes(marker), false, `marker collision: ${other} contains ${marker}`);
      assert.equal(marker.includes(other), false, `marker collision: ${marker} contains ${other}`);
    }
  }
});

test("iterate excludes Effective Flow's own marked threads from the ones it classifies", () => {
  const classification = flat(
    section(source('src/tools/iterate.md'), '### Phase 2: Classification'),
  );

  // Both markers must sit in the exclusion prose, not merely somewhere in the phase: without
  // the exclusion an `iterate` round reads Effective Flow's own output back as third-party
  // input and implements it. The markers carry no regular-expression metacharacter, so they
  // go into the pattern as they are.
  for (const marker of PULL_REQUEST_MARKERS) {
    assert.match(
      classification,
      near('Exclude', marker, 600),
      `Phase 2 must exclude threads carrying ${marker}`,
    );
  }

  // The gate marker is deliberately absent — see "the merge gate writes no marker of its own",
  // which asserts that for the whole file rather than for this phase alone.
});

test('the merge gate writes no marker of its own', () => {
  // The gate used to mark its trigger comment and its thread replies. Both jobs are gone: the
  // guard recognizes every own write across runs by its author alone, Phase 3's idempotency check
  // recognizes the trigger comment by that author plus the configured trigger text for the current
  // head, and a marker in the raw body would announce which tool composed a comment that manual
  // mode posts under the operator's own account.
  const token = gateMarkerToken();
  assert.equal(
    PULL_REQUEST_MARKERS.some((marker) => token.test(marker)),
    false,
    'the gate marker must not be listed among the markers that are written',
  );

  // Its writer and its only reader. A mention left in either file is an instruction to write
  // a marker nobody may write, or a check for one nobody writes — the dead contract this
  // change removes. The historical note belongs in the marker contract in
  // `src/shared/pr-review-comments.md`, which is why that file is not scanned here.
  //
  // The named token catches the two spellings a reintroduction would plausibly use; the
  // enumeration below catches every other one, because it accepts no marker in these two files
  // beyond the two that are actually written. A third marker of any name — gate-flavored or
  // not — fails here rather than waiting for someone to guess its spelling.
  for (const file of ['src/tools/merge-gate.md', 'src/tools/iterate.md']) {
    assert.doesNotMatch(
      source(file),
      token,
      `${file} must neither write nor read the merge gate marker`,
    );
    for (const marker of markersIn(source(file))) {
      assert.ok(
        PULL_REQUEST_MARKERS.includes(`<!-- ${marker} -->`),
        `${file} names a marker outside the two that are written: ${marker}`,
      );
    }
  }
});

test('a marker counts only as a body’s leading line, and a reader must require that position', () => {
  // This rule used to be pinned through `merge-gate.md`, whose guard excluded an item by a marker
  // and therefore had to say where a marker counts. The guard reads no body any more, so those
  // pins left the gate with it — but the requirement did not become irrelevant, it only lost its
  // loudest reader. `iterate` still skips a thread carrying one of these markers, and its own
  // exclusion rule states no position, so this contract is the single place the requirement is
  // written down. Both providers prefix a quoted body with `>`, which means anyone who presses
  // quote-reply reproduces a marker inside a blockquote; a reader that accepts a marker found
  // anywhere therefore reads a third party's comment as Effective Flow's own output. The behaviour
  // side is covered in `test/remote-tracker.test.mjs` — the stamper puts the marker on the first
  // line and refuses to treat a quoted one as a stamp — and this is the prose half that keeps a
  // reader obliged to require it.
  const contract = flat(
    section(
      source('src/shared/pr-review-comments.md'),
      '### Idempotency via the Effective Flow markers',
    ),
  );

  // Where a marker counts, stated as an exclusive position rather than as a description of how the
  // stamper happens to write one.
  assert.match(
    contract,
    near('(?:leading line|first line|opens the body)', '(?:only that position|that position)', 250),
    'the marker contract must state that only the body’s leading line counts as a marker',
  );

  // And the obligation on the reading side, which is the half a writer-only rule leaves open: a
  // stamper that always prepends still lets a reader search the whole body.
  assert.match(
    contract,
    near('reader', '(?:require|only honou?rs?)[^.]{0,60}position', 300),
    'the marker contract must require the reader to demand that position, not merely the writer to produce it',
  );

  // With the reason, so the requirement survives an editor who reads it as a formatting detail.
  assert.match(
    contract,
    near('quote-repl', '(?:blockquote|no longer opens|`>`)', 300),
    'the position requirement must name the quote-reply that defeats a whole-body search',
  );
});

test('the merge gate evaluates bot authorship before it consults the identity lookup', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // The rules are an ordered evaluation, not a set of independent conditions.
  assert.match(phase1, /\border\b/i, 'Phase 1 must state that its rules are evaluated in order');

  // Anchored on the heading of each of the three rules rather than on a sentence inside it, so a
  // reworded rationale stays green while a reordered evaluation fails. The order is the whole
  // contract: bot authorship, then this run's own account, then the catch-all. Hoisting the
  // identity rule above the bot rule is the refactor this pins against, and appending the bot rule
  // after the catch-all would make it unreachable.
  ordered(
    phase1,
    '**The author is a bot**',
    "**The author is this run's own account**",
    'Everything else counts as human',
  );

  // This is the assertion that guards app mode. `viewer-read` maps to `gh api user`, which
  // can legitimately fail on an installation token, so the bot rule must be decided from
  // authorship alone. A later refactor that hoisted the identity lookup above it would break
  // the one mode that never needed an identity — and nothing else here would fail.
  assert.match(
    phase1,
    near(
      '(?:`mergeGate\\.bots`|`authorType`)',
      '(?:(?:not|never|no|without)[^.]{0,60}(?:identity|viewer-?read)|(?:identity|viewer-?read)[^.]{0,60}(?:not|never)\\b)',
      700,
    ),
    'the configured-bot rule must state that it does not consult the identity lookup',
  );
});

test('a bot-typed author is excluded before the catch-all counts it as human', () => {
  // What this test is, and what it is not. Phase 1's bot rule and its catch-all are textually
  // unchanged by the author normalization `pr-comments-read` performs, so every assertion below is
  // satisfied by
  // the rule as it stood before that change too. This is a forward regression guard on the rule,
  // never evidence of the behaviour change. The half that detects the change is the
  // unconfigured-bot arm of `pull-request comments normalize their author exactly as review threads
  // do` in `test/remote-tracker.test.mjs`: it fails on the old bare-string author, and nothing here
  // does.
  //
  // The two belong together because one contract is read from both ends. The normalizer decides
  // whether a top-level comment carries `authorType: bot`, and this rule decides what that costs: a
  // comment from a bot nobody configured — a CI, coverage, or dependency bot — is excluded at rule
  // 1 and never reaches the human-comment guard. A rewrite that made the exclusion reachable only
  // through `mergeGate.bots` would put every one of those comments back in front of the guard, and
  // the normalization test would stay green while it happened.
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // Both rules are picked by content, deliberately not by position. The numbered split cuts at every
  // " <n>. " a rule's own prose contains, so an index-based pick can land on a slice that is not a
  // rule at all and assert against the wrong prose.
  const rules = phase1.split(/(?=\s\d+\.\s)/);
  const botRule = rules.find((item) => /\*\*The author is a bot\*\*/.test(item));
  const catchAll = rules.find((item) => /Everything else counts as human/.test(item));
  assert.ok(botRule, 'Phase 1 must carry a rule about an item whose author is a bot');
  assert.ok(catchAll, 'Phase 1 must carry the catch-all that counts every other item as human');

  // The normalized record is what the rule reads, so it has to name the field and the value the
  // read produces. A rule phrased purely in terms of configuration could not consume the normalized
  // author at all.
  assert.match(
    botRule,
    /`authorType`[^.]{0,60}`bot`/i,
    'rule 1 must name the normalized field and the value it excludes on',
  );

  // And that value has to stand on its own. `mergeGate.bots` lists the reviewers a project asked
  // for; the bots that comment on a pull request without being listed are the majority, and they
  // are reachable only through the account class the provider states. If this half were phrased as
  // a condition on a configured entry, every unlisted bot would fall through to the catch-all.
  assert.match(
    botRule,
    near('`authorType`', '(?:alone|overlap|on its own|do(?:es)? not divide|independent)', 500),
    'the bot-typed case must stand on its own rather than only qualifying a configured login',
  );

  // Exclusion and stop are one statement. "Excluded" without "stop" leaves a later rule free to
  // count the same item again, and the whole section is built on stopping at the first match.
  assert.match(
    botRule,
    near('\\bexcluded\\b', '(?:evaluation stops|stops? there|stop(?:s)? at)', 300),
    'rule 1 must state both the exclusion and that evaluation stops there',
  );

  // Order is the rest of the contract: a bot rule written after the catch-all is unreachable.
  ordered(phase1, '**The author is a bot**', 'Everything else counts as human');

  // The catch-all's own boundary, stated positively so it survives a rewording. `unknown` is what
  // an author record carries when no field decided — the fail-safe direction, where an unproven
  // account counts as human and keeps the guard. It is the value this rule admits, and the reason
  // the rule above must be about a *proven* bot rather than an unrecognized one.
  assert.match(
    catchAll,
    near('`unknown`', 'counts as human', 300),
    'the catch-all must name `unknown` as the value it counts as human',
  );
});

// The identity rule of Phase 1, sliced out of the numbered evaluation. The slice isolates this rule
// from the OTHER rules: a condition bot authorship carries above it, or the counting surfaces
// below it, cannot satisfy a check about this one. It isolates nothing inside itself — two
// thousand characters of rule and rationale sit in here, so a few-hundred-character window opened
// on one sentence can still land in a paragraph further down. Where an assertion is about what the
// exclusion covers, it binds `exclusionSentence()` instead.
function identityRule(phase1) {
  const rule = phase1
    .split(/(?=\s\d+\.\s)/)
    .find((item) => /\*\*The author is this run's own account\*\*/.test(item));
  assert.ok(rule, 'Phase 1 must carry a rule excluding an item this run’s own account wrote');

  // The boundary the cross-rule isolation rests on. If the numbered split stopped cutting between
  // the rules, this slice would silently run on to the end of the evaluation and every window
  // below would widen with it — a loss that shows up as nothing failing anywhere.
  assert.doesNotMatch(
    rule,
    /Everything else counts as human/,
    'the identity slice must end before the catch-all, or every assertion on it may read a neighbouring rule',
  );
  return rule;
}

// The one sentence of that rule which states the exclusion. What the exclusion covers — the body,
// the surface, the resolution state — has to be read off this sentence rather than off the rule:
// the rule's own rationale says `on either surface` some nine hundred characters below, about what
// the change GIVES UP rather than about what the exclusion holds for, and a window wide enough to
// reach it is satisfied by prose that would survive deleting the coverage entirely.
function exclusionSentence(rule) {
  const sentence = rule.split(/(?<=\.)\s/).find((part) => /\*\*excluded\*\*/.test(part));
  assert.ok(
    sentence,
    'the identity rule must state in one sentence that a matching item is **excluded**',
  );
  return sentence;
}

test('the merge gate excludes every item its own account wrote', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));
  const rule = identityRule(phase1);

  // The rule is an identity comparison and nothing else: the login the identity operation returned,
  // against the login the item carries. Asserted as ONE window rather than as two independent
  // matches over a two-thousand-character slice — separately, a rule that named `viewer-read` only
  // in a rationale while comparing the item's login against something else satisfies both.
  assert.match(
    rule,
    near('viewer-?read', '`login`[^.]{0,80}(?:equals?|equal to|is the same as|identical)', 200),
    'the identity rule must compare the item’s login against the login viewer-read returned',
  );

  // And the comparison must EXCLUDE. Without this the rule can be inverted wholesale — "the item
  // counts: whatever its body says, whichever of the two surfaces…" — while every other assertion
  // in this file still passes. That mutation does not narrow the guard, it turns it inside out:
  // every own write would hold it and no gate run could ever merge.
  assert.match(
    rule,
    near('\\*\\*excluded\\*\\*', '`login`', 200),
    'the identity rule must state that the matching item is excluded, not that it counts',
  );

  const exclusion = exclusionSentence(rule);

  // No body is read, and that is a property of the exclusion itself rather than of the paragraph
  // around it. Pinned as an explicit dismissal of the body next to the word, so a rule that made
  // the body a condition again — "excluded when its body is also the configured trigger text" —
  // fails here even though it never says "marker" and never says "trigger text".
  assert.match(
    exclusion,
    /(?:whatever|regardless of|no matter (?:what|which))[^,;.]{0,40}\bbody\b/i,
    'the exclusion must dismiss what the item’s body says instead of making it a condition',
  );

  // Resolution appears only to be dismissed, and in that same sentence. Asserted positively rather
  // than as a bare absence of the word: the rule has to say that a resolved thread and an
  // unresolved one are excluded alike, or a later editor could reintroduce the condition as an
  // unstated assumption.
  assert.match(
    exclusion,
    near('`resolved`', '(?:whether or not|regardless|no matter|either way)', 200),
    'the identity rule must state that the thread’s resolution state is not a condition of it',
  );

  // The two conditions that used to sit beside authorship, pinned as absent. These are samples, not
  // the invariant: a body comparison can be reintroduced under any wording that avoids both
  // phrases, which is why the positive statement below is what actually carries the property.
  assert.doesNotMatch(
    rule,
    /<!-- effective-flow-[a-z0-9-]+ -->/,
    'the identity rule must name no marker: it decides on the author record alone',
  );
  assert.doesNotMatch(
    rule,
    /trigger text/i,
    'the identity rule must not make the configured trigger text a condition',
  );

  // The invariant itself, where the contract states it: step 3 of this phase says that no exclusion
  // rule reads a body at all. A positive claim about every rule survives rewording, and it is what
  // makes the two absences above meaningful rather than a blacklist of two spellings. Tied to what
  // the rules read INSTEAD, so "no exclusion rule reads a body" cannot be left standing beside a
  // rule that quietly does.
  assert.match(
    phase1,
    /no exclusion rule reads a body/i,
    'Phase 1 must state positively that no exclusion rule reads a body',
  );
  assert.match(
    phase1,
    near('no exclusion rule reads a body', '(?:author record|authorship)', 300),
    'the no-body invariant must name the author record as what the rules decide on instead',
  );

  // And the catch-all still follows it. An identity rule written after the catch-all is
  // unreachable, and the entire section is built on stopping at the first rule that matches.
  ordered(phase1, "**The author is this run's own account**", 'Everything else counts as human');
});

test('the merge gate excludes its own top-level summary comment by author alone', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));
  const rule = identityRule(phase1);

  // A top-level comment has no resolved state on either provider, so a summary comment from a
  // directly invoked `iterate` run used to fall through to the catch-all and block the merge
  // forever. It is now excluded by its author, and the rule has to say so: the summary comment is
  // the case that has no second condition available to it, which is why it is pinned by name.
  assert.match(
    rule,
    near('summary comment', 'iterate', 400),
    'the identity rule must name the delegated run’s summary comment among the writes it subsumes',
  );

  // Named among what the rule EXCLUDES, which is a second assertion rather than an alternation
  // beside the writer's name. `{{SKILL:iterate}}` stands in that sentence either way, so one
  // window accepting either token is satisfied by the writer alone — and "excluded by authorship
  // alone" could be rewritten to "counted by authorship alone" without failing anything.
  assert.match(
    rule,
    near('summary comment', '\\bexcluded\\b', 250),
    'the summary comment must be named among what the rule excludes, not merely among what it lists',
  );

  // By author alone. The marker that used to be the second condition is not merely optional here —
  // it is absent, and a rule that reintroduced it would exclude nothing in app mode, where the
  // gate's own account stamps no marker at all.
  assert.doesNotMatch(
    rule,
    /first line|leading line|opens the body/i,
    'no marker position may qualify the exclusion of this tool’s own top-level comment',
  );

  // Neither surface is treated differently. The exclusion holds for a top-level comment exactly as
  // it does for an item inside a review thread, which is what removes the deadlock rather than
  // moving it to the other surface.
  //
  // Bound to the sentence that states the exclusion, deliberately not to the rule: the rule's
  // rationale says `on either surface` about the objection the operator no longer holds the guard
  // with, which is a claim about what the change gives up and stays true of a rule narrowed to one
  // surface. Matched against the rule, this assertion passed both on a rule that had dropped the
  // surface clause and on one that exempted review threads outright — the second being exactly the
  // regression the retired thread-surface rule used to catch.
  assert.match(
    exclusionSentence(rule),
    near('(?:surfaces?|top-level)', '(?:whichever|either|both|alike)', 200),
    'the exclusion must hold on both comment surfaces, not on one of them',
  );
});

test('Phase 6 reports every item the identity rule excluded that would otherwise have counted', () => {
  // The compensating control for the loosening, and the only one there is. Rule 2 withdraws a
  // protection — an objection the operator types themselves no longer holds the guard — and the
  // source accepts that withdrawal on the ground that it is not silent: Phase 6 names every item
  // the rule excluded that would otherwise have counted. Delete that bullet and the loosening
  // becomes invisible, with nothing else in the suite noticing. The disclosure is the condition
  // the change was accepted under, so it is guarded like one.
  //
  // Sliced to Phase 6 rather than to the rest of the file: "Edge cases" below it discusses the same
  // exclusions in the same words, so a deleted summary item would otherwise be satisfied by an edge
  // case that reports nothing to anyone.
  const phase6 = flat(section(source('src/tools/merge-gate.md'), '### Phase 6', '\n## '));
  const item = phase6
    .split(/(?=\s-\s)/)
    .find((bullet) => /\bexcluded\b/i.test(bullet) && /\bcounted\b/i.test(bullet));
  assert.ok(
    item,
    'Phase 6 must report every item an exclusion rule removed that would otherwise have counted',
  );

  // Attributed to the rule that does the excluding. A report phrased over "own comments" in general
  // would also cover items rule 1 excluded, which were never in front of the guard and whose report
  // would say nothing about the loosening.
  assert.match(
    item,
    near('identity rule', '\\bexcluded\\b', 200),
    'the reported items must be attributed to the identity rule that excluded them',
  );

  // Both surfaces, named together in what the bullet reports. The top-level comment is the case
  // with no other report anywhere — Phase 4's unmatched-thread report reaches no top-level comment
  // and fires only for a non-empty `mergeGate.bots` — so a report narrowed to threads leaves the
  // loudest case silent. The window is short on purpose: the bullet mentions the top-level comment
  // again a sentence later, to say that this is the only place it is reported at all, and a window
  // wide enough to reach that mention is satisfied by a bullet whose enumeration no longer covers
  // it.
  assert.match(
    item,
    near('review threads?', 'top-level', 80),
    'the report must enumerate both surfaces, not only the review threads',
  );

  // And it reads no body, like the rule it reports on. A report that started reading bodies to
  // spare the reader this gate's own trigger comment would reintroduce the body read the guard
  // removed, one phase further on.
  assert.match(
    item,
    near('reads?', 'no body', 120),
    'the report must state that it reads no body, exactly as the rule it reports on does not',
  );
});

test('a deferred bot finding is named in chat instead of answered in its thread', () => {
  const mergeGate = flat(source('src/tools/merge-gate.md'));

  // The gate's own writes are what broke the previous contract across runs: an unresolved
  // reply left behind is read as a human comment by the next run. The report therefore leaves
  // the pull request entirely.
  assert.match(
    mergeGate,
    near(
      '\\bchat\\b',
      '(?:writes? nothing|no (?:thread )?repl|not repl|never repl|leaves? [^.]{0,40}untouched)',
      400,
    ),
    'a finding this run does not implement must be reported in chat and get no thread reply',
  );

  // Resolving such a thread would signal "handled" for a finding nobody handled, so the gate
  // resolves nothing of its own either.
  assert.match(
    mergeGate,
    /(?:resolves? nothing|no thread resolution|resolution of any kind|nothing[^.]{0,40}resolv)/i,
    'the gate must resolve no thread of its own',
  );
});

test('an unprovable identity activates the merge gate guard and binds only the identity rule', () => {
  const phase1 = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  // Fail-closed direction: an identity the gate cannot establish makes the item count and the
  // guard activate, never the reverse. The reverse reading is the one that merges a pull
  // request under an open human comment.
  assert.match(
    phase1,
    near('(?:fails? clos|fail-clos|failing clos)', '(?:viewer-?read|identity|login)', 500),
    'Phase 1 must tie the fail-closed rule to the identity it could not establish',
  );
  assert.match(
    phase1,
    near(
      '(?:viewer-?read|authenticated login)',
      '(?:guard activates|activates? the guard|guard (?:is|becomes|stays) (?:\\*\\*)?activ)',
      500,
    ),
    'an unprovable identity must activate the guard rather than clear it',
  );

  // And it binds that rule alone: the rules decided from authorship keep working without an
  // identity, which is what keeps app mode alive on an installation token. Asserted as the
  // carve-out for those rules rather than as a bare "only" near "fail closed" — Phase 1 uses
  // that phrase in more than one place, so proximity alone would pass on a global rule.
  assert.match(
    phase1,
    near(
      '(?:rules? \\d|bot rule|resolved-thread rule|authorship rules?)',
      '(?:untouched|unaffected|keeps? working|never depends?|does not depend|need no identity|no identity)',
      300,
    ),
    'the rules that need no identity must stay exempt from the fail-closed rule',
  );
});

// The literal line a caller announces to suppress `iterate`'s per-round summary comment. Read
// out of the parsing side instead of pinned here, so a rename both sides make together stays
// green while a rename only one side makes fails — which is the failure that matters: the
// delegated run aborts on a switch it cannot parse.
function summaryCommentSwitch() {
  const phase0 = section(source('src/tools/iterate.md'), '### Phase 0');
  const [, literal] = phase0.match(/`([^`\n]*summary[^`\n]*:[^`\n]+)`/i) ?? [];
  assert.ok(literal, 'iterate.md Phase 0 must announce a literal summary-comment switch');
  return literal;
}

test('iterate lets a caller suppress its summary comment and posts it by default', () => {
  const iterate = source('src/tools/iterate.md');

  // Phase 0 owns the caller contract: a switch the parsing phase does not know is a switch the
  // run ignores. Its list item is sliced out so the item filter — a neighbouring, almost
  // identically shaped contract with its own `ABORT` and its own additive invariant — cannot
  // satisfy a single assertion below.
  // Selected by the item's own title, not by the bare word "summary": the delimiter item above it
  // names all four control lines, so a first match on "summary" would retarget every assertion
  // below onto the item that merely lists the switch.
  const suppression = flat(
    section(iterate, '### Phase 0')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => /summary-comment suppression/i.test(item)) ?? '',
  );
  assert.ok(suppression, 'Phase 0 must parse an optional summary-comment suppression');
  assert.ok(
    suppression.includes(summaryCommentSwitch()),
    'the parsed literal must sit in the Phase 0 item that documents the switch',
  );

  // A caller contract, not user free text, and optional.
  assert.match(suppression, /optional/i);
  assert.match(suppression, /caller|delegat/i);

  // Additive by construction: an invocation that announces nothing still posts its one summary
  // comment. Without that invariant every interactive `iterate` run silently loses its summary.
  assert.match(
    suppression,
    /(?:without|unset|absent|not announced|no such line)/i,
    'the unannounced case must be named',
  );
  assert.match(
    suppression,
    /(?:current behaviou?r|as before|unchanged|additive|still posts?)/i,
    'an unannounced switch must keep the current behavior',
  );

  // Fail closed on a switch it cannot parse. Continuing as an unsuppressed run is the one
  // resolution that must not happen: the caller suppresses for grounds the merge gate's delegation
  // contract states — the noise of one comment per round, the guarantee that a gate-initiated run
  // leaves at most one item of its own, and a gate running under a different account than the
  // delegated run, which does read that summary as foreign.
  assert.match(suppression, /ABORT/, 'an unparseable switch must abort');
  assert.match(suppression, near('(?:never|not)', 'unsuppress', 150));

  // Suppression removes the summary comment only. The thread replies are how a delegated round
  // answers the reviewer at all and their resolution is what closes the thread, so widening the
  // switch to them would silence the round's actual work rather than its noise.
  assert.match(
    suppression,
    near('(?:repl(?:y|ies)|resolution)', '(?:unaffected|unchanged|still|only)', 300),
    'suppression must be limited to the summary comment',
  );

  // The write site honours it. A switch parsed but not honoured is worse than none: the caller
  // reports content it believes was not posted, while the comment sits on the pull request.
  const delivery = flat(section(iterate, '### Phase 5'));
  assert.ok(
    delivery.includes(summaryCommentSwitch()),
    'the summary-posting step must name the switch it honours',
  );
  assert.match(
    delivery,
    near('caller', '(?:hand|report|back)', 300),
    'the suppressed content must go back to the caller instead of being dropped',
  );
});

test('the merge gate announces the exact suppression literal iterate parses', () => {
  const contract = section(source('src/tools/merge-gate.md'), '## Delegation contract', '\n## ');

  // The suppression belongs in the delegation contract rather than in one phase: `iterate` posts
  // one summary comment per delegated round, so an unsuppressed run leaves up to
  // `mergeGate.maxRounds` comments on someone else's pull request while Phase 6 reports the same
  // content in chat anyway. How this run's own Phase 4 read would classify such a comment is
  // deliberately not among the grounds — under the same account the guard's identity rule excludes
  // it — but a gate running under a *different* account than the delegated run does read it as
  // foreign, and the obligation is not conditional on the mode.
  //
  // Sliced to its own list item, because the neighbouring item-filter item calls itself
  // mandatory in every delegation too: matched against the whole section, the second assertion
  // would keep passing after the suppression item was deleted.
  const item = flat(contract.split(/\n-\s/).find((entry) => /summary/i.test(entry)) ?? '');
  assert.ok(item, 'the delegation contract must carry the summary-comment suppression');
  assert.ok(
    item.includes(summaryCommentSwitch()),
    'every delegation must announce the literal suppression switch that `iterate` parses',
  );
  assert.match(
    item,
    /mandatory|every delegation|never delegate without/i,
    'the suppression must bind every delegation, not an unspecified subset',
  );
});

test('every claim that the trigger comment is the only own write names what makes it true', () => {
  const mergeGate = flat(source('src/tools/merge-gate.md'));

  // The claim is only true together with the suppression of the delegated run's summary
  // comment, so a sentence that makes it without naming that qualifier is the contradiction
  // this test exists to catch. A file that makes no such claim passes vacuously — a valid
  // resolution too, and the suppression itself is pinned by the delegation-contract test.
  //
  // Restricted to claims that mention the trigger comment. Without that, "This is the only kind
  // of Git write this workflow performs" would demand a summary-comment qualifier it has no
  // business carrying.
  const claims = mergeGate
    .split(/(?<=\.)\s+/)
    .filter(
      (sentence) =>
        /\bonly\b/i.test(sentence) && /\bwrit/i.test(sentence) && /\btrigger\b/i.test(sentence),
    );

  for (const claim of claims) {
    const start = mergeGate.indexOf(claim);
    const window = mergeGate.slice(Math.max(0, start - 400), start + claim.length + 400);
    assert.match(
      window,
      /suppress|no summary|without[^.]{0,40}summary/i,
      `a claim about the gate's only own write must name the summary suppression: ${claim}`,
    );
  }
});

test('only the bot threads this run implemented can block the merge', () => {
  const preconditions = flat(section(source('src/tools/merge-gate.md'), '### Phase 4'));

  // Unscoped, this precondition was unsatisfiable by construction: a deferred or rejected
  // finding gets no reply and no resolution by design, so "every bot thread is answered or
  // resolved" could never become true once one finding was deferred — the gate would block on
  // its own rule. The numbered conditions are semicolon-separated, so the bounded window here
  // cannot leak into a neighbouring condition.
  assert.match(
    preconditions,
    /(?:implement[a-z]*[^;]{0,250}(?:answered|resolved)|(?:answered|resolved)[^;]{0,250}implement)/i,
    'the answered-or-resolved condition must be scoped to the findings this run implemented',
  );

  // And the other half of the scoping: a finding the run did not implement is reported, not
  // turned into a blocker.
  assert.match(
    preconditions,
    near(
      '(?:deferred|rejected|not implement)',
      '(?:not\\*{0,2}\\s*block|never blocks|no blocker|not a blocker)',
      400,
    ),
    'a deferred or rejected finding must be stated as not blocking the merge',
  );
  assert.match(
    preconditions,
    near('(?:deferred|rejected)', '(?:chat|summary)', 400),
    'a deferred finding must be named in the chat summary instead',
  );
});

test('a reviewer thread no round assessed blocks the merge in a condition of its own', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase4 = section(gate, '### Phase 4');

  // The window: a reviewer's check goes terminal before the reviewer's last thread is published,
  // so Phase 3 delegates only the thread IDs it could see and the thread that lands afterwards was
  // assessed by nobody. Condition 6 cannot catch it — that one asks about the findings this run
  // *implemented* — so without a condition of its own the gate merges a pull request carrying a
  // reviewer finding no run ever read. `src/shared/review-bot-state.md` names this window and
  // assigns closing it to the consumer; these assertions are that consumer discharging it.
  //
  // Sliced per numbered condition, because condition 6 already carries the "deferred or rejected"
  // vocabulary: matched against the whole Phase-4 section, the assertions below would stay green
  // with the new condition deleted outright.
  const conditions = phase4.split(/(?=\n\d+\.\s)/).slice(1);
  // Condition 7 is selected by its **ordinal**, never by first match on "assessed". Condition 10
  // carries that word too — it is the same protection one surface over, for a changes-requested
  // review nobody assessed — so a first-match selector would retarget this whole battery the moment
  // the two are reordered, and condition 7 would go unchecked while every assertion stayed green.
  const ordinal = (number) =>
    conditions.findIndex((item) => item.trimStart().startsWith(`${number}.`));
  const unassessedIndex = ordinal(7);
  const implementedIndex = conditions.findIndex((item) =>
    /implement[a-z]*[\s\S]{0,160}(?:answered|resolved)/i.test(item),
  );
  assert.notEqual(unassessedIndex, -1, 'Phase 4 must carry a condition 7');
  assert.match(
    conditions[unassessedIndex],
    /assessed/i,
    'condition 7 must remain the never-assessed precondition',
  );
  assert.notEqual(implementedIndex, -1, 'Phase 4 must keep its implemented-and-answered condition');

  // Two conditions, never one. Folding them back together is the realistic regression — they read
  // as near-duplicates — and each direction of that fold reintroduces a defect: widening
  // condition 6 demands a thread reply for a deferred finding, which nothing may write and no run
  // could satisfy, while narrowing this one to implemented findings merges past the unread thread.
  assert.notEqual(
    unassessedIndex,
    implementedIndex,
    'the never-assessed rule must be its own condition, not folded into the implemented one',
  );

  const unassessed = flat(conditions[unassessedIndex]);

  // What "assessed" covers has to be enumerated, or the condition is unexecutable: a deferred or
  // rejected finding is an outcome this run reached and must not block a second time.
  for (const outcome of ['implement', 'defer', 'reject']) {
    assert.match(
      unassessed,
      new RegExp(outcome, 'i'),
      `the condition must name ${outcome} as an outcome that counts as assessed`,
    );
  }
  assert.match(
    unassessed,
    near('(?:nobody|no round|neither)', 'block', 300),
    'a thread nobody reached an outcome about must be stated to block the merge',
  );

  // The distinction itself is load-bearing prose, not decoration: it is what stops the next reader
  // from simplifying the two conditions back into one.
  assert.match(
    unassessed,
    near('condition 6', '(?:folded|widened|different question|assessed at all)', 400),
    'the condition must state how it differs from the implemented-and-answered one',
  );

  // Blocking alone would end the run; the agreed behaviour is to pull the round back and let the
  // late threads be assessed. Bounded by the same counter as every other round, or a reviewer that
  // keeps publishing holds the run open forever.
  assert.match(
    unassessed,
    near('Phase 3', 'consumes a round', 300),
    'the return to Phase 3 must consume a round',
  );
  assert.match(
    unassessed,
    near('`mergeGate\\.maxRounds`', '(?:never with a merge|never a merge)', 300),
    'an exhausted round budget must end the run with a report, never with a merge',
  );

  // And the counter has to know about it. "Consumes a round" is only true if round accounting
  // counts an event that begins no Phase-2 round — the pre-existing rule counts Phase-2 starts
  // alone, so a Phase-4 return would otherwise be free and unbounded.
  const accounting = flat(section(gate, '#### Round accounting', '\n### '));
  assert.match(
    accounting,
    near('(?:Phase[- ]4|condition 7)', '(?:by one more|consumes a round)', 400),
    'round accounting must count the Phase-4 return, which begins no Phase-2 round of its own',
  );

  // Two conditions return into Phase 3 now, so the counting rule has to be stated over the return
  // itself. Bound to one condition by name — "the single exception condition 7 states for itself" —
  // the second returning condition is unbounded the day it is added, which is the regression this
  // pair of assertions closes at both sites.
  const preamble = flat(phase4.slice(0, phase4.search(/\n\d+\.\s/)));
  assert.match(
    preamble,
    near('return', 'condition 10', 400),
    'the Phase-4 preamble must name both returning conditions, not condition 7 alone',
  );
  for (const [label, text] of [
    ['round accounting', accounting],
    ['the Phase-4 preamble', preamble],
  ]) {
    assert.match(
      text,
      near(
        '(?:at most\\s+\\*{0,2}one\\*{0,2}|one)\\s+return',
        '(?:one round|exactly one round)',
        400,
      ),
      `${label} must bind one evaluation to at most one return consuming exactly one round`,
    );
  }

  // Fail closed, like every other precondition here: an assessment the read cannot establish is
  // not an assessment.
  assert.match(
    unassessed,
    near('(?:cannot establish|unprovable|unreadable)', '(?:unassessed|blocks)', 300),
    'an assessment the fresh read cannot establish must block rather than pass',
  );

  // The shared contract states the obligation; a contract whose consumer never discharges it is
  // the defect this closes. Both ends are asserted so neither can drift away from the other.
  const window = flat(
    section(source('src/shared/review-bot-state.md'), '### This narrows the window'),
  );
  assert.match(
    window,
    near('\\{\\{SKILL:merge-gate\\}\\}', '(?:Phase-4|Phase 4|precondition)', 300),
    'the shared contract must name where its consumer closes the window it leaves open',
  );
});

test('the trigger idempotency check rests on evidence the forge actually exposes', () => {
  const phase3 = flat(section(source('src/tools/merge-gate.md'), '### Phase 3'));
  const IDEMPOTENCY = '(?:idempot|second trigger|already been posted|already posted)';

  // The evidence is authorship plus the exact body plus the timestamps — all normalized
  // fields. The earlier form asked for "the configured bot login", a value no configuration
  // holds: a `mergeGate.bots` entry is a reviewer the gate waits for, never the account it
  // posts as. App mode therefore had no idempotency at all and re-triggered on every run.
  assert.match(phase3, near(IDEMPOTENCY, 'trigger text', 500), 'the body is the trigger text');
  assert.match(
    phase3,
    near(IDEMPOTENCY, '(?:`createdAt`|`headCommittedAt`)', 700),
    'the timestamps decide whether the trigger belongs to the current head',
  );
  assert.match(
    phase3,
    near('app mode', '`authorType`', 400),
    'app mode must establish its own authorship through the normalized author type',
  );
  assert.match(
    phase3,
    near('manual mode', 'viewer-?read', 400),
    'manual mode must establish its own authorship through the authenticated login',
  );
  assert.match(
    phase3,
    near('`mergeGate\\.bots`', '(?:never the author|cannot exist|no configuration names)', 500),
    'the configured reviewer list must be stated not to name the account the gate posts as',
  );

  // Unprovable evidence posts the trigger again rather than suppressing it: a redundant
  // mention costs one bot run, a wrongly suppressed one costs the merge.
  assert.match(
    phase3,
    near('(?:absent|cannot be established|unprovable)', '(?:not yet posted|post it)', 400),
    'unprovable idempotency evidence must resolve towards posting, not towards suppressing',
  );
});

test('merge-gate states its no-commit/no-push boundary and delegates every other change to iterate', () => {
  const mergeGate = flat(source('src/tools/merge-gate.md'));

  // Both prohibitions must sit close to the stated boundary, so a later edit that keeps
  // "no commit" but drops "no push" (or vice versa) cannot pass silently.
  assert.match(mergeGate, /performs no `git commit` and no push of its own/);

  // The boundary sanctions **two** kinds of write since the gate repairs a conflict with the base
  // itself, and both are the same base-into-head merge. Pinned as four separate facts inside the
  // boundary section rather than as one sentence, so rewording the paragraph stays green while
  // weakening any single guarantee fails: the count, the mechanism of the clean kind, the
  // mechanism of the conflicted kind, and the per-occurrence bound. Emphasis is stripped, because
  // where the bold markers sit is editorial.
  const boundary = prose(
    section(source('src/tools/merge-gate.md'), '## Git write boundary', '\n## '),
  );
  assert.match(
    boundary,
    near('two', 'sanctioned kinds', 40),
    'the Git write boundary must keep counting its sanctioned kinds, and the count must stay two. ' +
      'A third kind, or an open-ended phrasing that stops counting them, is what this pin exists ' +
      'to catch — the wording around the number is free',
  );
  assert.match(
    boundary,
    near('same operation', 'same branch', 60),
    'both kinds must stay the same operation on the same branch: the conflicted kind is the clean ' +
      'kind with its conflicts resolved, never a second mechanism',
  );

  // The clean kind, pinned as three short facts rather than as one 13-word sentence: which merge,
  // what it produces, and how it lands. Rewording it stays green; dropping any of the three does not.
  assert.match(
    boundary,
    near('clean', '`origin/<base>`', 120),
    'the first kind must stay `origin/<base>` merged into the head branch',
  );
  assert.match(
    boundary,
    near('`origin/<base>`', 'merge commit', 200),
    'the first kind must land as a merge commit, never as a replay of the head branch',
  );
  assert.match(
    boundary,
    near('merge commit', '(?:normally|normal push)', 200),
    'the first kind must be pushed normally — a forced push is not a sanctioned Git write',
  );
  assert.match(
    boundary,
    near('conflict-resolving', 'base-into-head merge', 120),
    'the second kind must stay the *same* base-into-head merge with its conflicts resolved',
  );
  assert.match(
    boundary,
    near('(?:each|every) occurrence', 'one merge commit', 200),
    'the per-occurrence bound must survive: exactly one merge commit per occurrence',
  );
  assert.match(
    boundary,
    near('(?:each|every) occurrence', 'one normal push', 250),
    'and exactly one normal push per occurrence, so neither kind becomes a licence for an ' +
      'unbounded number of writes',
  );

  // Direction, not adjacency. Every `near()` above proves only that the two kinds are described;
  // a boundary rewritten to resolve the conflict "on a rebase of the head branch onto
  // `origin/<base>`" and to "force-push the result" keeps all of them green. The forbidden
  // mechanisms are therefore pinned negatively too. Every legitimate mention in this section is
  // either negated (`no rebase`, `no force-push`) or a fenced configuration value — the `` `rebase` ``
  // of the `delivery.mergeMethod` list, which is how the forge integrates the PR, not a rewrite.
  assert.doesNotMatch(
    boundary,
    /(?<!\bno )(?<!\bnot )(?<!\bnever )(?<!`)(?:rebase|force-push|force push|cherry-pick)/i,
    'the Git write boundary must never permit a rebase, a force-push, or a cherry-pick: every ' +
      'mention of one has to be a prohibition (`no rebase`) or a fenced `delivery.mergeMethod` value',
  );

  // And the rule the two kinds rest on, asserted separately: deleting the whole no-rewriting
  // paragraph is a different edit from rewording one kind's mechanism, and neither may pass.
  assert.match(
    boundary,
    near('never rewrite', "head branch's history", 60),
    "the head branch's history must never be rewritten — here or in a delegation",
  );
  assert.match(
    boundary,
    near('never rewrite', '(?:no rebase|no force-push)', 150),
    'the no-rewriting rule must keep naming the operations it forbids, so a rewrite performed ' +
      'under another name stays covered',
  );
  assert.match(
    boundary,
    near('(?:need|needs|needed) a rewrite', '(?:reported|never performed)', 150),
    'a resolution that would need a history rewrite to succeed must be reported, never performed',
  );

  // The pre-capability sentence this workflow replaced. Re-inserting it would leave the file
  // claiming both that a conflict stops the run and that the gate repairs it.
  assert.doesNotMatch(
    source('src/tools/merge-gate.md'),
    /Not repaired automatically/i,
    'the sentence "Not repaired automatically: stop, report the conflict, and do not merge" must ' +
      'stay removed: the gate now repairs a conflict with the base',
  );

  // Two further contracts, each asserted on meaning rather than on a sentence, so that rewording
  // the paragraph cannot fail the suite while weakening it still does.
  //
  // (a) The two kinds are exhaustive: nothing else may be committed or pushed.
  assert.match(
    mergeGate,
    /(complete set of Git writes|no Git write of any other kind|no other (?:Git )?write)/,
  );
  // (b) Each is a KIND of write, not a one-time allowance. A branch can fall behind again in a
  //     later round, and a "single write" reading would refuse that second, legitimate repair.
  assert.match(mergeGate, /(a \*\*kind\*\* of write|every Phase-2 round|each occurrence)/);
  assert.match(mergeGate, /Every other code change is delegated to `\{\{SKILL:iterate\}\}`/);
});

test('the conflict resolver aborts on uncertainty and writes nothing the gate owns', () => {
  const resolverSource = source('src/agents/merge-conflict-resolver.md');

  // Both halves are sliced to the section that owns them rather than run over the whole file.
  // Unscoped, `contradictory` is also a word in the risk-classification list — 343 characters from
  // the nearest `ABORT` against a 300-character budget, 43 characters of margin — and
  // `near('uncertain', '`ABORT`')` is satisfied by the "Abort on uncertainty" heading itself.
  const abort = prose(section(resolverSource, '## Abort on uncertainty', '\n## '));

  // Abort-on-uncertainty is the default of this role, not one option beside guessing. A wrong
  // resolution is invisible in the diff of a merge commit and survives every later review, while
  // an ABORT costs one round and leaves the decision with a human.
  assert.match(
    abort,
    near('(?:contradictory|cannot be reconciled)', 'return `ABORT`', 250),
    'the resolver must RETURN ABORT where the two sides make contradictory functional statements ' +
      'that cannot be reconciled without a new product or architecture decision. The imperative is ' +
      'the contract: a rule that merely mentions ABORT beside the trigger states no obligation',
  );
  assert.doesNotMatch(
    abort,
    /\b(?:prefer|prefers|preferably|where possible|unless|usually|generally|normally)\b[^.]{0,120}`ABORT`|`ABORT`[^.]{0,120}\b(?:prefer|prefers|preferably|where possible|unless|usually|generally|normally)\b/i,
    'the abort must stay unhedged. "Prefer `ABORT` — but where one side is clearly the newer ' +
      'intent, resolve toward it" is precisely the weakening that turns a fail-closed default into ' +
      'a judgment call, and it satisfies every proximity pin above',
  );
  assert.match(
    abort,
    near('uncertainty resolves', '`ABORT`', 60),
    'uncertainty itself must resolve to ABORT, not to the best available reading',
  );
  assert.match(
    abort,
    near('`ABORT`', 'never to a guess', 80),
    'the ABORT must be stated as the alternative to guessing — an "assess it as well as you can" ' +
      'phrasing without that direction is exactly the weakening this pins',
  );
  assert.match(
    abort,
    near('validation that executed', '`ABORT`', 150),
    'a validation that executed no check must be an ABORT too: a resolution nobody could check is ' +
      'not a verified resolution, and an empty evidence list is never an assumed pass',
  );

  // The commit, the push and the lifecycle stay with the gate. A commit written here races the
  // run that is waiting for the report, and a blanket `git add` sweeps in precisely the
  // unreported change the gate reconciles against the per-file record.
  //
  // Scoped to the list that owns the bans, and pinned as the phrase rather than as the bare word:
  // `never` occurs sixteen times in this file, so an unscoped proximity window reaches out of one
  // bullet's ban into the next bullet's `never` and keeps "prefer staging by explicit path over
  // `git add .`" green — a rewrite that repeals the ban while keeping every token it named.
  const bans = prose(section(resolverSource, '**What you never do**', '\n## '));
  for (const banned of [
    'git commit',
    'git merge --continue',
    'git push',
    'git merge --abort',
    'git add \\.',
    'git add -A',
    'git commit -a',
  ]) {
    const literal = banned.replaceAll('\\', '');
    assert.match(
      bans,
      new RegExp(`never \`${banned}\``),
      `the resolver must forbid \`${literal}\` in so many words. The gate owns the commit, the ` +
        'push and the abort; blanket staging would stage a file the per-file record never names, ' +
        'and the gate would commit an unaudited change',
    );
  }
  for (const banned of ['rebase', 'squash', 'force-push']) {
    assert.match(
      bans,
      new RegExp(`never ${banned}`),
      `the resolver must forbid ${banned} on its own side of the contract too. The gate's Git ` +
        'write boundary states the same rule, but a worker that only inherits it by implication ' +
        'is a worker whose own source permits the rewrite',
    );
  }
  assert.match(bans, /never `commit --amend`/, 'the resolver must forbid `commit --amend`');
  assert.match(
    bans,
    near('merging forward', 'not at all', 80),
    'the direction must stay stated: a conflict is resolved by merging forward or not at all',
  );
  assert.match(
    bans,
    near('stage every file', 'explicit path', 150),
    'staging must stay per explicit path, so the index holds exactly the set the report names',
  );
});

test('the resolved tree is verified independently before the gate commits and pushes it', () => {
  const gate = source('src/tools/merge-gate.md');
  const contract = prose(section(gate, '## Conflict-resolution delegation contract', '\n## '));

  // The worker validating its own resolution is one layer; `code-validator` is the second, and it
  // is the one the producing role did not run. Dropping it would leave the run's only pre-push
  // check in the hands of the role whose work is being checked.
  assert.match(
    contract,
    near(
      '\\{\\{AGENT:code-validator\\}\\}',
      '(?:before anything is committed|uncommitted|before it commits)',
      400,
    ),
    'the delegation contract must hand the resolved but uncommitted tree to code-validator before ' +
      'anything is committed',
  );
  assert.match(
    contract,
    near('(?:failing verdict|either role)', '`ABORT`', 300),
    'a failing verdict from either role must be treated as ABORT — the two roles disagreeing is ' +
      'not a tie for the gate to break in favour of the merge',
  );

  // Modality, not presence. Every proximity pin above stays green on a contract that says the tree
  // "**may** be handed" to the validator and that "that step is **skipped**" — a hand-off nobody
  // is obliged to perform, which is the whole pre-push safety net made optional. The imperative is
  // pinned positively, and the hedges that would repeal it negatively.
  assert.match(
    contract,
    near('\\bHand\\b', '\\{\\{AGENT:code-validator\\}\\}', 80),
    'the hand-off to code-validator must stay an imperative instruction, not a described option',
  );
  assert.doesNotMatch(
    contract,
    /\b(?:may|might|optional|optionally)\b[^.]{0,150}\{\{AGENT:code-validator\}\}|\{\{AGENT:code-validator\}\}[^.]{0,150}\b(?:may|might|optional|optionally|is skipped|can be skipped)\b/i,
    'the independent verification must stay mandatory. A hedged "may be handed to code-validator", ' +
      'or a branch in which "that step is skipped", leaves this run\'s only pre-push check with ' +
      'the very role whose work is being checked',
  );
  assert.match(
    contract,
    near('exactly this order', '(?:reconcile|verify independently)', 300),
    'the two pre-commit steps must stay one mandatory ordered sequence rather than a menu of ' +
      'things the gate could do before committing',
  );

  // And the order is load-bearing rather than merely stated: resolve, verify, only then commit
  // and push. A verification that happens after the push verifies nothing that can still be
  // stopped.
  const step = section(gate, '#### Resolving a conflict with the base', '\n#### ');
  ordered(step, '{{AGENT:merge-conflict-resolver}}', '{{AGENT:code-validator}}', 'Commit and push');
});

test('the human-comment guard and the report mode both leave the conflict resolution running', () => {
  const gate = source('src/tools/merge-gate.md');

  // The guard blocks what a reviewer is negotiating, not an objective defect of the branch. The
  // conflict repair sits beside the CI repair for exactly that reason: dropping its bullet would
  // silently make an actively discussed pull request unrepairable again, while the branch it
  // conflicts with keeps moving.
  //
  // Asserted as direction rather than as adjacency. `near('conflict resolution', 'permitted')` is
  // co-occurrence, and co-occurrence is equally true of "the conflict resolution **is not
  // permitted**" — a source that stops the resolution, under a test whose name says it keeps
  // running. The predicate is pinned in the order it has to read, and its inversion is excluded.
  const guard = prose(section(gate, '#### Human-comment guard', '\n#### '));
  assert.match(
    guard,
    /conflict resolution stays permitted/i,
    'the guard bullet list must name the conflict resolution among the actions that stay ' +
      'permitted while the guard is active',
  );
  assert.match(
    guard,
    /CI repair stays permitted/i,
    'the CI repair must stay permitted beside it — the conflict bullet borrows its reason and ' +
      'reads as an unexplained exception on its own',
  );
  assert.doesNotMatch(
    guard,
    /conflict resolution[^.]{0,60}\b(?:not|never|is blocked|is withheld|is forbidden)\b|\b(?:no|not|never)\b[^.]{0,40}conflict resolution/i,
    'the guard must never be rewritten to block the conflict resolution: a branch whose base keeps ' +
      'moving would become unrepairable for as long as a human comment stays open',
  );
  assert.match(
    guard,
    near('resolution runs', 'merge does not', 60),
    'the guard bullet must keep stating which of the two it lets through: the resolution runs, ' +
      'the merge does not',
  );
  assert.match(
    guard,
    near('no merge', 'review-driven implementation', 400),
    'what the guard keeps blocking must stay stated in the same list: the review-driven ' +
      'implementation and the merge',
  );

  // `report` withholds the Phase-5 merge and nothing else. A second exception for the conflict
  // resolution would make a report run report the same conflict forever — the very state the
  // operator invoked the gate to clear — so the source accepts the one write and says so instead.
  //
  // Sliced to the phase that resolves the completion mode rather than run over the whole 1180-line
  // file, and again pinned as direction: `near('conflict resolution', 'not withhold')` matches "the
  // conflict resolution **is withheld** with the merge" exactly as well as the rule it is meant to
  // protect.
  const completion = prose(section(gate, '### Phase 0', '\n### '));
  assert.match(
    completion,
    near('`report` withholds', 'one action', 60),
    'the gate must keep `report` at exactly one withheld action',
  );
  assert.match(
    completion,
    near('one action', 'Phase 5', 80),
    'and that one action must stay the merge in Phase 5',
  );
  assert.match(
    completion,
    /conflict resolution[^.]{0,80}does not withhold/i,
    'the conflict resolution must be named among the actions `report` does NOT withhold, so the ' +
      'single-exception rule cannot quietly grow a second exception',
  );
  assert.doesNotMatch(
    completion,
    /conflict resolution[^.]{0,80}\b(?:is withheld|is also withheld|withholds|is suppressed)\b/i,
    'a `report` run that withholds the conflict resolution too would report the same conflict ' +
      'forever — the very state the operator invoked the gate to clear',
  );
});

test('the adjacent-file allowance keeps its bound at both ends of the conflict contract', () => {
  // One allowance, two owners: the worker may change a file Git never marked as conflicted, and
  // the gate proves afterwards that every file the worker touched was reported. Both ends are
  // asserted so neither can drift away from the other — the allowance without the reconciliation
  // is an unaudited write, and the reconciliation without the allowance turns every stale
  // adjacent test into an ABORT.
  const allowance = prose(
    section(source('src/agents/merge-conflict-resolver.md'), '## Adjacent files', '\n## '),
  );
  assert.match(
    allowance,
    near('only', 'named failing check', 200),
    'the allowance must stay bounded to making a NAMED failing check pass on the resolved tree; ' +
      'an unbounded "where it is clearly needed" allowance is a licence to improve things mid-merge',
  );
  assert.match(
    allowance,
    near('never', '(?:improve|tidy|extend)', 150),
    'the allowance must state what it is not for: improving, tidying, or extending anything',
  );
  assert.match(
    allowance,
    near('(?:cannot tie|cannot be tied|not tied)', '`ABORT`', 300),
    'a change the worker cannot tie to a named failing check must be an ABORT rather than a ' +
      'judgment call',
  );

  const contract = prose(
    section(
      source('src/tools/merge-gate.md'),
      '## Conflict-resolution delegation contract',
      '\n## ',
    ),
  );
  // Trigger and consequence as separate assertions. An alternation over the two — a window
  // containing `reconcile` OR `modified path` beside `record does not name` OR `commit nothing` —
  // is satisfied by whichever half a weakening leaves standing, so a reconciliation downgraded to
  // "reported as a warning and committed with the rest" passes it untouched.
  assert.match(
    contract,
    near('(?:reconcile|reconciliation)', '(?:every )?modified path', 250),
    'the gate must reconcile the worker’s per-file record against the paths actually modified in ' +
      'the working tree',
  );
  // Anchored on the modified-path rule itself rather than on a token the neighboring adjacent-path
  // rule also carries: `unnamed path` appears in both, so an alternation over the two lets the
  // second sentence stand in for the first and the downgrade survives again.
  assert.match(
    contract,
    near('modified path[^.]{0,60}does not name', 'abort the merge', 150),
    'a modified path the worker’s record does not name must abort the merge',
  );
  assert.match(
    contract,
    near('modified path[^.]{0,60}does not name', 'commit nothing', 200),
    'and it must commit nothing: a path downgraded to a warning and committed with the rest is ' +
      'exactly the unaudited write this reconciliation exists to prevent',
  );
  assert.match(
    contract,
    near('unnamed path', 'commit nothing', 200),
    'an adjacent path named without its check, or without that check’s verbatim failure output, ' +
      'must count exactly as an unnamed path — otherwise the disclosure requirement is satisfied ' +
      'by naming the file and nothing else',
  );
});

test('the conflict-resolution mode gate is resolved before any write and degrades ask towards off', () => {
  // `mergeGate.conflictResolution` lives in three documentation tables and, before this test, in no
  // behavioural prose at all: deleting the `off` bullet, running the resolution whatever the mode
  // says, and making a non-interactive `ask` behave as `auto` were all invisible to the suite.
  const gate = source('src/tools/merge-gate.md');
  const step = section(gate, '#### Resolving a conflict with the base', '\n#### ');
  const flatStep = prose(step);

  // The mode decides before the first write, not after it. A step that resolves first and consults
  // the key afterwards has already executed the untrusted head branch's own commands — which is
  // the exposure this key exists to control.
  assert.match(
    flatStep,
    near('`mergeGate.conflictResolution`', 'before any further write', 200),
    'the mode must be resolved before any further write in the provisioned checkout',
  );
  ordered(
    step,
    'Resolve the mode',
    'mergeGate.conflictResolution',
    '{{AGENT:merge-conflict-resolver}}',
  );

  // `off`: abort the in-progress merge, report the conflict, and write nothing.
  const off = prose(section(step, '**`off`:**', '- **`ask`'));
  assert.match(off, /`git merge --abort`/, '`off` must end the merge with `git merge --abort`');
  assert.match(
    off,
    near('report', 'conflicted paths', 150),
    '`off` must report the conflict with its conflicted paths rather than ending silently',
  );
  assert.match(
    off,
    near('no commit', 'no push', 60),
    '`off` must make no commit and no push, so the branch ends exactly where it started',
  );

  // `ask` in a non-interactive delegated run degrades to `off` — towards the outcome that writes
  // nothing, never towards the one that writes a merge commit nobody authorized.
  const askDelegated = prose(
    section(step, '**`ask` in a non-interactive delegated run:**', '- **`auto`'),
  );
  assert.match(
    askDelegated,
    near('cannot be posed', '`off`', 80),
    'an `ask` nobody can answer must behave as `off`',
  );
  assert.doesNotMatch(
    askDelegated,
    /(?:behaves|acts|counts) as `auto`|treated as `auto`/i,
    'the unanswerable question must never degrade towards `auto`: that would push a merge commit ' +
      'onto someone else’s pull request on the strength of a question nobody was asked',
  );

  // One attempt per round, bounded by maxRounds — not a loop that retries until the tree is clean.
  assert.match(
    flatStep,
    near('one attempt per round', 'no retry loop', 200),
    'the step must make one resolution attempt per round and open no retry loop of its own',
  );
  assert.match(
    flatStep,
    near('`mergeGate.maxRounds`', 'bounds', 120),
    'how often the run may come back here must stay bounded by `mergeGate.maxRounds`',
  );
  assert.doesNotMatch(
    flatStep,
    /repeat until/i,
    'an unbounded "repeat until the tree is clean" would push an unbounded number of commits onto ' +
      'a pull request this run does not own',
  );
});

test('setup carries the mergeGate.* and delivery.mergeMethod configuration keys with their defaults', () => {
  const setup = source('src/tools/setup.md');

  // The block-9 wizard table pairs each dotted key with its default. Sliced from its own header
  // row inclusively, so the Default column can be located by name rather than by position.
  const tableStart = setup.indexOf('| Key                              | Values');
  assert.notEqual(tableStart, -1, 'missing the block-9 configuration table in setup.md');
  const table = setup.slice(tableStart, setup.indexOf('\n\n', tableStart));
  for (const [key, value] of [
    ['mergeGate.completion', '`ask`'],
    // The default is `auto`, and it must read the same here, in the shared configuration
    // fragment, and in the user guide: a key whose three places disagree hands a project a
    // behavior nobody configured, and this one decides whether a gate run writes a merge commit.
    ['mergeGate.conflictResolution', '`auto`'],
    ['mergeGate.requireAllChecks', '`true`'],
    ['mergeGate.checkWaitMinutes', '`20`'],
    ['mergeGate.maxRounds', '`3`'],
    ['mergeGate.botWaitMinutes', '`10`'],
    ['mergeGate.bots', '`(empty)`'],
  ]) {
    assert.equal(
      defaultCell(table, `\`${key}\``),
      value,
      `setup.md's block-9 table must pair ${key} with its default ${value} in the Default column`,
    );
  }
  assert.match(table, /`mergeGate\.bots\.<login>\.trigger`/);
  assert.match(table, /`mergeGate\.bots\.<login>\.check`/);

  // delivery.mergeMethod is asked in block 5 (delivery), documented as prose rather than a
  // table row, so its default is matched by proximity to the key instead.
  assert.match(flat(setup), /`delivery\.mergeMethod` \(squash\/merge\/rebase, default `squash`/);
});

test('the user guide disambiguates mergeGate.* from the pre-existing delivery.prReview key', () => {
  const docs = source('docs/user-guide/configuration.md');
  const flatDocs = flat(docs);

  for (const key of [
    'mergeGate.completion',
    'mergeGate.conflictResolution',
    'mergeGate.requireAllChecks',
    'mergeGate.checkWaitMinutes',
    'mergeGate.maxRounds',
    'mergeGate.botWaitMinutes',
    'delivery.mergeMethod',
  ]) {
    assert.match(flatDocs, new RegExp(key.replace(/\./g, '\\.')));
  }

  // The dedicated "Block `mergeGate`" table carries the untraded key/default pairs. Read from the
  // Default column, not from the row: this table's Values column lists every accepted value, so a
  // whole-row match on `` `auto` `` is already satisfied by `off` / `ask` / `auto` and survives a
  // Default column flipped to `off`. Same default as setup.md's block-9 table and the shared
  // configuration fragment — the three places are read by three different audiences, and a
  // divergence here is a project running a gate that resolves conflicts while its documentation
  // says it does not.
  const block = section(docs, '## Block `mergeGate`', '\n## ');
  for (const [key, value] of [
    ['completion', '`ask`'],
    ['conflictResolution', '`auto`'],
    ['requireAllChecks', '`true`'],
    ['checkWaitMinutes', '`20`'],
    ['maxRounds', '`3`'],
    ['botWaitMinutes', '`10`'],
    ['bots', '`(empty)`'],
  ]) {
    assert.equal(
      defaultCell(block, `\`${key}\``),
      value,
      `the user guide must carry ${value} in the Default column of \`${key}\``,
    );
  }

  // The rename removed the shared name but not the confusion: `delivery.prReview` is still a
  // configuration key about publishing this run's own findings, while the gate's block is about
  // driving somebody else's pull request. The disambiguation must stay an explicit sentence
  // naming both, not merely implied by separate sections.
  assert.match(
    flat(block),
    /Do not confuse `mergeGate\.\*` with the pre-existing `delivery\.prReview`/,
  );
});

test('skill-ownership.json names no merge gate among the consumers of the pr-review skill', () => {
  // The manifest used to declare the gate as a delegate consumer of the central `pr-review`
  // skill, which the gate's own source forbids in bold: that skill brings its own approve and
  // request-changes submissions, its own CI recovery, and its own summary conventions, and this
  // workflow allows none of them. The row survived only because consumer and skill shared a
  // name and it read as a tautology. Asserted for both names, so the entry cannot come back
  // under the new one either.
  const ownership = JSON.parse(source('docs/developer-guide/skill-ownership.json'));
  const entry = ownership.relationships.find((skill) => skill.skill === 'pr-review');
  assert.ok(entry, 'skill-ownership.json must list a "pr-review" skill entry');
  for (const forbidden of ['pr-review', 'merge-gate']) {
    assert.equal(
      entry.consumers.some((consumer) => consumer.consumer === forbidden),
      false,
      `the "pr-review" skill entry must not list "${forbidden}" as a consumer`,
    );
  }

  // The empty slot needs its reason asserted too. An absence proves nothing on its own: delete the
  // gate's exclusion section and the manifest row above stays correct-looking while the rule that
  // makes it correct is gone — and the next person reading a missing row reads it as an oversight
  // and puts it back. The three named behaviours are the substance: they are what the skill would
  // bring and what this workflow forbids, and they are why the gate is a non-consumer rather than
  // an unlisted one.
  const gate = flat(source('src/tools/merge-gate.md'));
  assert.match(
    gate,
    /Do not load the central `pr-review` skill/,
    'the gate must forbid loading the central pr-review skill',
  );
  for (const forbidden of [
    'approve and request-changes submissions',
    'CI recovery',
    'summary conventions',
  ]) {
    assert.ok(
      gate.includes(forbidden),
      `the exclusion must name what the skill brings that this workflow forbids: ${forbidden}`,
    );
  }

  // And the judgment itself is not dropped, only relocated — otherwise the exclusion would read as
  // "this gate reviews without a reviewer".
  assert.match(
    gate,
    near('`\\{\\{SKILL:iterate\\}\\}` loads it', '(?:Mode C|handoff)', 200),
    'the excluded judgment must be stated as happening one delegation away',
  );
});

test('the review-publication fragments and their marker survive the merge-gate rename', () => {
  // These three carry the *review-publication* concept, not the gate: the fragments describe how
  // a delivery publishes its own findings onto a pull request, and the marker stamps those
  // comments. An over-eager `pr-review` → `merge-gate` sweep would rename them along with the
  // gate and recreate exactly the confusion the rename removed — and the marker rename would
  // additionally break idempotency against every comment already posted under the old literal.
  for (const path of ['src/shared/pr-review-comments.md', 'src/shared/pr-review-integration.md']) {
    assert.ok(existsSync(new URL(path, repositoryRoot)), `${path} must keep its name`);
  }

  // Collected from the sources rather than pinned to one file, so moving the marker between
  // fragments stays green while dropping or renaming it fails.
  const marker = '<!-- effective-flow-pr-review -->';
  const carriers = ['src/shared', 'src/tools', 'src/agents'].flatMap((directory) =>
    readdirSync(new URL(`${directory}/`, repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .filter((entry) => source(`${directory}/${entry}`).includes(marker)),
  );
  assert.ok(carriers.length > 0, `no source carries the review-publication marker ${marker}`);
});

test('the shared reviewer-state contract is loaded by the gate and by the guard', () => {
  // One block, two consumers, on purpose: the gate decides whether to trigger and wait, and
  // `iterate`'s guard decides whether to classify at all. If each derived "is this reviewer
  // still running?" for itself, the two could disagree about the same pull request — the gate
  // waiting for a reviewer the guard just declared finished, or the reverse.
  assert.ok(
    existsSync(new URL('src/shared/review-bot-state.md', repositoryRoot)),
    'the shared reviewer-state contract needs its own fragment',
  );

  for (const path of ['src/tools/merge-gate.md', 'src/tools/iterate.md']) {
    // The include fence, not a mere mention: a tool that only names the fragment in prose never
    // receives its rules.
    assert.match(
      source(path),
      /```(?:lazy-)?include\n(?:[a-z0-9-]+\n)*review-bot-state\n(?:[a-z0-9-]+\n)*```/,
      `${path} must load review-bot-state through an include fence`,
    );
  }
});

test('an emoji acknowledgment is never presented as evidence that a reviewer has no check', () => {
  // This cost a real merge. The gate refused to merge PR #317 because Greptile's freshness could
  // not be proven, while Greptile's own `Greptile Review` check sat green on the same head: the
  // sources claimed Greptile "publishes no check context either", so nobody configured `.check`
  // for it and the gate stayed on a fallback signal that cannot work for that reviewer at all.
  //
  // Two distinct things were conflated. A reaction is how a bot acknowledges a *trigger*, and it
  // is genuinely unreadable through the helper. A check context is how it reports the *review*,
  // and it is read from `pr-status-read` like any other check. A reviewer can — and Greptile does
  // — do both. Inferring the absence of the second from the presence of the first is the mistake
  // this test exists to keep out of the sources.
  //
  // Asserted as the guarantee the sources must carry, not as the absence of the one sentence that
  // was deleted. A negative pinned to that wording passes again for any paraphrase of it — dropping
  // the single word "either" was enough — and it says nothing about what has to stand there
  // instead. Every claim below is therefore bound to the edge-case bullet that must carry it, and
  // the one negative left is a second lock on the formulation that already misled a reader once.
  const edgeCases = section(source('src/tools/merge-gate.md'), '## Edge cases', '\n## ');
  const bullet = (marker) => {
    const entry = edgeCases.split(/\n-\s+/).find((item) => item.includes(marker));
    assert.ok(entry, `the gate's edge cases must carry the bullet about: ${marker}`);
    return flat(entry);
  };

  const reaction = bullet('acknowledges with an emoji reaction');
  assert.match(
    reaction,
    near('reaction', '`Greptile Review` check', 400),
    'the emoji-reaction case must name the check context this reviewer does publish',
  );
  assert.match(
    reaction,
    near('reaction', '(?:is not a check|no check to configure)', 300),
    "a reaction must be stated not to be evidence about the reviewer's check context",
  );
  assert.doesNotMatch(
    flat(edgeCases),
    /publishes no check/i,
    'no edge case may reintroduce the claim that this reviewer publishes no check context',
  );

  // The sticky-comment case is the concrete failure the fallback cannot survive, and it is the
  // reason `.check` is not merely an optimisation for these reviewers. Each assertion here is
  // matched on what its message promises: the frozen timestamp, the scope of the consequence, and
  // the remedy — not on the bullet's opening words, which a trimmed bullet would still satisfy.
  const sticky = bullet('edits one sticky comment in place');
  assert.match(
    sticky,
    near('edits one sticky comment in place', 'never moves past `headCommittedAt`', 200),
    "the sticky-comment case must document that the reviewer's `createdAt` freezes against the head",
  );
  // Scoped, because the fallback reads threads and thread replies too: a review that also opens a
  // thread for this head *is* seen, and claiming otherwise would trade one wrong statement about
  // this reviewer for another.
  assert.match(
    sticky,
    near('only\\*{0,2} output', '\\*\\*not started\\*\\*', 300),
    'the not-started consequence must be scoped to a head whose only output is that frozen edit',
  );
  // The remedy is now two remedies, and the bullet has to name both: a configured `.check`, and the
  // reviewer's own submitted review, which the fallback reads as a fourth surface. The former
  // wording — "only a configured `.check` resolves it: the fallback cannot, by construction" —
  // became false the moment the reviews surface was added, and asserting it would pin a
  // contradiction in place.
  assert.match(
    sticky,
    near('configured `\\.check`', 'submitted review', 300),
    "the remedy must name both a configured check and the reviewer's own submitted review",
  );
  assert.doesNotMatch(
    sticky,
    /the fallback cannot, by construction/i,
    'the fallback now reads a fourth surface, so it is no longer the one signal that cannot resolve this',
  );

  // The wizard half, bound to the `.check` bullet it belongs to. Its substance is the warning, not
  // the removed example: delete the warning and an asserted deletion still passes.
  const checkKey = flat(
    section(source('src/tools/setup.md'), '#### Block 9: the merge gate (`mergeGate.*`)')
      .split(/\n-\s+/)
      .find((entry) => entry.includes('`mergeGate.bots.<login>.check`:')) ?? '',
  );
  assert.ok(checkKey, 'the wizard must explain `mergeGate.bots.<login>.check` in its own bullet');
  assert.match(
    checkKey,
    near('reaction', '`Greptile Review` check', 200),
    'the wizard must state that this reviewer reacts *and* publishes a check context',
  );
  assert.doesNotMatch(
    checkKey,
    near('Greptile', '(?:is not a check|publishes no readable check)', 200),
    'the wizard must not use Greptile as its example of a reviewer without a check context',
  );

  // "Publishes no check context at all" is only usable as a criterion if the wizard also says how
  // to observe which case a reviewer is — and which way to resolve doubt, given that it offers
  // "not set" as the default answer.
  assert.match(
    checkKey,
    near('checks list', 'pull request', 200),
    'the wizard must name where the check context is observed',
  );
  assert.match(
    checkKey,
    near('checks list', 'exactly the name', 200),
    'the observed entry must be stated to carry exactly the value to configure',
  );
  assert.match(
    checkKey,
    near('(?:in doubt|unsure)', 'configure it', 120),
    'doubt must resolve toward configuring the context, never toward leaving it unset',
  );
  assert.match(
    checkKey,
    near('wrongly set', '(?:never be reported|can never be reported)', 300),
    'the asymmetry must be stated: a wrong context blocks visibly, an omitted one is never reported',
  );
});

test("this repository's own gate is not left on a signal its reviewer cannot use", () => {
  // `/effective-flow setup` rewrites these rows in place and offers "not set" as the default answer
  // for `.check`. A wizard run that accepted that default here would silently restore the state
  // that blocked PR #317 — this repository's reviewer back on a timestamp it stopped moving — and
  // until now no test read this file at all, so the suite would have stayed green through it.
  //
  // Deliberately narrow. `.check` is optional by contract, and a reviewer that genuinely publishes
  // no context must stay configurable without one, so this asserts nothing about bots in general:
  // only about the reviewer configured here, whose check context the gate itself documents.
  const adr = source('docs/adr/effective-flow-project-setup.md');
  const logins = tableRow(adr, 'mergeGate.bots')
    .split('|')[2]
    .split(',')
    .map((login) => login.trim())
    .filter(Boolean);
  const configured = logins.filter((login) => /greptile/i.test(login));
  assert.ok(
    configured.length > 0,
    'this repository must configure the reviewer its gate waits for',
  );

  for (const login of configured) {
    const context = tableRow(adr, `mergeGate.bots.${login}.check`).split('|')[2].trim();
    assert.ok(
      context && !/^(?:unset|not set|none|null|-)$/i.test(context),
      `${login} must carry a check context rather than the wizard's "not set" default`,
    );
    // And the reviewer's own context, not a plausible-looking typo: a context that never appears
    // resolves to **not started** exactly like a missing row does, so the two failures are one.
    assert.ok(
      source('src/tools/merge-gate.md').includes(context),
      `the configured context for ${login} must be the one the gate documents: ${context}`,
    );
  }
});

test('the reviewer-state contract pins its three states and its fail-closed precedence', () => {
  const state = source('src/shared/review-bot-state.md');
  const states = flat(section(state, '### The three states'));
  const precedence = flat(section(state, '### Precedence'));

  // Being included proves nothing about what is included. This fragment is the single source of
  // the reviewer-state rules for both consumers, and every rule below decides a merge
  // precondition: each one, silently inverted, merges a head no reviewer looked at.
  for (const name of ['running', 'not started', 'has run']) {
    assert.match(
      states,
      new RegExp(`\\*\\*${name}\\*\\*`),
      `the contract must define the ${name} state`,
    );
  }

  // Only the primary signal can prove "running". A consumer that read the fallback's
  // "not started" as "nothing is happening" would trigger a reviewer already at work.
  assert.match(
    precedence,
    near('`status: PENDING`', '\\*\\*running\\*\\*', 120),
    'a pending check must map to running',
  );

  // A terminal check is a finished review whatever it concluded. Reading a red review as
  // "has not run" re-triggers a reviewer that already answered.
  assert.match(
    precedence,
    near('`status: COMPLETED`', '\\*\\*has run\\*\\*', 120),
    'a completed check must map to has run',
  );
  assert.match(
    precedence,
    near('\\*\\*has run\\*\\*', 'whatever its `conclusion`', 120),
    'the conclusion must be stated not to decide whether the reviewer ran',
  );

  // The three fail-closed rules, each asserted in its own direction. Flipping any one of them
  // makes the gate's merge precondition pass for a reviewer that never ran — a misconfigured
  // context, an app that is not installed, or a queued run.
  assert.match(
    precedence,
    near('no matching entry', '\\*\\*not started\\*\\*', 200),
    'a context that never appears must count as not started, never as has run',
  );
  // Bound tightly and matched on the resolution itself: a wider window reaches the word
  // "fallback" in rule 2's own opening and would hold even for a `checksReported: false` that
  // resolved a state outright, which is the difference between "unavailable" and "negative".
  assert.match(
    precedence,
    near(
      '`checksReported: false`',
      '(?:falls through to rule 2|unavailable rather than negative)',
      160,
    ),
    'an unavailable check list must fall through to the fallback rather than resolve a state',
  );
  assert.match(
    precedence,
    near('unprovable', 'not started', 200),
    'anything unprovable must count as not started',
  );
  assert.match(
    precedence,
    near('unprovable', '(?:in no other|and in no other direction|never the opposite)', 300),
    'the fail-closed direction must be stated as the only one, not as a preference',
  );

  // And the fallback must not be readable as a running signal, which is the drift that would let
  // the two consumers disagree about the same pull request: the gate waiting for a reviewer the
  // guard just declared finished, or the guard holding a run the gate is not waiting for.
  assert.match(
    precedence,
    /never reports? running|says nothing whatsoever about what is in flight/i,
    'the fallback must state that it can never report running',
  );
});

test('the review-guard switch is announced by the gate and required by iterate', () => {
  // A caller-contract line is a literal two files must agree on, and the failure is silent on
  // one side: if the gate stops announcing it, every delegated round re-derives the reviewer
  // state and either duplicates the gate's wait or blocks against a reviewer the gate is
  // deliberately not waiting for. Both ends are therefore asserted in one test.
  const SWITCH = 'Review guard: established';

  // The requiring end. Sliced to its own Phase 0 item, because the item filter and the
  // summary-comment suppression are almost identically shaped contracts with their own `ABORT`.
  const exemption = flat(
    section(source('src/tools/iterate.md'), '### Phase 0')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => item.includes(SWITCH)) ?? '',
  );
  assert.ok(exemption, `iterate Phase 0 must parse the literal \`${SWITCH}\` switch`);
  assert.match(exemption, /caller|delegat/i, 'the switch must be a caller contract, not user text');
  assert.match(
    exemption,
    /(?:without that line|absent|unset|not announced|no such line)/i,
    'the unannounced case must be named, so the guard stays the default',
  );

  // Fail closed on a form it cannot parse. Continuing as an unguarded run is the resolution that
  // must not happen: the caller believes the guard is answered for, so a misread line would let
  // the run classify a thread set a reviewer is still adding to.
  //
  // The exact return value, not a bare `ABORT`: this item also contains the word inside prose
  // about what the run does *not* do, so a rule rewritten to "ignore the line and continue —
  // never `ABORT` for a misread switch" would satisfy a bare token while inverting the contract.
  assert.match(
    exemption,
    /ABORT: unparseable review-guard switch/,
    'an unparseable review-guard switch must return that exact literal',
  );

  // Anchored on `unguarded`, which occurs only in the sentence being protected. `guard` alone
  // matches the item's own opening sentence and would hold whatever the fail-closed rule said.
  assert.match(
    exemption,
    near('(?:never|not)\\s+continue', 'unguarded', 120),
    'the aborting run must be stated not to continue as an unguarded one',
  );

  // The announcing end.
  const contract = section(source('src/tools/merge-gate.md'), '## Delegation contract', '\n## ');
  const item = flat(contract.split(/\n-\s/).find((entry) => entry.includes(SWITCH)) ?? '');
  assert.ok(item, `the delegation contract must announce the literal \`${SWITCH}\``);
  assert.match(
    item,
    /mandatory|every delegation|never delegate without/i,
    'the exemption must bind every delegation, not an unspecified subset',
  );
});

test("iterate's review-in-flight guard is exempted by the switch, never by a filter", () => {
  const guard = flat(section(source('src/tools/iterate.md'), '### Phase 1.5'));
  assert.ok(guard, 'iterate must carry a review-in-flight guard phase');

  // The exemption is its own caller-contract line. Coupling it to `Item filter:` was the obvious
  // shortcut and the wrong one: a filter states the scope of a run, never that the reviewer state
  // is known, so any future workflow that filtered for scoping would lose the guard silently.
  assert.match(
    guard,
    /`?Review guard: established`?/,
    'the guard must name the caller-contract switch that exempts it',
  );

  // The negative belongs on the skip list, which is the only place an exemption can be added, and
  // it is checked per bullet. The switch's own bullet may explain why a caller sends the line —
  // including that it scoped the run — because that run still has to send it. What must not exist
  // is a *separate* condition that skips the guard on scope alone: any future workflow that
  // filtered for scoping would then lose the guard without ever deciding to.
  const skipItem =
    section(source('src/tools/iterate.md'), '### Phase 1.5')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => /skip conditions/i.test(item)) ?? '';
  assert.ok(skipItem, 'Phase 1.5 must carry an explicit skip-condition list');

  const skipBullets = skipItem.split(/\n\s*-\s+/).slice(1);
  assert.ok(skipBullets.length >= 2, 'the skip-condition list must enumerate its cases as bullets');
  for (const bullet of skipBullets) {
    if (bullet.includes('Review guard: established')) continue;
    assert.doesNotMatch(
      flat(bullet),
      /filter|scop(?:e|ed|ing)/i,
      'no skip condition beside the caller-contract switch may rest on the run being scoped',
    );
  }

  // And non-interactivity is not the exemption either — `apply-review` also delegates
  // non-interactively and knows nothing about reviewer state, so precisely the runs that need the
  // guard would lose it. Such a run aborts with the exact literal instead.
  assert.match(
    guard,
    /ABORT: review still in flight/,
    'a non-interactive run without the switch must abort with the exact literal',
  );
  assert.match(
    guard,
    near('non-interactive', 'ABORT: review still in flight', 300),
    'the abort must be tied to the run that cannot be asked, not to an unspecified failure',
  );
});

test('the gate branches on three reviewer states and triggers only on "not started"', () => {
  const phase3 = flat(section(source('src/tools/merge-gate.md'), '### Phase 3'));

  // Three states, not two. Under a check-based signal the old "has run" / "has not run" split is
  // wrong: a reviewer whose check is still pending has not run and must not be triggered — a
  // mention would queue a redundant second run or, for a reviewer that reads one as a fresh
  // request, discard the review already in flight.
  for (const state of ['running', 'not started', 'has run']) {
    assert.match(
      phase3,
      new RegExp(`\\*\\*${state}\\*\\*`, 'i'),
      `Phase 3 must distinguish the ${state} state`,
    );
  }

  // The trigger hangs off "not started" specifically. Asserted on the step that posts the trigger
  // text, so a step that reverted to "has not run" cannot satisfy it.
  assert.match(
    phase3,
    near('\\*\\*Not started', '`mergeGate\\.bots\\.<login>\\.trigger`', 200),
    'the trigger step must be conditioned on the not-started state',
  );

  // And the running state is a wait with no write at all.
  assert.match(
    phase3,
    near('\\*\\*Running', '(?:post \\*\\*no\\*\\* trigger|no trigger comment|post nothing)', 300),
    'a running reviewer must be waited for and never triggered',
  );

  // An unprovable state still falls to the safe side, exactly as before the three-way split.
  assert.match(
    phase3,
    near('(?:unprovable|cannot be established)', 'not started', 200),
    'an unprovable reviewer state must count as not started, never as an assumed pass',
  );
});

test('setup rewrites a legacy prReview.* block in place instead of leaving both standing', () => {
  // Without the in-place rewrite a migrated project ends up with two adjacent blocks of
  // plausible-looking configuration, one of them inert — the artifact a later maintainer edits
  // without effect. Sliced to setup's own migration section so a sentence elsewhere in the file
  // cannot satisfy these.
  const migration = flat(
    section(
      source('src/tools/setup.md'),
      '#### Rewriting a legacy `prReview.*` merge-gate block in place',
    ),
  );

  assert.match(
    migration,
    near('carry', '`mergeGate\\.', 300),
    'every legacy row must be carried over to the identical trailing key under mergeGate',
  );
  assert.match(
    migration,
    /(?:Remove the old rows|remove the legacy rows)/i,
    'the old rows must be removed, not left beside the new ones',
  );

  // A shadowed key is reported rather than merged: merging two differing values into one setting
  // would invent a configuration nobody chose.
  assert.match(
    migration,
    near(
      '(?:shadow|both present|both.{0,30}different values)',
      '(?:do not merge|never combine|not merge)',
      400,
    ),
    'a shadowed legacy key must be reported and never merged with its mergeGate counterpart',
  );

  // The write authority boundary the migration rests on: only setup writes configuration.
  assert.match(
    flat(source('src/tools/setup.md')),
    near('only', 'writer of the configuration', 200),
    'setup must state that it is the only writer of the configuration',
  );
});

test('the shared configuration fragment documents every merge-gate key and the legacy fallback', () => {
  // The fragment is what every consumer loads, so a key missing here is a key no run resolves —
  // it silently falls back to a default instead, turning a configured `merge` completion into
  // `ask` or a configured bot list into "no bots expected".
  const migration = source('src/shared/config-migration.md');
  const block = section(
    migration,
    '### Merge-gate keys (`mergeGate.*`) and their legacy namespace',
    '\n### ',
  );

  for (const key of [
    'mergeGate.completion',
    'mergeGate.conflictResolution',
    'mergeGate.requireAllChecks',
    'mergeGate.checkWaitMinutes',
    'mergeGate.maxRounds',
    'mergeGate.botWaitMinutes',
    'mergeGate.bots',
    'mergeGate.bots.<login>.trigger',
    'mergeGate.bots.<login>.check',
  ]) {
    assert.ok(block.includes(`\`${key}\``), `the configuration fragment must document ${key}`);
  }

  // The third of the three places these keys live, and the defaults have to agree with setup.md's
  // block-9 table and the user guide. `auto` is what makes a gate run resolve a conflict and push
  // a merge commit at all, so a fragment carrying a different default would resolve the key one
  // way while the wizard that writes it promised another. Read from the Default column: this
  // table's Values column repeats every default it accepts.
  for (const [key, value] of [
    ['mergeGate.completion', '`ask`'],
    ['mergeGate.conflictResolution', '`auto`'],
    ['mergeGate.requireAllChecks', '`true`'],
    ['mergeGate.bots', '`(empty)`'],
  ]) {
    assert.equal(
      defaultCell(block, `\`${key}\``),
      value,
      `the configuration fragment must carry the same default ${value} for ${key} as setup.md and ` +
        'the user guide',
    );
  }

  // The read fallback with its per-key precedence. A whole-block fallback would let one migrated
  // key hide every unmigrated one.
  const flatBlock = flat(block);
  assert.match(
    flatBlock,
    near('`prReview\\.<key>`', '(?:absent|missing|where a)', 300),
    'the legacy namespace must be read where the mergeGate key is absent',
  );
  assert.match(
    flatBlock,
    near('per key', '(?:wins|precedence)', 300),
    'precedence must be stated per key, not per block',
  );
});

test("the router's description names both iterate and the merge gate", () => {
  // The frontmatter description is the only catalog a harness sees before it loads anything, so a
  // tool missing from it is a tool nobody discovers by name.
  const [, description] = source('src/SKILL.md').match(/^description:\s*(.+)$/m) ?? [];
  assert.ok(description, 'SKILL.md must carry a frontmatter description');
  for (const tool of ['iterate', 'merge-gate']) {
    assert.match(
      description,
      new RegExp(`\\b${tool}\\b`),
      `the router description must name the ${tool} tool`,
    );
  }
  assert.doesNotMatch(description, /\bpr-review\b/, 'the renamed tool must not linger in the list');
});

test('iterate documents an optional item filter that never falls back to all items', () => {
  const iterate = source('src/tools/iterate.md');

  // The filter is what makes the gate's phase order binding rather than descriptive: an
  // unfiltered delegation classifies every unaddressed thread, so a run meant to repair one
  // failing check would silently implement every open bot finding along with it.
  assert.match(
    section(iterate, '### Phase 0: Target detection and input parsing'),
    /filter/i,
    'Phase 0 must parse the optional item filter out of the invocation',
  );
  assert.match(
    section(iterate, '### Phase 2: Classification'),
    /filter/i,
    'Phase 2 must apply the item filter to the items it classifies',
  );

  const blocks = iterate.split(/\n{2,}/).filter((block) => /filter/i.test(block));
  assert.ok(blocks.length > 0, 'iterate.md must document the optional item filter');
  const contract = flat(blocks.join('\n\n'));

  assert.match(contract, /item filter/i);
  assert.match(contract, /optional/i);
  // Both selectable scopes: the free-text items alone, or an explicit list of thread IDs.
  assert.match(contract, /free[- ]text/i);
  assert.match(contract, /thread ID/i);
  // Additive by construction — an unfiltered invocation keeps the current all-items behavior.
  assert.match(
    contract,
    /unfiltered|without (?:an? )?(?:item )?filter|no (?:item )?filter/i,
    'the contract must state what an unfiltered invocation does',
  );
  // The filter's most important failure mode: matching nothing yields an empty run, never a
  // silent fallback to processing every item.
  assert.match(
    contract,
    /matche?s? (?:no|nothing)|no item|nothing/i,
    'the contract must cover a filter that matches no item',
  );
  assert.match(
    contract,
    /fall(?:s|ing)? back|fallback/i,
    'the contract must rule out the fallback to all items explicitly',
  );
});

test('ci.yml keeps the job names the develop ruleset requires', () => {
  // The `develop` ruleset lists these two strings as required status checks, and GitHub matches
  // a required check by its exact name. Renaming either job would not fail anything here or on
  // GitHub — the check would simply stop reporting, and every pull request into `develop` would
  // block forever with no timeout, no override short of editing the ruleset, and nothing naming
  // the cause (issue #282).
  //
  // Only these two are required, deliberately. The managers job exercises externally published
  // manager releases, so requiring it would let an unrelated upstream release block every merge,
  // including the release pull request. That is also why its name is left alone here.
  const ci = source('.github/workflows/ci.yml');
  for (const name of ['Format, test and build', 'Shellcheck']) {
    assert.ok(
      ci.includes(`name: ${name}\n`),
      `ci.yml must keep the job name "${name}"; the develop ruleset requires it by that exact string`,
    );
  }
});

test('every workflow action is pinned to a commit', () => {
  // Movable tags let upstream change what runs in a job where the App private keys are in
  // scope — including for actions that receive no credential of their own. This scans the
  // directory rather than a file list so a newly added workflow cannot slip past (issue #293).
  //
  // Only the ref shape is asserted here. Every other assertion in this file matches actions
  // without their ref, so a Renovate digest bump touches no test at all; concentrating the
  // format in one place is what keeps those bumps from becoming an occasion to weaken a guard.
  const directory = new URL('.github/workflows/', repositoryRoot);
  // Both extensions, because GitHub runs both — filtering `.yml` alone would let a `.yaml`
  // workflow carry movable tags past the very scan that exists to catch new files.
  const workflows = readdirSync(directory).filter(
    (entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'),
  );
  assert.ok(workflows.length >= 3, 'expected the workflow directory to be populated');

  for (const workflow of workflows) {
    const lines = source(`.github/workflows/${workflow}`).split('\n');
    for (const [index, line] of lines.entries()) {
      const step = line.match(/^\s*-?\s*uses:\s*(\S+)\s*(.*)$/);
      if (!step) continue;
      const [, reference, trailer] = step;
      assert.match(
        reference,
        /@[0-9a-f]{40}$/,
        `${workflow}:${index + 1} must pin its action to a commit, found ${reference}`,
      );
      // The version comment is what Renovate reads to know which release the digest belongs
      // to; without it the pin becomes an opaque hash nobody can place. Its precision is left
      // to Renovate, which writes the upstream tag's own (`# v9`, not `# v9.0.0`).
      assert.match(
        trailer,
        /^# v\d+(?:\.\d+)*$/,
        `${workflow}:${index + 1} must carry a version comment, found "${trailer}"`,
      );
    }
  }
});

// --- Deprecated pr-review alias for merge-gate ---

test('src/tools/pr-review.md is a minimal alias that reports deprecation before forwarding to merge-gate', () => {
  const alias = source('src/tools/pr-review.md');

  const lineCount = alias.split('\n').length;
  assert.ok(
    lineCount < 40,
    `src/tools/pr-review.md has ${lineCount} lines but must stay under 40; the size cap is what ` +
      'keeps the alias from growing a second gate implementation next to the one in merge-gate.md',
  );

  assert.doesNotMatch(
    alias,
    /^## Phase/m,
    'the alias must carry no `## Phase` heading; a phase heading is the shape of the gate logic ' +
      'that belongs only in merge-gate.md',
  );
  for (const forbidden of [
    /\bapprove and request-changes/i,
    /\brequireAllChecks\b/,
    /\bbotWaitMinutes\b/,
    /\bcheckWaitMinutes\b/,
  ]) {
    assert.doesNotMatch(
      alias,
      forbidden,
      `the alias must carry no merge/check/reviewer logic of its own (found pattern: ${forbidden})`,
    );
  }

  // The deprecation notice must be instructed before the forward, not merely present somewhere
  // in the file — a reordered file would still "mention" both without actually notifying the
  // user before the gate's own Phase 1 output starts.
  ordered(alias, 'Emit the deprecation notice', 'Then read `tools/merge-gate.md`');
  assert.match(
    flat(alias),
    /read `tools\/merge-gate\.md`[\s\S]{0,40}follow it verbatim/,
    'the alias must state that it reads and follows tools/merge-gate.md verbatim',
  );
});

test('src/tools/pr-review.md states it is not the central pr-review skill and must not load it', () => {
  // merge-gate forbids loading the central `pr-review` skill in bold (see the neighboring test
  // "skill-ownership.json names no merge gate among the consumers of the pr-review skill"). A
  // tool source that now shares that skill's name is exactly the accident that rule exists for:
  // without an explicit exclusion here, the alias is the one place an agent could plausibly
  // reach for "the pr-review skill" by name and get it wrong.
  const alias = flat(source('src/tools/pr-review.md'));
  assert.match(
    alias,
    /not the central `pr-review` skill/,
    'the alias must state it is not the central pr-review skill',
  );
  assert.match(
    alias,
    /must not load it/,
    'the alias must state that it must not load the central pr-review skill',
  );
});

test('build.mjs declares the pr-review alias and keeps it out of the tool catalog', () => {
  // TOOL_GROUPS cannot be imported: build.mjs runs the entire build on load, so the group
  // definition is sliced out of the source text instead, the same technique the neighboring
  // test "the merge gate is exposed in the Deliver changes group" uses.
  const groups = section(source('build.mjs'), 'const TOOL_GROUPS = [', '\nconst EXPOSED_TOOLS');
  assert.doesNotMatch(
    groups,
    /'pr-review'/,
    'pr-review must appear in no TOOL_GROUPS entry; TOOL_GROUPS drives the router catalog, and ' +
      'listing the retired name there would advertise it again',
  );

  assert.match(
    source('build.mjs'),
    /const DEPRECATED_TOOL_ALIASES = \[\{ alias: 'pr-review', replacement: 'merge-gate' \}\];/,
    'build.mjs must declare DEPRECATED_TOOL_ALIASES mapping pr-review to merge-gate',
  );
});

test('argument-hint is derived from the pure exposed tool set, without the deprecated alias', () => {
  const argumentHintLine = source('build.mjs')
    .split('\n')
    .find((line) => line.includes('const argumentHint ='));
  assert.ok(argumentHintLine, 'build.mjs must define argumentHint');
  assert.match(
    argumentHintLine,
    /EXPOSED_TOOLS\.join/,
    'argumentHint must be derived from the pure EXPOSED_TOOLS array, not a set that also carries ' +
      'deprecated alias names — otherwise the retired pr-review name would get autocomplete',
  );
  assert.doesNotMatch(
    argumentHintLine,
    /DEPRECATED_TOOL_ALIASES/,
    'argumentHint must not reference DEPRECATED_TOOL_ALIASES',
  );
});

test('src/SKILL.md carries the {{DEPRECATED_ALIASES}} placeholder in its dispatch section', () => {
  // The rendered alias clause is the only thing that makes an unlisted name route instead of
  // falling into dispatch rule 1 ("no or unknown tool -> print the catalog"). Losing this
  // placeholder from the source would silently break the alias without failing anything else,
  // because the router would still render — just without the clause that routes `pr-review`.
  const dispatch = section(source('src/SKILL.md'), '## Dispatch rule', '\n```include');
  assert.match(
    dispatch,
    /\{\{DEPRECATED_ALIASES\}\}/,
    'the dispatch rule section must contain the {{DEPRECATED_ALIASES}} placeholder',
  );
});

test('one rule decides when a configured reviewer login matches a reported one', () => {
  const state = source('src/shared/review-bot-state.md');
  // Default stop, so the slice ends at the next `###` heading: assertions must be satisfied by the
  // rule itself, not by neighbouring prose elsewhere in the fragment.
  const rule = flat(section(state, '### Matching a configured login'));

  // The defect this rule exists for: the same account arrives as `greptile-apps[bot]` from REST and
  // `greptile-apps` from GraphQL, so no single configured value satisfied both surfaces. Configured
  // the REST way, Phase 4's unassessed-thread condition matched nothing and reported itself
  // satisfied while open reviewer findings sat there.
  assert.match(rule, /\[bot\]/, 'the rule must name the suffix it tolerates');
  assert.match(
    rule,
    near('trailing', '\\[bot\\]', 200),
    'only a trailing suffix is trimmed — a `[bot]` elsewhere is part of the login',
  );
  assert.match(
    rule,
    /exact|exactly/i,
    'the comparison must stay exact apart from that trim, or it becomes a substring match',
  );

  // The trim is an allowance for one bot account spelled two ways, so it takes a bot account.
  // GitHub mints `foo[bot]` for an app slug `foo` while the bare `foo` stays an ordinary user or
  // organization name: an ungated trim adds exactly one human-reachable login per configured entry,
  // and that human's comments then count as the reviewer's output on every consumer of this rule.
  assert.match(
    rule,
    near('trim', '(?:`isBot`|`authorType`|bot-typed)', 400),
    'the trim must be conditioned on the reported account class, not applied to every login',
  );

  // Resolution direction. The dotted config keys are spelled the way the project wrote them, so a
  // tolerant match that then looked config up under the *reported* spelling would find nothing.
  assert.match(
    rule,
    near('`mergeGate\\.bots\\.<login>\\.(?:trigger|check)`', 'configured spelling', 400),
    'the rule must state that .trigger/.check are looked up under the configured spelling',
  );

  // A project may already carry both spellings as the documented workaround. After this rule they
  // are one reviewer, which must not silently become two rounds, two mentions and two waits.
  assert.match(
    rule,
    near('(?:collapse|collapsing|de-duplicat|duplicate)', '(?:report|conflict)', 400),
    'collapsing entries must be de-duplicated, and a conflicting trigger/check reported',
  );
});

test('every site that matches mergeGate.bots resolves through the shared login rule', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase1 = flat(section(gate, '### Phase 1'));
  const phase3 = flat(section(gate, '### Phase 3'));

  // Four sites compare a configured login against a reported one, on two surfaces that spell the
  // same account differently. A site that restates a bare equality instead of resolving through the
  // shared rule reintroduces the defect at that site alone, which is exactly how it stayed hidden.
  const reference = /Matching a configured login/;

  assert.match(
    phase1,
    reference,
    'Phase 1 rule 1 must resolve the configured login through the rule',
  );
  assert.match(phase3, reference, "Phase 3's per-login round must resolve through the rule");

  // `mergeConditions`, never a raw split of the whole phase. A raw split files every trailing
  // Phase-4 paragraph under the last condition, and three of those paragraphs name this same rule —
  // so the condition-10 assertion below passed on prose outside condition 10 and stayed green with
  // the reference deleted from the condition itself. That is the regression this test exists for.
  const conditions = mergeConditions(gate);
  assert.match(
    flat(mergeCondition(conditions, 5)),
    reference,
    'the has-run condition must resolve the configured login through the rule',
  );
  assert.match(
    flat(mergeCondition(conditions, 7)),
    reference,
    'the never-assessed condition must resolve the configured login through the rule',
  );
  // The fifth site, and the newest: which login counts as a configured reviewer is exactly the same
  // question on the review surface as on the thread surface, and a restated bare equality here would
  // reintroduce the two-spellings defect at one more site.
  assert.match(
    flat(mergeCondition(conditions, 10)),
    reference,
    'the unassessed-verdict condition must resolve the configured login through the rule',
  );
});

test('condition 7 finding no reviewer thread is reported, not passed over in silence', () => {
  const gate = source('src/tools/merge-gate.md');

  // The numbered preconditions and the commentary after them come out of one shared cut, so every
  // assertion below can tell a merge condition apart from the prose that follows it — and so this
  // test does not carry a second copy of that boundary to drift against the first.
  const { conditions, afterList: tail } = mergeConditionsAndTail(gate);
  const afterList = flat(tail);

  // The slicing is itself under test: an empty or truncated condition list would let the
  // not-a-precondition check below pass without ever reading a condition.
  assert.ok(
    conditions.length >= 10,
    'Phase 4 must slice into its numbered preconditions — conditions 7 and 10 among them — or the checks below assert nothing',
  );

  // The report's own contract phrase, required of the prose and forbidden of the conditions, so both
  // halves move together when it is reworded. `\b` keeps the alternation out of `Note`, `nothing`
  // and `not`, and naming one phrase replaces a bare character distance that could pair a `no` in
  // one sentence with a `match` in another.
  const zeroMatch = 'match(?:ed|es|ing)?\\s+\\b(?:no|zero|none of the)\\b\\s+configured\\s+logins?';
  const zeroMatchPhrase = new RegExp(zeroMatch, 'i');

  // "Satisfied" and "no reviewer threads are open" were indistinguishable in the log, which is why
  // a gate whose unassessed-thread protection was inert said so nowhere. A misconfigured or absent
  // login is not a suffix problem, so the matching rule above does not reach this case.
  assert.match(
    afterList,
    near(zeroMatch, '(?:report|name)', 500),
    'Phase 4 must report a reviewer list that matched no unresolved thread',
  );

  // Report-only, deliberately. A thread another account left unresolved already blocks at the
  // human-comment guard, so a blocking condition here would double-count it and could stall merges
  // that the guard correctly releases — including the ones it releases because this run's own
  // account wrote the item.
  assert.match(
    afterList,
    near(
      '(?:reports? only|not a (?:new )?(?:blocking )?condition|never blocks|does not block)',
      'condition',
      400,
    ),
    'the zero-match report must state that it is not a blocking condition',
  );

  // It must not have been written as a numbered precondition, or it would gate the merge after all.
  const asCondition = conditions.filter((item) => zeroMatchPhrase.test(flat(item)));
  assert.equal(
    asCondition.length,
    0,
    'the zero-match report must not be a numbered Phase 4 merge precondition',
  );
  assert.match(
    afterList,
    zeroMatchPhrase,
    'the zero-match report must live in the prose after the numbered preconditions',
  );
});

test('issue-backed apply workflows share one started-before-delegation lifecycle contract', () => {
  const lifecycle = source('src/shared/issue-lifecycle.md');
  const applyIssues = source('src/tools/apply-issues.md');
  const applyReview = source('src/tools/apply-review-remote.md');
  const mergeGate = source('src/tools/merge-gate.md');

  for (const workflow of [applyIssues, applyReview, mergeGate]) {
    assert.match(workflow, /```include\nissue-lifecycle\n```/);
  }

  const issueImplementation = section(applyIssues, '**Sufficient issues (`sufficient`)');
  ordered(
    issueImplementation,
    '**Immediately before delegation**',
    'apply the started transition',
    'Delegate to the target skill',
  );
  const reviewImplementation = section(
    applyReview,
    '### Phase 4 remote: Implementation, PR and deferred epic completion',
  );
  ordered(
    reviewImplementation,
    'Immediately before the first implementation delegation',
    'transition the finding at least to\n   started',
    'Pre-analysis and implementation',
  );

  const started = prose(section(lifecycle, '### Started transition'));
  assert.match(
    started,
    /Skipped, `wontfix`, terminal, container-only, and failed-before-start items receive no transition/,
  );
  assert.match(
    started,
    /Never move a terminal issue, reopen it, or move a later active state backwards/,
  );
  assert.match(started, /stop before delegation and before code changes/);
});

test('native workflow state remains separate from Effective Flow classifications', () => {
  const lifecycle = prose(source('src/shared/issue-lifecycle.md'));
  const trackerTarget = prose(source('src/shared/tracker-target.md'));

  assert.match(
    lifecycle,
    /the tracker's native workflow state.*Effective Flow classifications.*pull request's versioned lifecycle receipt/,
  );
  assert.match(
    trackerTarget,
    /`effective-flow-issue-done` remains orchestration metadata for a secured PR and never substitutes for a terminal native state/,
  );
  assert.match(
    trackerTarget,
    /`tracker\.externalStartedState` is a tool-native state value and is never stored as an Effective Flow classification/,
  );
});

test('issue lifecycle receipt propagation is exact and existing PR writes stay guarded', () => {
  const lifecycle = source('src/shared/issue-lifecycle.md');
  const lifecycleProse = prose(lifecycle);
  const canonical =
    '<!-- effective-flow-issue-lifecycle:v1 {"target":"forge|external","repository":"owner/repo|null","externalTool":"tool|null","items":[{"issue":"reference","relationship":"closes|refs","container":"reference|null","containerMechanism":"native|checklist|null"}]} -->';
  assert.match(lifecycle, new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(
    lifecycleProse,
    /Serialize keys in exactly the shown order, on one line, with no insignificant whitespace/,
  );
  assert.match(
    lifecycleProse,
    /Reject malformed JSON, unknown or missing keys, multiple receipt lines, conflicting duplicates, mixed targets, cross-repository bindings, a tool mismatch, and invalid references/,
  );

  for (const path of ['src/tools/apply-issues.md', 'src/tools/apply-review-remote.md']) {
    const workflow = prose(source(path));
    assert.match(workflow, /fresh body read/);
    assert.match(workflow, /hash-guarded `pr-update-body`/);
    assert.match(workflow, /receipt/);
  }
  assert.match(
    prose(lifecycle),
    /`STALE_WRITE`, an invalid existing receipt, or a concurrent edit aborts delivery bookkeeping without overwriting prose or silently dropping the receipt/,
  );
});

test('interrupted in-progress issue recovery fails closed instead of duplicating implementation', () => {
  const lifecycle = prose(
    section(source('src/shared/issue-lifecycle.md'), '### Started transition'),
  );
  assert.match(
    lifecycle,
    /Read its comments and search the current forge exactly once by the exact issue reference/,
  );
  assert.match(
    lifecycle,
    /Exactly one candidate.*may have its PR-link comment and receipt restored/,
  );
  assert.match(lifecycle, /Zero or multiple candidates fail closed/);
  assert.match(
    lifecycle,
    /never reset the issue to unstarted and never start a replacement implementation automatically/,
  );

  for (const path of ['src/tools/apply-issues.md', 'src/tools/apply-review-remote.md']) {
    const workflow = prose(source(path));
    assert.match(workflow, /one-search fail-closed recovery|single exact-reference recovery/);
    assert.match(workflow, /zero or multiple/);
  }
});

test('container completion is deferred until a linked issue is observed terminal after merge', () => {
  const lifecycle = prose(source('src/shared/issue-lifecycle.md'));
  const applyIssues = prose(source('src/tools/apply-issues.md'));
  const applyReview = prose(source('src/tools/apply-review-remote.md'));
  const mergeObservation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );

  assert.match(lifecycle, /must not complete a native sub-item or tick a container checklist/);
  assert.match(
    applyIssues,
    /Do not set a native sub-item to done and do not tick a checklist entry/,
  );
  assert.match(applyReview, /Do not set a native sub-item to done or tick an epic checklist/);
  assert.match(
    mergeObservation,
    /Only for an observed terminal issue, complete its optional receipted container/,
  );
  assert.match(
    mergeObservation,
    /An open, timed-out, or unobservable issue leaves its container entry open/,
  );
  assert.match(mergeObservation, /fresh container body and exact hash-guarded patch/);

  const nativeReconciliation = prose(
    section(source('src/shared/issue-lifecycle.md'), '### Post-merge observation'),
  );
  assert.match(
    nativeReconciliation,
    /For a forge-native container, do not issue a second completion mutation/,
  );
  ordered(
    nativeReconciliation,
    're-read the recorded parent through `issue-sub-issues-read`',
    'verify that the receipted child still belongs to it',
    'report the remaining open native children',
  );
  assert.match(
    nativeReconciliation,
    /Repeated observation, native parent reads, and eligible completion writes are idempotent/,
  );
});

test('merge-gate supports already-merged observer re-entry with terminal-only reconciliation', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase0 = prose(
    section(gate, '### Phase 0: Resolve the pull request and the completion mode'),
  );
  const observation = prose(section(gate, '### Phase 5.5: Observe linked issues after merge'));

  assert.match(
    phase0,
    /already-merged pull request with one valid receipt enters observer-only mode and jumps to Phase 5\.5/,
  );
  assert.match(phase0, /performs no check wait, delegation, branch provisioning, or merge/);
  assert.match(phase0, /observer-only mode skip completion-mode resolution/);
  assert.match(
    observation,
    /only after a fresh PR read proves either that Phase 5 merged the pull request or that Phase 0 selected observer-only mode/,
  );
  assert.match(observation, /fixed 30-second grace period/);
  assert.match(observation, /Never model-poll/);
  assert.match(
    observation,
    /freshly observed terminal forge issue, remove `effective-flow-issue-in-progress` idempotently/,
  );
  assert.match(observation, /Keep the marker for every other outcome/);
  assert.match(observation, /Never force-close an issue/);
});

test('external started-state configuration is tracker-verified and only setup persists suggestions', () => {
  const migration = prose(source('src/shared/config-migration.md'));
  const tracker = prose(source('src/shared/tracker-target.md'));
  const setup = prose(source('src/tools/setup.md'));

  assert.match(migration, /tracker\.externalStartedState.*nullable string.*stable state ID/);
  assert.match(
    migration,
    /Missing or `null` means unset and never authorizes a guessed transition/,
  );
  assert.match(
    migration,
    /Only `\{\{SKILL:setup\}\}` writes a confirmed tracker-verified suggestion/,
  );
  assert.match(tracker, /Before the first implementation delegation, list those states fresh/);
  assert.match(
    tracker,
    /Exactly one candidate may be proposed with both its display name and stable value/,
  );
  assert.match(tracker, /A gated run may use that value for this run only after confirmation/);
  assert.match(
    tracker,
    /A non-interactive run, zero candidates, or multiple candidates aborts before code/,
  );
  assert.match(setup, /Persist the suggestion only in the confirmed Step 6 write/);
  assert.match(setup, /Never infer a state from the tool name or a familiar display name/);
});

test('linked-issue re-entry is mirrored by next steps and user documentation', () => {
  const nextSteps = source('src/shared/next-steps.md');
  const row = nextSteps
    .split('\n')
    .find(
      (line) =>
        line.startsWith('| merge-gate') &&
        line.includes('merged but at least one linked issue is open or unobservable'),
    );
  assert.ok(row, 'missing merged-but-linked-issues-open next-step row');
  assert.match(row, /\{\{SKILL:merge-gate\}\} <PR>/);
  assert.match(
    source('docs/user-guide/tool-flow.md'),
    /merged but at least one linked issue is open or unobservable/,
  );
  assert.match(source('docs/user-guide/tools-deliver.md'), /observer-only re-entry/);
  assert.match(
    source('docs/user-guide/troubleshooting.md'),
    /A linked issue remains open after merge/,
  );
});

// --- plan archival ---------------------------------------------------------
// The handback's mark-and-archive step used to instruct an unconditional
// `git mv`, which is fatal on the untracked path it normally meets, had no
// state for an already-archived plan, and named no execution root. The
// contract now lives in its own fragment; these assertions pin the parts a
// later edit could quietly undo.

test('the plan-archival fragment states its detection, states and cleanup', () => {
  const fragment = source('src/shared/plan-archival.md');

  // Detection is index-first and uses the hardened probe shape the reverse
  // archive move already established: `--` does not disable pathspec globbing.
  assert.match(
    fragment,
    /git -C <EXECUTION_ROOT> ls-files -z -- ':\(literal\)<P>' ':\(literal\)<A>'/,
  );
  assert.doesNotMatch(fragment, /ls-tree/);
  assert.doesNotMatch(fragment, /merge-base/);

  // Result interpretation: only the output decides, a nonzero exit blocks.
  ordered(
    fragment,
    'The path appears among the entries → tracked.',
    'The path is absent from the entries → not tracked.',
    '**blocks archival**',
    'It is never read',
  );
  // A blocked probe or a collision must not abort the handback: the run reports
  // and delivers, because stranding finished work uncommitted is the worse
  // outcome. This is the sentence that decides whether work survives.
  assert.match(fragment, /They never\s+abort the handback/);
  assert.match(fragment, /The delivery continues/);

  // Exactly the four documented outcomes plus the collision stop, in order.
  ordered(
    fragment,
    '**Archived basis**',
    '**Collision**',
    '**State D — already archived.**',
    '**State A — tracked.**',
    '**State C — untracked.**',
  );

  // The state table carries exactly four rows, each with a condition and an
  // action. A fifth row, or a row that lost its action, fails here.
  const states = section(fragment, '### States', '\n### ');
  const stateRows = states
    .split('\n')
    .filter((line) => line.startsWith('| **'))
    .map((line) =>
      line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean),
    );
  assert.equal(stateRows.length, 4, 'the state table must carry exactly four rows');
  for (const [label, meaning, action] of stateRows) {
    assert.ok(meaning && meaning.length > 20, `state ${label} needs a condition`);
    assert.ok(action && action.length > 40, `state ${label} needs an action`);
  }
  assert.deepEqual(
    stateRows.map(([label]) => label),
    ['**A** — tracked', '**C** — untracked', '**D** — already archived', '**Archived basis**'],
  );

  // The three actions that caused the original bug.
  assert.match(states, /No `git mv`: there is nothing tracked to move/);
  assert.match(states, /`git -C <EXECUTION_ROOT> add -- ':\(literal\)<A>'`/);
  assert.match(states, /Never re-add at top level/);
  assert.match(states, /refresh it if it differs/);
  assert.match(states, /Terminal: report that the basis is already archived/);

  // `mkdir -p` precedes both the move and the write, in both rows.
  const [rowA, rowC] = stateRows;
  ordered(rowA[2], 'mkdir -p', 'git -C <EXECUTION_ROOT> mv');
  ordered(rowC[2], 'mkdir -p', 'place it atomically');

  // The archived basis is decided before the paths are derived at all — the
  // predicate cannot be a comparison of two paths that can never be equal.
  assert.match(fragment, /check the basis first/i);
  assert.match(fragment, /nested `<plan\.dir>\/archive\/archive\/<file>\.md`/);
  assert.match(fragment, /the basis check precedes/);
  // The condition cell itself, not just the row label: the never-satisfiable
  // "P and A resolve to the same path" comparison must not come back.
  const detectionRow1 = fragment.split('\n').find((line) => line.startsWith('| 1 '));
  assert.ok(detectionRow1, 'missing detection row 1');
  assert.match(detectionRow1, /the basis lies under `<plan\.dir>\/archive\/`/);
  assert.doesNotMatch(fragment, /resolve to the same path/);

  // The mark happens after the take-over, superseding the older arrangement.
  assert.match(fragment, /The order is read → take over → mark/);
  assert.match(fragment, /Autorisierung im Haupt-Repo/);

  // Emptiness, not string equality: the `-z` rationale must survive.
  assert.match(fragment, /`-z` is load-bearing rather than tidy/);
  assert.match(fragment, /C-quotes any path `core\.quotePath` covers/);
  assert.match(fragment, /matches neither\s+path literally/);

  // The collision arm, including the untracked-target case.
  // Regression: the index probe cannot see an untracked file, so without a
  // filesystem existence check the untracked-archive-target arm of the collision
  // rule is unreachable and State C writes straight over that file. Detection
  // must carry the check, not just the Collision prose.
  const detectionRows = fragment
    .split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) =>
      line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean),
    );
  assert.equal(detectionRows.length, 6, 'detection must carry six rows');
  const [, stateCRow] = [detectionRows[4], detectionRows[4]];
  assert.match(
    stateCRow[1],
    /no file exists at `A`/,
    'State C must require an empty archive target',
  );
  assert.match(detectionRows[5][1], /a file exists at `A`/);
  assert.match(detectionRows[5][2], /Collision/);
  assert.match(fragment, /filesystem existence check on `A`/);
  // The check alone is a TOCTOU window: a file created between row 5 and the
  // write would be silently replaced. The write itself must refuse to clobber.
  assert.match(fragment, /\*\*The check is not the guarantee — the placement is\.\*\*/);
  // The target is created complete or not at all: content goes to a temporary
  // file beside it, then one no-clobber placement. A plain write into the
  // target leaves a partial file when the run dies mid-write, and the next run
  // reads that artifact as a collision it cannot clear.
  assert.match(fragment, /never writes into the target at all/);
  assert.match(fragment, /temporary file \*\*in the same directory\*\*/);
  assert.match(fragment, /`link\(<temp>, <A>\)` followed by `unlink\(<temp>\)`/);
  assert.match(fragment, /a plain `rename` is unusable here/);
  assert.match(fragment, /\*\*is the collision stop\*\*/);
  assert.match(fragment, /On any failure, remove the temporary file/);
  assert.match(fragment, /A leftover temporary is never mistaken for the archive/);
  assert.match(states, /place it atomically/);

  const collision = section(fragment, '### Collision', '\n### ');
  assert.match(collision, /report\s+both paths/);
  assert.match(collision, /An archive target that exists as an \*\*untracked\*\* file/);

  // EXECUTION_ROOT must be the repository root, or the probe silently matches
  // nothing from a subdirectory.
  assert.match(
    fragment,
    /repository root\*\*; `ls-files` output is relative to the directory it runs in/,
  );

  // `git mv -f` may appear, but only inside its own prohibition: it produces a
  // modify-plus-delete rather than a rename and discards the destination.
  for (const match of fragment.matchAll(/git mv -f/g)) {
    const context = fragment.slice(
      Math.max(0, match.index - 180),
      match.index + match[0].length + 80,
    );
    assert.match(
      context,
      /(?:never|must not|do not|forbidden|prohibit)/i,
      '`git mv -f` must only occur in an explicit prohibition',
    );
  }

  // The rationale for index-first must survive, or a later edit re-derives the
  // two defects it removed.
  assert.match(
    fragment,
    /re-selects State A, and runs `git mv` on a source\s+that no longer exists/,
  );
  assert.match(fragment, /two copies of one plan on the base branch/);

  // Cleanup preconditions, in order, with State D comparing against the
  // archived file rather than against itself.
  const cleanup = section(fragment, '### Main-checkout cleanup', '\n### ');
  ordered(
    cleanup,
    'The take-over is staged in `EXECUTION_ROOT`',
    'is untracked there',
    'still hashes to the value captured',
    'matches the already-archived file with the status marker',
    're-verified immediately before removal',
  );
  assert.match(cleanup, /Applies to States A, C, and D\./);
  assert.match(cleanup, /nothing to clean up/);
  assert.match(cleanup, /report which precondition failed/);
  assert.match(cleanup, /The cleanup is idempotent/);
  assert.match(cleanup, /The archived-basis arm runs no cleanup\./);
  // The cleanup must disambiguate itself from the worktree-cleanup prohibition
  // in execution-location, which forbids RUNTIME_STATE_ROOT as a cleanup target.
  assert.match(cleanup, /\*\*This is not worktree cleanup\.\*\*/);
  assert.match(cleanup, /never the root, never a directory, and never\s+anything Git tracks/);

  // Execution roots are named, never inherited.
  const roots = section(fragment, '### Execution roots', '\n### ');
  for (const operation of [
    '`ls-files` detection',
    '`mkdir -p`',
    'status-marker edit',
    '`git mv`',
    '`git add`',
  ]) {
    assert.ok(roots.includes(operation), `the roots table must place ${operation}`);
  }
  assert.match(roots, /Reading the plan's final content for the take-over/);
  assert.match(roots, /`EXECUTION_ROOT`, passed explicitly with `git -C`/);
  assert.match(roots, /`RUNTIME_STATE_ROOT`, from the retained absolute handle/);
  assert.match(roots, /No operation relies on an inherited working directory\./);

  // Both in-place shapes, and the five report shapes.
  const inPlace = section(fragment, '### In-place execution contexts', '\n### ');
  assert.match(inPlace, /\*\*In-place with delivery:\*\*/);
  assert.match(inPlace, /\*\*In-place without delivery:\*\*/);
  assert.match(inPlace, /the cleanup still runs/);
  assert.match(inPlace, /The\s+cleanup runs here too/);
  const report = section(fragment, '### Report vocabulary', '\n## ');
  for (const shape of [
    'archived a tracked plan (State A)',
    'archived as a new file (State C)',
    'already archived (State D)',
    'the basis was itself an archived plan',
    'stopped because the plan is tracked at both top level and in the archive',
  ]) {
    assert.ok(report.includes(shape), `missing report shape: ${shape}`);
  }
  for (const shape of [
    /the removed path with its digest/,
    /nothing to clean up/,
    /the\s+precondition that prevented removal/,
  ]) {
    assert.match(report, shape, `missing cleanup report shape: ${shape}`);
  }

  // Declared inputs, including the base commit as optional and decision-free.
  const inputs = section(fragment, '### Inputs', '\n### ');
  for (const input of [
    '`EXECUTION_ROOT`',
    '`RUNTIME_STATE_ROOT`',
    '`plan.dir`',
    "the plan file's repository-relative path",
    "the plan's complete language",
    'the delivery shape',
  ]) {
    assert.ok(inputs.includes(input), `missing declared input: ${input}`);
  }
  assert.match(inputs, /optionally, the delivery branch's creation OID/);
  assert.match(inputs, /decides nothing/);
  assert.match(inputs, /An absent creation OID is not an error and never blocks/);

  // The fragment reads runtime state and mutates none, so it carries no write
  // guard — and it must not smuggle one in through a nested fence either.
  assert.equal(collectIncludeNames(fragment).eager.size, 0);
  assert.equal(collectIncludeNames(fragment).lazy.size, 0);
  // The fragment must stay clear of the runtime directory in substance and in
  // wording: `findRuntimeStateSafetyViolations` fires on a mutation verb sharing
  // a line with an `.effective-flow/` path, so the guard is a build-time
  // co-assertion of this one.
  assert.match(fragment, /carries no runtime-state write guard, because it needs none/);
  assert.match(fragment, /neither reads from nor writes to it/);
  assert.match(fragment, /Its one destructive\s+act is on a \*\*project\*\* file/);
  // Neither may be named as a flow that archives: they keep no plan file, so
  // saying so would ship a false statement in all three targets.
  const opening = fragment.slice(0, fragment.indexOf('### Inputs'));
  assert.match(
    opening,
    /`\{\{SKILL:iterate\}\}`, `\{\{SKILL:maintain\}\}` and `\{\{SKILL:merge-gate\}\}` keep no plan\s+file and carry no pointer/,
  );
});

test('every workflow that keeps a plan file defers plan-archival, and every exemption says why', () => {
  // The consumer set is derived, not listed: an eighth tool that embeds the
  // delivery fragment and keeps a plan file must fail here rather than ship an
  // unloadable archive contract.
  const toolNames = readdirSync(new URL('src/tools/', repositoryRoot))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -3));
  const deliveryConsumers = toolNames.filter((name) => {
    const { eager, lazy } = collectIncludeNames(source(`src/tools/${name}.md`));
    return eager.has('worktree-integration') || lazy.has('worktree-integration');
  });
  assert.deepEqual(
    [...deliveryConsumers].sort(),
    ['build', 'docs', 'fix', 'iterate', 'maintain', 'merge-gate', 'refactor'],
    'the delivery-fragment consumer set changed; re-derive the plan-archival pointers',
  );

  // Exempt because they keep no plan file. Each states that in its own source.
  const exemptions = new Map([
    ['iterate', /keeps no plan file[\s\S]{0,200}no deferred pointer to `plan-archival`/],
    ['maintain', /keeps no plan file[\s\S]{0,200}no deferred pointer to `plan-archival`/],
    ['merge-gate', /no deferred pointer to `plan-archival`/],
  ]);

  for (const name of deliveryConsumers) {
    const body = source(`src/tools/${name}.md`);
    const { eager, lazy } = collectIncludeNames(body);
    assert.equal(
      eager.has('plan-archival'),
      false,
      `${name} must not eagerly include plan-archival`,
    );

    const reason = exemptions.get(name);
    if (reason) {
      assert.equal(lazy.has('plan-archival'), false, `${name} is exempt and must carry no pointer`);
      assert.match(body, reason, `${name} must state why it carries no plan-archival pointer`);
      continue;
    }

    assert.equal(
      lazy.has('plan-archival'),
      true,
      `${name} keeps a plan file and must defer plan-archival`,
    );
    const fences = [...body.matchAll(LAZY_INCLUDE_RE)].filter((match) =>
      match[0].includes('plan-archival'),
    );
    assert.equal(fences.length, 1, `${name} must carry exactly one plan-archival fence`);
    assert.match(fences[0][0], /when:\s*\S/, `${name}'s plan-archival fence needs a load trigger`);
    assert.match(fences[0][0], /in-place/, `${name}'s trigger must cover in-place execution`);
  }
});

test('the handback delegates archival instead of instructing a git mv', () => {
  const delivery = source('src/shared/worktree-integration.md');

  // The defective instruction is gone, and the fence is deliberately not here:
  // in-place without delivery is told to perform no further steps from this
  // fragment, so a pointer at the handback step would be unreachable there.
  assert.doesNotMatch(delivery, /git mv/);
  assert.equal(collectIncludeNames(delivery).lazy.has('plan-archival'), false);
  assert.match(
    delivery,
    /is owned by\s+`plan-archival`, which every workflow that keeps a plan file loads through its own deferred\s+pointer/,
  );
  assert.match(
    delivery,
    /Plan archival still applies in that mode: it is owned by\s+`plan-archival`/,
  );
  // The fragment declares inputs it cannot obtain itself; step 1 must supply
  // them, or the contract is only inferrable from "Rooted operations".
  assert.match(delivery, /Hand it the inputs it declares/);
  for (const input of ['`EXECUTION_ROOT`', '`RUNTIME_STATE_ROOT`', '`plan.dir`', 'creation OID']) {
    assert.ok(delivery.includes(input), `step 1 must hand over ${input}`);
  }
});

test('the four plan-carrying tools keep their in-place-without-delivery instruction', () => {
  // After the fence relocation this sentence is the only executing archival
  // trigger in the mode the relocation was decided for. Nothing else pins it.
  for (const name of ['build', 'fix', 'docs', 'refactor']) {
    assert.match(
      source(`src/tools/${name}.md`),
      /in-place without delivery[\s\S]{0,240}same status switch and archive move/,
      `${name} lost its in-place-without-delivery archival instruction`,
    );
  }
});

test('the plan-file conventions name plan-archival as the owner of the mechanism', () => {
  // plan-numbering keeps its `git mv` literal: 830e07a made it one half of a
  // forward/reverse contrast and pinned it. It gains an ownership pointer only.
  const numbering = source('src/shared/plan-numbering.md');
  assert.match(numbering, /moves the file via `git mv` to `<plan\.dir>\/archive\/`/);
  assert.match(numbering, /`plan-archival` owns the \*\*how\*\*/);
  assert.match(numbering, /cannot move an untracked path/);

  // The developer-guide copy drops the mechanism outright.
  const conventions = source('docs/developer-guide/plan-conventions.md');
  const archiveSection = section(conventions, '## Archive of implemented plans', '\n## ');
  assert.doesNotMatch(archiveSection, /git mv/);
  assert.match(archiveSection, /src\/shared\/plan-archival\.md` owns that state model/);

  // And the fragment is listed among the mode-gated lazy blocks.
  assert.match(
    source('docs/developer-guide/build-system.md'),
    /`plan-archival`,\s+`effective-flow-dir-migration`/,
  );
});

test('the user guide describes archival as state-dependent', () => {
  for (const [path, phrase] of [
    [
      'docs/user-guide/worktree-and-delivery.md',
      /What archiving does depends on the state the plan is in/,
    ],
    ['docs/user-guide/glossary.md', /depending on whether the plan was already\s+tracked/],
    ['docs/user-guide/tools-implement.md', /depending on whether the plan was already tracked/],
  ]) {
    assert.match(source(path), phrase, `${path} still describes the archive move as unconditional`);
  }
});

test('both consumers of the reviewer contract read the submitted reviews', () => {
  // The shared fragment is loaded by two tools that evaluate it independently against their own
  // fresh read. Widening one consumer's read and not the other's makes the two disagree about the
  // same reviewer on the same pull request — the exact drift the fragment's own contract forbids,
  // and one that no assertion on either file alone would catch.
  const gate = flat(section(source('src/tools/merge-gate.md'), '### Phase 1'));
  const iterate = flat(section(source('src/tools/iterate.md'), '### Phase 1:'));

  for (const [label, text] of [
    ['the gate', gate],
    ['iterate', iterate],
  ]) {
    assert.match(text, /`pr-reviews-read`/, `${label} must read the submitted reviews`);
    assert.match(
      text,
      /`prReviewsRead`/,
      `${label} must name the capability key the read is gated on`,
    );
    // One instant, or the state assembled from two reads describes no state the pull request ever
    // had — the same invariant the status read and the threads already carry.
    assert.match(
      text,
      near('`pr-reviews-read`', '(?:same instant|one instant)', 600),
      `${label} must read the reviews at the same instant as the status and the threads`,
    );
  }

  // Each consumer states its own unavailability rule. `iterate` degrades and reports; the gate
  // separates a capability that is absent from a read that failed this time, because only the
  // second can be repaired by trying again.
  assert.match(
    iterate,
    near('`prReviewsRead`|`pr-reviews-read`', '(?:UNSUPPORTED_CAPABILITY|unavailable)', 900),
    'iterate must state what an unavailable review read costs its run',
  );

  const preflight = flat(section(source('src/tools/merge-gate.md'), '### Phase 0'));
  assert.match(
    preflight,
    /`prReviewsRead`/,
    "the gate's capability read list must include the new key",
  );
  assert.match(
    preflight,
    near('`prReviewsRead`', '(?:ask once|asks once)', 700),
    'an absent review capability must degrade like the check wait: report and ask once',
  );
  assert.match(
    preflight,
    near('`prReviewsRead`', '(?:never merges|never merge)', 700),
    'a non-interactive run must never merge on an unestablished verdict',
  );
});

test('one supersession rule serves the gate condition and the guard, and lives in one place', () => {
  const shared = source('src/shared/review-bot-state.md');
  const verdict = prose(section(shared, '### A changes-requested verdict and what supersedes it'));

  // Three cases, and the third is the one the reported defect turns on: treating a commented review
  // as superseding lets a reviewer request changes in its body, add one inline comment at the same
  // head, and clear the condition in silence.
  assert.match(
    verdict,
    near('approved', '(?:clears|supersed)', 200),
    'a later approved review at the same head must clear the verdict',
  );
  assert.match(
    verdict,
    near('dismiss', '(?:clears|supersed)', 300),
    'a dismissal must clear the verdict',
  );
  assert.match(
    verdict,
    near('commented', '(?:never clears|does not clear)', 300),
    'a later commented review must never clear a standing changes-requested verdict',
  );
  // Both providers' spellings, or the rule fires on one forge only — which is a rule that ships,
  // passes every test, and protects nothing on the other.
  assert.match(
    verdict,
    near('commented', "(?:both providers|either provider|providers' spellings)", 400),
    'the commented state must be recognized under both providers spellings',
  );

  // The three fail-closed causes, each of which leaves no latest review to read at all.
  for (const [label, pattern] of [
    ['an unestablishable author', 'author cannot be established'],
    ['an unestablishable head binding', 'head binding cannot be established'],
    ['identical submission times', 'identical submission times'],
  ]) {
    assert.match(verdict, new RegExp(pattern, 'i'), `${label} must be named as fail-closed`);
  }

  // One home, referenced from every consumer, as the login-matching rule already is. Four sites
  // restating it is four places for it to drift.
  const gate = source('src/tools/merge-gate.md');
  const conditions = mergeConditions(gate);
  const verdictCondition = flat(
    conditions.find((item) => item.trimStart().startsWith('10.')) ?? '',
  );
  assert.ok(verdictCondition, 'Phase 4 must carry condition 10');
  assert.match(
    verdictCondition,
    /Automatic reviewer state/,
    'condition 10 must resolve the latest review through the shared rule, not restate it',
  );
  assert.match(
    flat(section(gate, '### Phase 1')),
    /Automatic reviewer state/,
    "the guard's review surface must resolve the latest review through the shared rule",
  );
});

test('the unassessed-verdict condition blocks the absence of an outcome, never the verdict', () => {
  const gate = source('src/tools/merge-gate.md');
  const conditions = mergeConditions(gate);
  const condition = prose(conditions.find((item) => item.trimStart().startsWith('10.')) ?? '');
  assert.ok(condition, 'Phase 4 must carry condition 10');

  assert.match(condition, /`VERIFIED_HEAD_SHA`/, 'the condition must bind to the verified head');
  for (const outcome of ['implement', 'defer', 'reject']) {
    assert.match(
      condition,
      new RegExp(outcome, 'i'),
      `the condition must name ${outcome} as an outcome that counts as assessed`,
    );
  }

  // The gate writes no verdict of its own and must not start enforcing one it is forbidden to
  // write: what blocks is the missing outcome, not the reviewer's disagreement.
  assert.match(
    condition,
    near('(?:never approves|forbidden to write|verdict itself is never)', 'block', 400),
    'a verdict whose findings were all assessed must not block on the verdict alone',
  );
  // An earlier head is condition 5's business, not this one's; without that split the condition
  // would block on a verdict about a commit nobody is merging.
  assert.match(
    condition,
    near('earlier head', '(?:does not block|not block)', 300),
    'a review bound to an earlier head must not block on its own',
  );
  assert.match(
    condition,
    near('earlier head', 'condition 5', 500),
    'the earlier-head rule must name the condition that carries the weight instead',
  );

  // The two failure causes are different in kind, and conflating them burns the whole round budget
  // on a condition no round can change.
  assert.match(
    condition,
    near('unreadable this time|unreadable', '(?:return|Phase 3)', 400),
    'a list unreadable this time must block and return into Phase 3',
  );
  assert.match(
    condition,
    near('`prReviewsRead`', '(?:ask once|asks once)', 500),
    'an absent capability must report and ask once instead of returning',
  );

  assert.match(
    condition,
    near('Phase 3', 'consumes a round', 400),
    'the return to Phase 3 must consume a round',
  );
  assert.match(
    condition,
    near('`mergeGate\\.maxRounds`', '(?:never with a merge|never a merge)', 300),
    'an exhausted round budget must end the run with a report, never with a merge',
  );
  // Every continuation paragraph of condition 10 is indented, or the Phase-4 list terminator in the
  // neighbouring test truncates the slice and stops asserting anything past this condition.
  for (const line of (conditions.find((item) => item.trimStart().startsWith('10.')) ?? '')
    .replace(/^\n+/, '')
    .split('\n')
    .slice(1)) {
    assert.ok(
      line.trim() === '' || /^\s/.test(line),
      `condition 10 continuation must stay indented: ${line}`,
    );
  }
});

test('a changes-requested review is the guard third counting surface, decided by state alone', () => {
  const phase1 = prose(section(source('src/tools/merge-gate.md'), '### Phase 1'));

  assert.match(
    phase1,
    near('(?:submitted review|changes-requested)', 'counting surface|counts', 500),
    'the guard must count a changes-requested review as a third surface',
  );
  // Restricted to that one state, or a routine commented "looks good" activates a guard that is set
  // once and never cleared.
  assert.match(
    phase1,
    near('changes-requested', '(?:latest|newest) review', 700),
    'the surface must be decided on the latest review per author',
  );
  // The author rules stay the ones already written; a fourth rule reading a review body is exactly
  // what "no exclusion rule reads a body" forbids.
  assert.match(
    phase1,
    near('review', 'no exclusion rule reads a body', 1200),
    'no exclusion rule may read a review body',
  );
});

test('the gate reports every reviewer verdict per finding, and every unmatched one', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase6 = prose(section(gate, '### Phase 6'));

  assert.match(
    phase6,
    near('changes-requested review', 'per finding|one line per finding', 400),
    'Phase 6 must report a reviewer verdict per finding, never as a binary',
  );
  assert.match(
    phase6,
    /never a binary/i,
    'the report must forbid a binary assessed, which hides an auto-classification',
  );
  assert.match(
    phase6,
    near('changes-requested review', 'another condition already blocks|even when another', 600),
    'the verdict must be reported even when another condition already blocks the merge',
  );
  assert.match(
    phase6,
    near('changes-requested review', 'matched no configured login', 900),
    'Phase 6 must report a changes-requested review that matched no configured login',
  );

  const phase4 = prose(section(gate, '### Phase 4'));
  assert.match(
    phase4,
    near('changes-requested review', 'matched no configured login', 500),
    'Phase 4 must carry the unmatched-review report, modelled on the unmatched-thread one',
  );
  assert.match(
    phase4,
    near(
      'changes-requested review that matched no configured login',
      '(?:never blocks|not a condition)',
      1400,
    ),
    'the unmatched-review report must state that it never blocks the merge',
  );
});

test('a review body reaches iterate as identified free text, never as direction', () => {
  const iterate = source('src/tools/iterate.md');
  const phase0 = flat(section(iterate, '### Phase 0', '\n### Phase 1'));

  // The grammar is deliberately unchanged: free text is already accepted beside a thread list.
  assert.match(
    phase0,
    near('review body', '(?:free text|free-text)', 400),
    'a body-carried finding must arrive as free text',
  );
  // The zero-thread case is the one that aborts if a caller improvises: an empty `threads=` list is
  // unparseable and costs a round.
  assert.match(
    phase0,
    near('`free-text-only`', 'empty `threads=`', 500),
    'the filter form for a body-only delegation with zero threads must be stated',
  );
  assert.match(
    phase0,
    near('stable identifier', '(?:one item for every|one returned item)', 700),
    'free text must carry a caller-supplied stable identifier for the return contract',
  );

  const phase2 = flat(section(iterate, '### Phase 2: Classification'));
  assert.match(
    phase2,
    near('review body', 'Mode C', 400),
    'a review body must be classified through the same Mode C path as any other item',
  );
  assert.match(
    phase2,
    near('review body', '(?:never.{0,40}direction|never treated as direction)', 500),
    'a review body must never be treated as direction',
  );

  // And the gate's own side of the same contract: the exemption's grounds may no longer rest on
  // "before this run has observed any reviewer", which a Phase-3 body-only delegation falsifies.
  const contract = prose(
    section(source('src/tools/merge-gate.md'), '## Delegation contract', '\n## '),
  );
  assert.doesNotMatch(
    contract,
    /and the exemption is correct there precisely because/i,
    'the review-guard exemption may not rest on a claim a Phase-3 body-only delegation falsifies',
  );
  assert.match(
    contract,
    near('`free-text-only`', 'scope', 500),
    'the CI repair exemption must rest on its scope rather than on when it is issued',
  );
  // And the falsifier is named, so the corrected grounds cannot be re-simplified back into the old
  // ones by a reader who never meets the Phase-3 body-only delegation.
  assert.match(
    contract,
    near('before this run has observed any reviewer', 'Phase-3|Phase 3', 500),
    'the corrected grounds must name the Phase-3 body-only delegation that falsified the old ones',
  );
});

test('the sentences reviews make false are corrected rather than left standing', () => {
  const gate = source('src/tools/merge-gate.md');
  const shared = source('src/shared/review-bot-state.md');
  const prComments = source('src/shared/pr-review-comments.md');

  // Each of these was true only while no workflow read a review. Left standing they contradict the
  // condition, the guard and the fallback that now do.
  assert.doesNotMatch(
    gate,
    /a review body is in neither/i,
    'the claim that a review body can never hold the guard must go',
  );
  assert.doesNotMatch(
    gate,
    /Only a configured `\.check` resolves it/i,
    'the fallback now reads a fourth surface, so the check is no longer the only remedy',
  );
  assert.doesNotMatch(
    gate,
    /the single exception condition 7 states for itself/i,
    'the returning exception must be stated over the return, not over one condition by name',
  );
  assert.doesNotMatch(
    shared,
    /newest comment, review thread, or thread reply/i,
    'the fallback evidence set must name the submitted reviews too',
  );
  assert.doesNotMatch(
    prComments,
    /Two further operations/i,
    'the Forgejo limitation paragraph miscounted its own three-item list',
  );

  // And the positive halves, so a deletion cannot pass as a correction.
  assert.match(
    flat(section(shared, '### Precedence')),
    near('submitted review', 'headCommittedAt', 900),
    'the fallback must weigh a submitted review against the head commit timestamp',
  );
  assert.match(
    flat(section(shared, '### This narrows the window')),
    near('review', 'Phase-4|Phase 4', 500),
    'the narrowing-window obligation must name the review surface its consumer closes',
  );
  assert.match(
    flat(section(prComments, '### Read the submitted reviews')),
    /`prReviewsRead`/,
    'the new read section must name its capability key',
  );
});

test('an undecided latest verdict blocks in its own right, on both halves of the rule', () => {
  const state = source('src/shared/review-bot-state.md');
  const gate = source('src/tools/merge-gate.md');
  const supersession = prose(
    section(state, '### A changes-requested verdict and what supersedes it'),
  );
  const condition = prose(mergeCondition(mergeConditions(gate), 10));

  // Two halves, asserted separately, because the merged change shipped a remedy that closed only
  // the first: an implementer could satisfy every criterion and fix half the bug.
  for (const [surface, text] of [
    ['the shared contract', supersession],
    ['condition 10', condition],
  ]) {
    assert.match(
      text,
      /undecided latest neither clears nor supersedes/i,
      `${surface} must state that an undecided latest does not clear a standing verdict`,
    );
    assert.match(
      text,
      /undecided[\s\S]{0,120}is itself an unassessed verdict/i,
      `${surface} must state that an undecided latest is itself an unassessed verdict`,
    );
  }

  // The supersession list grew a fourth case, and its own closing count has to grow with it — the
  // stale count is what a reader applies when the list and the sentence disagree.
  assert.match(supersession, /these four cases are the whole rule/i);
  assert.doesNotMatch(state, /three cases/i, 'the supersession list no longer holds three cases');
  assert.doesNotMatch(
    gate,
    /three fail-closed causes/i,
    "Phase 6's fail-closed-cause count must follow condition 10",
  );
  assert.match(prose(section(gate, '### Phase 6')), /four fail-closed causes/i);
});

test('the undecided cause is scoped to condition 10 and never reaches the human-comment guard', () => {
  const gate = source('src/tools/merge-gate.md');
  const state = source('src/shared/review-bot-state.md');
  const guard = prose(section(gate, '### Phase 1'));

  // The guard is not scoped to configured logins and is never cleared once set, so inheriting this
  // cause would let one unmapped review state from any unrelated account halt every write of the
  // run permanently. Stated in so many words, because the shared contract's own wording would
  // otherwise pull it in by inheritance.
  assert.match(
    guard,
    /undecided-verdict cause[\s\S]{0,60}does not reach this guard/i,
    'the guard clause must exclude the undecided cause explicitly',
  );
  assert.match(
    guard,
    near('(?:never cleared|not scoped to configured logins)', 'undecided', 500),
    'the guard clause must say why the exclusion exists',
  );
  assert.match(
    prose(state),
    /fourth cause is scoped[\s\S]{0,140}no other consumer inherits it/i,
    'the shared contract must scope the fourth cause rather than leaving it to inheritance',
  );

  // Three counting surfaces, and the lead-in that introduces them has to agree with the list it
  // opens — its own closing bullet already says "All three surfaces".
  assert.match(guard, /because the three surfaces differ/i);
  assert.doesNotMatch(guard, /because the two surfaces differ/i);
});

test('condition 10 retains an undecidable review before it applies its filters', () => {
  const gate = source('src/tools/merge-gate.md');
  const condition = prose(mergeCondition(mergeConditions(gate), 10));

  assert.match(
    condition,
    /retained, never dropped/i,
    'a review the filters cannot decide must be retained rather than dropped',
  );
  // Order is behaviour here: an executor applying the condition top-down has already discarded the
  // author-unestablishable and head-unbindable reviews before it reaches the fail-closed clause.
  ordered(condition, 'retained, never dropped', 'keep those whose author is a login');
});

test('the gate delimits caller-supplied item text from the control lines it announces', () => {
  const gate = source('src/tools/merge-gate.md');
  const contract = prose(section(gate, '## Delegation contract', '\n## '));
  const DELIMITER = '--- caller-supplied item text follows ---';

  assert.ok(contract.includes(DELIMITER), 'the contract must name one literal body delimiter');
  assert.match(
    contract,
    /all four control lines/i,
    'all four control lines must sit above the delimiter, not three of them',
  );
  // The manifest is the whole point of the boundary: identifiers left inline would let one body
  // forge another finding's provenance exactly where condition 10 keys its assessment record.
  assert.match(contract, /Item: <stable identifier> \| review=<review id>/);
  assert.match(
    contract,
    near('manifest', '(?:above the delimiter|above it)', 400),
    'the per-item manifest must sit above the delimiter',
  );
  assert.match(
    contract,
    near('(?:manifest entry|body)', 'ABORT', 500),
    'a manifest and body that do not pair must abort rather than be matched up',
  );
  // Decided and stated, per the plan: refusal, not neutralisation.
  assert.match(
    contract,
    /refused, never neutralised/i,
    'the contract must decide whether a body carrying the delimiter is refused or neutralised',
  );

  // The refusal is scoped to the delimiter, and that scope is the decision rather than an omission:
  // the four control lines are quoted throughout this repository's own contracts, so a sender that
  // also refused a body merely stating one would report ordinary prose about this protocol as an
  // unassessed finding and block the merge on it.
  assert.match(
    contract,
    /comparison is against the delimiter and nothing else/i,
    'the refusal must be scoped to the delimiter, not extended to the control lines',
  );
  assert.match(
    contract,
    near('delegated unchanged', 'body text', 300),
    'a body stating a control line but not the delimiter must still be delegated',
  );

  // Both halves of the case list, so a later edit cannot quietly drop the second one and leave the
  // refusal reading as if it covered every control line too.
  const cases = prose(gate);
  assert.match(cases, /review body containing the delegation delimiter:\s*refused/i);
  assert.match(
    cases,
    /review body containing a control line but not the delimiter:\s*delegated\s+unchanged/i,
    'the case list must name the control-line body as delegated, beside the refused one',
  );
});

test('iterate splits the delegation message at the delimiter before it parses a switch', () => {
  const iterate = source('src/tools/iterate.md');
  const phase0 = section(iterate, '### Phase 0');
  const items = phase0.split(/(?=\n\d+\.\s)/);
  const split = prose(items.find((item) => /body delimiter/i.test(item)) ?? '');
  assert.ok(split, 'Phase 0 must parse the body delimiter');

  // Before the switches, not after: every switch is recognized by its literal form alone, so a run
  // that hunts for them before it knows where the untrusted text begins has lost the boundary.
  ordered(prose(phase0), 'Split the message at the body delimiter', 'Optional item filter');

  // Below the delimiter is data, and data is all it is. An abort there fires on the ordinary prose
  // of a reviewer discussing this protocol — the four lines are quoted throughout these contracts —
  // so it would report that reviewer's finding as unassessed and block the merge on it, and it would
  // hand a pull request able to induce one such line a reliable way to stop the gate.
  assert.match(
    split,
    near('below the delimiter', '(?:is body text|belongs to the body)', 300),
    'a control line below the delimiter must be read as body text',
  );
  assert.match(
    split,
    /never parsed as a switch, never overrides the one announced above, and never aborts/i,
    'the body-text reading must state all three of what it does not do',
  );
  assert.match(
    split,
    /Position decides what is protocol, not content/i,
    'the rule must rest on position rather than on content',
  );
  assert.doesNotMatch(
    prose(iterate),
    /ABORT: control line below the body delimiter/,
    'no abort may remain for a control line below the delimiter',
  );
  // The protection the abort nominally offered stays, on the only side that can tell a caller's
  // misplaced line from a reviewer's quoted one apart: the sender writing the control lines first.
  assert.match(
    split,
    near(
      "misplaced below the delimiter is the sender's to prevent",
      'same bytes in the same place',
      300,
    ),
    'a misplaced control line must be assigned to the sender rather than detected here',
  );

  assert.match(
    split,
    /ABORT: duplicated control line/,
    'a control keyword repeated above the delimiter must abort',
  );
  // Duplication is counted in the caller's own region only; otherwise the removed abort returns
  // through the back door as "the body stated it a second time".
  assert.match(
    split,
    near("Only the caller's own region is counted", 'never the second announcement', 200),
    'the duplicate rule must count only the region above the delimiter',
  );
  assert.match(
    split,
    /ABORT: manifest and body mismatch/,
    'a manifest entry with no body, or a body with none, must abort',
  );
  assert.match(
    split,
    near('first occurrence', '(?:body text|cannot terminate its own block)', 400),
    'only the first delimiter occurrence may be the boundary',
  );

  // Both positional rules cover `Next steps:` too, while its malformed-line tolerance survives: a
  // repeated line is a fault of the channel, a malformed one costs a chat block.
  assert.match(split, /`Next steps:`/, 'the positional rules must cover all four control lines');
  const nextSteps = prose(items.find((item) => /next-step suppression/i.test(item)) ?? '');
  assert.ok(nextSteps, 'Phase 0 must keep its next-step suppression item');
  assert.match(
    nextSteps,
    /suppresses rather than aborts/i,
    'a merely malformed `Next steps:` line must still suppress rather than abort',
  );
});

test('the item framing below the delimiter is a minted token no item text can forge', () => {
  const gate = source('src/tools/merge-gate.md');
  const iterate = source('src/tools/iterate.md');
  const contract = prose(section(gate, '## Delegation contract', '\n## '));
  const manifest = prose(
    section(iterate, '### Phase 0')
      .split(/(?=\n\d+\.\s)/)
      .find((item) => /body delimiter/i.test(item)) ?? '',
  );
  assert.ok(manifest, 'Phase 0 must parse the body delimiter');

  // The token is what frames an item, so both ends of the channel have to carry it: a sender that
  // declares none leaves the receiver with nothing to split the region on, and a receiver that reads
  // none is back to looking for a pattern in text it does not trust.
  for (const [text, label] of [
    [contract, 'merge-gate'],
    [manifest, 'iterate'],
  ]) {
    assert.match(text, /Item: <stable identifier> \| review=<review id>/, `${label} manifest form`);
    assert.match(text, /`Boundary token: <token>`/, `${label} must declare the boundary token`);
    assert.match(
      text,
      near('manifest order', 'separated by (?:that|the boundary) token', 300),
      `${label} must lay the item texts out in manifest order, separated by the token`,
    );
    assert.match(
      text,
      near('own line', 'no separator before the first', 300),
      `${label} must put the token on its own line and only between the items`,
    );
  }

  // The sender's whole obligation, and both halves of it: an unpredictable token, and the substring
  // search that establishes it is absent before the message goes out. Without the search the token
  // is only probably absent, and "probably" is what the untrusted text gets to attack.
  assert.match(
    contract,
    near('Mint it freshly for every message', 'at random', 300),
    'the sender must mint an unpredictable token per message',
  );
  assert.match(
    contract,
    near('search every body', 'plain substring', 300),
    'the sender must verify the token is absent by substring search',
  );
  // Scope is the whole of it. The check covers what the caller supplied — the bodies plus the
  // provenance values the manifest carries on their behalf — and stops there.
  assert.match(
    contract,
    near('search every body', 'caller-supplied value the manifest carries', 200),
    'the absence check must cover every body plus the caller-supplied manifest values',
  );
  assert.match(
    contract,
    near('occurs in any of them', 'mint another one and search again', 200),
    'a token colliding with caller-supplied content must be re-minted and re-checked',
  );
  // And it must stop there, explicitly. The token stands in its own declaration line and in every
  // separator by construction, so a check that covered "the message" would collide with the
  // sender's own framing on every candidate and re-mint forever: no delegation would ever be sent
  // and every finding would come back unassessed with the merge blocked on it.
  assert.match(
    contract,
    near('`Boundary token:` declaration line', 'separator line', 200),
    'the sender must name the two places its own framing carries the token by construction',
  );
  assert.match(
    contract,
    near("sender's own occurrences are not a collision", 'they are the framing', 200),
    "the contract must state that the sender's own occurrences are the framing, not a collision",
  );
  assert.match(
    contract,
    near('mint,', 'then write the declaration and the separator lines', 300),
    'the contract must order the mint and the absence check before the framing is written',
  );
  for (const [text, label] of [
    [contract, 'merge-gate'],
    [manifest, 'iterate'],
  ]) {
    assert.doesNotMatch(
      text,
      /(?:every other part of the message|nowhere else in the message|anywhere in the message)/i,
      `${label} must not extend the absence check over the sender's own protocol text`,
    );
  }
  // The receiver rests the property on the sender's check, so it has to restate the same scope: an
  // "and nowhere else in the message" here is the identical non-terminating rule, one file over.
  assert.match(
    manifest,
    near('occurs in none of them', 'caller-supplied values its manifest carries', 300),
    'the receiver must restate the absence check as scoped to caller-supplied content',
  );
  assert.match(
    manifest,
    near('declaration line and its separator lines', 'never terminate', 300),
    "the receiver must say why the check cannot reach the sender's own framing",
  );

  // The receiver's whole obligation, and the explicit refusal of the arithmetic the byte count
  // demanded: a split on the token, and nothing else that could decide a boundary.
  assert.match(
    manifest,
    near('Split the region', 'on that exact token', 200),
    'the receiver must split the region on the token',
  );
  assert.match(
    manifest,
    near('do nothing else to find a boundary', '(?:no counting|no byte offsets|no grammar)', 200),
    'the receiver must determine boundaries by the split alone',
  );

  // The byte-count framing is replaced, not layered under the token: two framings would be two
  // things to keep in step, and the arithmetic one is the half a language model gets wrong.
  for (const [text, label] of [
    [gate, 'merge-gate'],
    [iterate, 'iterate'],
  ]) {
    assert.doesNotMatch(prose(text), /bytes=/, `${label} must not still declare a byte count`);
    assert.doesNotMatch(
      prose(text),
      /(?:sum of the counts|declared sum|byte count of that)/i,
      `${label} must not still frame an item by a declared length`,
    );
    assert.doesNotMatch(
      prose(text),
      /each body is introduced by a line carrying its identifier/i,
      `${label} must no longer frame an item by an introducer line`,
    );
    assert.doesNotMatch(
      prose(text),
      /runs to the next such line/i,
      `${label} must no longer end an item at the next matching line`,
    );
  }

  // The property, stated rather than left to be inferred from the mechanism, and argued from the
  // one fact that establishes it: the token was verified absent from the bodies before they shipped.
  for (const [text, label] of [
    [contract, 'merge-gate'],
    [manifest, 'iterate'],
  ]) {
    assert.match(
      text,
      /No sequence of characters a(?:n item text|\s+body) can contain changes how it is framed/i,
      `${label} must state the property its framing establishes`,
    );
    assert.match(
      text,
      near('substring search', 'occurs in none of them', 400),
      `${label} must rest the property on the verified-absent token, not on trusting the text`,
    );
  }
  assert.match(
    manifest,
    near('stricter grammar', '(?:still a grammar|out of the content)', 400),
    'the contract must say why a stricter introducer grammar is not the fix',
  );
  // Why the swap keeps what it replaced, and what it stops asking of a language-model operator.
  assert.match(
    contract,
    near('unforgeability', 'fixed from outside the span', 400),
    'the sender must say why the token keeps the unforgeability the declared length had',
  );
  assert.match(
    contract,
    near('multibyte Unicode', '(?:substring search and a split|unreliably)', 600),
    'the sender must say why byte arithmetic was the part worth removing',
  );

  // The negative half: an item that spells out the framing syntax, a control line, or the text
  // around the delimiter is not refused, not escaped and not cut short — its extent was fixed
  // before any character of it was read.
  assert.match(
    manifest,
    near(
      'bracketed identifier',
      '(?:delivered whole|inside the single span already fixed for it)',
      500,
    ),
    'an item containing the framing syntax must still be delivered whole',
  );
  assert.match(
    manifest,
    near('all four control lines', 'delivered whole', 500),
    'an item containing a control line must still be delivered whole',
  );
  assert.match(
    manifest,
    near('may contain the delimiter', 'delivered whole', 500),
    'an item containing the delimiter itself must still be delivered whole',
  );
  assert.match(
    manifest,
    near('`Boundary token:` line', 'delivered whole', 500),
    'an item containing a boundary-token line must still be delivered whole',
  );
  assert.match(
    prose(gate),
    /review body containing the item-framing syntax:\s*delegated unchanged and delivered whole/i,
    'the case list must name the framing-syntax body as delegated and delivered whole',
  );

  // The abort survives for the one fault it was always about — a message the caller assembled wrong
  // — and it now counts items rather than bytes.
  assert.match(
    manifest,
    near(
      'ABORT: manifest and body mismatch',
      'different number of spans than the manifest declares entries',
      400,
    ),
    'the mismatch abort must fire on a span count, not on a length',
  );
  assert.match(
    manifest,
    near('ABORT: manifest and body mismatch', 'counts items, never bytes', 600),
    'the mismatch abort must be a count of items rather than of bytes',
  );
  assert.match(
    manifest,
    near('ABORT: manifest and body mismatch', 'never from what an item text contains', 700),
    'the mismatch abort must be unreachable from what an item text contains',
  );
});

// The return direction of the merge-gate -> iterate delegation. The forward direction is framed by
// the four control lines above; the way back is framed by nothing, and is instead made safe by a key
// set the receiver pre-commits. These assertions pin that rule, the closed vocabulary both ends
// speak, and the identifier requirement the rule rests on.
const returnedRecord = (text, label) => {
  const record = prose(section(text, '## Returned outcome record', '\n## '));
  assert.ok(record.trim(), `${label} must declare its returned outcome record in its own section`);
  return record;
};

test('both ends of the iterate return declare one closed outcome vocabulary', () => {
  const gate = source('src/tools/merge-gate.md');
  const iterate = source('src/tools/iterate.md');

  // Extracted rather than pattern-matched, so a fifth value or a renamed one fails instead of
  // passing because the four expected words happen to be somewhere in the section.
  const declared = (text, label) => {
    const match = returnedRecord(text, label).match(
      /agreed outcome vocabulary is closed and has four values:([^.]+)\./i,
    );
    assert.ok(match, `${label} must declare the closed outcome vocabulary in one sentence`);
    const values = [...match[1].matchAll(/`([a-z]+)`/g)].map((hit) => hit[1]).sort();
    assert.deepEqual(
      [...new Set(values)],
      values,
      `${label} must not declare a value twice in the vocabulary sentence`,
    );
    return values;
  };

  const expected = ['deferred', 'implemented', 'rejected', 'unassessed'];
  const gateValues = declared(gate, 'merge-gate');
  const iterateValues = declared(iterate, 'iterate');
  assert.deepEqual(gateValues, expected, 'merge-gate must declare exactly the agreed four values');
  assert.deepEqual(iterateValues, expected, 'iterate must declare exactly the agreed four values');
  assert.deepEqual(gateValues, iterateValues, 'the two ends of the channel must not drift apart');

  // The mapping itself, compared row for row rather than probed for keywords. A `near()` probe went
  // vacuous here in review: with the rows adjacent, dropping one still left its neighbour's value
  // inside the window. Both files carry the identical table deliberately — one end holding the
  // mapping alone is the end the other drifts from.
  const mapping = (text, label) => {
    returnedRecord(text, label);
    const table = section(text, '## Returned outcome record', '\n## ')
      .split('\n')
      .filter((line) => line.startsWith('|') && !/^\|[\s-]+\|[\s-]+\|$/.test(line))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    assert.ok(table.length >= 7, `${label} must map every processing outcome, header included`);
    return table;
  };

  const gateTable = mapping(gate, 'merge-gate');
  const iterateTable = mapping(iterate, 'iterate');
  assert.deepEqual(
    gateTable,
    iterateTable,
    'the two ends must carry the identical processing-to-outcome mapping',
  );

  // The three rows that are not word-for-word, and are therefore the ones a drift reinterprets
  // silently: `skipped` is a processing outcome on one side and two different assessments on the
  // other, while `failed` and a deselected item are no assessment at all.
  const mapped = new Map(gateTable.slice(1).map(([from, to]) => [from, to]));
  assert.deepEqual(
    [...mapped.values()].filter((value) => value === '`unassessed`').length,
    2,
    'exactly the two non-assessments must map onto `unassessed`',
  );
  for (const [pattern, expected, label] of [
    [/^`skipped` as a false positive/, '`rejected`', 'a false positive'],
    [/^`skipped` as out of scope/, '`deferred`', 'an out-of-scope item'],
    [/^`failed`/, '`unassessed`', 'a failed implementation'],
    [/^deselected/, '`unassessed`', 'a deselected item'],
  ]) {
    const row = [...mapped].find(([from]) => pattern.test(from));
    assert.ok(row, `the mapping must carry a row for ${label}`);
    assert.equal(row[1], expected, `${label} must map onto ${expected}`);
  }
  for (const value of new Set(mapped.values())) {
    assert.ok(
      expected.includes(value.replaceAll('`', '')),
      `the mapping must not produce a value outside the closed vocabulary: ${value}`,
    );
  }
});

test('the gate consumes the iterate return only through identifiers it recorded before delegating', () => {
  const gate = source('src/tools/merge-gate.md');
  const record = returnedRecord(gate, 'merge-gate');

  // The sentence the whole section exists for. Its absence was the defect: the gate consumed "the
  // reported outcome per item" out of free prose, so any text in the return could state one.
  assert.match(
    record,
    /No outcome is derived from anything else in the returned text/i,
    'the receiver rule must state that nothing else in the return produces an outcome',
  );
  assert.doesNotMatch(
    prose(gate),
    /Consume `\{\{SKILL:iterate\}\}`'s reported outcome per item/i,
    'the retired consumption sentence must be gone rather than supplemented',
  );

  // Keyed to what was recorded, and recorded covers both halves: the identifiers this run mints for
  // body findings and the forge thread IDs it hands over. Keyed to the minted half alone, every
  // thread outcome would be inert and conditions 6 and 7 would have nothing to read.
  assert.match(
    record,
    near('receiver rule', 'recorded', 200),
    'the rule must be keyed to the identifiers recorded before the delegation',
  );
  assert.match(
    record,
    near('recorded every item identifier it is about to supply', 'forge thread IDs', 300),
    'the pre-committed key set must cover the forge thread IDs beside the minted identifiers',
  );
  assert.match(
    record,
    near('pre-commitment', 'unpredictability', 400),
    'the rule must rest on pre-commitment rather than on the unpredictability of one half',
  );

  // The four outcomes of a match, each of which a naive rule gets wrong in a different direction.
  assert.match(
    record,
    near('same', 'idempotent', 200),
    'a repeated identical outcome must be idempotent rather than a second outcome',
  );
  assert.match(
    record,
    near('suppressed summary', '(?:restates|idempotent)', 400),
    'the idempotence must be grounded in the suppressed summary restating the outcomes',
  );
  assert.match(
    record,
    near('conflicting', 'mismatch', 200),
    'two different values for one identifier must be a mismatch',
  );
  assert.match(
    record,
    near('no outcome at all', 'same mismatch', 200),
    'a recorded identifier with no outcome must be the same mismatch',
  );
  assert.match(
    record,
    near('did not record', 'inert', 200),
    'an outcome naming an unrecorded identifier must be inert',
  );
  assert.match(
    record,
    near('inert', '(?:never fatal|never be fatal)', 300),
    'the inert case must be stated as never fatal',
  );
  // Inertness is narrowness, not immunity — the overclaim this section must not make.
  assert.match(
    record,
    near('narrowness, not immunity', 'whole-run', 400),
    'the rationale must concede that a forged whole-run abort stays reachable',
  );

  // Unbounded, quoted inert outcomes would put attacker-influenceable text into the Phase 6 summary
  // and into this gate's own return when it runs delegated. Containment is deferred, so the report
  // itself is what has to be bounded and de-quoted.
  assert.match(
    record,
    near('identifier and a count', 'never by reproducing its text', 200),
    'an inert outcome must be reported by identifier and count, never by its text',
  );
  assert.match(record, near('at most', 'ten', 120), 'the inert report must state a concrete bound');
  assert.match(
    prose(section(gate, '### Phase 6')),
    near('inert returned outcome', '(?:count|identifier)', 300),
    'Phase 6 must be where the inert outcomes reach the user',
  );

  // A non-assessment survives the round and blocks at condition 10; any other out-of-set value is a
  // mismatch. Collapsing the two would either lose a round or wave a finding through.
  assert.match(
    record,
    near('outside the closed vocabulary', 'mismatch', 200),
    'an out-of-set value must be a mismatch',
  );
  assert.match(
    record,
    near('outside the closed vocabulary', 'non-assessment', 200),
    'the mapped non-assessment must be stated as the exception to that mismatch',
  );
  assert.match(
    record,
    near('non-assessment leaves the item `unassessed`', 'condition 10 blocks', 300),
    'a mapped non-assessment must leave the item unassessed rather than end the round',
  );
});

test('the Phase 3 assessment record is written from the validated return and two gate-internal writers', () => {
  const gate = source('src/tools/merge-gate.md');
  const record = returnedRecord(gate, 'merge-gate');

  assert.match(
    record,
    near('Phase 3 per-finding record', 'validated return', 400),
    'the delegated half of the record must come from the validated return alone',
  );
  // Both writers, named. Step 5 of the plan contradicted an existing rule by omitting the first:
  // an empty-bodied review still has to be assessed, and it has no identifier at all.
  assert.match(
    record,
    near('empty body', '(?:no identifier of any kind|no identifier)', 400),
    'the empty-bodied review must be named as a gate-internal writer with no identifier',
  );
  assert.match(
    record,
    near('human-comment guard', "(?:gate's own decision|delegates nothing)", 300),
    'a finding assessed under the guard must be named as the second gate-internal writer',
  );

  // The identifier-free delegation. Its return is consumed, so a rule that only spoke about
  // identified items would leave it undescribed rather than out of scope.
  assert.match(
    record,
    near('CI repair', '(?:free-text-only|no manifest)', 400),
    'the identifier-free CI repair must be covered explicitly',
  );
  assert.match(
    record,
    near('CI repair', '(?:fresh check read|whole-run abort)', 600),
    'the CI repair outcome must be consumed through the check read and the whole-run abort',
  );
});

test('no side of the iterate channel still claims a per-item ABORT', () => {
  const gate = source('src/tools/merge-gate.md');
  const iterate = source('src/tools/iterate.md');

  assert.doesNotMatch(
    prose(gate),
    /On `ABORT` for an item/i,
    'the gate must no longer presume a per-item ABORT that iterate never emits',
  );
  for (const [text, label] of [
    [gate, 'merge-gate'],
    [iterate, 'iterate'],
  ]) {
    const record = returnedRecord(text, label);
    assert.match(
      record,
      near('whole-run', '`ABORT`', 200),
      `${label} must state that every returned ABORT is whole-run`,
    );
    assert.match(record, /per-item `ABORT`/, `${label} must name the per-item ABORT it rules out`);
  }
  // Per file, because the sentence differs on each side and a shared `near()` probe was satisfied by
  // the mapping table sitting a few lines above it.
  assert.match(
    returnedRecord(gate, 'merge-gate'),
    near('implementation delegation aborted comes back marked', '`unassessed`', 60),
    'the gate must read an aborted item as unassessed rather than as a channel fault',
  );
  assert.match(
    returnedRecord(iterate, 'iterate'),
    near("sub-agent's `ABORT` marks that one item", '`unassessed`', 60),
    'iterate must map an aborted sub-agent onto the unassessed outcome',
  );
  // The DONE/ABORT note lives in the two tools that need it, never in the eagerly included
  // completion-protocol fragment: fifteen tools carry that fragment and review.md renders within a
  // handful of lines of its 700-line budget.
  assert.doesNotMatch(
    source('src/shared/completion-protocol.md'),
    /whole-run|per-item/i,
    'the workflow-handoff note must not be added to the eagerly included completion protocol',
  );
});

test('iterate returns exactly one outcome per caller-supplied item identifier', () => {
  const iterate = source('src/tools/iterate.md');
  const record = returnedRecord(iterate, 'iterate');

  assert.match(
    record,
    near('One outcome per caller-supplied item identifier', 'exactly one', 200),
    'iterate must state one outcome per supplied identifier',
  );
  // Both halves of the key set, and explicitly no difference between them: a rule stated only for
  // the minted identifiers would leave every thread outcome unpromised.
  assert.match(
    record,
    near('minted for a body-carried finding', 'forge thread ID', 100),
    'both a minted identifier and a thread ID must be covered by the same promise',
  );
  assert.match(
    record,
    near('forge thread ID', 'no difference between the two', 100),
    'the two halves of the key set must be promised identically',
  );
  assert.match(
    record,
    near('mints no identifier of its own', 'merges no two', 300),
    'iterate must mint no identifier of its own and merge no two identified items',
  );
  // The record is stated separately from the handed-back summary, while the receiving rule is
  // explicitly not allowed to depend on that separation.
  assert.match(
    record,
    near('Summary comment: suppressed', 'own complete list', 400),
    'the record must be stated separately from the handed-back summary content',
  );
  assert.match(
    record,
    near('must not depend on the separation', 'idempotent', 300),
    'the caller rule must not be allowed to rest on that separation',
  );
});

test('the gate mints its item identifier per message, to the token concrete requirement', () => {
  const gate = source('src/tools/merge-gate.md');
  const contract = prose(section(gate, '## Delegation contract', '\n## '));

  // The same concrete numbers the boundary token carries. "Comparable to" was unmeasurable, and an
  // unmeasurable requirement is one no reader and no test can check.
  assert.match(
    contract,
    near('Mint that identifier', 'at least 32 characters', 300),
    'the identifier requirement must state the token concrete length',
  );
  assert.match(
    contract,
    near('at least 32 characters', '`A`–`Z` and `0`–`9`', 200),
    'the identifier requirement must state the token alphabet',
  );
  assert.doesNotMatch(
    contract,
    /comparable to the (?:boundary )?token/i,
    'the unmeasurable "comparable to" requirement must be gone',
  );

  // Per-message channel key, with the durable key named separately: an identifier disclosed in a
  // report or in a delegated gate own return must be worthless in a later round.
  assert.match(
    contract,
    near('freshly for every delegation message', 'per-message channel key', 400),
    'the identifier must be minted per delegation message',
  );
  assert.match(
    contract,
    near('durable', 'finding ordinal', 300),
    'the durable key must be the review id plus a finding ordinal',
  );
  assert.match(
    contract,
    near('Record each per-message identifier', 'before the delegation, never after it', 300),
    'the identifiers must be recorded before the delegation, never after it',
  );
  assert.match(
    contract,
    near('pre-committed key set', '(?:forge thread ID|thread ID)', 400),
    'the recorded key set must include the thread IDs the item filter carries',
  );

  // The absence check keeps the identifiers in scope and drops only the wrong label. The scope
  // itself is pinned by the framing test; what this asserts is that the correction did not narrow
  // it while removing the contradiction.
  assert.match(
    contract,
    near('search every body', 'caller-supplied value the manifest carries', 200),
    'the absence check must still cover the manifest values',
  );
  assert.match(
    contract,
    /the stable identifiers, which do not/i,
    'the identifiers must be named as content this gate did write',
  );
  assert.match(
    contract,
    near('identifiers stay inside the check', 'lose that label', 300),
    'the identifiers must stay in the absence-check scope while losing the wrong label',
  );
  assert.doesNotMatch(
    contract,
    /the stable identifiers, the review ids, the author logins and the review URLs/i,
    'the retired origin claim must be gone rather than merely supplemented',
  );
});

test('the return is declared in its own section and adds no fifth control line', () => {
  const gate = source('src/tools/merge-gate.md');
  const record = returnedRecord(gate, 'merge-gate');
  const contract = prose(section(gate, '## Delegation contract', '\n## '));

  // The four control lines are counted by the delimiter test above. A return announced as a fifth
  // one would move a boundary that test guards, so the return gets a section instead.
  assert.match(contract, /all four control lines/i, 'the forward direction must still carry four');
  assert.match(
    record,
    near('not', 'fifth control line', 200),
    'the return must state that it is not a fifth control line',
  );
  ordered(gate, '## Delegation contract', '## Returned outcome record');

  // The sibling contract in the shared fragment: one classification set behind the other, and the
  // "one item per supplied ID" requirement stated once on each channel rather than conflated.
  const integration = prose(source('src/shared/pr-review-integration.md'));
  assert.match(
    integration,
    near('judgment vocabulary', '(?:behind|never these values)', 400),
    'the handoff classification set must be marked as a vocabulary behind the outcome ones',
  );
  assert.match(
    integration,
    near('`{{SKILL:iterate}}`', '`skipped`', 300),
    'the fragment must name where iterate skipped is actually produced',
  );
  assert.match(
    integration,
    near('sibling', 'pre-commits', 500),
    'the fragment must separate its own one-item-per-ID rule from the pre-committed one',
  );

  // The user-facing surface the documentation-sync gate makes mandatory here.
  const deliver = prose(source('docs/user-guide/tools-deliver.md'));
  assert.match(
    deliver,
    near('`unassessed`', '(?:deselected|implementation failed)', 500),
    'the user guide must name the fourth value and when a reader sees it',
  );
  assert.match(
    deliver,
    near('recorded before delegating', 'written down every item identifier', 300),
    'the user guide must describe the pre-committed key set',
  );
  assert.match(
    deliver,
    near('never handed over', 'reported and otherwise ignored', 100),
    'the user guide must say that an unrecognized identifier is ignored rather than fatal',
  );
});

test('no contract still carries the four retired claims about reviews and surfaces', () => {
  const state = source('src/shared/review-bot-state.md');
  const integration = source('src/shared/pr-review-integration.md');
  const deliver = source('docs/user-guide/tools-deliver.md');

  // Each of the four was load-bearing for a rule a reader or an executor has to apply, and each
  // became false — or was already stale — when the review surface was added.
  for (const [claim, text, label] of [
    [/not readable through the plumbing/i, integration, 'a review body is unreadable'],
    [/not readable through those operations/i, integration, 'a review body is unreadable'],
    [/two surfaces the state is read from/i, state, 'the state is read across two surfaces'],
    [/exactly three ways/i, deliver, 'a verdict stops blocking in exactly three ways'],
  ]) {
    assert.doesNotMatch(text, claim, `the retired claim must be gone: ${label}`);
  }

  // The stale `One read, one head` enumeration omitted the submitted reviews both consumers read.
  const oneRead = prose(section(state, '### One read, one head'));
  assert.match(
    oneRead,
    /submitted reviews/i,
    'the one-read enumeration must name the submitted reviews it now covers',
  );

  // The replacement grounds, so a deletion cannot pass as a correction.
  assert.match(
    prose(integration),
    near('(?:threads and the|two surfaces)', '(?:scope|reads those two surfaces only)', 400),
    'the outside-diff ground must be restated as scope rather than as capability',
  );
  assert.match(
    prose(deliver),
    /undecided[\s\S]{0,200}unassessed verdict/i,
    'the user-facing enumeration must name the undecided cause the contract blocks on',
  );
});

test('every site stating the pending discriminator is true on both providers', () => {
  // Five sites carry the claim that a missing submission time is what marks a pending review. On
  // Forgejo the field is never missing — Gitea declares it without `omitempty` — so each site has
  // to say that the helper normalizes the zero instant, and each names the portable `PENDING`
  // cross-check both providers emit.
  const sites = [
    ['src/shared/review-bot-state.md', /A review with no `submittedAt` is a pending/],
    ['src/shared/pr-review-comments.md', /A review with no submission time is a pending/],
    ['src/tools/merge-gate.md', /A pending review the caller owns/],
    ['docs/user-guide/remote-tracker.md', /A review with no submission time is a pending draft/],
    ['src/scripts/remote-tracker-core.mjs', /`submittedAt` is absent for a pending review/],
  ];
  for (const [path, anchor] of sites) {
    const text = prose(source(path));
    const at = text.search(anchor);
    assert.notEqual(at, -1, `${path} must still carry the pending discriminator`);
    const window = text.slice(at, at + 700);
    assert.match(window, /zero instant/i, `${path} must name the zero instant it normalizes`);
    assert.match(window, /PENDING/, `${path} must name the portable PENDING cross-check`);
  }
});
