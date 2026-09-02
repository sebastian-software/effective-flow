import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assertNoUnresolvedEagerIncludes,
  collectIncludeNames,
  findNextStepsDocViolations,
  LAZY_INCLUDE_RE,
  parseAskBlock,
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

// Slices from an opening marker to a **required** stop marker. `section()` asserts only that its
// heading exists: when a stop string is renamed or removed, `indexOf` returns -1 and
// `slice(start, -1)` silently widens the cut to "everything but the last character", so every
// assertion below it goes vacuous while still reporting success. That is the failure class
// `mergeConditionsAndTail` guards against by hand; this is the reusable form. Both markers are
// kept in the slice, and the stop is searched after the opening so a marker that also appears
// above the section cannot invert the cut.
function boundedSlice(text, start, stop) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing opening marker: ${start}`);
  const to = text.indexOf(stop, from + start.length);
  assert.notEqual(to, -1, `missing stop marker: ${stop}`);
  return text.slice(from, to);
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

// Every Markdown list item in the given text, at any indentation and for either bullet marker.
// `line.startsWith('- ')` sees top-level hyphen bullets only, so a nested sub-item or an
// asterisk-marked one slips past a "this list holds exactly N items" guard — which is the single
// thing such a guard exists to catch. Continuation lines of a wrapped item are not items and stay
// out, so an item's own index is stable.
function bullets(text) {
  return text.split('\n').filter((line) => /^\s*[-*] /.test(line));
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
  // Only the row's own table is searched. The upward scan stops at the first non-table line
  // above the row, so a target table whose `Default` header was renamed fails loudly instead
  // of silently borrowing the column index of an earlier table in the same slice and reporting
  // some other table's cell as this row's default. A `|---|---|` separator row starts with `|`
  // and keeps counting as part of the block.
  const tableLines = [];
  for (let index = rowIndex - 1; index >= 0 && lines[index].startsWith('|'); index -= 1) {
    tableLines.push(lines[index]);
  }
  const header = tableLines.find((line) => rowCells(line).includes('Default'));
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

test('the session-title contract ships per emitting tool and stays out of the router', () => {
  const router = source('src/SKILL.md');
  const fragment = source('src/shared/session-title.md');
  const renderedRouter = resolveEagerIncludes(router, {
    context: 'SKILL.md',
    readFragment: (name) => source(`src/shared/${name}.md`),
  });

  // The router carried this contract eagerly because, at the time, `build` and `plan`
  // sat at the 700-line context budget and a pointer per tool would have failed the
  // build. That is no longer true - the budget refactor returned headroom, and the
  // pointer costs a single rendered line - so the fragment now loads from the tools
  // that emit and from nowhere else. The router keeps no copy in any form: it resolves
  // eager includes only, so a lazy fence here would ship a dangling pointer, and an
  // eager one would put the contract back into every catalog-only session.
  assert.doesNotMatch(router, /session-title/);
  assert.doesNotMatch(renderedRouter, /```include/);
  assert.doesNotMatch(
    prose(renderedRouter),
    /session title/i,
    'the rendered router must carry no session-title prose at all',
  );
  assert.match(fragment, /\*\*Suggested session title:\*\* <title>/);
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
        `${directory}/${file} must not inline or duplicate the session-title contract`,
      );
    }
  }

  // Load-bearing clauses: only the explicitly established app-native path may
  // target the caller, arbitrary cross-session renames stay forbidden, and the
  // title stays a reference-first emission decided once. This is an instruction
  // contract; it does not claim to execute the Desktop operation.
  const contract = prose(fragment);
  assert.match(contract, near('app-native current-task path', 'takes no task id', 200));
  assert.match(contract, /apply the title silently instead of proposing it/);
  assert.match(contract, /never retitle another session/);
  assert.match(contract, /never probe speculatively/);
  assert.match(contract, near('later automatic title', 'replace one the user set manually', 200));
  assert.match(contract, /a delegate never repeats a subject its parent already proposed/);
  assert.match(contract, /at most 60 characters/);

  // The reference becomes the leading segment, and a run holding none keeps the
  // previous title byte for byte - that fallback is the majority case, so a
  // regression there would be the least visible one this bullet can produce.
  assert.match(contract, /`<Reference> · <Subject> · <tool>`/);
  assert.match(contract, near('no reference leaves', '`<Subject> · <tool>`', 80));

  // The clause this change inverts. Left standing beside the new shape it would
  // forbid exactly what the shape prescribes, so its absence is the pin.
  assert.doesNotMatch(contract, /never in front/);

  // The four reference sources, each rendered as its source renders it, plus the
  // one candidate deliberately excluded: a legacy plan number resolves nowhere
  // and is therefore not a lookup handle.
  assert.match(contract, near('forge issue or pull request', '`#<number>`', 80));
  assert.match(contract, near('tool-native id such as', '`SEB-123`', 80));
  assert.match(contract, near('finding `R-XXXXXXX`', 'absent a tracker reference', 120));
  assert.match(contract, near('several issues', '`\\+N`', 120));
  // Pinned as one clause rather than as two loose tokens in a window: `legacy plan
  // number` near `none` also matches the exact inversion this guards against - a
  // rewrite like "a legacy plan number where none of the above is present" would
  // make the plan number a valid reference and still satisfy a loose pin.
  assert.match(contract, near('a legacy plan number included', 'none', 20));

  // A remote review finding carries a tracker reference and a finding ID at the
  // same time; only the tracker reference resolves in a forge or tracker UI, so
  // one segment wins rather than both being rendered.
  assert.match(contract, near('Exactly one segment', 'tracker reference over finding ID', 120));

  // Truncation is pinned as a sequence, not as three separate mentions: the
  // whole reason it sits in the contract is that two hosts must not cut the same
  // over-long title differently.
  ordered(contract, 'cut the subject', '`<tool>` segment', 'never the reference');

  // The one case where reference-first yields no title at all: a bare reference
  // already over the cap. Without this the precedence above has no terminating
  // rule and a host is left to invent one.
  assert.match(contract, near('a bare reference over it', 'yields none', 40));

  // The token shape is stated generically so an unknown tracker is covered
  // without enumerating trackers, and a candidate outside it is dropped rather
  // than forced into shape - the butler refuses control characters outright, so
  // sanitizing would only hide a malformed reference instead of omitting it.
  // The allowed character class is part of the pin: without it a rewrite to
  // "letters, digits and any punctuation" stays green and reopens exactly the
  // under-specification the plan's deep review closed.
  assert.match(
    contract,
    near('whitespace-free run of letters, digits, `#` and `-`', 'at most 16 characters', 200),
  );

  // The token grammar excludes `+`, while the several-issues form appends `+N`. Without the
  // "before any `+N`" carve-out the two rules contradict each other and a multi-issue title
  // loses its reference entirely, because a non-matching candidate is omitted rather than
  // trimmed. A review bot caught exactly that on the delivering pull request, so pin the
  // carve-out rather than trusting the two clauses to stay compatible by accident.
  assert.match(contract, /A reference token, before any `\+N`, is a whitespace-free run/);
  assert.match(
    contract,
    near('non-matching candidate is omitted', 'never trimmed or sanitized', 160),
  );

  // Late binding is what lets every late-applying path stay at one emission: the
  // subject is fixed when it becomes known, the reference is read at the moment
  // the title is actually used.
  assert.match(contract, /the reference is resolved when the title is applied or emitted/);

  // The re-derivation must name the ChatGPT Desktop native call itself rather than
  // a class of early-applying hosts, or a later host inherits it silently; and it
  // stays gated on all three conditions together.
  assert.match(
    contract,
    near('ChatGPT Desktop native call', 're-derives the title when its inputs change', 160),
  );
  ordered(
    contract,
    'ChatGPT Desktop native call',
    'carried no reference',
    'one now exists',
    'the resulting title differs',
  );
  // ordered() pins sequence but not distance, so the three gates would survive
  // being scattered into separate bullets - where they read as three independent
  // permissions rather than one conjunction. This binds them into one window.
  assert.match(contract, near('carried no reference', 'the resulting title differs', 120));

  // How often a re-derived title is applied belongs to the mechanism fragment and not
  // here: its Claude Code section sends on every character-exact change, six times per
  // run at most, while its ChatGPT Desktop section licenses exactly one further call. A
  // per-run count stated here contradicts one of them whatever number it names, so the
  // delegation is pinned positively and the count this contract used to carry is pinned
  // absent - restoring "may emit once more per run" beside the delegation would
  // otherwise leave the suite green on the positive pin alone.
  assert.match(contract, near('applies it again', 'as often as that fragment allows', 80));
  assert.doesNotMatch(contract, /once more per run/i);

  // The suggestion line is printed in the completion report unconditionally. An
  // earlier draft scoped it to "where no established rename path applies", which
  // left ChatGPT Desktop with a failed capability printing an early,
  // reference-less line while session-rename.md simultaneously claimed that line
  // already carried the reference. Pinning only the completion-report wording
  // would pass on that broken draft, so the qualifier is pinned absent too.
  //
  // The positive pin below carries the scope: `Wherever it is emitted at all` is
  // the wording that makes the line unconditional. Pinning only the absence of
  // the earlier draft's phrase would let any equivalent re-scoping - "only on
  // hosts without a rename path", "unless a rename path applied the title" -
  // restore the broken semantics with the suite green.
  assert.match(
    contract,
    near('Wherever it is emitted at all', 'printed in the run.s completion report', 120),
  );
  assert.match(
    contract,
    near('printed in the run.s completion report', 'never earlier and never twice', 200),
  );
  assert.doesNotMatch(contract, /where no established rename path applies/i);

  // V6: the butler carve-out is what makes an unmandated session refuse. An
  // unmandated session declines a cross-session rename request on two grounds,
  // one of them this very contract - so without this clause every butler on
  // every harness declines too, while the ADR, the mechanism fragment and each
  // assertion above survive untouched. It used to be pinned on the rendered
  // router, as the copy that shipped to every user. The fragment now ships as its
  // own file under `shared/` — but not as raw source: the build runs every shared
  // fragment through `renderGeneratedBody` once per harness. That it comes out
  // byte-identical today holds only because this fragment carries no
  // `{{SKILL:…}}`/`{{AGENT:…}}` reference and no ask block, which is a property of
  // the current content rather than of the pipeline, and nothing pins it. So the
  // clause is pinned on the rendered form for each of the three harnesses, the way
  // the `shared/pr-review-integration.md` test in this file already does for its
  // fragment.
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
  for (const harness of ['claude', 'codex', 'portable']) {
    const context = `shared/session-title.md (${harness})`;
    const rendered = renderBody(
      resolveEagerIncludes(fragment, {
        context,
        readFragment: (name) => source(`src/shared/${name}.md`),
      }),
      harness,
      {
        exposedTools: [...knownTools],
        agentPrefix: 'effective-flow-',
        skillName: 'effective-flow',
        knownTools,
        knownAgents,
        context,
      },
    );
    assertNoUnresolvedEagerIncludes(rendered, { context });
    assert.match(
      prose(rendered),
      near('own user.s standing rename mandate', 'rename request for the session that asked', 400),
      harness,
    );
    assert.match(rendered, /\*\*Suggested session title:\*\* <title>/, harness);
  }
  for (const silent of [
    'version',
    'open-plans',
    'setup',
    'cleanup',
    'commit',
    'pr',
    'merge-gate',
  ]) {
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
    'Reference first',
    'One line, never blocking',
  );
});

// The fragment is no longer inlined into the router, so it is no longer paid by a
// catalog-only session - but it is still read in nearly every work-subject run, which is
// why the measurable cap stays rather than reverting to the advisory note it replaced.
// Base is `1dbf453` at 44 lines; the cap was +12 net (56) while the fragment was eager,
// the classification of `deliver` and `merge-gate` raised it deliberately by one to 57, and
// qualifying the delegating-parent rule — a parent whose delegates are all silent keeps the
// emission, which is what `deliver` over `commit`/`pr` needs — raised it by one more to 58.
// Counted off the file rather than shelled out to `git diff --numstat`, so the guard
// also holds in an exported tree that carries no history, and so future growth fails
// loudly instead of accruing silently.
test('the session-title fragment stays inside its line budget', () => {
  const lines = source('src/shared/session-title.md').trimEnd().split('\n').length;
  assert.ok(
    lines <= 58,
    `src/shared/session-title.md is ${lines} lines, over its 58-line cap (44 at 1dbf453, +12 ` +
      `net while it was eagerly inlined, +1 for the two newly classified tools, +1 for the ` +
      `qualified delegating-parent rule). This fragment ` +
      `is read in nearly every work-subject run on all three build targets - trim the fragment ` +
      `rather than raise the cap. If the cap is being raised deliberately, restate the new ` +
      `baseline in this test.`,
  );
});

// R1: the router resolves eager includes only, so both the `session-title` decision contract
// and the `session-rename` mechanism must be pointed at from each emitting tool itself - a
// router-side lazy pointer would register no fragment and ship a dangling reference. The tool
// names are read from the contract's own two lists rather than duplicated here, so a tool added
// to a list without its own pointers fails this test instead of silently missing them.
//
// The lists are reconciled against the built tool set, not counted. A hard-coded `length === 16`
// plus a hand-copied silent list is exactly how `deliver` and `merge-gate` shipped in *neither*
// list with the suite green: both halves agreed with themselves, and nothing compared their union
// to the tool set they are supposed to partition. A built tool in neither list and outside the
// declared exemption set has undefined emission behaviour, and one in both contradicts itself, so
// both cases fail here.
test('the two session-title lists partition the built tools and match their pointers', () => {
  const fragment = source('src/shared/session-title.md');

  const workSubjectSection = fragment.match(
    /Only from work-subject tools:\*\*([\s\S]*?)\.\s*`version`/,
  );
  assert.ok(
    workSubjectSection,
    'could not locate the "Only from work-subject tools" list in src/shared/session-title.md',
  );
  const workSubjectTools = [...workSubjectSection[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
  assert.ok(workSubjectTools.length > 0, 'the work-subject list must name tools');

  const silentSection = fragment.match(/`version`([\s\S]*?)stay silent/);
  assert.ok(silentSection, 'could not locate the silent-tool list in src/shared/session-title.md');
  const silentMatches = [...silentSection[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
  // Asserted before `version` is prepended, not after. `version` opens the list and is consumed
  // by the cut's opening delimiter, so it has to be added back — but once it is, the length can
  // never be zero and a guard placed below it reads as a check while being dead.
  assert.ok(silentMatches.length > 0, 'the silent list must name tools');
  const silentTools = ['version', ...silentMatches];

  // Both lists name real tools; a typo would otherwise reconcile as a missing exposed tool
  // somewhere else and report the wrong name.
  for (const tool of [...workSubjectTools, ...silentTools]) {
    assert.ok(
      existsSync(new URL(`src/tools/${tool}.md`, repositoryRoot)),
      `src/shared/session-title.md names ${tool}, but there is no src/tools/${tool}.md`,
    );
  }

  // TOOL_GROUPS cannot be imported: build.mjs runs the entire build on load, so the group
  // definition is sliced out of the source text instead - the same technique the router
  // description and merge-gate exposure tests use. `boundedSlice` rather than `section`,
  // because `section` widens silently to end-of-file when its stop marker disappears, which
  // this file's own comment on `boundedSlice` documents as the failure class to avoid.
  const groups = boundedSlice(
    source('build.mjs'),
    'const TOOL_GROUPS = [',
    '\nconst EXPOSED_TOOLS',
  );
  const groupArrays = [...groups.matchAll(/tools: \[([^\]]*)\]/g)];
  const exposed = groupArrays.flatMap((match) =>
    [...match[1].matchAll(/'([^']+)'/g)].map((tool) => tool[1]),
  );
  // Under-extraction has to be loud. The scrape reads bracketed array literals only, so any
  // edit that keeps a group's names out of one - factoring the array into a named constant,
  // a spread, different quoting - drops those tools from `exposed` while the build still
  // passes, and every check below then goes vacuous for exactly them. Demonstrated: moving
  // the "Implement a change" group to `tools: IMPLEMENT_TOOLS,` let `iterate` be dropped from
  // the emitting list together with both of its pointers, suite green. Counting the `tools:`
  // keys and the `title:` keys off the same slice makes an unparsed group fail here instead.
  const declaredToolKeys = groups.match(/\btools:/g) ?? [];
  const declaredTitleKeys = groups.match(/^\s*title: /gm) ?? [];
  assert.ok(declaredTitleKeys.length > 0, 'TOOL_GROUPS must declare groups');
  assert.equal(
    groupArrays.length,
    declaredToolKeys.length,
    'every TOOL_GROUPS entry must present its tools as a bracketed array literal; a group whose ' +
      'names are not scraped here drops out of the reconciliation below without failing',
  );
  assert.equal(
    groupArrays.length,
    declaredTitleKeys.length,
    'every TOOL_GROUPS entry must carry exactly one title and one parsed tools array',
  );
  assert.ok(exposed.length > 0, 'TOOL_GROUPS must declare exposed tools');

  // The partition is reconciled against every built tool - the same `src/tools/*.md` scan
  // build.mjs budgets - and not against the exposed twenty. Eight tools are internal, and four
  // of them (`apply-plan`, `apply-review`, `apply-issues`, `concept-review`) sit in the emitting
  // list, so reconciling against `exposed` left all eight constrained by nothing: removing
  // `apply-plan` from the list and deleting both of its pointers kept the suite green. The
  // fragment's own rule that "internal sub-agents and workers never emit" is a different
  // statement and does not cover this, since those four internal *tools* do emit.
  //
  // The non-emitting internal tools are named here with a reason each, following the
  // `NEXT_STEPS_EXEMPT_TOOLS` shape in build.mjs: a new internal tool has to be listed or
  // exempted deliberately rather than inheriting "undefined behaviour" by being unreachable.
  const SESSION_TITLE_EXEMPT_TOOLS = new Map([
    ['pr-review', 'deprecated forwarder; it follows merge-gate, which is silent'],
    ['plan-review', 'internal review sub-file; its parent `review` has decided the title already'],
    ['apply-review-remote', 'internal sub-file of apply-review, which decides for it'],
    ['apply-review-commit-mechanics', 'internal sub-file of apply-review, which decides for it'],
  ]);
  const builtTools = readdirSync(new URL('src/tools/', repositoryRoot))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.replace(/\.md$/, ''));
  assert.ok(builtTools.length > 0, 'src/tools must contain sources to reconcile');

  const emitting = new Set(workSubjectTools);
  const silent = new Set(silentTools);
  assert.deepEqual(
    [...emitting].filter((tool) => silent.has(tool)),
    [],
    'a tool listed as both emitting and silent contradicts itself in src/shared/session-title.md',
  );
  // The exemptions are reconciled two-sidedly as well: one naming no tool is stale, and one
  // whose tool does appear in a list is a contradiction rather than an exemption.
  for (const [tool, reason] of SESSION_TITLE_EXEMPT_TOOLS) {
    assert.ok(
      builtTools.includes(tool),
      `stale session-title exemption: ${tool} (${reason}), but there is no src/tools/${tool}.md`,
    );
    assert.ok(
      !emitting.has(tool) && !silent.has(tool),
      `${tool} is exempt from the session-title partition, so it must not be listed in ` +
        'src/shared/session-title.md',
    );
  }
  assert.deepEqual(
    builtTools.filter(
      (tool) => !emitting.has(tool) && !silent.has(tool) && !SESSION_TITLE_EXEMPT_TOOLS.has(tool),
    ),
    [],
    'every built tool must be listed as emitting or as silent in src/shared/session-title.md, ' +
      'or be named in SESSION_TITLE_EXEMPT_TOOLS above with a reason; a tool in none of the ' +
      'three has undefined session-title behaviour',
  );
  // The internal tools may sit in the emitting list, so only the silent side is restricted to
  // exposed names; a silent name that is not exposed would be a contract about an uninvocable
  // tool, which is what the exemption set records instead.
  assert.deepEqual(
    silentTools.filter((tool) => !exposed.includes(tool)),
    [],
    'the silent list must name exposed tools only',
  );

  const titlePointer = /```lazy-include\nsession-title\n/;
  const renamePointer = /```lazy-include\nsession-rename\n/;
  for (const tool of workSubjectTools) {
    const toolSource = source(`src/tools/${tool}.md`);
    assert.match(
      toolSource,
      titlePointer,
      `src/tools/${tool}.md must carry the session-title lazy-include pointer`,
    );
    assert.match(
      toolSource,
      renamePointer,
      `src/tools/${tool}.md must carry the session-rename lazy-include pointer`,
    );
    // The decision precedes the mechanism: session-rename.md is loaded only once this
    // contract has decided a title is due, so its pointer must not fire first.
    assert.ok(
      toolSource.search(titlePointer) < toolSource.search(renamePointer),
      `src/tools/${tool}.md must point at session-title before session-rename`,
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
    const toolSource = source(`src/tools/${tool}.md`);
    assert.doesNotMatch(
      toolSource,
      titlePointer,
      `src/tools/${tool}.md must not carry the session-title lazy-include pointer`,
    );
    assert.doesNotMatch(
      toolSource,
      renamePointer,
      `src/tools/${tool}.md must not carry the session-rename lazy-include pointer`,
    );
  }

  for (const path of ['src/shared/session-title.md', 'src/shared/session-rename.md']) {
    assert.ok(existsSync(new URL(path, repositoryRoot)), `${path} must exist`);
    assert.ok(source(path).trim().length > 0, `${path} must not be empty`);
  }
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

  // The retry ban above stays, and the one event that is not a retry is named beside
  // it: a reference that only became available after a *successful* call. Without that
  // carve-out an implementer reads the ban as forbidding the bounded second emission,
  // and this fragment then contradicts the session-title contract it serves.
  assert.match(
    contract,
    near('after a successful call is not the retry', 'licenses exactly one further call', 240),
  );

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

// Step 6 item 7 offers a one-line `CLAUDE.md` that imports `AGENTS.md`. It is a numbered list
// item, not a heading, so `section()` cannot cut it; `boundedSlice` stops at the `####` subsection
// that follows, which means a renumbered or deleted item aborts loudly instead of letting Step 7's
// own capability fence quietly satisfy every assertion below.
function setupClaudeMdImportItem(setup) {
  return boundedSlice(
    setup,
    '7. **Offer a `CLAUDE.md` that imports `AGENTS.md`.**',
    '\n#### Rewriting a legacy',
  );
}

function setupClaudeMdImportAsk(item) {
  const fences = [...item.matchAll(/```ask\n([\s\S]*?)\n```/g)];
  assert.equal(fences.length, 1, 'Step 6 item 7 must carry exactly one ask fence');
  return parseAskBlock(fences[0][1], { context: 'tools/setup.md Step 6 item 7' });
}

test('setup offers the CLAUDE.md import behind one ask fence that writes only @AGENTS.md', () => {
  const item = setupClaudeMdImportItem(source('src/tools/setup.md'));
  const contract = prose(item);
  const ask = setupClaudeMdImportAsk(item);

  assert.equal(ask.header, 'CLAUDE.md');
  assert.deepEqual(
    ask.options.map((option) => option.label),
    ['Yes', 'No'],
    'the offer is a plain yes/no; a third option would need its own written outcome',
  );

  // The written content is the whole contract of this step. Anything beyond the single import
  // line turns a non-destructive offer into a second convention file the project has to maintain,
  // and the reason `AGENTS.md` stays canonical disappears with it.
  assert.match(
    contract,
    near('whole content is the single line', '`@AGENTS.md`', 80),
    'item 7 must state that the written file is exactly the one line `@AGENTS.md`',
  );
  assert.match(
    ask.options[0].description,
    near('single line', '`@AGENTS.md`', 80),
    'the affirmative option must name the single line it writes',
  );
  assert.match(
    ask.options[1].description,
    /Write nothing/,
    'declining must write nothing rather than fall back to some smaller edit',
  );

  // Mirrors the Step 7 assertion of the same shape. Without it a later editor folds this item
  // into the Step 5 blocks and the ADR grows a setting nothing reads.
  assert.match(contract, near('not part of the configuration', 'declares no key', 200));
});

test('the CLAUDE.md import fence is posed on both paths and an unposable run writes nothing', () => {
  const item = setupClaudeMdImportItem(source('src/tools/setup.md'));
  const contract = prose(item);
  const ask = setupClaudeMdImportAsk(item);

  // The gate is the recorded file state, not the presentation path. A `when:` that named the
  // wizard would let the Express path write a file into the project root unasked.
  assert.match(
    ask.when,
    /state recorded by item 5/,
    'the fence must trigger on the `CLAUDE.md` state item 5 recorded',
  );
  assert.match(
    ask.when,
    /absent or a pure prose pointer/,
    'the fence must name the two writable states',
  );
  assert.doesNotMatch(
    ask.when,
    /guided|express|wizard/i,
    'the fence condition must not gate on which path is running',
  );

  assert.match(contract, near('deliberately unconditional', 'rather than guided-path only', 160));
  assert.match(
    contract,
    near('Express path poses it', 'exactly as the guided path does', 160),
    'the Express path must pose the fence too',
  );
  assert.doesNotMatch(
    contract,
    /Express path (?:skips|omits|never poses|does not pose)/i,
    'nothing may restrict the fence to the guided path',
  );

  // The half that makes it a gate rather than a prompt: no answer is not a quiet yes, and it is
  // not a quiet no that goes unreported either.
  assert.match(
    contract,
    near(
      'unanswered, skipped, or non-interactive',
      'writes nothing and reports that the fence could not be posed',
      200,
    ),
    'a run that cannot pose the fence must write nothing and say so',
  );
  assert.match(contract, /There is no silent default on either path/);
});

test('setup names all four CLAUDE.md states the import offer can meet', () => {
  const contract = prose(setupClaudeMdImportItem(source('src/tools/setup.md')));

  assert.match(
    contract,
    /Absent → pose the fence below and create the file only on an affirmative answer/,
    'the absent state must reach the fence and write only on a yes',
  );
  assert.match(
    contract,
    near(
      'A pure prose pointer → pose the fence below',
      'naming the exact line that would be replaced',
      120,
    ),
    'a pure prose pointer must reach the fence and show the line it replaces',
  );
  assert.match(
    contract,
    near(
      'Content-bearing, or already importing → write nothing',
      'do not pose the fence at all',
      160,
    ),
    'a content-bearing or already-importing file must write nothing and skip the fence',
  );
  assert.match(
    contract,
    /already imports `AGENTS.md` is the finished state/,
    'an existing import must be named as the finished state, not as a failure',
  );

  // The predicate is what separates the writable pointer state from the content-bearing one. Its
  // marker exclusions guard a live configuration locator, so they are pinned individually.
  assert.match(contract, /no `Effective Flow project setup:` marker/);
  assert.match(contract, /no legacy `Firmo project setup:` marker/);
  assert.match(contract, /no `@AGENTS.md` import already present/);
  assert.match(
    contract,
    near(
      'only non-blank, non-heading content is a single line referring to `AGENTS.md`',
      'Anything else is content-bearing',
      120,
    ),
    'the pointer predicate must close with content-bearing as the default',
  );
});

test('the CLAUDE.md symlink hard stop is evaluated before the state classification', () => {
  const contract = prose(setupClaudeMdImportItem(source('src/tools/setup.md')));

  assert.match(
    contract,
    near(
      'A symlink at the `CLAUDE.md` path is a hard stop',
      'evaluated before the state classification below',
      120,
    ),
    'the symlink stop must state that it runs before the state classification',
  );
  assert.match(contract, /never softened into a reroute/);
  assert.match(
    contract,
    near(
      'never a write target',
      'report the path and write nothing rather than writing through it',
      160,
    ),
    'a symlink must stop the run rather than be written through',
  );
  // The broken link is the dangerous half: an existence check reports it as absent, and absent is
  // the one state that creates a file — at whatever path the link names, outside the repository.
  assert.match(contract, near('broken symlink', 'would otherwise read as absent', 160));
  assert.match(contract, /outside the repository/);

  // Position, not only prose. A reader who stops at the first matching classification must have
  // passed the stop already, so the ordering is pinned where it is executed.
  ordered(
    contract,
    'A symlink at the `CLAUDE.md` path is a hard stop',
    'Decide on the state item 5 observed',
    'Absent → pose the fence below',
    'Content-bearing, or already importing → write nothing',
  );
});

// Item 5 observes the `CLAUDE.md` state and may then write the marker into that very file; item 7
// decides on what item 5 recorded. The two halves are only correct together, so they are pinned
// together — the same carry-forward shape `<adr-convention>` uses from Step 2.
test('Step 8 reports the CLAUDE.md import outcome and never contradicts the marker location', () => {
  const setup = source('src/tools/setup.md');
  const summary = prose(section(setup, '### Step 8: Summary', '\n## '));

  assert.match(
    summary,
    /for Step 6 item 7/,
    'Step 8 must report the outcome of the CLAUDE.md import offer',
  );
  for (const [pattern, outcome] of [
    [/created with the single line `@AGENTS\.md`/, 'the file created'],
    [/pure prose pointer replaced by it with the replaced\s+line named/, 'a pointer replaced'],
    [/content-bearing or already imports `AGENTS\.md`/, 'nothing written, file has content'],
    [/a symlink at that path was a hard stop/, 'nothing written, symlink stop'],
    [/the fence could not be\s+posed/, 'nothing written, fence unposable'],
    [/because the user declined/, 'nothing written, user declined'],
    [/added no configuration key/, 'the no-key statement'],
  ]) {
    assert.match(summary, pattern, `Step 8 must report ${outcome}`);
  }

  // The marker can land in CLAUDE.md, which item 7 may then replace. Step 8 reports both the
  // marker location and the import outcome, so the two bullets must be reconciled explicitly
  // or a run emits two contradictory statements about the same file.
  assert.match(
    summary,
    near(
      'created the minimal `AGENTS.md` first',
      'never contradicts the marker location reported',
      400,
    ),
    'Step 8 must reconcile the import outcome with the marker location it also reports',
  );
});

test('setup keys the CLAUDE.md import decision to the state item 5 recorded, not a fresh read', () => {
  const setup = source('src/tools/setup.md');
  const item5 = prose(
    boundedSlice(setup, '5. **Set the AGENTS.md marker.**', '\n6. **Migration and untracking'),
  );
  const item7 = prose(setupClaudeMdImportItem(setup));

  assert.match(
    item5,
    near(
      'record the `CLAUDE.md` state this step observed',
      'carry that record forward to item 7',
      300,
    ),
    'item 5 must record the observed state and hand it to item 7',
  );
  for (const [pattern, component] of [
    [/absent, a symlink, or present with its content/, 'the three observed shapes'],
    [/already carried a marker or an `@AGENTS.md` import/, 'the marker and import flags'],
    [
      /the way `<adr-convention>` is carried from Step 2/,
      'the carry-forward convention it follows',
    ],
  ]) {
    assert.match(item5, pattern, `the recorded CLAUDE.md state must include ${component}`);
  }
  assert.match(
    item5,
    near(
      'item 7 decides on that record',
      'rather than on the file this step may just have changed',
      200,
    ),
  );

  assert.match(
    item7,
    near('Decide on the state item 5 observed', 'not the state item 5 left', 80),
    'item 7 must decide on the observed state, not the resulting one',
  );
  assert.match(
    item7,
    /do not re-read the file to classify it/,
    'item 7 must not re-read `CLAUDE.md` to classify it',
  );
  assert.match(
    item7,
    near(
      'a fresh read here would see the marker this run just wrote',
      'silently decline the very case this step exists for',
      200,
    ),
    'the reason for the carry-forward must stay next to the rule',
  );
});

// Item 5 selects the marker host before item 7 runs at all, so item 7's symlink hard stop cannot
// protect that write. The two stops are separate applications of one rule, and this pins the earlier
// one — without it a symlinked `CLAUDE.md` receives the marker and item 7 only reports it afterwards.
test('item 5 refuses a symlinked CLAUDE.md as the marker host', () => {
  const item5 = prose(
    boundedSlice(
      source('src/tools/setup.md'),
      '5. **Set the AGENTS.md marker.**',
      '\n6. **Migration and untracking',
    ),
  );

  assert.match(
    item5,
    near(
      'A symlink at the `CLAUDE.md` path is never the marker target',
      "item 7's own hard stop cannot cover that write",
      200,
    ),
    'item 5 must refuse a symlinked marker host and say why item 7 is too late for it',
  );
  assert.match(
    item5,
    /does not follow the link so a dangling one is seen rather than reported absent/,
    'the test must not follow the link, so a dangling symlink is not read as absent',
  );
  assert.match(
    item5,
    near('live or dangling', 'create the minimal `AGENTS.md` instead', 200),
    'both symlink shapes must send the marker to the minimal AGENTS.md branch',
  );
  assert.match(item5, /no softened hard stop but a different write/);
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

  // The run's order paragraph alone, cut at the section's first `#### ` subheading.
  // `section()` stops at the next `### `, and Claude Code is the last `###`-level
  // section, so the default slice runs to EOF and swallows both the corrective
  // subsection and the degradation table's closing sentence - against which a pin on
  // the first send is vacuous and survives deleting the paragraph it claims to protect.
  const claudeIntro = prose(
    section(fragment, '### Claude Code: a mandated butler renames on request', '\n#### '),
  );

  // The send moment is what makes this path reachable at all: everything between the
  // fixed title and the send is an unprotected window, and a run abandoned inside it
  // renames nothing while looking exactly like a run that found no butler. Both halves
  // are pinned - the moment and the discovery precondition - so a reader who restores
  // the retired last-action ordering for the reason it used to carry fails here.
  assert.match(
    claudeIntro,
    near('as soon as the title is fixed', 'exactly one butler was discovered', 200),
  );
  // The retired ordering is pinned negatively across the whole fragment rather than this
  // section: a positive pin stays green when the old sentence is left standing beside the
  // new one, and two orderings in one contract is worse than either of them. Checked
  // against `prose()` and never the raw text - `oxfmt` chooses where a line breaks, and a
  // reflowed `the run's last\naction` would keep a raw pin green.
  assert.doesNotMatch(prose(fragment), /last action/i);

  // The stop rule is the one observation that silences a session for good, so it has to
  // be keyed to every title this session requested. Keyed to a single request - the
  // wording from before the budget existed - a run that sent a corrective request reads
  // its own correct rename as the user's chosen title and stops asking for the rest of
  // the session.
  assert.match(
    claudeIntro,
    near(
      'differing from every title this session requested',
      'send no further request for the remainder of the session',
      250,
    ),
  );

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

  const corrective = prose(
    section(fragment, '#### A changed title sends a further request, six times at most', '\n#### '),
  );

  // Moving the send earlier only stays affordable because a later-bound title can still
  // be sent. Trigger and bound are pinned together because neither half survives alone: a
  // trigger without a bound is an unbounded loop over a paraphrased title, and a bound
  // without the character-exact comparison invites a semantic "has the title really
  // changed?" judgement no run can make without re-deriving the title.
  assert.match(
    corrective,
    near(
      'send a further request whenever the title changes',
      'differs character-exactly from the last title this run sent',
      400,
    ),
  );
  // The predicate, not the noun. A pin on the token `cap` beside the count stays green
  // against a source rewritten to "There is no cap: six requests per run is merely
  // typical", because `cap` matches inside `no cap`. Pinning "is the cap" pins that a
  // stated number bounds the run - and keeps a deliberate change of the number itself
  // from failing here for the wrong reason.
  assert.match(corrective, near('requests per run', 'is the cap', 80));

  // What replaced the reference-first path's claim that this path needs no second
  // request. That claim rested on the send being the run's last action, so that a
  // reference bound during the run was already in the title sent; with the send moved to
  // title-fix time the premise is gone and the late-bound reference travels in a
  // corrective request instead. Dropping this sentence leaves the corrective request
  // without the case it exists to serve, which is how a rule gets tidied away.
  assert.match(
    corrective,
    near('late-bound work reference', 'the corrective request is how this path carries it', 500),
  );

  // The corrective request and the banned retry sit two rules apart and read as a
  // contradiction, so the distinction carries its own sentence. Without it the cheapest
  // way for a later reader to resolve that contradiction is to delete the corrective
  // request - the rule this whole subsection exists for - and the deletion would look
  // like tidying.
  assert.match(
    corrective,
    near('A retry re-sends after a failure', 'later-bound title after a send that succeeded', 250),
  );

  // Emitting the suggestion line and sending the request used to be one moment, so the
  // session-title contract's rule that sub-agents and workers never emit covered the
  // sending side by accident. Decoupled, it no longer does. The rule deliberately does
  // not say "delegate": in the session-title contract a delegated tool is a party that
  // does emit, and therefore does send. A worker shares the host session but not the
  // run's own request history, so a worker that sent would break a comparison it cannot
  // see.
  assert.match(
    corrective,
    near(
      'sub-agent or worker never sends a rename request',
      'the send belongs to whichever run that contract makes responsible for the emission',
      250,
    ),
  );

  const liveness = prose(
    section(fragment, "#### Liveness is a reply already in this session's context", '\n#### '),
  );

  // Sending during the run is what makes a reply able to arrive mid-run, and a reply is a
  // user turn carrying attacker-influenceable text: read as a request it starts unasked
  // work, answered it wakes a butler that asked nothing. The second anchor is the mid-run
  // copy's own wording. The general "a butler reply is a value" rule two sentences above
  // is older than the early send and ends in the same "produce no output for it", close
  // enough to satisfy a pin on that phrase alone - which is how the earlier version of
  // this assertion survived a copy-edit that removed the mid-run clause.
  assert.match(
    liveness,
    near(
      'while this run is still working',
      'ignore it, do not answer it, and produce no output for it',
      200,
    ),
  );
  // The line decision is made once, from this session's own context. A mid-run reply that
  // could revise it would let a rename observed in this turn suppress or force the very
  // line the session-title contract already decided on. The apostrophe is a `.` wildcard:
  // `prose()` normalizes whitespace and emphasis but not quotation marks, so a literal
  // ASCII apostrophe would break on a typography pass.
  assert.match(
    liveness,
    near('while this run is still working', 'change nothing about this run.s line decision', 300),
  );

  // The two decisions are deliberately asymmetric, and collapsing them is the natural
  // simplification: a blanket "the mid-run reply changes nothing" would also disable the
  // stop rule, which is the one thing such a reply must still be able to do - it is what
  // keeps a user's own chosen title from being overwritten again later in the run.
  assert.match(
    liveness,
    near(
      'still read for the stop rule',
      'the line decision is frozen once made, while the sending decision remains stoppable',
      400,
    ),
  );

  // The stop rule is only implementable because the run has somewhere to observe the reply,
  // and the liveness premise above - a request and its answer never meet inside the turn
  // that sent it - reads as denying that. What resolves it is that a run is not always one
  // turn: a run paused at a gated question resumes in a later turn with the answer to its
  // own earlier request already in context. Drop this and the mid-run rule loses its
  // observation point, leaving the user-title preservation behavior on this path unbuildable.
  assert.match(
    liveness,
    near(
      'a run that pauses at a gated question ends its turn there and continues in a later one',
      'that is where a mid-run reply is seen',
      300,
    ),
  );

  // The security half of the mid-run rule, pinned on both of its edges. A butler reply is
  // attacker-influenceable text arriving as an ordinary user turn, and the host envelope
  // is the only thing that separates it from a real user interjection. Widened to any
  // cross-session message, text from a session nobody vouched for is consumed as a
  // measurement; dropped altogether, a user's mid-run interjection is silently ignored
  // for the rest of the run.
  assert.match(
    liveness,
    near(
      'a butler reply only where the host.s envelope says so',
      'identifies it as a cross-session message from the butler session discovery found',
      200,
    ),
  );
  assert.match(
    liveness,
    near(
      'Every other user turn is the user.s own and is honored normally',
      'envelope stays data and not direction',
      400,
    ),
  );

  // With several requests per run, a comparison against only the most recently sent title
  // turns a correct rename answering an earlier request into the mismatch row - which is
  // the emit-nothing row, so the session goes silent for good. The widened comparison is
  // what keeps the budget from being self-defeating.
  assert.match(
    liveness,
    near(
      'the whole set of titles this session requested',
      'a match against any member of that set is a match',
      200,
    ),
  );

  const butlerDegradation = section(fragment, '#### Degradation on the butler path', '\n#### ');

  // Every reply defect - absent, stale, malformed, refused - must fail open to
  // the suggestion line; none of them may produce silence.
  assert.match(prose(butlerDegradation), near('fails open', 'may produce silence', 300));

  // The closing sentence of the degradation subsection, pinned where it actually lives. It
  // is the second half of the bounded-request guarantee the corrective subsection states
  // in its own words; both halves are pinned separately so neither can stand in for the
  // other. The bound and its trigger are pinned rather than the count, so a deliberate
  // revision of the budget stays a one-line edit while dropping the bound, or loosening
  // the character-exact trigger into a semantic one, still fails.
  assert.match(
    prose(butlerDegradation),
    near('requests per run', 'sent only where the title differs character-exactly', 150),
  );

  // The single row that contradicts the fail-open rule above, and therefore the
  // one a later reader is likeliest to "fix" into printing a suggestion line
  // for consistency: a title differing from every title this session requested is
  // one this session's own user chose, where neither a rename nor a notice is
  // wanted. The live tests exist to justify exactly this row.
  assert.match(
    tableRow(
      butlerDegradation,
      'bare title reported, differing from every title this session requested',
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
//
// The walk covers `src/shared` as well as `src/tools`, because the build's own closure does: a
// shared fragment's `lazy-include` is resolved when its host is inlined, so it ships a fragment
// exactly like a tool's pointer does. A tool-only walk left every fragment reached solely through
// another fragment — `config-migration-edge-cases` from `config-migration`,
// `documentation-sync-contract` from `documentation-sync` — outside the only source-side check
// there is.
test('every lazy-include fragment referenced by a tool or shared fragment has a source', () => {
  const collect = (dir) =>
    readdirSync(new URL(`${dir}/`, repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .flatMap((file) => [...collectIncludeNames(source(`${dir}/${file}`)).lazy]);

  const lazyNames = new Set([...collect('src/tools'), ...collect('src/shared')]);
  assert.ok(
    lazyNames.size > 0,
    'no lazy-include names were collected from src/tools or src/shared',
  );
  for (const name of lazyNames) {
    assert.ok(
      existsSync(new URL(`src/shared/${name}.md`, repositoryRoot)),
      `a lazy include references ${name}, but src/shared/${name}.md does not exist`,
    );
  }
});

// The check above is satisfied vacuously by a *deleted* pointer: a name nobody references is a
// name nobody can dangle. That is harmless for a fragment several tools point at, and fatal for
// one whose only route into the build's closure is a single pointer inside another fragment —
// delete it and the fragment stops shipping to every target, with the build and the suite green.
// Both such fragments are pinned here, by the trigger token of their decision point rather than by
// the whole clause, so rewording stays free while losing the pointer or its condition fails.
test('every fragment reachable only through a shared-fragment pointer keeps that pointer', () => {
  const pinned = [
    {
      host: 'src/shared/config-migration.md',
      fragment: 'config-migration-edge-cases',
      // Both halves of the split's own seam: the locator's rare branches and the external tracker
      // keys. A clause naming only one of them leaves the other half of the fragment with no
      // documented moment to load it.
      trigger: /(?=[\s\S]*locator)(?=[\s\S]*`tracker\.mode: external`)/i,
      decision: 'the config locator and the `tracker.mode: external` run',
    },
    {
      host: 'src/shared/documentation-sync.md',
      fragment: 'documentation-sync-contract',
      trigger: /documentation sync/i,
      decision: 'the documentation sync phase',
    },
  ];

  for (const { host, fragment, trigger, decision } of pinned) {
    const triggers = new Map(
      [...source(host).matchAll(LAZY_INCLUDE_RE)].map((match) => [
        match[1].trim(),
        (match[2] ?? '').trim(),
      ]),
    );
    const when = triggers.get(fragment);
    assert.ok(
      when !== undefined,
      `${host} must keep its lazy-include pointer for ${fragment} - it is the only reference ` +
        `that puts the fragment into the build's closure, so without it the fragment ships nowhere`,
    );
    assert.notEqual(
      when,
      '',
      `the ${fragment} pointer in ${host} must carry a non-empty when: clause`,
    );
    assert.match(
      when,
      trigger,
      `the ${fragment} pointer must name its decision point (${decision}); got: ${when}`,
    );
  }
});

// A pointer's own condition must be decidable from the half that stays loaded. Deferring the
// legacy marker's literal spelling broke that: step 1 was left saying only that "a legacy marker
// spelling is recognized", while the spelling lived behind a pointer whose `when:` fires on that
// same marker being present. A reader could not detect the marker without the fragment and could
// not reach the fragment without detecting the marker, so the locator fell through to step 2,
// matched a lower-priority ADR, and read the wrong project configuration in silence. Content
// preservation cannot catch this - nothing was lost, it was moved out of reach of its own trigger.
test('the config locator keeps every predicate its own lazy trigger depends on', () => {
  const core = source('src/shared/config-migration.md');
  const step1 = section(core, '1. **AGENTS.md marker.**', '\n2. **Default path/scan.**');

  assert.match(
    step1,
    /\*\*Firmo project setup:\*\*/,
    'locator step 1 must spell the legacy marker it recognizes: that spelling is the detection ' +
      'predicate of the edge-cases pointer, so deferring it makes the trigger undecidable and the ' +
      'locator silently selects a lower-priority ADR',
  );

  // The remaining trigger clauses stay decidable from the core, which is why only this one moved
  // back: the exact-slug match (clause 1), both transitional handle paths (clause 4) and the
  // tracker mode (clause 5) are all stated in the always-loaded half.
  assert.match(core, /stem equals `effective-flow-project-setup`/);
  assert.match(core, /\.effective-flow\/config\.json[\s\S]*\.firmo\/config\.json/);
});

// A deferred fragment is only correctly deferred while its pointer still says *when* to load it.
// `LAZY_INCLUDE_RE` in build-lib.mjs makes the `when:` line optional and `assertNoEagerLazyOverlap`
// is the build's only lazy-side guard, so a pointer that loses its condition still renders (as a
// bare "Load on demand: Read `shared/<name>.md`"), still builds, and still ships - while the agent
// is left with no documented moment to reach for it. On the merge gate that is worse than not
// deferring at all: the rule stops running instead of failing loudly. Slimming merge-gate's
// always-loaded core from 4744 to ~3150 lines is what created that surface, so the gate's own
// pointers are pinned here.
//
// Each fragment is pinned by the *trigger token* of its decision point, never by the whole
// sentence, so rewording the clause stays free while dropping the decision point fails.
test('every merge-gate lazy pointer names the decision point that loads it', () => {
  const triggers = new Map(
    [...source('src/tools/merge-gate.md').matchAll(LAZY_INCLUDE_RE)].map((match) => [
      match[1].trim(),
      (match[2] ?? '').trim(),
    ]),
  );

  const pinned = [
    // Deferred by the context-slimming work:
    {
      fragment: 'worktree-integration',
      trigger: /behind|dirty/i,
      decision: 'the head branch reading BEHIND or DIRTY',
    },
    {
      // Not merely "language" plus "resolve": a clause saying language must somehow be resolved
      // names no decision point. The pointer has to name *what* is resolved — the artifact output
      // language, or the language context handed to a delegate — because that is the moment the
      // fragment is needed.
      fragment: 'language-rules',
      trigger: /(?=[\s\S]*resolv)(?=[\s\S]*(?:output language|delegated language context))/i,
      decision: 'an output language or a delegated language context having to be resolved',
    },
    {
      // `merge` alone is satisfied by any sentence about merging, and this pointer's whole job is
      // to name the *post*-merge phase. Only the phase number pins it.
      fragment: 'issue-post-merge-observation',
      trigger: /Phase 5\.5/,
      decision: 'Phase 5.5',
    },
    {
      // `/Phase 5\b/` matches inside `Phase 5.5` — the word boundary sits between the `5` and the
      // `.` — so the observation pointer's own clause would satisfy this one. Require a `Phase 5`
      // that is not `Phase 5.5`, *and* the closure token, since this fragment is loaded for both
      // the merge and the closure offer and a clause naming only one of them is incomplete.
      fragment: 'pr-merge-completion',
      trigger: /(?=[\s\S]*Phase 5(?!\.5))(?=[\s\S]*closure)/i,
      decision: 'Phase 5 (not Phase 5.5) and the issue-closure offer',
    },
    // Pre-existing pointers, pinned in the same battery so the slimming cannot quietly
    // strip a condition that predates it:
    { fragment: 'next-steps', trigger: /completion report/i, decision: 'the completion report' },
    {
      fragment: 'runtime-state-safety',
      trigger: /`\.effective-flow\/`/,
      decision: 'a mutation below `.effective-flow/`',
    },
    {
      fragment: 'effective-flow-dir-migration',
      trigger: /`\.effective-flow\/`/,
      decision: 'a mutation below `.effective-flow/`',
    },
    { fragment: 'tracker-target', trigger: /`external`/, decision: 'the external tracker target' },
  ];

  for (const { fragment, trigger, decision } of pinned) {
    const when = triggers.get(fragment);
    assert.ok(
      when !== undefined,
      `src/tools/merge-gate.md must keep its lazy-include pointer for ${fragment}`,
    );
    assert.notEqual(
      when,
      '',
      `the ${fragment} pointer in src/tools/merge-gate.md must carry a non-empty when: clause - ` +
        `without it the fragment ships with no documented moment to load it`,
    );
    assert.match(
      when,
      trigger,
      `the ${fragment} pointer must name its decision point (${decision}); got: ${when}`,
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
  const tracker = source('src/shared/issue-tracker-forge.md');
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
  const tracker = source('src/shared/issue-tracker-forge.md');

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
  const tracker = source('src/shared/issue-tracker-forge.md');
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

test('both central-skill ownership guards stay wired into build.mjs', () => {
  // Neither guard has an observable output on a healthy tree, so deleting its
  // call site leaves the build green and every unit test passing: the pure
  // functions keep proving themselves against synthetic input nobody runs.
  // Reading build.mjs as source text is the same defence the next-steps
  // exemption set gets above.
  const build = source('build.mjs');

  // Guard (a): the roster call, with all four inputs it needs. `sectionAgents`
  // is what separates "no section" from "a section naming no skill", so a
  // dropped argument is a silently weaker guard rather than a crash.
  const roster = boundedSlice(
    build,
    'assertAgentSkillRecommendationRoster(',
    "{ context: 'agent skill-recommendation roster' },",
  );
  for (const argument of [
    "agents: agentFiles.map((file) => basename(file, '.md'))",
    'sectionAgents: collectRecommendedSkillSections(agentRecommendationSources)',
    'recommendationChains: collectRecommendedSkillChains(agentRecommendationSources)',
    'exemptAgents: SKILL_RECOMMENDATION_EXEMPT_AGENTS',
  ]) {
    assert.ok(roster.includes(argument), `the roster guard call must pass ${argument}`);
  }
  // `ownedSkills` is what keeps the roster manifest-driven: without it an agent
  // recommending only an allowlisted external skill would satisfy the guard
  // while naming no central owner at all.
  assert.match(
    roster,
    /ownedSkills: new Set\(\s*ownershipManifest\.relationships\.map\(\(relationship\) => relationship\.skill\),\s*\)/,
    'the roster guard call must derive ownedSkills from the ownership manifest',
  );

  // Guard (b): the reverse check runs only when the ownership call supplies the
  // consumers that can carry a recommendation at all.
  const ownership = boundedSlice(
    build,
    'assertSkillOwnershipContract(',
    "{ context: 'central-skill ownership guard' },",
  );
  assert.match(
    ownership,
    /recommendationCapableConsumers: new Set\(\s*recommendationSources\.map\(\(source\) => source\.consumer\),\s*\)/,
    'the ownership guard call must supply recommendationCapableConsumers',
  );

  // The exemption set is derived, not asserted: build.mjs and this contract must
  // share one membership, exactly as the next-steps exemptions do.
  const declared = section(build, 'const SKILL_RECOMMENDATION_EXEMPT_AGENTS = new Set([', '\n]);');
  const parsed = [...declared.matchAll(/^\s*'([^']+)',/gm)].map((match) => match[1]).sort();
  assert.deepEqual(
    parsed,
    ['merge-conflict-resolver'],
    'build.mjs and this contract must share one agent exemption set',
  );
  for (const name of parsed) {
    assert.ok(
      existsSync(new URL(`src/agents/${name}.md`, repositoryRoot)),
      `stale exemption: src/agents/${name}.md no longer exists`,
    );
    assert.doesNotMatch(
      source(`src/agents/${name}.md`),
      /^## (?:Recommended skills|Empfohlene Skills)\s*$/m,
      `${name} is exempt and must carry no recommended-skills section`,
    );
  }
  // Every other agent must carry one, which is the guard's obligated set stated
  // independently of the guard itself.
  const agentFiles = readdirSync(new URL('src/agents/', repositoryRoot)).filter((file) =>
    file.endsWith('.md'),
  );
  assert.ok(agentFiles.length > 0, 'no agent sources found — the roster check is vacuous');
  const obligated = agentFiles.filter((file) => !parsed.includes(file.slice(0, -'.md'.length)));
  assert.equal(obligated.length, agentFiles.length - parsed.length);
  for (const file of obligated) {
    assert.match(
      source(`src/agents/${file}`),
      /^## (?:Recommended skills|Empfohlene Skills)\s*$/m,
      `src/agents/${file} must name its domain owner or be exempt`,
    );
  }
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
  // `deliver` → `commit` → `pr` → `merge-gate` is the delivery chain in the order it is walked. A gate
  // listed first would present the group as "merge, then commit", which is the reading the
  // group move exists to remove. The whole sequence is therefore pinned.
  const deliver = section(source('build.mjs'), "title: 'Deliver changes',", '\n  {');
  assert.match(deliver, /tools: \['deliver', 'commit', 'pr', 'merge-gate'\]/);

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

  // What "assessed" covers has to be enumerated, or the condition is unexecutable. This used to be
  // a loop over `implement`, `defer` and `reject` asserting that each "counts as assessed". Those
  // three words still stand in the condition, so that loop stayed green while its message became
  // false: a deferred or rejected thread no longer clears on its own, and being handed over was
  // never an assessment at all. Each value is pinned to what it now does.
  assert.match(
    unassessed,
    near('assessment that clears it', 'implemented', 200),
    'the condition must still name the outcome that clears it on its own',
  );
  assert.match(
    unassessed,
    near('`unassessed` thread', '(?:blocks|as unassessed as)', 200),
    'an `unassessed` thread must be stated to block, exactly as an unassessed verdict does',
  );
  assert.match(
    unassessed,
    near('(?:deselected|implementation delegation aborted)', '`unassessed`', 300),
    'the condition must name where an `unassessed` thread comes from',
  );
  assert.match(
    unassessed,
    near('(?:`deferred` or `rejected`|deferred.{0,20}rejected)', 'set-aside confirmation', 300),
    'a deferred or rejected thread must reach the shared confirmation rather than clear itself',
  );
  assert.match(
    unassessed,
    near('Delegation membership', '(?:never cleared|assessed)', 300),
    'the condition must state that delegation membership never cleared it',
  );
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

  // The outcome-derived list is built through the mapping this run recorded before delegating, never
  // from a thread the return names: with every key minted, a thread ID in the return is not a key at
  // all, so a condition that read one out of the return would resolve nothing.
  assert.match(
    unassessed,
    near('identifier→thread-ID mapping', '(?:recorded|before delegating)', 300),
    'the outcome-derived list must be built through the recorded identifier-to-thread mapping',
  );
  assert.match(
    unassessed,
    near('thread ID', '(?:not a key|resolves to nothing)', 300),
    'a thread ID appearing in the return must resolve to nothing here',
  );
  assert.doesNotMatch(
    unassessed,
    /outcome naming a thread this run never handed over/i,
    'the condition must no longer claim a returned outcome names a thread directly',
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
    near('`mergeGate\\.maxRounds`', 'bounds', 120),
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
    ['mergeGate.maxRounds', '`10`'],
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
  // Default column flipped to `off`. The same defaults live in setup.md's block-9 table and in
  // the shared configuration fragment, three places read by three different audiences, and a
  // divergence is a project running a gate that resolves conflicts while its documentation says
  // it does not. Only `completion`, `conflictResolution`, `requireAllChecks` and `bots` are
  // actually pinned in all three: the fragment's own test asserts those four Default cells and
  // no others, so `checkWaitMinutes`, `maxRounds` and `botWaitMinutes` are pinned here and in
  // setup.md while the fragment carries their values with nothing asserting them.
  const block = section(docs, '## Block `mergeGate`', '\n## ');
  for (const [key, value] of [
    ['completion', '`ask`'],
    ['conflictResolution', '`auto`'],
    ['requireAllChecks', '`true`'],
    ['checkWaitMinutes', '`20`'],
    ['maxRounds', '`10`'],
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

test('skill-ownership.json names no merge gate among the consumers of effective-delivery', () => {
  // The manifest used to declare the gate as a delegate consumer of the central `pr-review`
  // skill, which the gate's own source forbids in bold: that skill brings its own approve and
  // request-changes submissions, its own CI recovery, and its own summary conventions, and this
  // workflow allows none of them. `pr-review` has since been consolidated into
  // `effective-delivery`, and the exclusion travels with the skill rather than with the old name.
  // Asserted for both consumer names, so the row cannot come back under the deprecated tool alias
  // either.
  const ownership = JSON.parse(source('docs/developer-guide/skill-ownership.json'));
  const entry = ownership.relationships.find((skill) => skill.skill === 'effective-delivery');
  assert.ok(entry, 'skill-ownership.json must list an "effective-delivery" skill entry');
  for (const forbidden of ['pr-review', 'merge-gate']) {
    assert.equal(
      entry.consumers.some((consumer) => consumer.consumer === forbidden),
      false,
      `the "effective-delivery" skill entry must not list "${forbidden}" as a consumer`,
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
    /Do not load `effective-delivery` here\./,
    'the gate must forbid loading the central delivery skill',
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
  // instead. Every claim below is therefore bound to the paragraph that must carry it, and the one
  // negative left is a second lock on the formulation that already misled a reader once.
  //
  // Both claims now sit where the key they qualify is documented — the `.check` bullet of the gate's
  // configuration — rather than in a separate edge-case list. A reader deciding whether to configure
  // `.check` for a reviewer reads that bullet; the pairs below are unchanged, only their home is.
  const gateSource = source('src/tools/merge-gate.md');
  const gateCheckKey =
    section(gateSource, '## Configuration', '\n## ')
      .split(/\n-\s+/)
      .find((entry) => entry.includes('`mergeGate.bots.<login>.check` names')) ?? '';
  assert.ok(
    gateCheckKey,
    'the gate must document `mergeGate.bots.<login>.check` in its own bullet',
  );
  const bullet = (marker) => {
    const entry = gateCheckKey.split(/\n\n/).find((part) => flat(part).includes(marker));
    assert.ok(entry, `the gate's \`.check\` documentation must carry the case about: ${marker}`);
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
    flat(gateSource),
    /publishes no check/i,
    'no part of the gate may reintroduce the claim that this reviewer publishes no check context',
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
  // This fragment is what `setup` and `iterate` load to resolve these keys — `merge-gate` documents
  // them in its own Configuration section instead — so a key missing here is a key those runs do
  // not resolve: it silently falls back to a default, turning a configured `merge` completion into
  // `ask` or a configured bot list into "no bots expected".
  const migration = source('src/shared/config-merge-gate-keys.md');
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

test("the router's description names exactly the exposed tool set", () => {
  // The frontmatter description is the only catalog a harness sees before it loads anything, so a
  // tool missing from it is a tool nobody discovers by name. A sample of two names cannot see that:
  // the list drifted from EXPOSED_TOOLS while every spot-checked name was still there. It is
  // reconciled in full instead, against the same TOOL_GROUPS the build derives EXPOSED_TOOLS from.
  const [, description] = source('src/SKILL.md').match(/^description:\s*(.+)$/m) ?? [];
  assert.ok(description, 'SKILL.md must carry a frontmatter description');

  // The list is generated, not written out: the placeholder is what keeps it from drifting again.
  assert.match(
    description,
    /\{\{TOOL_LIST\}\}/,
    'the router description must render its tool list from the {{TOOL_LIST}} placeholder',
  );
  const toolListLine = source('build.mjs')
    .split('\n')
    .find((line) => line.includes('TOOL_LIST') && line.includes('EXPOSED_TOOLS'));
  assert.ok(
    toolListLine,
    'build.mjs must resolve the {{TOOL_LIST}} placeholder from EXPOSED_TOOLS, so a deprecated ' +
      'alias — which is deliberately absent from TOOL_GROUPS — can never be advertised there',
  );
  assert.match(toolListLine, /EXPOSED_TOOLS\.join/);

  // TOOL_GROUPS cannot be imported: build.mjs runs the entire build on load, so the group
  // definition is sliced out of the source text instead, the same technique the neighboring
  // test "the merge gate is exposed in the Deliver changes group" uses.
  const groups = section(source('build.mjs'), 'const TOOL_GROUPS = [', '\nconst EXPOSED_TOOLS');
  const exposed = [...groups.matchAll(/tools: \[([^\]]*)\]/g)].flatMap((match) =>
    [...match[1].matchAll(/'([^']+)'/g)].map((tool) => tool[1]),
  );
  assert.ok(exposed.length > 0, 'TOOL_GROUPS must declare exposed tools');

  // Reconcile the rendered description, not the template: every exposed tool present, and no
  // extra tool-shaped name written in beside the placeholder.
  const rendered = description.replace(/\{\{TOOL_LIST\}\}/g, exposed.join(', '));
  const listed = (rendered.match(/Tools: ([^"]+)\./)?.[1] ?? '')
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
  assert.deepEqual(
    [...listed].sort(),
    [...exposed].sort(),
    'the router description must name exactly the exposed tool set',
  );
  assert.doesNotMatch(rendered, /\bpr-review\b/, 'the renamed tool must not linger in the list');
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

test('src/tools/pr-review.md states it is no central skill and inherits the gate exclusion', () => {
  // merge-gate forbids loading `effective-delivery` in bold (see the neighboring test
  // "skill-ownership.json names no merge gate among the consumers of effective-delivery"). The
  // alias once shared a name with the central `pr-review` skill that has since been consolidated
  // into `effective-delivery`; the accidental collision is gone, but the alias still forwards into
  // a gate that excludes that skill, so it must say so rather than leave an agent guessing that a
  // forward re-opens what the gate closed.
  const alias = flat(source('src/tools/pr-review.md'));
  assert.match(
    alias,
    /This tool is not a central skill, and it loads none\./,
    'the alias must state that it is no central skill and loads none',
  );
  assert.match(
    alias,
    /excludes `effective-delivery`/,
    'the alias must state that the gate it forwards to excludes `effective-delivery`',
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
    /Only for an issue observed terminal \(done\), complete its optional receipted container/,
  );
  assert.match(
    mergeObservation,
    /An open, timed-out, unobservable, `terminal \(cancelled\)`, or `terminal \(reconciliation unavailable\)` issue leaves its container entry open/,
  );
  assert.match(mergeObservation, /fresh container body and exact hash-guarded patch/);

  const nativeReconciliation = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
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
    /freshly observed terminal \(done\), remove `effective-flow-issue-in-progress` idempotently/,
  );
  assert.match(
    observation,
    /Keep the marker\s*for every other outcome, `terminal \(cancelled\)` included/,
  );
  assert.match(observation, /Never force-close an issue/);
});

test('external started-state configuration is tracker-verified and only setup persists suggestions', () => {
  const migration = prose(source('src/shared/config-migration-edge-cases.md'));
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

// --- post-merge completion assessment and the offered terminal transition ---
// After a confirmed merge the gate now assesses whether the merged pull request completes each
// still-open linked issue, and offers exactly one operator-confirmed transition to the terminal
// tracker state. Every guarantee here is prose, so each pin below matches a literal sentence: a
// reworded guarantee has to be a deliberate edit in this file as well.

test('the post-merge completion assessment states a closed verdict vocabulary and its gating', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );

  assert.match(
    observation,
    /Record exactly one verdict per issue, from a closed vocabulary of three values/,
  );
  for (const verdict of ['complete', 'incomplete', 'undetermined']) {
    assert.ok(
      observation.includes(`\`${verdict}\``),
      `the closed verdict vocabulary must name \`${verdict}\``,
    );
  }
  // "We could not tell" is a first-class verdict rather than a silent pass, and it gates exactly
  // as `incomplete` does. A vocabulary that reported only two values would have to route the
  // unreadable issue into one of them.
  assert.match(
    observation,
    /`incomplete` and `undetermined` are reported differently and treated identically — neither ever reaches the offer/,
  );

  // The assessment is ungated, the offer is gated, and collapsing the two is the failure this
  // pins: an ungated offer transitions issues unattended, while a gated assessment would leave a
  // non-interactive run with no recommendation to carry into its summary.
  assert.match(observation, /This assessment is not gated: it runs without asking/);
  assert.match(observation, /The offer is posed only in a gated run/);
  assert.match(observation, /A non-interactive run poses nothing, transitions nothing/);

  // Steps 5 and 6 are gated on a fresh terminal observation, so the post-transition re-read has to
  // replace step 2's record rather than merely sit beside it — otherwise a transitioned issue is
  // stranded with its in-progress label and an open container entry.
  assert.match(observation, /replaces that issue's recorded observation outcome/);
});

test('the confirmed transition revalidates the whole assessment basis before each mutation', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );

  // The offer is posed once for the whole run and the confirmed issues are then mutated in turn, so
  // a state-only recheck closes an issue whose task list, classifications, children or covering
  // pull-request text moved while the prompt stood open — and steps 5 and 6 then strip its label and
  // tick its container entry with the newly raised work signalled nowhere.
  assert.match(
    observation,
    /revalidate the whole assessment basis immediately before the mutation/,
  );
  // Every input is re-read per issue, the pull-request text included. Reading it once for the loop
  // would leave the later issues closing on a title and body observed before the first transition,
  // which is the same staleness the per-issue issue reads exist to remove.
  assert.match(
    observation,
    /re-read that issue's whole basis — the pull-request text included, per issue rather than once for the loop/,
  );
  assert.match(
    observation,
    /One fresh forge `pr-read` of the merged pull request supplies its title and body/,
  );
  assert.match(
    observation,
    /that issue's own basis comes from the same operations and the same target split step 3 uses/,
  );
  // Step 3's single whole-run read is earned by a pass that only reads; borrowing that bound for a
  // loop that mutates between its issues is what made the pull-request text the one stale input.
  assert.match(
    observation,
    /whole-run bound is earned by a pass that only reads, while this loop writes between its issues/,
  );
  assert.match(
    observation,
    /a covering statement edited away mid-loop would otherwise still close every issue behind it/,
  );
  assert.match(
    observation,
    /one fresh read of the issue for its state, body and classifications, and one fresh read of its direct children/,
  );
  // The rules live in step 3 and are re-applied, never restated: a second copy is what drifts.
  assert.match(
    observation,
    /Re-derive the verdict from that fresh basis by step 3's existing rules/,
  );

  // All three outcomes fail closed. Without the middle one a changed basis still closes the issue;
  // without the last one an unreadable basis does, which step 3 already refuses to call satisfied.
  assert.match(
    observation,
    /Where the fresh verdict is no longer `complete`, transition nothing for that issue/,
  );
  // The already-terminal branch skips the transition, and skipping the record with it is what
  // leaves the label on a closed issue: steps 5, 6 and 7 read step 2's outcome, so this branch has
  // to promote its fresh read exactly as the post-transition re-read does.
  assert.match(
    observation,
    /Skipping the transition is not skipping the record: this fresh read replaces that issue's recorded observation outcome from step 2 exactly as the post-transition re-read below does/,
  );
  assert.match(
    observation,
    /Steps 5, 6 and 7 fire on the recorded outcome and never on how it became terminal/,
  );
  assert.match(
    observation,
    /Where a revalidation read fails or cannot be performed, treat it exactly as a verdict that is no longer `complete`/,
  );

  // A revalidation that could add an issue would write past the confirmation the operator gave, and
  // asking again would break the one-question-per-run rule; the set may therefore only shrink.
  assert.match(observation, /The confirmed set therefore only ever shrinks/);
  assert.match(
    observation,
    /an issue whose verdict newly becomes `complete` here is not transitioned and the run poses no second question/,
  );

  // Step 4's budget is its own. Folding it into step 3's identically shaped one would make every
  // revalidation read look already spent, which is how the widened re-read quietly becomes optional.
  assert.match(
    observation,
    /These bounds are step 4's own, distinct from step 3's identically shaped ones and never read as one shared budget/,
  );
  assert.match(
    observation,
    /at most one `pr-read`, one issue read and one sub-issue read per confirmed issue/,
  );
  // The budget stays a fixed literal with no `mergeGate.*` key, so making the pull-request read
  // per issue must not reintroduce step 3's whole-run wording here.
  assert.doesNotMatch(observation, /one `pr-read` for the whole revalidation/);
});

test('the condensed lifecycle rule and the Phase-6 summary carry the widened revalidation', () => {
  const lifecycle = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
  );
  const summary = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 6: Summary', '\n## '),
  );

  // The shared contract is the condensed statement of the same rule, so leaving it on a state-only
  // recheck would contradict the widened one wherever a reader stops at the include.
  assert.match(
    lifecycle,
    /revalidate each item's whole assessment basis fresh immediately before its mutation/,
  );
  // The condensed rule has to carry the per-item granularity too, pull-request text included: a
  // reader who stops at the include would otherwise take one whole-loop read for the contract.
  assert.match(
    lifecycle,
    /all re-read per item rather than once for the loop, because this loop writes between its items/,
  );
  // The condensed rule carries the already-terminal branch's record promotion for the same reason
  // the widened one does: a reader who stops at the include would otherwise take "skipped as a
  // no-op" for skipping the record too, and leave the marker on an item that closed itself.
  assert.match(
    lifecycle,
    /Skipping the transition for an already-terminal item is not skipping the record: that revalidation read replaces the item's recorded observation outcome exactly as the post-transition re-read below does/,
  );
  assert.match(
    lifecycle,
    /one whose verdict is no longer `complete`, and one whose revalidation read fails, is not transitioned at all/,
  );
  assert.match(lifecycle, /The confirmed set only ever shrinks, and nothing enters it late/);

  // Without this the report spells a declined issue and a revalidation-blocked one identically, and
  // the case where the operator said yes while the run still wrote nothing goes unreported.
  assert.match(
    summary,
    /Where a confirmed issue was not transitioned because step 4's revalidation found its basis changed, name the dimension that changed/,
  );
});

test('the terminal-transition offer quotes no text and its option discloses the whole cascade', () => {
  const gate = source('src/tools/merge-gate.md');
  const observation = prose(section(gate, '### Phase 5.5: Observe linked issues after merge'));

  // The same threat model the set-aside confirmation already carries: the verdict derives from
  // text a third party can write on any repository where they can file an issue, so an excerpt
  // would carry attacker-influenceable text into the prompt that exists to resist it. The evidence
  // is listed as locators in chat instead.
  assert.match(observation, /the question's own text is fixed and carries no per-run data/);
  assert.match(observation, /This run quotes no issue or pull-request text/);
  assert.match(observation, /one locator per criterion/);

  // The `ask` fence itself. One confirmation authorizes three classes of write — the transition,
  // the label removal of step 5, and the container completion of step 6 — so the option text has
  // to disclose all three rather than only the one it is named after.
  const headerIndex = gate.indexOf('header: Issue done');
  assert.notEqual(headerIndex, -1, 'missing the Issue done ask fence header');
  const fenceStart = gate.lastIndexOf('```ask', headerIndex);
  assert.notEqual(fenceStart, -1, 'the Issue done header must sit inside an ask fence');
  const fence = gate.slice(fenceStart, gate.indexOf('\n```', fenceStart));
  assert.match(
    fence,
    /question: The linked issues listed above are fully implemented by this merged pull request\. May this run set them to their terminal tracker state\?/,
  );

  const setToDone = fence.slice(
    fence.indexOf('label: Set to done'),
    fence.indexOf('label: Leave open'),
  );
  assert.ok(
    setToDone.includes('label: Set to done'),
    'the fence must carry a Set to done option ahead of Leave open',
  );
  assert.match(setToDone, /effective-flow-issue-in-progress/);
  assert.match(setToDone, /container entry/);
  assert.match(setToDone, /this run quotes no issue or pull-request text/);
});

test('a stated acceptance criterion comes from a closed heading set and its absence is undetermined', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );
  const lifecycle = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
  );

  for (const contract of [observation, lifecycle]) {
    assert.match(
      contract,
      /The set is `Acceptance criteria`, `Akzeptanzkriterien`, and `Done criteria`, matched case-insensitively at any heading level/,
    );
    assert.match(contract, /the criteria are that section's top-level list items/);
    // An issue with no criteria at all is the cheapest input in the system to construct, and the
    // per-criterion evidence the offer rests on is vacuous exactly there.
    assert.match(contract, /states no acceptance criteria is `undetermined`, never `complete`/);
  }

  // Pulling "must"/"shall" sentences out of prose is derivation, not observation, and the
  // lifecycle contract already forbids inventing an acceptance criterion.
  assert.match(
    observation,
    /Never pull a criterion out of prose by collecting "must" or "shall" sentences/,
  );
  assert.match(lifecycle, /a criterion is never derived from prose/);
});

test('the completion verdict recognizes the legacy planning-blocker spelling on the forge', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );
  const lifecycle = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
  );
  const gate = source('src/tools/merge-gate.md');

  // The label convention in `issue-tracker.md` treats `firmo-needs-planning` as permanently
  // equivalent on every forge read, and the gate does not load that fragment. Without the
  // equivalence restated here, an issue classified under the old prefix verdicts `complete` and is
  // closed with its planning unfinished — the blocker is present, the reader simply cannot see it.
  for (const contract of [observation, lifecycle]) {
    assert.match(contract, /legacy `firmo-needs-planning` spelling/);
    assert.match(contract, /neither queried nor written on an external target/);
  }
  assert.match(
    lifecycle,
    /`effective-flow-needs-planning`, on the forge in either spelling — complete the planning path/,
  );

  // The gate carries no include of the label convention, which is why the rule is stated inline
  // rather than referenced. If that ever changes, this pin is what says the duplication may go.
  assert.doesNotMatch(gate, /```include\nissue-tracker\n```/);

  // The other half of the sweep: `effective-flow-issue-in-progress` is the only other Effective
  // Flow label this phase touches, it is newer than the `firmo-` prefix, and it has no legacy
  // spelling — so its removal deliberately looks for no second variant.
  for (const contract of [observation, lifecycle]) {
    assert.match(contract, /has no legacy spelling/);
  }
});

test('a terminal outcome is split into done and cancelled before anything is reconciled', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );
  const lifecycle = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
  );

  // Terminal and done are two facts. The in-progress removal and the container tick are the writes
  // that record delivery, so an issue withdrawn as cancelled must not reach either of them.
  for (const contract of [observation, lifecycle]) {
    assert.match(contract, /terminal is not the same as done/);
    assert.match(
      contract,
      /terminal \(done\)[^.]*state reason of `completed`[^.]*resolved `tracker.externalDoneState`/,
    );
    assert.match(contract, /terminal \(cancelled\)/);
    // Forgejo states no reason at all, so an absence is the provider's silence and never a
    // withdrawal; reading it the other way would make every Forgejo issue unreconcilable forever.
    assert.match(contract, /Only a stated contrary reason cancels/);
  }

  // The three sites the split has to reach: the pre-transition promotion of an already-terminal
  // issue, the post-transition proof, and the two cleanup writes.
  assert.match(
    observation,
    /it replaces it with the split outcome step 2 defines, never with a bare "terminal"/,
  );
  assert.match(
    observation,
    /a re-read that still shows a nonterminal state, one that shows `terminal \(cancelled\)`, or one that shows `terminal \(reconciliation unavailable\)` is a failed transition/,
  );
  assert.match(
    observation,
    /For every forge issue freshly observed terminal \(done\), remove `effective-flow-issue-in-progress`/,
  );
  assert.match(
    observation,
    /Only for an issue observed terminal \(done\), complete its optional receipted container reconciliation/,
  );
  assert.match(
    lifecycle,
    /Complete a checklist entry only after the linked issue is observed `terminal \(done\)`/,
  );

  // A cancelled issue is not open work either: no closure guidance is derived for it.
  assert.match(observation, /derive no\s*closure guidance for it/);
  assert.match(lifecycle, /derive no guidance\s*for it/);
});

test('the external done state is re-resolved before every transition, not once before the offer', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );
  const lifecycle = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
  );
  const target = prose(source('src/shared/tracker-target.md'));

  // The offer is posed once and the issues are transitioned one after another, so a mapping
  // resolved before the question is exactly as old as the verdict beside it. A state reclassified
  // out of the done category while the prompt stood open would otherwise be written and then
  // matched against itself by the post-transition re-read, reporting success against a target that
  // no longer means done.
  assert.match(observation, /re-resolve `tracker.externalDoneState`/);
  assert.match(lifecycle, /re-resolve `tracker.externalDoneState`/);
  assert.match(
    target,
    /Resolve it again immediately before every transition, not once before the offer/,
  );
  assert.match(
    target,
    /the post-transition re-read would then match the issue against that same stale value/,
  );
  for (const contract of [observation, lifecycle]) {
    assert.match(contract, /treated exactly as a failed revalidation\s*read/);
  }
});

test('an already-terminal external issue resolves its done state where the split is recorded', () => {
  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );
  const lifecycle = prose(
    section(source('src/shared/issue-post-merge-observation.md'), '### Post-merge observation'),
  );
  const target = prose(source('src/shared/tracker-target.md'));

  // The split's external half is the resolved `tracker.externalDoneState`, but the transition that
  // re-resolves it is a path an already-terminal issue never takes: it is not assessed, so it never
  // earns the `complete` verdict the transition loop consumes. The observation that records the
  // split therefore has to resolve the value itself, or it is classifying against nothing.
  for (const contract of [observation, lifecycle]) {
    assert.match(contract, /The external half needs a resolved done state/);
    assert.match(contract, /resolve `tracker.externalDoneState` by the loaded `tracker-target`/);
    // Observation needs the listing half only — a connection that cannot transition still tells a
    // done issue from a withdrawn one.
    assert.match(contract, /needs only the listing half/);
    assert.match(contract, /never poses their unset-key proposal|observation never poses/);
  }
  assert.match(
    target,
    /before recording the terminal split for an issue post-merge observation finds already terminal/,
  );
  // The capability statement used to say observation needed only a state read, which is what left
  // the split with no value to compare against.
  assert.doesNotMatch(
    target,
    /Post-merge _observation_ still requires only a fresh native-state read/,
  );

  // Where it cannot be resolved the outcome is a third one: terminal, but not classifiable. Not
  // done, so no delivery write follows; not cancelled either, since nobody observed a withdrawal.
  for (const contract of [observation, lifecycle]) {
    assert.match(contract, /terminal \(reconciliation unavailable\)/);
    assert.match(contract, /the split is undecidable/);
  }
  // It reaches every site the split reaches: the promotion of an issue that closed itself, the
  // post-transition proof, the container write, and the closure guidance.
  for (const contract of [observation, lifecycle]) {
    assert.match(
      contract,
      /records terminal \(reconciliation unavailable\) rather than a guessed `terminal \(done\)`/,
    );
    assert.match(
      contract,
      /`terminal \(reconciliation unavailable\)` (?:issue|one)[\s\S]{0,120}?(?:leaves its container|are all failed)/,
    );
    assert.match(contract, /what is missing is the mapping rather than the work/);
  }

  // And it reaches the report. The Phase 6 row per linked issue names the observed state from a
  // closed list, so an outcome missing from that list has no valid row: a reconciliation-unavailable
  // issue would have to be filed as done, cancelled, open, timed out or unobservable, and every one
  // of those five says something about it that nobody established.
  const summary = prose(section(source('src/tools/merge-gate.md'), '### Phase 6: Summary'));
  assert.match(
    summary,
    /one row per linked issue with its observed terminal-done\/terminal-cancelled\/terminal-reconciliation-unavailable\/open\/timed-out\/unobservable state/,
  );
  assert.match(
    summary,
    /a reconciliation-unavailable one naming the missing capability or configuration value that left `tracker.externalDoneState` unresolved/,
  );
});

test('the forge preflight probes issueClose, degrades without it, and never calls it a read', () => {
  const phase0 = prose(
    section(
      source('src/tools/merge-gate.md'),
      '### Phase 0: Resolve the pull request and the completion mode',
    ),
  );

  assert.match(phase0, /`pullRequestMerge`, `viewerRead`, `prReviewsRead`, and `issueClose`/);
  // `viewerRead` is the model: the one capability whose absence ends nothing.
  assert.match(phase0, /Without `issueClose` the run continues/);
  assert.match(
    phase0,
    /the Phase-5\.5 completion offer is unavailable for every forge issue of this run/,
  );
  assert.match(
    phase0,
    /an unavailable offer is not the same result as an issue the assessment found incomplete/,
  );

  // The observer-only sentence is about forge *reads*. Extending its list in place would have
  // produced a sentence that calls a close a read, so the required reads and the one optional
  // mutation must stay stated apart.
  const observerStart = phase0.indexOf('In observer-only mode require only the forge');
  assert.notEqual(observerStart, -1, 'missing the observer-only capability sentence');
  const observerOnly = phase0.slice(observerStart);
  const requiredReads = observerOnly.slice(0, observerOnly.indexOf('Beyond those reads'));
  assert.ok(
    requiredReads.length > 0,
    'the observer-only sentence must separate its required reads from what follows them',
  );
  assert.equal(
    requiredReads.includes('issueClose'),
    false,
    'the observer-only required-read list must not name issueClose: a close is a mutation',
  );
  assert.match(observerOnly, /this path uses exactly one optional mutation — `issueClose`/);
  assert.match(observerOnly, /It is a mutation and is never counted among the required reads/);
  assert.match(observerOnly, /never degrades or rejects the run/);
});

test('the Phase-6 summary and the merged-PR re-entry allowlist name the completion assessment', () => {
  const gate = source('src/tools/merge-gate.md');
  const summary = prose(section(gate, '### Phase 6: Summary', '\n## '));

  assert.match(summary, /per linked issue, the completion verdict of Phase 5\.5 by its name/);
  assert.match(summary, /together with the criterion locators that produced it/);
  // The summary states three lines above that it reads "no body, deliberately"; an extension that
  // quoted criterion or pull-request text would reverse its own discipline.
  assert.match(
    summary,
    /Report the locators and never the criterion text or any pull-request text/,
  );
  assert.match(
    summary,
    /whether the terminal transition was offered, how the operator answered, and what the transition did/,
  );

  // The re-entry list is an allowlist, so an action absent from it is out of scope by
  // construction — which is why the recovery path for an unposed offer has to be named in it.
  assert.match(
    prose(gate),
    /A merged PR is re-entered: run only receipt validation, bounded tracker observation, the completion assessment and its offered terminal transition, terminal label cleanup, and eligible container reconciliation/,
  );
});

test('both force-close prohibitions survive verbatim beside the operator-confirmed carve-out', () => {
  // An operator-confirmed transition after an evidence-backed `complete` verdict is not a forced
  // close, so neither prohibition is weakened; each gains the carve-out next to it instead.
  const carveOut =
    /An operator-confirmed transition after a `complete` assessment verdict is not a forced close and is the one authorized path\./;

  const lifecycle = prose(source('src/shared/issue-post-merge-observation.md'));
  assert.match(lifecycle, /Do not force-close an issue\./);
  assert.match(lifecycle, carveOut);
  assert.match(
    lifecycle,
    near(
      'Do not force-close an issue\\.',
      'is not a forced close and is the one authorized path',
      200,
    ),
    'the lifecycle carve-out must sit beside the prohibition it qualifies',
  );

  const observation = prose(
    section(source('src/tools/merge-gate.md'), '### Phase 5.5: Observe linked issues after merge'),
  );
  assert.match(
    observation,
    /Never force-close an issue and never write a fallback classification to a different target\./,
  );
  assert.match(observation, carveOut);
  assert.match(
    observation,
    near('Never force-close an issue', 'is not a forced close and is the one authorized path', 200),
    "the gate's carve-out must sit beside the prohibition it qualifies",
  );
});

test('the merge-gate rules drop the observe-only closure claim for the confirmed-transition rule', () => {
  const gate = prose(source('src/tools/merge-gate.md'));

  // The retired sentence sat in `## Rules`, where it read as a scope statement — this gate
  // observes, it does not close — and the offer makes that false. A reader who greps the Rules and
  // stops there would draw the wrong conclusion, so it has to be gone rather than kept verbatim.
  assert.equal(
    gate.includes('Observe but never force issue closure'),
    false,
    'the retired Rules scope statement must not survive the offered transition',
  );
  assert.match(gate, /Never close an issue on this gate's own authority\./);
  assert.match(
    gate,
    /A terminal transition happens only after a `complete` assessment verdict and an explicit operator confirmation in a gated run; every other path observes only\./,
  );
});

test('the in-run reasoning enumeration names the completion assessment as its fifth member', () => {
  // The carve-out from the delegation mandate is a closed enumeration, so a guard that authorizes
  // a write is either named in it or delegated away. Reading an exception into the four is exactly
  // what this pin prevents.
  const gate = prose(source('src/tools/merge-gate.md'));

  assert.match(
    gate,
    /evaluating the Phase-4 conditions, and forming the Phase-5\.5 completion assessment stay in this run/,
  );
  assert.match(
    gate,
    /The completion assessment is named here as a fifth member rather than read into the four before it/,
  );
  assert.match(gate, /it is a guard that authorizes a tracker write/);
});

test('external done-state configuration mirrors the started state and never aborts a merged run', () => {
  const migration = prose(source('src/shared/config-migration-edge-cases.md'));
  const tracker = prose(source('src/shared/tracker-target.md'));
  const setup = prose(source('src/tools/setup.md'));
  const guide = source('docs/user-guide/configuration.md');

  assert.match(
    migration,
    /`tracker\.externalDoneState` → a nullable string containing the external connection's stable terminal state ID/,
  );
  assert.match(
    migration,
    /Missing or `null` means unset and never authorizes a guessed transition/,
  );
  assert.match(
    migration,
    /make that transition unavailable instead of guessing, and never abort a run whose merge already succeeded/,
  );

  assert.match(
    tracker,
    /Before the offered post-merge terminal transition, and before recording the terminal split for an issue post-merge observation finds already terminal, list those states fresh in the same context and resolve `tracker\.externalDoneState`/,
  );
  assert.match(tracker, /it must be writable and terminal, and normalized as a done category/);
  // Discovery has to carry the done category too, not only the terminal flag. A tracker that spells
  // cancellation as a terminal state has two writable terminal candidates where exactly one
  // qualifies: filtering on terminal alone loses the transition to ambiguity there, and proposes
  // the canceled state wherever the completed one happens not to be writable.
  assert.match(
    tracker,
    /When the key is unset, filter the fresh states to writable, terminal candidates normalized as a done category/,
  );
  assert.match(tracker, /A display-name match is never enough/);
  assert.match(
    tracker,
    /Exactly one candidate may be proposed with both its display name and stable value/,
  );
  // The one deliberate divergence from the started state: the write it authorizes is optional and
  // follows a merge that already succeeded, so an unresolvable value never fails the run closed.
  assert.match(
    tracker,
    /unlike the started state it never aborts the run, because the merge has already happened/,
  );
  assert.match(
    tracker,
    /Never infer a state from `tracker\.externalTool` or from a brand-specific name such as "Done"\./,
  );

  assert.match(
    setup,
    /`externalDoneState` \(nullable stable native terminal state ID, or exact accepted token only when the connection exposes no ID; freshly tracker-verified before persistence/,
  );
  assert.match(setup, /`tracker\.externalDoneState` – the terminal counterpart/);
  // The same rule in the wizard, on both halves: a configured value is validated against the done
  // category, and an absent one is discovered by it. Without this, setup would happily persist a
  // canceled state as the value the merge gate transitions completed issues into.
  assert.match(
    setup,
    /Validate an existing value by stable value, context, normalized done category, terminal flag, and writability/,
  );
  assert.match(
    setup,
    /If it is absent and exactly one writable, terminal candidate is normalized as a done category/,
  );
  assert.match(
    setup,
    /report that the post-merge transition will be offered as unavailable until setup can verify one/,
  );
  assert.match(
    setup,
    /`externalTool`\/`externalToolHint`\/`externalStartedState`\/`externalDoneState` when the mode is `local` or `remote`/,
  );
  assert.match(
    setup,
    /the freshly verified nullable `tracker\.externalStartedState` and `tracker\.externalDoneState`/,
  );
  assert.match(
    setup,
    /the confirmed `tracker\.externalStartedState` and `tracker\.externalDoneState` stable values or `null`/,
  );

  // The key gained a second reader when post-merge observation started resolving it to split an
  // already-terminal issue into done and withdrawn. Every surface that describes the key has to say
  // so: an operator told the offered transition is its only reader concludes that leaving it unset
  // costs nothing but that offer, when it also costs every already-closed issue its reconciliation.
  for (const [name, text] of [
    ['setup.md', setup],
    ['config-migration-edge-cases.md', migration],
    ['configuration.md', prose(guide)],
  ]) {
    assert.doesNotMatch(
      text,
      /only (?:by )?the (?:merge gate's )?offered post-merge (?:terminal )?transition/i,
      `${name} must not describe the offered transition as the only reader of externalDoneState`,
    );
  }
  assert.match(setup, /and by the post-merge observation that tells an already-terminal issue/);
  assert.match(
    setup,
    /so does that gate's post-merge observation of an issue it finds already terminal/,
  );
  assert.match(
    migration,
    /That transition is not the only reader: the post-merge observation of an issue found already terminal resolves the same value by the same rules/,
  );
  assert.match(
    prose(guide),
    /Two readers use it, both in \[`\/effective-flow merge-gate`\]\(\.\/tools-deliver\.md\) and both after a merge/,
  );

  assert.equal(
    rowCells(tableRow(section(guide, '## Block `tracker`', '\n## '), '`externalDoneState`'))[3],
    'Writable, terminal native state normalized as done; external target only',
  );
  assert.match(
    prose(guide),
    /`externalDoneState` is the terminal counterpart and follows the same rules with one deliberate difference in consequence/,
  );
  // The page's own table row and prose already promise "normalized as done", so a discovery
  // sentence that asked only for a terminal state would document a rule the contract does not have
  // and contradict the row two paragraphs above it.
  assert.match(
    prose(guide),
    /When the key is absent and exactly one writable, terminal candidate is normalized as done/,
  );
  // Nullable and unset by default, exactly as `externalStartedState`, so it earns no row in the
  // safe-defaults table: a row there would assert a default the key does not have.
  assert.equal(
    section(guide, '## Safe defaults at a glance', '\n## ').includes('externalDoneState'),
    false,
    'a nullable, unset-by-default key must not appear in the safe-defaults table',
  );
});

test('the completion offer adds no mergeGate.* key: all four key tables still carry nine rows', () => {
  // The operator chose "report, transition nothing" for the non-interactive case, so there is no
  // mode to configure and setup.md's "The gate is safe without any of these keys" stays true. A
  // tenth row would be a fifth place to keep in sync and a guarantee that quietly became
  // configurable — which is why the row set is asserted rather than only its length.
  //
  // The gate's own Configuration table is the fourth copy and was, until this assertion, the one
  // nobody compared: the configuration split gave `merge-gate` a table of its own precisely so it
  // would not have to load `config-merge-gate-keys`, which made it the copy that can drift alone.
  const prefixed = [
    '`mergeGate.completion`',
    '`mergeGate.conflictResolution`',
    '`mergeGate.requireAllChecks`',
    '`mergeGate.checkWaitMinutes`',
    '`mergeGate.maxRounds`',
    '`mergeGate.botWaitMinutes`',
    '`mergeGate.bots`',
    '`mergeGate.bots.<login>.trigger`',
    '`mergeGate.bots.<login>.check`',
  ];
  const bare = prefixed.map((key) => key.replace('mergeGate.', ''));

  // The first `| Key` table of the given slice, minus its header and separator rows.
  const keyRows = (text, label) => {
    const start = text.indexOf('| Key');
    assert.notEqual(start, -1, `missing the mergeGate key table in ${label}`);
    const end = text.indexOf('\n\n', start);
    return firstColumnCells(text.slice(start, end === -1 ? undefined : end)).slice(2);
  };

  assert.deepEqual(
    keyRows(
      section(
        source('src/shared/config-merge-gate-keys.md'),
        '### Merge-gate keys (`mergeGate.*`) and their legacy namespace',
        '\n### ',
      ),
      'src/shared/config-merge-gate-keys.md',
    ),
    prefixed,
  );

  const setup = source('src/tools/setup.md');
  assert.deepEqual(
    keyRows(
      setup.slice(setup.indexOf('| Key                              | Values')),
      'src/tools/setup.md',
    ),
    prefixed,
  );

  assert.deepEqual(
    keyRows(
      section(source('docs/user-guide/configuration.md'), '## Block `mergeGate`', '\n## '),
      'docs/user-guide/configuration.md',
    ),
    bare,
  );

  // The gate documents `delivery.mergeMethod` in the same table, because it is the one non-gate
  // key a gate run reads. Allowed explicitly and only in that position: an unlisted extra row
  // here is a key the other three tables never learned about.
  assert.deepEqual(
    keyRows(
      section(source('src/tools/merge-gate.md'), '## Configuration', '\n## '),
      'src/tools/merge-gate.md',
    ),
    [...prefixed, '`delivery.mergeMethod`'],
  );
});

// The fail-closed rule for one of those nine keys, pinned in every source that carries it. It is
// the rule the configuration split nearly lost: `merge-gate` stopped loading
// `config-merge-gate-keys`, the paragraph stayed behind in the fragment, and the gate's own
// Configuration section restated the table and the mode semantics but not this. An unparseable
// line would then have fallen through to the documented default `auto` and authorized an
// automatic resolution, a commit and a push — while both guides still promised `off`.
test('an unreadable conflictResolution resolves to off in every source that documents the key', () => {
  for (const [path, heading, until] of [
    ['src/tools/merge-gate.md', '## Configuration', '\n## '],
    [
      'src/shared/config-merge-gate-keys.md',
      '### Merge-gate keys (`mergeGate.*`) and their legacy namespace',
      '\n### ',
    ],
    ['docs/user-guide/configuration.md', '## Block `mergeGate`', '\n## '],
  ]) {
    const block = flat(section(source(path), heading, until));
    assert.match(
      block,
      near('(?:unreadable|invalid)', 'resolves to `off`', 200),
      `${path} must state that an unreadable or invalid mergeGate.conflictResolution resolves ` +
        'to `off`',
    );
    assert.match(
      block,
      near('resolves to `off`', 'not to (?:the documented default )?`auto`', 120),
      `${path} must say the fallback is not the documented default \`auto\` - the whole point of ` +
        'the rule is that this key is where the safe default and the documented default diverge',
    );
    assert.match(
      block,
      near('unparseable', 'never authorize a commit and a push', 200),
      `${path} must give the reason: an unparseable line must never authorize a commit and a push`,
    );
  }
});

test('the merge-gate operation table gains issue-close and the tea note reports it unsupported', () => {
  const gateOps = section(
    source('docs/user-guide/remote-tracker.md'),
    '## Merge gate operations',
    '\n## ',
  );

  assert.deepEqual(firstColumnCells(gateOps).slice(2), [
    '`pr-status-read`',
    '`pr-reviews-read`',
    '`pr-checks-wait`',
    '`pr-merge`',
    '`viewer-read`',
    '`issue-state-wait`',
    '`issue-close`',
  ]);
  assert.equal(rowCells(tableRow(gateOps, '`issue-close`'))[1], '`issueClose`');

  // The lead-in counts the rows of the table it introduces, so it has to move with them.
  const flatOps = prose(gateOps);
  assert.match(
    flatOps,
    /through seven additional forge operations of the same remote-tracker helper/,
  );
  assert.equal(
    flatOps.includes('six additional forge operations'),
    false,
    'the lead-in count must follow the table it introduces',
  );

  // Decision 9 adds no probe: `issue-close` rides the `tea api` transport the gate reads already
  // use, so it simply joins the operations a `tea` without `--include` reports unsupported.
  assert.match(
    prose(source('docs/user-guide/troubleshooting.md')),
    /a `tea` without it reports `pr-status-read`, `pr-reviews-read`, `pr-merge`, `viewer-read` and `issue-close` as `UNSUPPORTED_CAPABILITY`/,
  );
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

// The rule's own arms, one entry per outcome bullet, with the lead-in classification prose kept as
// entry 0. `oxfmt` puts a blank line between a paragraph and the list that follows it, and the
// `\s*` in the split lookahead matches at both of that gap's newlines, so the raw split yields a
// whitespace-only element between the prose and the first bullet. Dropping empties keeps the
// positional reads below anchored to the arms themselves instead of to the formatter's line breaks
// - without it `missing` silently binds a blank string and every assertion on it goes vacuous.
function baseBranchRuleParts() {
  const rule = boundedSlice(
    source('src/shared/base-branch-resolution.md'),
    '## Base-branch resolution',
    '\n### Recorded results',
  );
  return rule
    .split(/(?=\n\s*- )/)
    .map(prose)
    .filter((part) => part.trim() !== '');
}

test('the base-branch resolution rule distinguishes a missing remote from a failed fetch', () => {
  const step = boundedSlice(
    source('src/shared/base-branch-resolution.md'),
    '## Base-branch resolution',
    '\n### Recorded results',
  );

  // The `git remote` check is what separates "this ref can never exist here" from "this ref
  // exists but I could not reach it". Without it the two collapse into one failure, and a
  // zero-config local project — the deployment line with no forge at all — cannot pass its
  // first delivery preflight even though the local branch resolves perfectly.
  assert.match(step, /`git remote`/, 'the rule must probe whether the remote is configured');

  // Each case is its own bullet, taken with its continuation lines so a wrapped sentence is not
  // read as belonging to the next case. Asserting only on the whole step would stay green if a
  // later edit merged the fallback into the failure branch, which is the dangerous regression:
  // a stale local branch silently becoming the base after an unreachable remote.
  const cases = baseBranchRuleParts().slice(1);
  assert.equal(cases.length, 3, 'the rule must carry exactly its three outcome bullets');
  const [configured, missing, unresolvable] = cases;

  assert.match(configured, /Remote configured/);
  assert.match(configured, /git fetch REMOTE BRANCH/);
  assert.match(
    configured,
    near('fetch or the resolution fails', 'never fall back', 200),
    'a reachable remote whose fetch or resolution fails must stop instead of falling back',
  );
  assert.doesNotMatch(
    configured,
    /local branch part/,
    'the failure branch must not offer the local-branch substitution',
  );

  assert.match(missing, /Remote not configured/);
  assert.match(
    missing,
    near('no such ref can exist', 'local branch part', 200),
    'an unconfigured remote must fall back to the local branch part of the value',
  );
  assert.match(missing, /report that substitution/, 'the substitution must be visible, not silent');
  assert.doesNotMatch(missing, /git fetch/, 'there is nothing to fetch from an absent remote');

  assert.match(
    unresolvable,
    /Neither the remote ref nor any local candidate for the value resolves/,
  );
  assert.match(unresolvable, /abort, naming both facts/);
  assert.match(unresolvable, /Never\s+invent or create a base branch/);
});

test('the base-branch resolution rule keeps a slash-containing local base branch whole', () => {
  const [classification, , missing] = baseBranchRuleParts();

  // Splitting the value at the first `/` is only correct when the leading part actually names a
  // remote. Local branch names carry slashes all the time, and `setup` now proposes the current
  // local branch — so `feature/foo` in a repository without remotes would probe a remote
  // `feature`, take the fallback `foo` and abort, while the ref it was handed resolves.
  assert.match(
    classification,
    near('part before its first `/`', '`git remote`', 200),
    'only a leading part that names a configured remote may make the value a remote ref',
  );
  assert.match(
    classification,
    /`feature\/foo`/,
    'the slash-containing local branch is the case the split gets wrong',
  );

  // `setup` proposes a bare local branch where no `origin` exists, so the slashless value is a
  // real input to this rule and not a degenerate one. Left unstated, a reader has to infer the
  // classification from a `/` that is not there.
  assert.match(
    classification,
    /no `\/` at all/,
    'a value without a slash has no leading part and can never be a remote ref',
  );

  // Order matters here, not just presence: the full value has to be tried before anything is cut
  // off it, or `feature/foo` resolves to `foo` in every repository that has both branches.
  ordered(missing, 'as a local ref', 'as it stands first', 'local branch part');

  // The user guide restates the rule for readers who never open the fragment; a mirror that still
  // describes the unconditional split contradicts the contract it is documenting.
  assert.match(
    prose(source('docs/user-guide/worktree-and-delivery.md')),
    near('part before its first `/`', '`feature/foo`', 200),
    'the user guide still describes the value as split at the first slash unconditionally',
  );
});

// `pr` step 4 picks its diff-base arm from the recorded pair, and a complete handoff supplies that
// pair while running no arm at all. Unless the arm is recoverable from the two values themselves,
// that selection is undefined on precisely the path that cannot observe which arm ran — so the
// derivation is a property of the rule, pinned where the rule records its results.
test('the recorded base-branch results identify the arm that produced them', () => {
  const recorded = prose(
    section(source('src/shared/base-branch-resolution.md'), '### Recorded results'),
  );

  assert.match(
    recorded,
    near('always differ', 'remote name in front of the branch', 300),
    'the remote-configured arm must be stated as the one whose two results differ',
  );
  assert.match(
    recorded,
    near('always equal', 'records one candidate as both', 300),
    'the remote-not-configured arm must be stated as the one whose two results are equal',
  );
  // The reading itself, not only its two halves: a consumer needs the direction spelled out.
  assert.match(
    recorded,
    /equal results are the remote-not-configured arm and differing results are the remote-configured one/,
  );
  // Carrying the arm as a third named result is the alternative this derivation replaces. Left
  // unstated, a later handoff would grow that field back and the pair would stop being sufficient.
  assert.match(
    recorded,
    near('no arm name', 'alongside the pair', 200),
    'the derivation must state that no caller passes an arm name',
  );
});

test('the partial-diff path defers to the single base-branch resolution rule', () => {
  const delivery = source('src/shared/worktree-integration.md');
  const partial = boundedSlice(delivery, '### Partial-diff PR via worktree', '\n### ');

  // The rule is defined once. Both partial-diff sites used to restate the assumption
  // ("resolvable and, for remote refs, updatable" / "Refresh and resolve"), which is how a
  // second, quietly diverging copy of the fetch contract came to exist in one fragment.
  assert.match(partial, /resolves under the "Base-branch resolution" rule/);
  assert.match(partial, /Resolve `delivery\.baseBranch` by that same rule/);
  assert.doesNotMatch(partial, /updatable/);
  assert.doesNotMatch(partial, /git fetch/, 'only the shared rule instructs the fetch');

  // The branch is created from the recorded result, not from the configured value: on the
  // substitution arm those differ, and creating from the raw value would abort or start the
  // partial-diff worktree from the wrong commit.
  assert.match(prose(partial), /recorded resolved base ref/);
});

// One rule, one fetch, in both hosts. The count runs over the eagerly resolved composition rather
// than over the fragment alone: a host that grows a second refresh sentence of its own is exactly
// the defect the extraction removes, and a fragment-local count would never see it. The raw
// zero-count is the other half - it is what fails when a host restates the fetch inline.
test('base-branch resolution reaches both hosts eagerly, with exactly one fetch each', () => {
  for (const path of ['src/shared/worktree-integration.md', 'src/tools/pr.md']) {
    const raw = source(path);
    const { eager } = collectIncludeNames(raw);
    assert.ok(
      eager.has('base-branch-resolution'),
      `${path} must include the rule eagerly; a lazy pointer would leave the rule unrendered ` +
        'in a host that resolves a base on every run',
    );
    assert.equal(
      (raw.match(/git fetch/g) ?? []).length,
      0,
      `${path} must not restate the fetch the rule owns`,
    );

    const resolved = resolveEagerIncludes(raw, {
      context: path,
      readFragment: (name) => source(`src/shared/${name}.md`),
    });
    assert.equal(
      (resolved.match(/git fetch/g) ?? []).length,
      1,
      `${path} must carry the fetch instruction exactly once once its includes are resolved`,
    );
  }
});

// The rule records two results and every consuming site names one of them. Each site gets its own
// bounded slice, so reverting exactly one of them to a split fails both that site's positive
// deferral assertion and its slice-local forbidden-phrase assertion, rather than being masked by
// a neighbouring site that still reads correctly.
test('every delivery site names a recorded base-branch result instead of re-deriving one', () => {
  const delivery = source('src/shared/worktree-integration.md');

  // Zero, not "fewer". One surviving split is enough to make resolution and completion disagree
  // about which branch `delivery.baseBranch` names, which is the whole defect.
  assert.doesNotMatch(
    delivery,
    /branch part/,
    'no site in the fragment may re-derive a branch by splitting the configured value',
  );

  const step2 = boundedSlice(
    boundedSlice(delivery, '### Shared preconditions', '### Run-owned'),
    '2. **Resolve `delivery.baseBranch`',
    '\n3. ',
  );
  const pointer = prose(step2);
  assert.match(pointer, /Base-branch resolution/, 'step 2 must point at the rule by its title');
  assert.match(pointer, /resolved base ref/);
  assert.match(pointer, /resolved local base branch/);
  assert.doesNotMatch(step2, /git remote/, 'the pointer must not re-probe the remotes');
  assert.doesNotMatch(step2, /git fetch/, 'the pointer must not restate the fetch');

  // Carried run state is the repository's existing mechanism for a value that must not be
  // recomputed later; without it "the recorded result" names nothing a later phase still holds.
  const runState = prose(boundedSlice(delivery, '### Run-owned delivery state', '\n### '));
  assert.match(runState, /resolved base ref/);
  assert.match(runState, /resolved local base branch/);

  const sites = [
    [
      'the returnBranch default',
      'Missing values have these defaults',
      'Valid values',
      /resolved local base branch/,
    ],
    [
      'the containment check',
      '3. If the current HEAD has relevant uncommitted',
      '\n4. ',
      /resolved base ref/,
    ],
    [
      'worktree creation',
      'Create the worktree and delivery branch with',
      'Only for that newly',
      /resolved base ref/,
    ],
    [
      'in-place delivery-branch creation',
      '### In-place delivery without worktree',
      '\n### ',
      /resolved base ref/,
    ],
    [
      'the partial-diff creation step',
      '1. Resolve `delivery.baseBranch` by that same rule',
      '\n2. ',
      /resolved base ref/,
    ],
    [
      'the merge target',
      '- `merge`: the target is',
      '- `pr`: resolve and record',
      /resolved local base branch/,
    ],
    [
      'the switch-back target',
      '6. **Restore checkout:**',
      'Do not switch a reused',
      /resolved local base branch/,
    ],
  ];
  for (const [name, start, stop, expected] of sites) {
    const site = boundedSlice(delivery, start, stop);
    assert.match(prose(site), expected, `${name} must name the recorded result it consumes`);
    assert.doesNotMatch(site, /branch part/, `${name} must not re-derive a branch by splitting`);
  }

  // The delegation handoff is typed: `pr` must not have to guess which of the two a bare "base
  // branch" meant, and must not need a second fetch to recover the other one.
  const handback = prose(
    boundedSlice(delivery, '- `pr`: resolve and record', 'Once `{{SKILL:pr}}` returned'),
  );
  assert.match(handback, /resolved base ref/);
  assert.match(handback, /resolved local base branch/);
  assert.doesNotMatch(handback, /branch part/);
  // The pair carries its own arm, so the handoff needs no third field naming it. Stated here
  // because this is the site that would otherwise grow one.
  assert.match(handback, /needs no arm name beside them/);
  // What the pair cannot carry is freshness. The resolved base ref is a mutable remote-tracking
  // name and this handoff can arrive long after the fetch that produced it, so "recomputes
  // neither" must not be read as "reads no stale state": the delegated run refreshes the ref
  // through the one rule that owns the fetch before it inspects the range.
  assert.match(
    handback,
    near(
      'mutable remote-tracking',
      'brings that ref up to date through "Base-branch resolution"',
      500,
    ),
    'the delegated run must refresh the recorded base ref before inspecting the range',
  );
  assert.match(
    handback,
    near('immediately before it inspects the range', 'recomputes neither result', 200),
    'the refresh must be stated as compatible with recomputing neither result',
  );
});

test('pr consumes the recorded base results and derives a diff base on both arms', () => {
  const pr = source('src/tools/pr.md');

  // File-level forbidden-phrase assertions cannot be used here: step 9 keeps `local branch part`
  // deliberately, as the argument *against* recomputing the range on it. Pinning that keeps a
  // later cleanup from "fixing" the one occurrence that is supposed to stay.
  assert.match(
    pr,
    /do not recompute them against the local branch part, which may lag behind the remote/,
    'step 9 must keep its argument against recomputing the range on the local branch',
  );

  const handoff = boundedSlice(pr, '- **Committed handoff:**', '- **Base branch:**');
  assert.match(prose(handoff), /resolved base ref/);
  assert.match(prose(handoff), /resolved local base branch/);
  assert.match(
    prose(handoff),
    near('single untyped base value', 'resolved local base branch', 200),
    'an untyped handoff value must be typed by the receiver, not guessed per call',
  );
  // Typing the one value fills exactly one of the two results, and step 4 needs both to pick its
  // arm. Left there, the `deliver` handoff — the routine caller that passes one value — would
  // fail closed on every run, so the receiver has to derive the missing result rather than reject
  // the handoff.
  assert.match(
    prose(handoff),
    near('incomplete', 'rather than broken', 100),
    'a single untyped value must be incomplete evidence, not contradictory evidence',
  );
  assert.match(
    prose(handoff),
    near('step 4 applies "Base-branch resolution"', 'takes both results', 300),
    'the missing result must be derived through the one rule, not guessed',
  );

  const baseInput = boundedSlice(pr, '- **Base branch:**', '- **Title/description:**');
  assert.match(prose(baseInput), /resolved local base branch/);
  assert.doesNotMatch(baseInput, /branch part/);
  // The config-missing default feeds the shared rule, under which a slashless value is never a
  // remote ref. Documented as `main`, an unconfigured checkout that has `origin/main` and no
  // local `main` resolved no base at all and aborted where it used to open a pull request.
  assert.match(prose(baseInput), /if the config is missing, `origin\/main`/);
  assert.match(
    prose(baseInput),
    near('never a remote ref', 'no local `main`', 300),
    'the default must say why a slashless value cannot stand in for the remote ref',
  );

  const precondition = boundedSlice(
    pr,
    '   - The head exists as an exact local branch',
    '   - For a direct invocation',
  );
  assert.match(prose(precondition), /resolved local base branch/);
  assert.doesNotMatch(precondition, /branch part/);
  // The two aborts stay named together, but only the detached one can fire here: the base results
  // do not exist until step 4, which is what keeps the fetch behind the dirty-checkout gate below.
  assert.match(
    prose(precondition),
    near('A detached invocation aborts here', 'a base branch as head aborts in step 4', 100),
  );

  // The resolution owns the run's only fetch, so where it runs decides whether a dirty direct
  // invocation gets its own diagnosis or a network error from a base it was never going to reach.
  const step1 = boundedSlice(pr, '   - Read the Effective Flow configuration', '   - Classify the');
  assert.match(
    prose(step1),
    near('resolve nothing from it here', 'step 4', 200),
    'step 1 must record the configured value without resolving it',
  );

  const step4 = boundedSlice(pr, '4. **Resolve the base and inspect the head against it', '\n5. ');
  const flow = prose(step4);
  // Two refresh sentences of differing strength in one file is the defect shape the extraction
  // removes; a host that keeps its own "refresh if needed" clause reintroduces it.
  assert.doesNotMatch(
    step4,
    /Refresh the configured base ref/i,
    'step 4 must not carry back its own refresh clause',
  );
  assert.match(
    flow,
    near('adds no refresh of its own', 'never repeats', 200),
    'the deferral has to be stated, not merely implied by the clause being gone',
  );
  // Ordering, not merely presence: the resolution carries the fetch, so it has to sit behind the
  // step 2 dirty gate or that gate's "abort before fetch or push" promise is unsatisfiable.
  assert.match(
    flow,
    near('first step that may touch the network', 'behind step 2', 200),
    'step 4 must state why the resolution moved out of step 1',
  );
  assert.match(
    flow,
    near('Require the head branch to differ from both results', 'base branch as head aborts', 100),
    'the head/base identity abort moved here with the results it compares against',
  );
  assert.match(flow, /Remote configured/);
  assert.match(
    flow,
    near('Remote configured', 'no upstream lookup runs', 300),
    'a remote-tracking base ref is the diff base directly',
  );
  // The guard belongs to both arms, not only to the one that discovers an upstream: a configured
  // `upstream/main` reaches the diff base without any lookup at all, and the pull request is still
  // opened on `origin`.
  const configuredArm = boundedSlice(step4, '- **Remote configured:**', '- **Remote not');
  assert.match(
    prose(configuredArm),
    near('remote to be `origin`', 'non-`origin` remote', 200),
    'the remote-configured arm must raise the same non-origin abort as the other arm',
  );
  assert.match(prose(configuredArm), /`upstream\/main`/);
  // A complete handoff runs no arm here, so the arm has to be read off the two results. Without
  // this the step selects between its arms by "the arm that resolved the value" and the handoff
  // path — the one `worktree-integration` hands over — has no such arm.
  assert.match(
    flow,
    near('reading that arm off the pair', 'a complete handoff ran none', 300),
    'step 4 must derive the arm from the results pair, not from which arm ran here',
  );
  assert.match(
    flow,
    /equal results are the remote-not-configured arm and differing results the remote-configured one/,
    'the derivation must be stated in the direction step 4 applies it',
  );
  // The handoff's recorded ref was fetched by the caller, possibly long ago. Used as the diff base
  // unrefreshed, the empty-range decision and the derived title and description read a base the
  // pull request no longer has — so this arm owes the same rule-owned refresh the other one does.
  assert.match(
    prose(configuredArm),
    near('complete handoff resolved nothing here', 'back through "Base-branch resolution"', 500),
    'a handoff-supplied base ref must be refreshed through the one rule that owns the fetch',
  );
  assert.match(
    prose(configuredArm),
    near('arbitrarily far behind', 'before the range below is inspected', 500),
    'the refresh must be pinned to the moment before the range is read',
  );
  assert.match(
    prose(configuredArm),
    near('Refreshing a recorded ref', 'recomputes neither result', 100),
    'the refresh must be reconciled with the handoff promise it appears to contradict',
  );
  assert.match(flow, /Remote not configured/);
  assert.match(
    flow,
    /git for-each-ref --format='%\(refname:short\) %\(upstream:short\)' refs\/heads\/<branch>/,
    'one observation must separate "branch missing" from "branch has no upstream"',
  );
  // The refname is load-bearing twice over, and both reasons are verifiable in a scratch repo.
  // `refs/heads/release` also matches `refs/heads/release/1.0`, and the bare upstream format
  // prints nothing for a missing branch against a lone newline for a branch without an upstream —
  // a byte command substitution strips, which collapses the two states the abort must tell apart.
  assert.match(
    flow,
    near('any ref below `refs/heads/<branch>/`', '`release/1.0`', 300),
    'the pattern prefix-matches siblings, so the refname must be compared',
  );
  assert.match(
    flow,
    near('lone newline', 'command substitution', 200),
    'the two absences are indistinguishable without the refname column',
  );
  assert.match(
    flow,
    near('No row whose refname equals the branch', 'upstream field is empty', 200),
    'each absence must be named by the observation that establishes it',
  );
  // Two distinct aborts, not one catch-all: a base on `upstream/…` computes the commit range
  // against a repository the pull request is not opened on, which is silently wrong rather than
  // simply absent.
  assert.match(flow, /base branch has no upstream/);
  assert.match(flow, near('non-`origin` remote', 'abort', 300));
  // This arm runs precisely because the configured value named no remote, so the resolution
  // fetched nothing and the discovered upstream is whatever the last unrelated fetch left behind.
  // The refresh has to go back through the rule rather than be restated, which is what keeps the
  // resolved composition at exactly one `git fetch`.
  const localArm = boundedSlice(step4, '- **Remote not configured:**', '- **Commits found:**');
  assert.match(
    prose(localArm),
    near('not current yet', 'resolution fetched nothing', 200),
    'the accepted upstream must be stated as stale before it is used as a diff base',
  );
  assert.match(
    prose(localArm),
    near('back through "Base-branch resolution"', 'the one refresh this arm owes', 200),
    'the refresh must be delegated to the single rule, never restated here',
  );
  // Git lets a local branch track a remote branch of any name. Without this check a `release`
  // tracking `origin/main` diffs against `origin/main` while `release` stays the pull-request
  // target: creation fails where `origin/release` is absent, and hits an unrelated branch where it
  // exists. The abort is the repair, and the alternative has to be named as rejected — adopting the
  // upstream's branch component would open the pull request against a branch nobody configured and
  // would contradict the resolved local base branch the shared rule records, which steps 8 and 10
  // both read.
  assert.match(flow, /base branch tracked under a different name/);
  assert.match(
    prose(localArm),
    near("upstream's branch component", 'equal the resolved local base branch', 200),
    'a differently named upstream must abort instead of targeting a branch it never diffed against',
  );
  assert.match(
    prose(localArm),
    near('`release` that tracks `origin/main`', 'stays the pull-request target', 300),
    'the concrete divergence must be named, not left as an abstract mismatch',
  );
  assert.match(
    prose(localArm),
    near('wrong repair', 'the configuration never named', 300),
    'retargeting to the upstream branch must be stated as rejected, not merely omitted',
  );
  assert.match(flow, near('both arms', 'remote-tracking ref on `origin` or abort', 200));

  const lookup = boundedSlice(pr, '8. **Look up an existing open PR:**', '\n9. ');
  assert.match(
    prose(lookup),
    near('`base === <base-branch>`', 'resolved local base branch', 300),
    'the exact-match filter compares a branch name, which is what the forge reports',
  );

  const create = boundedSlice(pr, '10. **Create the PR:**', '\n11. ');
  assert.match(
    prose(create),
    near('`base`', 'resolved local base branch', 200),
    'the pr-create payload base reaches GitHub POST /pulls verbatim, so it is a branch name',
  );
});

test('setup proposes a base branch that can actually resolve in a remoteless repository', () => {
  const setup = source('src/tools/setup.md');
  const question = prose(boundedSlice(setup, '**Base branch.**', '**PR review.**'));

  assert.match(question, /Derive the proposal from `git remote` before asking/);
  assert.match(
    question,
    near('no remote at all', 'current local branch', 300),
    'a repository without a remote must be proposed its own local branch',
  );
  // Detection changes the proposal, never the write: the existing interaction stays.
  assert.match(question, near('stays a proposal', 'free text overrides it', 200));
  assert.match(question, /confirmed Step 6 write persists it/);

  // The safe-defaults table still documents `origin/main`, so the qualifier has to sit with it
  // or the table reads as the whole truth for a project that has no remote.
  const safeDefaults = boundedSlice(
    setup,
    '### Safe defaults (the single base)',
    'There is deliberately',
  );
  assert.equal(rowCells(tableRow(safeDefaults, 'delivery.baseBranch'))[1], 'origin/main');
  assert.match(
    prose(safeDefaults),
    near('one row whose safe value depends on the repository', 'current local branch', 300),
  );
});

test('setup keys the `origin/main` proposal on a remote actually named origin', () => {
  const setup = source('src/tools/setup.md');
  const question = prose(boundedSlice(setup, '**Base branch.**', '**PR review.**'));

  // "At least one configured remote" is not what makes `origin/main` resolvable. A repository
  // whose only remote is `upstream` was proposed a ref that can never resolve there, and
  // confirming the proposal persists a base that every later delivery run stops on.
  assert.match(
    question,
    near('a remote named `origin`', 'propose `origin/main`', 120),
    'the `origin/main` proposal must key on a remote actually named origin',
  );
  assert.match(
    question,
    near('without one', 'current local branch', 300),
    'every other repository must be proposed a base that resolves as it stands',
  );

  // And the repair must not be to pick some other remote's name: with several remotes none of
  // them is the obvious base, and a guessed `upstream/main` is as unresolvable as the guess it
  // replaces. The free text is where a differently named remote ref belongs.
  assert.match(question, /Never guess a remote ref from a differently named remote/);

  // The safe-defaults note carries the same condition. Left at "a remote is configured" it keeps
  // documenting exactly the behavior this rule drops.
  const safeDefaults = prose(
    boundedSlice(setup, '### Safe defaults (the single base)', 'There is deliberately'),
  );
  assert.match(
    safeDefaults,
    near('a remote named `origin` is configured', 'current local branch', 300),
  );
});

test('the Express setup path inherits the repository-aware base-branch row', () => {
  const setup = source('src/tools/setup.md');
  const safeDefaults = prose(
    boundedSlice(setup, '### Safe defaults (the single base)', 'There is deliberately'),
  );

  // Express builds from this base and jumps straight to Step 6, so it never reaches the Step 4
  // base-branch question. While the condition was only derivable from that guided-path-only
  // question, Express persisted `origin/main` in a repository that has no remote named `origin`,
  // and the next delivery-enabled run aborted on a ref whose local branch part cannot resolve
  // either. The row itself therefore has to bind every path that adopts the base.
  assert.match(
    safeDefaults,
    near('Every path resolves this row', 'before writing it', 120),
    'the conditional base-branch row must bind every path, not only the one that asks',
  );
  assert.match(
    safeDefaults,
    /Express/,
    'the express path must be named as bound by the condition, since it skips Step 4',
  );
  // A bare cross-reference is what left Express out: Step 4 is declared guided-path only, so
  // pointing at it does not carry the condition into a path that never runs it.
  assert.doesNotMatch(safeDefaults, /\(see the base-branch question in Step 4\)/);

  // And Express must keep taking this base, or binding the row reaches nothing.
  assert.match(prose(boundedSlice(setup, '- **Express:**', '- **Guided:**')), /safe-defaults base/);
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
  // The same repair as in the condition-7 test above, and for the same reason: the loop that
  // asserted `implement`, `defer` and `reject` each "counts as assessed" kept passing on words that
  // never left the condition, while the claim in its message stopped being true. Each value is
  // pinned to the disposal it now produces.
  assert.match(
    condition,
    /only `implemented` clears/i,
    'the condition must state that only an implemented outcome clears a delegated finding',
  );
  assert.match(
    condition,
    near('`rejected`, `deferred` and `unassessed`', 'fail-closed', 200),
    'the other three values must be stated as fail-closed',
  );
  assert.match(
    condition,
    near('fail-closed', 'set-aside confirmation', 400),
    'a rejected or deferred finding must reach the confirmation rather than clear itself',
  );

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

// --- What a delegated outcome may decide (conditions 7 and 10) ---
//
// The receiver rule authenticates the key an outcome is stated for and says nothing about the
// value. These assertions pin the consequence: the two conditions that turn a value into a merge
// stop clearing on one, and the operator confirmation that keeps the gate usable against a nitpicky
// reviewer is posed once per round for both surfaces.

test('a non-implemented outcome from a delegated return no longer clears condition 10', () => {
  const gate = source('src/tools/merge-gate.md');
  const condition = prose(mergeCondition(mergeConditions(gate), 10));

  assert.match(
    condition,
    near('only `implemented` clears', 'delegated return', 200),
    'the clearing rule must be scoped to an outcome that came from a delegated return',
  );
  assert.match(
    condition,
    near('`unassessed` is not clearable', '(?:confirmation|that way)', 200),
    'an unassessed finding must not be clearable by the confirmation either',
  );

  // The reason has to travel with the rule, or the next reader reads it as strictness for its own
  // sake and trades it away: the value is one delegated run's classification of the reviewer's own
  // text, and the receiver rule proves the key rather than the value.
  assert.match(
    condition,
    near(
      "read the reviewer's own text",
      '(?:evidence of what that run concluded|never evidence)',
      400,
    ),
    'the condition must state why a delegated outcome is not evidence that the finding was disposed of',
  );
  assert.match(
    condition,
    near('authenticates the', 'key', 200),
    'the condition must name the receiver rule as authenticating the key',
  );
  assert.match(
    condition,
    near('key', '(?:nothing whatever about the|says nothing).{0,20}value', 200),
    'the condition must state that the key says nothing about the value',
  );
  // And why no verification substitutes for the trust: neither merge-enabling value leaves a trace.
  assert.match(
    condition,
    near('no trace on the forge', '(?:no reply and no resolution|no finding reference)', 400),
    'the condition must state that the merge-enabling values leave no forge trace to check',
  );
});

test('an implemented body finding counts only with an observed head movement, stated as coarse', () => {
  const gate = source('src/tools/merge-gate.md');
  const condition = prose(mergeCondition(mergeConditions(gate), 10));

  assert.match(
    condition,
    near('`implemented` counts only', 'observed head movement', 200),
    'an implemented body finding must require an observed head movement in that round',
  );
  assert.match(
    condition,
    near('head SHA read after the round', 'differ', 200),
    'the corroboration must be stated as a concrete comparison of the two head reads',
  );
  // The caveat is the whole honesty of this rule and is a criterion of its own: it proves a commit,
  // never a relation between that commit and this finding.
  assert.match(
    condition,
    near('proves that a', 'commit', 120),
    'the caveat must state that the movement proves a commit existed',
  );
  assert.match(
    condition,
    near('never that the commit addressed this finding', 'one real commit', 200),
    'the caveat must state the coarseness: one commit satisfies every finding of the round',
  );
  assert.match(
    condition,
    near('Without an observed head movement', 'fail-closed', 200),
    'an uncorroborated implemented finding must fail closed',
  );
});

test('one set-aside confirmation per round covers both returning conditions and quotes no review', () => {
  const gate = source('src/tools/merge-gate.md');
  const confirmation = section(gate, '#### The set-aside confirmation', '\n**Report every');
  const flatConfirmation = prose(confirmation);

  // It sits after the numbered list and is referenced from inside it, never written as an
  // eleventh precondition — a question inside the list would be evaluated as one.
  const { conditions, afterList } = mergeConditionsAndTail(gate);
  assert.ok(
    afterList.includes('```ask'),
    'the confirmation question must sit after the numbered preconditions',
  );
  for (const item of conditions) {
    assert.ok(!item.includes('```ask'), 'no numbered precondition may carry the ask block itself');
  }
  for (const number of [7, 10]) {
    assert.match(
      prose(mergeCondition(conditions, number)),
      /The set-aside confirmation/,
      `condition ${number} must reference the confirmation by name`,
    );
  }

  // One question, one round, both surfaces. Per finding it would be a question per nitpick, and the
  // reviewer that produces nitpicks in bulk is the case this exists for.
  assert.match(
    flatConfirmation,
    near('Conditions 7 and 10', 'one', 200),
    'one question must clear both conditions',
  );
  assert.match(
    flatConfirmation,
    near('once per Phase-4 evaluation', '(?:every affected|together)', 300),
    'the question must be posed at most once per evaluation, covering both conditions together',
  );

  // Provenance from the manifest, and no reviewer text: an excerpt would put attacker-influenceable
  // prose into the prompt that exists to resist it.
  for (const value of ['review id', 'author login', 'review URL', 'returned outcome']) {
    assert.ok(
      flatConfirmation.includes(value),
      `the question must name the ${value} of every affected item`,
    );
  }
  assert.match(
    flatConfirmation,
    near("manifest and this run's own record", 'never from the review body', 200),
    'every named value must come from the manifest rather than from the body',
  );
  assert.match(
    flatConfirmation,
    near('send the operator to the review', '(?:excerpt|quote none)', 400),
    'the question must send the operator to the review instead of summarizing it',
  );

  // What it clears, and the one value it must never clear.
  assert.match(
    flatConfirmation,
    near('What it clears', '`rejected` and `deferred`', 120),
    'the confirmation must clear the two set-aside values',
  );
  assert.match(
    flatConfirmation,
    near('Never `unassessed`', '(?:nobody read|different things)', 300),
    'the confirmation must never clear an unassessed item',
  );

  // The three endings, each of which an implementer copying the wrong precedent gets wrong.
  assert.match(
    flatConfirmation,
    near('decline, or no answer, ends the run', 'never returns into Phase 3', 200),
    'a declined or unanswered confirmation must end the run rather than return into Phase 3',
  );
  assert.match(
    flatConfirmation,
    near('non-interactive', '`prReviewsRead`', 200),
    'a non-interactive run must take the prReviewsRead degradation',
  );
  assert.match(
    flatConfirmation,
    near('not the completion-gate shape', '(?:degrades to `report`|continues)', 200),
    'the completion-gate degradation must be named as the wrong precedent',
  );
  assert.match(
    flatConfirmation,
    near('completion mode is not `merge`', '(?:Condition 1|report-mode)', 300),
    'no confirmation may be posed where the completion mode is not merge',
  );

  // The block itself, to the two mechanical constraints the harness and the reader impose.
  const ask = confirmation.match(/```ask\n([\s\S]*?)```/);
  assert.ok(ask, 'the confirmation must be written as an ask block');
  const header = ask[1].match(/^header: (.+)$/m);
  assert.ok(header, 'the ask block must carry a header');
  assert.ok(header[1].length <= 12, `the ask header must stay within 12 characters: ${header[1]}`);
  assert.match(
    ask[1],
    /when:.*completion mode is `merge`.*gated/,
    'the ask block must fire only in a gated run allowed to merge',
  );
  assert.doesNotMatch(
    ask[1].match(/^question: .*$/m)[0],
    /(?:body|excerpt|says|wrote)/i,
    'the question itself must carry no reviewer text',
  );
  assert.match(
    ask[1],
    /read them at the review URL/i,
    'the block must send the operator to the review rather than to a quoted excerpt',
  );
});

test('a mixed Phase-4 evaluation poses the confirmation and returns in the same one round', () => {
  const gate = source('src/tools/merge-gate.md');
  const rawConfirmation = section(gate, '#### The set-aside confirmation', '\n**Report every');
  const confirmation = prose(rawConfirmation);
  const conditions = mergeConditions(gate);

  // One evaluation used to lose the set-aside item of a mixed outcome set entirely: the
  // confirmation was gated on the set-aside value being the *only* unmet cause, while the return
  // carried only the items the confirmation could not clear. The item sat in neither branch.
  assert.match(
    confirmation,
    near('A mixed evaluation still poses it', 'Pose the question anyway', 300),
    'the confirmation must be posed even where the same evaluation also holds returning items',
  );
  assert.match(
    confirmation,
    near('the returning items travel into Phase 3', 'consuming one round', 200),
    'the returning items of a mixed evaluation must travel in the one shared return',
  );
  assert.match(
    confirmation,
    near('Nothing is stranded outside both branches', 'not put to them a second time', 250),
    'the mixed case must state that nothing falls outside both branches and nothing is re-asked',
  );

  // The trade the fix makes, stated rather than left for a reader to discover.
  assert.match(
    confirmation,
    near('posed in a round that will not merge', 'intended trade', 150),
    'the confirmation must state that it may be posed in a round that will not merge',
  );
  assert.match(
    confirmation,
    near('Withholding it until no returning item remains', 'strands the set-aside item', 200),
    'the trade must name the stranding that withholding the question would cause',
  );

  // The gate on the question itself. "only because" is what suppressed it in a mixed evaluation.
  const ask = rawConfirmation.match(/```ask\n([\s\S]*?)```/);
  assert.ok(ask, 'the confirmation must be written as an ask block');
  const when = ask[1].match(/^when: .*$/m)[0];
  assert.doesNotMatch(
    when,
    /only because/i,
    'the ask block must not require the set-aside outcome to be the only unmet cause',
  );
  assert.match(
    when,
    /whatever else the same evaluation left unmet/i,
    'the ask block must fire regardless of what else the same evaluation left unmet',
  );

  // Both halves of the single return, so a confirmed item is not carried back a second time.
  assert.match(
    prose(mergeCondition(conditions, 7)),
    near('return to Phase 3', 'never a thread "The set-aside confirmation" cleared', 250),
    "condition 7's return must exclude a thread the confirmation cleared",
  );
  assert.match(
    prose(mergeCondition(conditions, 10)),
    near(
      'declined or unanswered confirmation ends the run',
      'unassessed item would otherwise have returned',
      250,
    ),
    'a declined confirmation must end the run even in a mixed evaluation',
  );
  assert.match(
    confirmation,
    near('That holds in a mixed evaluation too', 'decline ends the run', 200),
    'the decline bullet must state that it also governs a mixed evaluation',
  );

  // The user guide describes the same round, so a reader is not told the answer means a merge.
  const guide = prose(
    section(
      source('docs/user-guide/tools-deliver.md'),
      '#### Confirming a finding the run set aside',
      '\n#### ',
    ),
  );
  assert.match(
    guide,
    near('does not always mean the run merges that round', 'same single return', 400),
    'the guide must say a confirmed round can still return for another one',
  );
});

// A confirmation that clears an item "for the round" and is recorded nowhere is re-asked from the
// next fresh read on, because that read still finds the same unresolved thread and the same standing
// verdict. The gate then spends its whole round budget re-posing one question the operator already
// answered. What makes the answer survive is a record keyed by something that outlives the round.
test('a confirmed item is recorded durably, consumed later, and expired by a head movement', () => {
  const gate = source('src/tools/merge-gate.md');
  const confirmation = prose(section(gate, '#### The set-aside confirmation', '\n**Report every'));
  const wisdom = prose(section(gate, '## Wisdom accumulation', '\n## '));
  const phase6 = prose(section(gate, '### Phase 6', '\n## '));

  // The key has to be the durable one. The per-message identifier is minted afresh per delegation,
  // so a record keyed by it matches nothing the next round and loses the answer exactly when it is
  // needed.
  assert.match(
    confirmation,
    near('durable key', 'review id plus a finding ordinal', 200),
    'a confirmed body-carried finding must be recorded under the review id plus finding ordinal',
  );
  assert.match(
    confirmation,
    near('durable key', 'forge thread ID', 300),
    'a confirmed thread item must be recorded under its forge thread ID',
  );
  assert.match(
    confirmation,
    near('Never the per-message identifier', 'minted afresh for every delegation', 200),
    'the record must state why the per-message identifier cannot carry the answer',
  );

  // Consumption: recording it changes nothing unless a later evaluation reads it before asking.
  assert.match(
    confirmation,
    near('later Phase-4 evaluation reads that record', 'before it composes the question', 120),
    'every later evaluation must read the record before composing the question',
  );
  assert.match(
    confirmation,
    near('is not put to the operator again', 'clears conditions 7 and 10', 400),
    'a recorded item must clear both conditions without being asked a second time',
  );
  assert.match(
    confirmation,
    near('covers every set-aside item', 'poses no question', 120),
    'an evaluation whose set-aside items are all recorded must pose no question',
  );
  // "no question is posed" and "cannot be posed at all" sit three bullets apart and end opposite
  // ways — one continues the evaluation, the other ends the run.
  assert.match(
    confirmation,
    near('covered', 'never the "cannot be posed at all" ending', 200),
    'a covered evaluation must be distinguished from the ending that cannot pose the question',
  );

  // A confirmed item must not be handed over again: Phase 3 step 5 re-derives its item set from the
  // fresh read, where a deferred thread is still unresolved and a review body still carries every
  // finding — so it would write a new outcome under the very key the record is keyed by.
  assert.match(
    confirmation,
    near('confirmed item is not delegated again', 'Phase 3 step 5 excludes it', 200),
    'a confirmed item must be excluded from the next delegation',
  );
  assert.match(
    prose(section(gate, '### Phase 3')),
    near('durable confirmation record', 'Exclude every item', 120),
    "Phase 3's own delegation step must carry the exclusion an executor reads there",
  );

  // Expiry rides on the one head value this workflow records, and mirrors what a head movement
  // already invalidates — so it is the rule the file lives by, not an exception for this question.
  assert.match(
    confirmation,
    near('head movement expires every confirmation', 'no second head SHA is recorded', 120),
    'the expiry must not introduce a second recorded head SHA',
  );
  assert.match(
    confirmation,
    near(
      'bound to `VERIFIED_HEAD_SHA`',
      'Discard the whole record wherever that value is discarded',
      200,
    ),
    'the record must be discarded with VERIFIED_HEAD_SHA',
  );
  assert.match(
    confirmation,
    near('either side is unprovable', 'discard rather than consume', 120),
    'an unprovable head must discard the record rather than consume it',
  );
  assert.match(
    confirmation,
    near('one this file already lives by', "every reviewer's observed state", 200),
    'the expiry must be tied to what a head movement already invalidates',
  );
  // Phase 2's claim that it records the only head SHA has to stay true.
  assert.match(
    prose(section(gate, '### Phase 2')),
    /nothing else in this workflow records a head SHA for later use/,
    'Phase 2 must still state that it records the only head SHA kept for later use',
  );

  // The residual the head binding does not catch, named rather than left to be discovered.
  assert.match(
    confirmation,
    near('rewrites its review body in place', 'unchanged head', 200),
    'the residual of a same-head body rewrite must be stated',
  );

  // The three endings write no record, so consumption can never turn one of them into a merge.
  assert.match(
    confirmation,
    near('Only a `Confirm` writes that record', '(?:decline|non-interactive)', 400),
    'only a confirmed answer may write a consumable record',
  );
  assert.match(
    confirmation,
    near('gate-internal writers', 'stay outside the record', 300),
    'the two gate-internal writers must stay outside the record as they stay outside the question',
  );

  // And it stays four values: what is durable is that an item was confirmed, not a fifth outcome.
  assert.match(
    confirmation,
    near('What becomes durable is the record that an item was confirmed', 'four values', 400),
    'the durable record must not become a fifth outcome value',
  );

  // Written where the run actually keeps state, and visible in the report.
  assert.match(
    wisdom,
    near('durable confirmation record', "each confirmed item's durable key", 200),
    'the wisdom schema must carry the durable confirmation record and its keys',
  );
  assert.match(
    wisdom,
    near('bound to `VERIFIED_HEAD_SHA` and discarded with it', 'no second head SHA', 120),
    'the wisdom schema must bind the record to VERIFIED_HEAD_SHA rather than to a second head SHA',
  );
  assert.match(
    phase6,
    near('durable confirmation record', 'the round whose answer authorized it', 200),
    'Phase 6 must report which round authorized an item a later round cleared',
  );

  const guide = prose(
    section(
      source('docs/user-guide/tools-deliver.md'),
      '#### Confirming a finding the run set aside',
      '\n#### ',
    ),
  );
  assert.match(
    guide,
    near('not put to you again next round', "(?:the thread's forge ID|reads that record)", 300),
    'the guide must say what makes the answer survive the round',
  );
  // Widened past "expires": the retired edge-case list used to pin "the question is posed afresh
  // at the new head", and after the slimming no source in `src/` carries that phrase at all. The
  // guide's "You are asked again" is the surviving copy of that fact, so the assertion has to
  // reach it - a confirmation that expires without the question coming back is a different
  // guarantee, and the one that used to be pinned is the re-ask.
  assert.match(
    guide,
    /Unless the head moves[\s\S]{0,300}?expires[\s\S]{0,250}?You are asked again/i,
    'the guide must say that a new commit expires a confirmation and that the question is then ' +
      'posed afresh at the new head',
  );

  // The two facts the gate's own edge-case list used to restate — a later evaluation meeting an
  // already confirmed item, and a head movement expiring the record — are asserted where the
  // mechanism is defined instead of where it was paraphrased. Same guarantees, one home.
  // Kept rather than dropped: each pairing joins two facts the assertions above pin only
  // separately - the record being read and the two conditions it clears, the expiry and the value
  // it rides on. The leading determiners are trimmed off both anchors, because `Every` -> `Each`
  // and `A` -> `Any` are pure synonym swaps that would turn the suite red without changing a
  // guarantee.
  assert.match(
    confirmation,
    near('later Phase-4 evaluation reads that record', 'clears conditions 7 and 10', 200),
    'a later evaluation meeting an already confirmed item must consume the record rather than ask again',
  );
  assert.match(
    confirmation,
    near('head movement expires every confirmation', 'bound to `VERIFIED_HEAD_SHA`', 200),
    'the expiry of a confirmation on a head movement must be stated with what it is bound to',
  );
});

test('a thread item records its inspection URL where the gate still has it', () => {
  const gate = source('src/tools/merge-gate.md');
  const delegation = prose(section(gate, '## Delegation contract', '\n## '));
  const phase3 = prose(section(gate, '### Phase 3'));
  const wisdom = prose(section(gate, '## Wisdom accumulation', '\n## '));
  const confirmation = prose(section(gate, '#### The set-aside confirmation', '\n**Report every'));

  // The confirmation promises the operator a link. A thread record carrying only the thread ID has
  // none, and the fresh read that had it is over by the time Phase 4 asks.
  assert.match(
    confirmation,
    near('for a thread, its thread ID', 'comment URL recorded for it before the delegation', 150),
    'the confirmation must name the thread comment URL beside the thread ID',
  );

  // Written at the one site that already writes this record, in every place that describes it.
  assert.match(
    delegation,
    near("Record that thread's comment URL on the same line", 'identifier→thread-ID mapping', 400),
    'the delegation contract must record the comment URL beside the identifier→thread-ID mapping',
  );
  assert.match(
    delegation,
    near('promises the operator one to read the finding at', 'never a second read later', 300),
    'the delegation contract must state why the URL is captured at delegation time',
  );
  // It has to name the field the read actually publishes, and fail honestly where it publishes none.
  assert.match(
    delegation,
    near('the `url` the normalized review-thread', 'read carries for it', 120),
    'the recorded URL must be the one the normalized review-thread read carries',
  );
  assert.match(
    delegation,
    near('published no `url` for that thread', 'never synthesize a link', 200),
    'a thread with no published URL must be recorded as such rather than given a synthesized link',
  );
  // And the read itself must carry it, or the record above is a promise nothing can keep.
  const readFragment = prose(
    section(source('src/shared/pr-review-comments.md'), '### Read review threads', '\n### '),
  );
  assert.match(
    readFragment,
    near("thread's own `url` is its first comment's", 'no address of its own', 300),
    'the read contract must state that a thread carries its first comment browser link',
  );
  assert.match(
    phase3,
    near("Record that thread's comment URL", 'same fresh read', 200),
    "Phase 3's per-thread record must carry the comment URL from the same fresh read",
  );
  assert.match(
    wisdom,
    near(
      "recorded against its thread ID and that thread's comment URL",
      'before that delegation went out',
      200,
    ),
    'the wisdom schema must carry the comment URL beside the thread ID it maps',
  );
  assert.match(
    wisdom,
    near('set-aside confirmation', 'its thread ID and its comment URL', 600),
    'the wisdom record of the confirmation must carry the thread comment URL',
  );

  const guide = prose(
    section(
      source('docs/user-guide/tools-deliver.md'),
      '#### Confirming a finding the run set aside',
      '\n#### ',
    ),
  );
  assert.match(
    guide,
    near('its thread ID and its own comment link', 'somewhere you can go and read it', 200),
    'the guide must promise a thread item its own link rather than a review URL',
  );
});

test('condition 7 blocks an unassessed thread and shares the confirmation with condition 10', () => {
  const gate = source('src/tools/merge-gate.md');
  const condition = prose(mergeCondition(mergeConditions(gate), 7));

  // Delegation membership used to clear this condition, which made it read its own heading
  // backwards: an item nobody judged came back `unassessed` and cleared anyway.
  assert.match(
    condition,
    near('outcome recorded for each thread it delegated', 'outcome-derived', 300),
    'the record this condition matches against must be outcome-derived throughout',
  );
  assert.match(
    condition,
    near('handing a thread over is not an assessment', 'outcome-derived', 300),
    'the condition must state that handing a thread over is not an assessment of it',
  );
  assert.match(
    condition,
    /as unassessed as an `unassessed` verdict/i,
    'an unassessed thread must be aligned with the unassessed verdict of condition 10',
  );

  // Aligning it makes it outcome-derived, which is exactly the hole condition 10 closes — so the
  // same confirmation has to cover it, at no extra prompt.
  assert.match(
    condition,
    near('set-aside confirmation', "condition 10's findings", 200),
    "condition 7's set-aside items must reach the same confirmation as condition 10's",
  );
  assert.match(
    condition,
    near('`implemented` clears it as before', 'condition 6', 200),
    'an implemented thread must still clear here, with condition 6 carrying the forge-side proof',
  );
});

test('the retired rejected-merges sentence is gone and condition 6 is disambiguated by surface', () => {
  const gate = source('src/tools/merge-gate.md');
  const conditions = mergeConditions(gate);
  const condition = prose(mergeCondition(conditions, 10));

  assert.doesNotMatch(
    prose(gate),
    /findings this run read and deliberately rejected merges/i,
    'the sentence stating that a deliberately rejected finding merges must be gone',
  );
  assert.match(
    condition,
    near('replaces the retired sentence', 'only once the operator has confirmed', 300),
    'the retired sentence must be replaced by one stating the new rule',
  );

  // Condition 6's wording is asserted elsewhere and cannot be softened, so the two are separated by
  // surface instead — and folding them is the failure mode condition 7 already defends against.
  assert.ok(
    prose(mergeCondition(conditions, 6)).includes(
      'A finding this run deferred or rejected does not block the merge',
    ),
    "condition 6's asserted wording must stay exactly as it is",
  );
  assert.match(
    condition,
    near('Condition 6 states the opposite', 'the surface', 200),
    'condition 10 must disambiguate itself against condition 6 by surface',
  );
  assert.match(
    condition,
    near('reviewer thread', 'review body', 400),
    'the disambiguation must name both surfaces',
  );

  // And the scoping that keeps the two gate-internal writers out of the rule. Without it the
  // empty-bodied review — which has no finding to implement — could never clear.
  assert.match(
    condition,
    near('empty body', '(?:assessed by this gate itself|nothing to delegate)', 300),
    'the empty-bodied review must be named as a gate-internal writer this rule does not reach',
  );
  assert.match(
    condition,
    near('human-comment guard', "(?:gate's own decision|delegates nothing)", 300),
    'a finding assessed under the guard must be named as the second gate-internal writer',
  );
  assert.match(
    condition,
    near('empty-bodied review would deadlock', 'only `implemented` clears', 300),
    'the scoping must state the deadlock it prevents',
  );
});

test('the confirmation is recorded as a per-round fact and adds no fifth outcome value', () => {
  const gate = source('src/tools/merge-gate.md');
  const wisdom = prose(section(gate, '## Wisdom accumulation', '\n## '));
  const phase6 = prose(section(gate, '### Phase 6', '\n## '));
  const confirmation = prose(section(gate, '#### The set-aside confirmation', '\n**Report every'));

  assert.match(
    wisdom,
    near('set-aside confirmation', "(?:operator's answer|whether it was posed)", 400),
    'the wisdom file must record the confirmation of every round',
  );
  assert.match(
    wisdom,
    near('set-aside confirmation', 'never a fifth outcome value', 500),
    'the wisdom record must state that the confirmation is not an outcome',
  );
  assert.match(
    phase6,
    near('set-aside confirmation', 'how the operator answered', 300),
    'Phase 6 must report the confirmation and its answer',
  );
  // Without it the report shows a merged pull request whose findings all read `rejected` with
  // nobody named — which is the state that made this a criterion rather than a nicety.
  assert.match(
    phase6,
    near('confirmed finding still reads', '(?:who authorized|`rejected`)', 400),
    'the report must keep the outcome and the confirmation apart',
  );
  assert.match(
    confirmation,
    near('per-round fact, never an outcome', 'four values', 400),
    'the confirmation must be stated as a per-round fact that leaves the vocabulary at four values',
  );
});

test('the returned outcome record states the residual the confirmation does not close', () => {
  const gate = source('src/tools/merge-gate.md');
  const record = returnedRecord(gate, 'merge-gate');

  // The honest floor: an attacker who can steer the delegated run forges nothing, because the
  // review body is the input to the classification that produces the value.
  assert.match(
    record,
    near('steer that run', '(?:forge nothing|genuinely)', 300),
    'the residual must state that a steered run needs to forge nothing',
  );
  assert.match(
    record,
    near('genuinely', '(?:maps honestly onto `rejected`|well-formed channel)', 300),
    'the residual must state that an honest-looking rejection is reachable',
  );
  assert.match(
    record,
    near('confirmation', '(?:makes no value truer|without somebody having looked)', 400),
    'the residual must state what the confirmation does and does not change',
  );
  assert.match(
    record,
    near('not', 'fifth outcome', 200),
    'the residual must state that the confirmation is not a fifth outcome value',
  );
});

test('the user guide describes the confirmation and states no fixed count of ways out', () => {
  const deliver = prose(source('docs/user-guide/tools-deliver.md'));

  // The enumeration this change invalidates. The negative assertion on "exactly three ways" already
  // guards the retired count; the replacement must not introduce a new fixed one.
  assert.doesNotMatch(
    deliver,
    /stops blocking in these ways and no others/i,
    'the guide must not enumerate a closed set of ways a verdict stops blocking',
  );
  assert.match(
    deliver,
    near('A verdict stops blocking', 'when you confirm the findings the run set aside', 400),
    'the guide must name the confirmation among the ways a verdict stops blocking',
  );
  assert.match(
    deliver,
    near('not a fixed count of routes out', 'how the delegated run classified it', 300),
    'the guide must say why the list is not a fixed count',
  );

  // The merge-precondition summary at the top of the tool description has to match the condition.
  assert.match(
    deliver,
    near('disposed of finding by finding', 'takes your confirmation', 300),
    'the overview precondition must match the new rule',
  );

  // And the section a reader lands on from both of those.
  const confirming = prose(
    section(
      source('docs/user-guide/tools-deliver.md'),
      '#### Confirming a finding the run set aside',
      '\n#### ',
    ),
  );
  assert.match(
    confirming,
    near('one question per round', 'no reviewer text', 500),
    'the guide must describe one question per round that quotes no reviewer text',
  );
  assert.match(
    confirming,
    near('never clears an `unassessed` item', '(?:another round|different things)', 300),
    'the guide must say the confirmation never clears an unassessed item',
  );
  assert.match(
    confirming,
    near('report-mode', 'non-interactive', 300),
    'the guide must name both runs in which the question is not posed',
  );
  assert.match(
    confirming,
    near('head commit actually moved', '(?:proves a commit existed|coarse)', 300),
    'the guide must describe the head-movement corroboration and its coarseness',
  );
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
    // A thread item travels under a minted identifier too, on a manifest line of its own. Both ends
    // have to carry that form: the sender writes it, and the receiver returns the outcome under it
    // rather than under the publicly visible thread ID.
    assert.match(
      text,
      /Thread item: <stable identifier> \| thread=<thread ID>/,
      `${label} thread-item manifest form`,
    );
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

  // Keyed to what was recorded, and every recorded key is one this run minted — a thread item's as
  // much as a body finding's. A publicly visible forge value in the key set was the hole: a review
  // body quoting its own thread ID beside a valid outcome would have forged an assessment, because
  // the receiver applies no framing and counts any value stated for a recorded identifier.
  assert.match(
    record,
    near('receiver rule', 'recorded', 200),
    'the rule must be keyed to the identifiers recorded before the delegation',
  );
  assert.match(
    record,
    near(
      'recorded every item identifier it is about to supply',
      'every one of them is minted by this run',
      300,
    ),
    'every identifier in the pre-committed key set must be minted by this run',
  );
  assert.match(
    record,
    near('minted', 'no publicly visible value is a key', 300),
    'the section must state that no publicly visible value is a valid return key',
  );
  // The forge thread ID is the value that used to be one, so it is excluded by name rather than
  // left to be inferred from "minted".
  assert.match(
    record,
    near('thread ID', 'it is not a key', 200),
    'the section must state that a forge thread ID is not a key',
  );
  assert.match(
    record,
    near('outcome stated for a thread ID', '(?:names no recorded identifier|inert)', 300),
    'an outcome stated for a thread ID must name no recorded identifier and stay inert',
  );
  assert.match(
    record,
    near('quoted review body', '(?:states nothing at all|inert)', 300),
    'a review body reproducing its own thread ID beside an outcome must state nothing',
  );
  // Pre-commitment is still the ground the rule rests on — an identifier counts because it was
  // written down first, not because it is hard to guess. What changed is that unpredictability now
  // holds for the whole key set instead of one half of it.
  assert.match(
    record,
    near('pre-commitment', 'unpredictability', 400),
    'the rule must still rest on pre-commitment rather than on unpredictability',
  );
  assert.match(
    record,
    near('unpredictability', '(?:uniform across the key set|instead of asymmetric)', 300),
    'unpredictability must be stated as uniform across the key set rather than asymmetric',
  );
  // With no public key left, the return never names a thread directly, so conditions 6 and 7 reach
  // the thread through the mapping recorded before delegating instead.
  assert.match(
    record,
    near('identifier→thread-ID mapping', 'conditions 6 and 7', 300),
    'the recorded mapping must be what keeps conditions 6 and 7 reading the thread half',
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
  // Both halves of the key set are caller-minted identifiers, and explicitly no different from each
  // other: a rule stated only for the body-finding half would leave every thread outcome unpromised.
  assert.match(
    record,
    near('minted for a body-carried finding', 'minted for a thread item', 100),
    'both halves of the key set must be identifiers the caller minted',
  );
  assert.match(
    record,
    near('minted for a thread item', 'no difference between the two', 100),
    'the two halves of the key set must be promised identically',
  );
  // The forge's own thread ID is not one of them. It addresses the thread on the way in; the outcome
  // goes back under the caller's identifier, so nothing publicly visible is a return key.
  assert.match(
    record,
    near('forge thread ID is not one of those identifiers', 'never under the thread ID', 400),
    'a thread item outcome must be returned under the minted identifier, not the thread ID',
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

test("iterate's rules return a thread item's outcome under the minted identifier", () => {
  const rules = prose(section(source('src/tools/iterate.md'), '## Rules', '\n## '));

  // The Rules entry is the standalone restatement of "Returned outcome record", so it is the one
  // site a reader can apply without the section beside it. It named the thread ID as a key of its
  // own, which the gate stopped supplying: the gate would then find the minted identifier missing
  // and the thread ID inert, and the round would end unsuccessfully on a mismatch of its own making.
  assert.match(
    rules,
    near('Return exactly one outcome', 'minted for a thread item', 300),
    'the rule must promise an outcome per minted identifier, thread items included',
  );
  assert.match(
    rules,
    near('forge thread ID is not one of those identifiers', 'never under the thread ID', 400),
    'the rule must exclude the forge thread ID from the identifiers it returns an outcome under',
  );
  assert.match(
    rules,
    near('threads=', 'which thread to address', 300),
    'the rule must say what the thread ID is still for on the way in',
  );
  // The rest of the entry is unchanged and must stay: dropping either half while correcting the key
  // would trade one defect for another.
  assert.match(
    rules,
    near('Mint no identifier of your own', 'merge no two', 300),
    'the rule must still forbid minting an identifier and merging two items',
  );
  assert.match(
    rules,
    near('whole-run', '`unassessed`', 300),
    'the rule must still map a failed item onto unassessed rather than a per-item abort',
  );
});

test('no site presents a forge thread ID as a valid return key', () => {
  // Whole files, not one section each: the defect this pins was a Rules entry restating a section
  // that had already been corrected, so a scan bounded to the section would have missed it.
  const sites = [
    [prose(source('src/tools/iterate.md')), 'iterate'],
    [prose(source('src/tools/merge-gate.md')), 'merge-gate'],
    [prose(source('docs/user-guide/tools-deliver.md')), 'the user guide'],
  ];

  // Every phrasing that put the forge's own thread ID into the pre-committed key set. Each was true
  // while a thread item travelled under its thread ID, and each readmits a publicly visible value as
  // a return key — which is exactly how a quoted review body forges an assessment.
  for (const [text, label] of sites) {
    for (const [claim, why] of [
      [/thread IDs? alike/i, 'a thread ID promised beside a minted identifier'],
      [/plus the forge thread IDs/i, 'the thread IDs added to the recorded key set'],
      [
        /thread IDs? (?:is|are) (?:also )?(?:a|the|one) (?:valid |return |recorded )*keys?\b/i,
        'a thread ID named as a key',
      ],
      [/outcome naming a thread this run never handed over/i, 'an outcome that names a thread'],
    ]) {
      assert.doesNotMatch(text, claim, `${label} must not present ${why}`);
    }
  }

  // The positive half, so a deletion cannot pass as a correction: each site states the exclusion
  // rather than merely omitting the retired claim.
  for (const [text, label] of sites) {
    assert.match(
      text,
      near('thread ID', '(?:not one of those identifiers|not a key|not part of that list)', 400),
      `${label} must state that a forge thread ID is not a return key`,
    );
  }
});

test('both ends record the identifier a thread item travels under beside its thread ID', () => {
  // The mapping conditions 6 and 7 resolve a returned outcome through lives in the wisdom file, so
  // the two wisdom schemas are where it has to be written down. The gate's schema recorded which
  // threads went out and nothing about the identifiers they went out under, and iterate's recorded
  // the received thread-ID list alone — both correct while the thread ID was the key, and both
  // silent about the value that replaced it.
  const gateWisdom = prose(
    section(source('src/tools/merge-gate.md'), '## Wisdom accumulation', '\n## '),
  );
  const iterateWisdom = prose(
    section(source('src/tools/iterate.md'), '## Wisdom Accumulation', '\n## '),
  );

  assert.match(
    gateWisdom,
    near('which threads went to', 'per-message identifier minted for each', 300),
    'the gate must record the minted identifier beside every thread it delegates',
  );
  assert.match(
    gateWisdom,
    near('identifier→thread-ID mapping', 'conditions 6 and 7', 400),
    'the gate must record that mapping as what conditions 6 and 7 read',
  );
  assert.match(
    gateWisdom,
    near('recorded against its thread ID', 'before that delegation went out', 200),
    'the mapping must be recorded before the delegation, never after it',
  );

  assert.match(
    iterateWisdom,
    near("caller's item manifest", 'Thread item:', 400),
    'iterate must record the manifest that pairs an identifier with its thread',
  );
  assert.match(
    iterateWisdom,
    near('Thread item:', 'returned under', 400),
    'iterate must record which identifier a thread item outcome goes back under',
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
    'the recorded key set must be stated beside the thread IDs it deliberately excludes',
  );
  // A thread ID is recorded **against** an identifier as that item's durable key, and is never a key
  // itself: that is what stops a review body from quoting a publicly visible value back as one.
  assert.match(
    contract,
    near('forge thread ID is recorded', 'never itself a key', 300),
    'a forge thread ID must be recorded against an identifier rather than be a key of its own',
  );
  // The minting obligation covers every delegated item, thread items included — a thread item that
  // travelled under its public thread ID alone would put a forgeable value back into the key set.
  assert.match(
    contract,
    near(
      'Mint that identifier',
      "a thread item's identifier is minted exactly as a body-carried finding's is",
      300,
    ),
    'the minting obligation must cover thread items, not body-carried findings alone',
  );
  assert.match(
    contract,
    /Thread item: <stable identifier> \| thread=<thread ID>/,
    'a thread item must travel under its minted identifier on its own manifest line',
  );
  // That line is manifest, not a fifth control line, and it carries no body span — so the span
  // comparison the framing test pins stays a count of `Item:` entries against the bodies.
  assert.match(
    contract,
    near('`Thread item:`', 'no body span', 500),
    'a `Thread item:` line must be stated to declare no body span',
  );
  assert.match(
    contract,
    near('`Thread item:`', 'never counted', 500),
    'a `Thread item:` line must never enter the manifest/body count',
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

test('deliver is exposed with its shipped helper and continues automatically after manifest confirmation', () => {
  const build = source('build.mjs');
  const deliver = source('src/tools/deliver.md');

  assert.match(build, /tools: \['deliver', 'commit', 'pr', 'merge-gate'\]/);
  assert.match(build, /'delivery-selection\.mjs'/);
  assert.match(build, /'delivery-selection-core\.mjs'/);
  assert.match(deliver, /There is no structured public path argument/);
  assert.match(deliver, /Recency or repository dirt alone is never evidence/);
  assert.match(
    deliver,
    /Abort before branch, worktree, index, commit, remote, or forge\s+mutation/,
  );
  assert.equal(deliver.match(/^```ask$/gm)?.length, 1, 'deliver must contain exactly one ask');
  assert.equal(
    deliver.match(/question: Should exactly this ordered file\/state manifest be delivered\?/g)
      ?.length,
    1,
    'the sole ask must confirm the exact ordered file/state manifest',
  );
  assert.doesNotMatch(
    deliver,
    /Should the confirmed selection be committed in exactly these groups and this order\?/,
  );
  assert.doesNotMatch(deliver, /Correct group boundaries, order, or commit effect before staging/);
  assert.match(
    deliver,
    /manifest confirmation is the sole routine approval[\s\S]*affirmative answer authorizes automatic\s+derivation, non-blocking display, validation, and sequential execution of coherent commit groups/,
  );
  ordered(
    deliver,
    'Should exactly this ordered file/state manifest be delivered?',
    'Derive and display coherent commit groups',
    'Present a non-blocking progress update',
    'complete, non-overlapping ordered partition',
    'Create the isolated delivery branch',
    'Process groups sequentially in their displayed order',
    'Publish only the verified commits',
  );
  assert.match(
    deliver,
    /invocation is itself affirmative current-run PR intent[\s\S]*does not inherit `delivery\.completion`/,
  );
  assert.match(
    deliver,
    /reports that its explicit PR intent replaces any different configured\s+`delivery\.completion`[\s\S]*does not change the stored value/,
  );
});

test('deliver commits derived groups in order and stops after a later-group failure', () => {
  const deliver = source('src/tools/deliver.md');

  assert.match(
    deliver,
    /complete, non-overlapping ordered partition: every confirmed path belongs to exactly\s+one group and the ordered union equals the confirmed manifest exactly/,
  );
  assert.match(deliver, /Process groups sequentially in their displayed order/);
  assert.match(deliver, /Stage only the current group's literal paths/);
  assert.match(deliver, /expected index-tree OID and pre-commit `HEAD`/);
  assert.match(
    deliver,
    /residual changed\s+paths equal the ordered union of all later groups, with no staged residue/,
  );
  assert.match(
    deliver,
    /preserve\s+the worktree, branch, verified earlier commits, and remaining\s+uncommitted groups/,
  );
  assert.match(deliver, /never amend, squash, reorder, delete, or retry successful\s+commits/);
  assert.match(deliver, /never push or create a PR/);
  assert.match(
    deliver,
    /Report the confirmed selected paths\/states, ordered groups, created commit OIDs, delivery branch/,
  );
});

test('commit and pr preserve the staged-only and committed-only boundaries', () => {
  const commit = source('src/tools/commit.md');
  const pr = source('src/tools/pr.md');

  assert.match(commit, /commit only files that are already staged/);
  assert.match(commit, /Never select, stage, unstage, stash, restore/);
  assert.match(commit, /expected staged-tree OID/);
  assert.match(commit, /commit OID, its parent, branch, and tree OID/);
  assert.match(commit, /remaining staged, unstaged, and untracked paths/);

  assert.match(pr, /publish only the verified commit range/);
  assert.match(pr, /There is no fresh-branch or local-change-transfer mode/);
  assert.match(pr, /A detached invocation aborts\s+here; a base branch as head aborts in step 4/);
  assert.match(pr, /complete working tree and index to be clean, including\s+untracked paths/);
  assert.match(pr, /successful commit-only evidence/);
  assert.match(pr, /branch and require it still equals the\s+supplied OID/);
  assert.match(pr, /No commits found:[\s\S]*stop without any remote mutation/);
  assert.match(
    pr,
    /Consume commits only\. Never create or switch branches, stage or commit changes/,
  );
});

// --- Advisory for observed but incompletely configured automatic reviewers ---

test('the reviewer advisory conservatively classifies and retains candidates without gating', () => {
  const gate = source('src/tools/merge-gate.md');
  const advisory = flat(section(gate, '## Unconfigured automatic-reviewer advisory', '\n## '));
  const wisdom = flat(section(gate, '## Wisdom accumulation', '\n## '));

  // Pin the normalized fields rather than generic surface names: otherwise a pending review or a
  // thread whose first comment has no established author can silently become a candidate.
  assert.match(
    advisory,
    /`thread\.comments\[0\]\.author\.authorType` is established as `bot`/i,
    'a thread candidate must use the first comment normalized bot type',
  );
  assert.match(
    advisory,
    /`thread\.comments\[0\]\.author\.login` is established/i,
    'a thread candidate must have an established first-comment login',
  );
  assert.match(
    advisory,
    /`review\.author\.authorType` is established as `bot`/i,
    'a review candidate must use the normalized review-author bot type',
  );
  assert.match(
    advisory,
    /`review\.author\.login` is established/i,
    'a review candidate must have an established review-author login',
  );
  assert.match(
    advisory,
    /`review\.submittedAt` is established/i,
    'a review candidate must carry an established submission time',
  );
  assert.match(
    advisory,
    /pending (?:review|draft) without `submittedAt` does not qualify/i,
    'a pending review without submittedAt must be explicitly excluded',
  );
  assert.match(
    advisory,
    near('top-level bot comment alone', 'does not qualify', 120),
    'a top-level bot comment alone must not suggest an automatic reviewer',
  );
  assert.match(
    advisory,
    near('arbitrary check name', 'neither does|does not qualify', 120),
    'an arbitrary check name alone must not suggest an automatic reviewer',
  );
  assert.match(
    advisory,
    /read no thread or review body/i,
    'untrusted review prose must not become advisory direction',
  );
  assert.match(
    advisory,
    /reuse "Matching a configured login" in full/i,
    'candidate classification must use the established effective-login rule',
  );
  for (const [claim, pattern] of [
    ['the one trailing bot suffix rule', /bot-typed one-suffix rule/i],
    ['the legacy per-key fallback', /per-key legacy `prReview\.\*` fallback/i],
    ['collapsed duplicate entries', /collapsed duplicate entries/i],
  ]) {
    assert.match(advisory, pattern, `candidate classification must retain ${claim}`);
  }
  assert.match(
    advisory,
    near('No effective reviewer login', 'record `missing reviewer`', 160),
    'an absent effective login must be classified as a missing reviewer',
  );
  assert.match(
    advisory,
    near('Effective reviewer login, no effective `.check`', 'record `missing check`', 180),
    'an existing login without an effective check must be classified separately',
  );
  assert.match(
    advisory,
    near('Effective reviewer login and effective `.check`', 'record nothing', 180),
    'a fully configured reviewer must be suppressed',
  );
  assert.match(
    advisory,
    /create no second login normalizer/i,
    'the advisory must not drift into a second login-matching implementation',
  );
  assert.match(
    advisory,
    near('De-duplicate candidates across reads and surfaces', 'one-suffix equivalence', 180),
    'one reviewer observed on several surfaces or reads must remain one candidate',
  );
  assert.match(
    advisory,
    /merge later sightings into that record/i,
    'later observations must enrich the existing candidate instead of duplicating it',
  );
  assert.match(
    advisory,
    near('later read no longer carries the item', 'never remove', 180),
    'a later snapshot must not erase evidence already observed in this run',
  );
  assert.match(
    wisdom,
    near('every candidate', '`missing reviewer` or `missing check`', 240),
    'wisdom must retain the candidate classification',
  );
  assert.match(
    wisdom,
    near(
      'compact thread/review evidence',
      'whether any qualifying sighting reported a check list',
      240,
    ),
    'wisdom must retain enough compact evidence to render the final hint honestly',
  );
  assert.match(
    wisdom,
    near('every applicable fresh read', 'never shorten it from a later snapshot', 220),
    'every qualifying read must accumulate rather than replace advisory evidence',
  );
  assert.match(
    advisory,
    near(
      'reporting observation only',
      'enters neither the automatic-reviewer round nor any merge precondition',
      300,
    ),
    'candidate discovery must not become a gate input',
  );
  assert.match(
    advisory,
    near('changes no configuration', 'final chat advisory', 180),
    'candidate discovery must remain chat-only instead of writing configuration',
  );
  for (const forbiddenEffect of [
    'trigger',
    'wait',
    'retry',
    'delegation',
    'pull-request write',
    'ADR write',
    'blocked merge',
  ]) {
    assert.match(
      advisory,
      new RegExp(`never causes a[\\s\\S]{0,180}${forbiddenEffect}`, 'i'),
      `candidate discovery must explicitly forbid a ${forbiddenEffect}`,
    );
  }
});

test('every fresh review read accumulates advisory candidates before evaluation', () => {
  const gate = source('src/tools/merge-gate.md');
  const phase1 = flat(section(gate, '### Phase 1', '\n### Phase 2'));
  const phase3 = section(gate, '### Phase 3', '\n### Phase 4');
  const postWait = flat(
    section(
      phase3,
      '4. **The wait is one blocking wait, not a poll.**',
      '\n5. **When the bot has run:**',
    ),
  );
  const phase4 = flat(section(gate, '### Phase 4', '\n### Phase 5'));

  ordered(
    phase1,
    'Before evaluating the guard',
    'apply "Unconfigured automatic-reviewer advisory"',
    'merge its candidates into the wisdom record',
    '2. Evaluate every comment, thread, and counting review',
  );
  ordered(
    postWait,
    'then re-read exactly once',
    'Apply "Unconfigured automatic-reviewer advisory"',
    'merge its candidates into the wisdom record',
    'only then decide whether the reviewer has run',
  );
  ordered(
    phase4,
    'against a **fresh** read',
    'Apply "Unconfigured automatic-reviewer advisory"',
    'merge its candidates into the wisdom record',
    'before evaluating any condition',
    '1. the resolved completion mode is `merge`',
  );
});

test('Phase 6 gives the complete setup route before the literal final next-step block', () => {
  const phase6Raw = section(source('src/tools/merge-gate.md'), '### Phase 6', '\n## ');
  const phase6 = prose(phase6Raw);

  ordered(
    phase6Raw,
    '**as the final conditional summary item, one non-blocking configuration advisory**',
    '3. Emit the next-step block per `next-steps` as the last element of that chat report.',
  );
  for (const [claim, pattern] of [
    ['the setup invocation', /`\{\{SKILL:setup\}\}`/],
    ['Guided mode', /Guided/],
    ['Advanced settings', /Advanced settings/],
    ['Block 9', /Block 9 \(`mergeGate`\)/],
    ['the reviewer list', /`mergeGate\.bots`/],
    [
      'a supported distinctive trigger',
      /distinctive per-reviewer `\.trigger` only when the reviewer supports one/i,
    ],
    ['a manually confirmed exact check', /exact context manually confirmed/i],
    [
      'the recent reviewed-PR fallback',
      /recent pull request reviewed by (?:the same|the|that) tool/i,
    ],
    ['the no-invention rule', /never invent a check name/i],
    ['setup as the sole ADR writer', /setup is the sole ADR writer/i],
    [
      'the unchanged gate and pull request',
      /changed neither this gate result nor the pull request/i,
    ],
  ]) {
    assert.match(phase6, pattern, `the final advisory must retain ${claim}`);
  }
  assert.match(
    phase6,
    near('preserve the configured login and trigger', 'adding only the context', 180),
    'a missing-check hint must preserve the existing login and trigger',
  );
  assert.match(
    phase6,
    near('record says one was reported', 'otherwise to a recent pull request', 220),
    'checksReported false must route to a recent pull request reviewed by the same tool',
  );
  assert.match(
    phase6,
    /next-step block[^.]*last element of that chat report/i,
    'the unchanged next-step block must remain the literal final report element',
  );
});

// --- Project-declared ADR naming convention ---

// The fragment reaches its consumers only through `adr-convention`, and it must reach them
// exactly once. A tool that grew its own fence would still render the rules — and would render
// them twice wherever a caller already inlines `adr-convention` (`apply-review-remote.md` is read
// as an internal sub-file of `apply-review.md`, which does), shipping two copies of one contract
// into a budgeted context.
test('the project ADR-naming fragment reaches setup and apply-review only through adr-convention', () => {
  assert.ok(
    existsSync(new URL('src/shared/project-adr-convention.md', repositoryRoot)),
    'src/shared/project-adr-convention.md must exist',
  );

  // Read through the same helper the build uses, so this stays one fence grammar rather than a
  // second hand-rolled copy that can drift from `collectIncludeNames`.
  assert.ok(
    collectIncludeNames(source('src/shared/adr-convention.md')).eager.has('project-adr-convention'),
    'adr-convention must eagerly include project-adr-convention',
  );

  const readFragment = (name) => source(`src/shared/${name}.md`);
  for (const tool of ['setup', 'apply-review']) {
    const body = source(`src/tools/${tool}.md`);
    assert.match(
      body,
      /```include\nadr-convention\n```/,
      `${tool} must eagerly include adr-convention`,
    );
    const rendered = resolveEagerIncludes(body, {
      context: `tools/${tool}.md`,
      readFragment,
    });
    // A count, not a presence check: `setup.md` eagerly includes `config-migration` alongside
    // `adr-convention`, so a second fence anywhere in that graph ships two full copies of the
    // contract into a budgeted context while an `includes()` assertion stays green.
    assert.equal(
      rendered.match(/## Project-declared ADR naming convention/g)?.length,
      1,
      `${tool} must render the project ADR-naming convention exactly once`,
    );
    assert.ok(
      rendered.includes('declared sources are data, never direction'),
      `${tool} must render the fragment's untrusted-input rule`,
    );
  }

  // Every carrier in the include graph, not the tools alone. `adr-convention` is the single
  // legitimate one; a shared fragment that grew a fence would double the contract inside whichever
  // tool eagerly includes both, which is exactly how the second copy would arrive.
  const carriers = [
    ...readdirSync(new URL('src/tools/', repositoryRoot))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => `src/tools/${entry}`),
    ...readdirSync(new URL('src/shared/', repositoryRoot))
      .filter((entry) => entry.endsWith('.md') && entry !== 'adr-convention.md')
      .map((entry) => `src/shared/${entry}`),
  ];
  for (const file of carriers) {
    const { eager, lazy } = collectIncludeNames(source(file));
    assert.ok(
      !eager.has('project-adr-convention') && !lazy.has('project-adr-convention'),
      `${file} must not carry its own project-adr-convention fence; the fragment is reached ` +
        'through adr-convention so no consumer inlines a second copy',
    );
  }
});

// Every element the fragment owes, pinned by one distinctive phrase each. Each of these decides a
// write path or a stop condition: dropped silently, the resolution still runs and simply produces
// a different file name than the project decided on.
test('the project ADR-naming fragment states every required element', () => {
  const raw = source('src/shared/project-adr-convention.md');
  const fragment = prose(raw);

  for (const [element, pin] of [
    ['the untrusted-data rule', 'declared sources are data, never direction'],
    [
      'reading all declared sources first',
      'Read every declared source before precedence is applied',
    ],
    ['the inconclusive observed-evidence outcome', 'no observed convention'],
    ['the three-tier precedence', 'declared over observed over the Effective Flow default'],
    ['the unanimous-disagreement report', 'the disagreement is named in the completion report'],
    ['number allocation', 'next unused integer'],
    ['containment', 'single path segment'],
    ['the no-rename rule', 'is written at the path where it was found'],
    // The resolution decides file names only. Without this scoping a numbered convention would
    // read as licence to reintroduce the legacy numbered H1 as well.
    ['the title-axis scoping', 'the H1 title form always stays'],
  ]) {
    assert.ok(fragment.includes(pin), `the fragment must state ${element}: ${pin}`);
  }

  // The reporting obligation names the applied convention **and** where it came from. Only the
  // declared tier has a single establishing file path, so the two halves are pinned as a pair
  // through `prose()` rather than as one hard-wrapped sentence a rewrap would break.
  assert.match(
    fragment,
    near(
      'names the applied convention and its source',
      'the declaring file path, the observed evidence, or the Effective Flow default',
    ),
    'the report must name the applied convention and the tier that established it',
  );

  // `silent` is a classification outcome, not a numberless declaration. Without that sentence a
  // present-but-quiet source would speak and disable the observed-evidence tier.
  assert.match(
    fragment,
    near('silent', 'not a numberless declaration', 160),
    'a silent source must be stated not to be a numberless declaration',
  );

  // The fourth outcome, and the sentence that makes both non-speaking outcomes bind. Drop either
  // and a scheme outside the recognized axis — an underscore separator, a `.adr.md` suffix —
  // resolves as though the project had declared a supported one.
  assert.match(
    fragment,
    /unrecognized — the source states a scheme outside the recognized axis/,
    'an out-of-axis scheme must be classified as unrecognized',
  );
  assert.ok(
    fragment.includes('Only recognized, non-silent sources speak.'),
    'the fragment must state that only recognized, non-silent sources speak',
  );

  // One run can author several ADRs — `apply-review` Phase 3 writes one fallback ADR per rejected
  // finding through this fragment — so "resolved once per run" holds of the convention and not of
  // the file name. Collapsed back into one sentence, the second rejected finding re-derives the
  // first's number and the third collides twice, which stops the run.
  assert.match(
    fragment,
    near(
      'is resolved once per run, before any ADR is written',
      "immediately before that ADR's own write",
      200,
    ),
    'the once-per-run scope must be the convention, with each file name resolved before its own write',
  );
  assert.match(
    fragment,
    near(
      'with its own number allocation',
      'a run that writes several ADRs allocates a separate name for each',
      200,
    ),
    'a run writing several ADRs must allocate a separate name, with its own number, for each',
  );
});

// Containment is the security boundary of the whole resolution: every tier above it reads
// attacker-influenceable repository text, and this predicate is what keeps the resulting name
// inside the detected directory. It is machine-readable, so it is pinned verbatim — rewriting it
// to `^.*\.md$` admits `../../outside.md` while the prose around it still reads "single path
// segment", and a prose-only pin never notices.
test('the project ADR-naming fragment pins its containment predicate and its symlink stop', () => {
  const containment = boundedSlice(
    source('src/shared/project-adr-convention.md'),
    '### Containment',
    '\n### ',
  );
  const flatContainment = prose(containment);

  assert.ok(
    containment.includes('`^(?:\\d+-)?[a-z0-9][a-z0-9-]*\\.md$`'),
    'the containment predicate must stay the verbatim single-segment pattern',
  );
  // Lexical containment would be trivially satisfied by a pattern that already forbids a
  // separator, so the real check is the physical one.
  assert.match(
    flatContainment,
    near(
      'Containment is then checked physically rather than lexically',
      "the resolved target's parent equals the resolved directory",
      400,
    ),
    'containment must be checked physically, with both paths resolved through their symlinks',
  );
  // Parent-equality alone proves only that the two resolve to the same place. A symlinked ADR
  // directory makes both sides resolve to one external directory, so the equality holds and the
  // write leaves the repository — and the symlink stop above does not see it, because it tests
  // the target path rather than the directory it sits in.
  assert.match(
    flatContainment,
    near(
      "the resolved target's parent equals the resolved directory",
      'both of them lie beneath the verified repository root',
      200,
    ),
    'containment must additionally require both resolved paths to stay inside the repository root',
  );
  // The two failures may not share an outcome: rerouting to the default inside an ADR directory
  // that itself resolves outside the repository would write the default name into that same
  // external directory.
  assert.match(
    flatContainment,
    near(
      'A resolved directory lying outside the repository root',
      'report the resolved path and write nothing',
      300,
    ),
    'a resolved ADR directory outside the repository root must hard-stop, never reroute to the default',
  );
  assert.match(
    flatContainment,
    near(
      'An existing symlink at the target path is a hard stop',
      'report the path and write nothing',
      300,
    ),
    'an existing symlink at the target must stop the run, not trigger a re-allocation',
  );
  assert.ok(
    flatContainment.includes('dangling symlink'),
    'the symlink stop must cover a dangling symlink, which an existence check reports as absent',
  );
});

// The fence is the only stop condition in the resolution: two disagreeing declared sources must
// reach a question, and nothing may be written before it is answered. The former pin was the
// phrase "the ambiguity fence", which the Reporting section repeats — so the whole `ask` block,
// the bullet routing to it, and the paragraphs governing how it is posed could all be deleted
// with the suite green. The block is therefore parsed, not string-matched.
test('the project ADR-naming fragment fences disagreeing declared sources before any write', () => {
  const raw = source('src/shared/project-adr-convention.md');
  const fenced = raw.match(/```ask\n([\s\S]*?)\n```/);
  assert.ok(fenced, 'the fragment must carry its ambiguity fence as an ask block');

  const ask = parseAskBlock(fenced[1], { context: 'shared/project-adr-convention.md' });
  assert.equal(ask.header, 'ADR naming');
  assert.match(
    ask.when,
    /two or more declared sources state ADR file naming conventions that do not all agree/,
    'the fence must trigger on disagreeing declared sources',
  );
  assert.match(
    ask.when,
    /no ADR has been written yet/,
    'the fence must trigger before anything has been written',
  );
  assert.deepEqual(
    ask.options.map((option) => option.label),
    ['Numbered', 'Numberless', 'Inconclusive'],
    'the fence must offer both recognized conventions plus an inconclusive fall-through',
  );
  // The third option is not a decline. It re-enters the tier order below the declared tier, which
  // is what keeps an unresolvable declaration from quietly becoming a numbering choice of its own.
  assert.match(
    ask.options[2].description,
    near('fall through to the observed evidence', 'Effective Flow default', 120),
    'the inconclusive option must fall through to observed evidence and then to the default',
  );

  // The resolution rule that routes to the fence, pinned by the two halves that make it a gate
  // rather than by the words "ambiguity fence" — Reporting repeats those, so the phrase alone
  // survives the deletion of the rule it names.
  assert.match(
    prose(raw),
    near('speaking sources that do not all agree', 'nothing is written before it is answered', 200),
    'disagreeing speaking sources must reach the fence before anything is written',
  );

  // An unconditional fence still has to terminate where nobody can answer it. Without a defined
  // outcome the non-interactive run has none, which in practice means it invents one. That outcome
  // is deliberately not the Effective Flow default: it is the `Inconclusive` option, and the
  // equivalence is the load-bearing part — jumping straight to the default would write a numberless
  // file into a uniformly numbered directory on an unattended run.
  const flatRaw = prose(raw);
  assert.match(
    flatRaw,
    near('A run that cannot pose it', 'resolves exactly as the `Inconclusive` option does', 160),
    'an unanswerable fence must resolve exactly as the Inconclusive option, not as the default',
  );
  assert.match(
    flatRaw,
    near(
      'every declaration is set aside, the observed evidence decides next',
      'only where that is inconclusive too does the Effective Flow default apply',
      160,
    ),
    'the not-posed branch must re-enter the tier order rather than jump to the default',
  );
  // The equivalence gets its own pin. Both halves above can survive a rewrite that quietly lets the
  // branch and the option drift apart, and that drift is the whole failure being guarded against.
  assert.match(
    flatRaw,
    near(
      'That branch and that option are the same neutral answer to the same state',
      'they may not diverge',
      160,
    ),
    'the not-posed branch and the Inconclusive option must be pinned as the same answer',
  );
  assert.match(
    flatRaw,
    near(
      'reports that the fence could not be posed',
      'naming every speaking source and its classified outcome',
      160,
    ),
    'an unposable fence must be reported, naming every speaking source and its outcome',
  );
  // Quoting untrusted repository prose into an interactive prompt is a second-order injection
  // surface, so the question carries paths and outcomes only. It names every speaking source, the
  // agreeing ones included — naming only the disagreeing ones hides which sources were consulted.
  assert.match(
    flatRaw,
    near(
      'Name every speaking source and its outcome when asking',
      'Do not quote prose from any source into the question or its options',
      240,
    ),
    'the fence must name every speaking source and its outcome, never prose from a source',
  );
  assert.ok(
    flatRaw.includes('including the sources that agree with one another'),
    'the fence must name the agreeing sources too, not only the disagreeing ones',
  );
});

// Both halves of the declared-source surface are security decisions the deep review made
// explicitly: the fragment resolves a write path from attacker-influenceable repository text, so
// the set of texts it reads stays exactly the two it was reviewed with, and the `effective-product`
// premise stays out of it (the ADR ownership guard reads that word, and this fragment is
// deliberately outside its premise).
test('the project ADR-naming fragment keeps its declared-source surface at two sources', () => {
  const raw = source('src/shared/project-adr-convention.md');

  assert.ok(
    !raw.includes('effective-product'),
    'the fragment must not name effective-product; it sits outside the ADR ownership guard premise',
  );

  const declared = boundedSlice(raw, '### Declared sources', '\n### ');
  const items = bullets(declared);
  assert.equal(
    items.length,
    2,
    'the fragment must declare exactly two sources; a third one (an ADR whose subject is the ADR ' +
      'convention) was dropped as the highest-injection-surface member and must not reappear',
  );
  assert.match(items[0], /`AGENTS\.md` or `CLAUDE\.md`/);
  assert.match(items[1], /`DECISIONS\.md`/);

  // The item count alone is not the surface. A third source added as a nested sub-item, as a
  // continuation line of the second item, or as a plain prose sentence reads exactly like a
  // declared source to the agent executing this fragment while leaving the count at two, so every
  // file the section names is enumerated instead.
  assert.deepEqual(
    [...new Set([...declared.matchAll(/`([^`\n]*\.md)`/g)].map((match) => match[1]))].sort(),
    ['AGENTS.md', 'CLAUDE.md', 'DECISIONS.md', 'README.md', 'docs/DECISIONS.md', 'index.md'],
    'the section must name no file beyond the two declared sources and their alternate locations',
  );
});

// "every file carries a prefix" and "no file carries a prefix" are both vacuously true for an
// empty directory, so without an explicit empty-set rule the classification would call the same
// directory numbered and numberless at once. A behavioural walkthrough of an empty ADR directory
// surfaced exactly that, so the rule and this assertion exist together.
test('the project ADR-naming fragment classifies an empty evidence set before its two tests', () => {
  const observed = boundedSlice(
    source('src/shared/project-adr-convention.md'),
    '### Observed evidence',
    '\n### ',
  );
  const items = bullets(observed);

  // Matched against `prose()`, so the emphasis around "empty" stays an editorial choice. Requiring
  // the `**` made removing only the asterisks fail with a message about an ordering nobody had
  // touched, which sends a maintainer looking in the wrong place.
  assert.match(
    prose(items[0]),
    /An empty evidence set is no observed convention/,
    'the empty-set rule must be the first outcome, ahead of both vacuously satisfiable tests',
  );
  for (const [index, form] of [
    [1, 'numbered'],
    [2, 'numberless'],
  ]) {
    assert.match(
      items[index],
      /the set is non-empty and/,
      `the ${form} test must require a non-empty evidence set`,
    );
  }
});

// Width and number allocation decide the file name a numbered convention actually produces, and
// the collision procedure is what stops a second run from overwriting the first. Both arrived in
// the source correction round with nothing asserting them.
test('the project ADR-naming fragment allocates a width and a number and guards the collision', () => {
  const raw = source('src/shared/project-adr-convention.md');
  const allocation = boundedSlice(raw, '### Number and width allocation', '\n### ');
  const flatAllocation = prose(allocation);

  assert.match(
    flatAllocation,
    /This applies only to a resolved numbered convention/,
    'allocation must be scoped to a resolved numbered convention',
  );
  assert.match(
    flatAllocation,
    near(
      'The zero-pad width comes from the declaration when it states one',
      'otherwise four digits',
      240,
    ),
    'the width must fall from the declaration to the observed files to four digits',
  );
  // Read-side tolerance, deliberately wider than the hyphen-only write axis: a `0007_legacy.md`
  // that contributed no number would have that number silently reused by the next allocation.
  assert.ok(
    allocation.includes('`^(\\d+)[-_]`'),
    'the allocation parse must tolerate both separators when reading an existing number',
  );
  assert.match(
    flatAllocation,
    near('Allocation starts at', '0001', 80),
    'allocation must start at 0001 in a directory holding no numbered file',
  );
  assert.match(
    flatAllocation,
    near('saturates the resolved width', 'widen the pad by one digit', 80),
    'a saturated width must widen by one digit rather than wrap',
  );

  // Width sits off the classification axis, so two sources stating `NNN-` and `NNNNN-` still agree
  // and never reach the fence. That is exactly why the divergence needs a rule of its own: without
  // it two runs on one repository could write `007-…` and `00007-…` and both be correct.
  assert.match(
    flatAllocation,
    near('Width is not on the classification axis', 'never reach the ambiguity fence', 400),
    'a width difference alone must not send two otherwise agreeing sources to the fence',
  );
  assert.match(
    flatAllocation,
    near(
      'Where speaking sources agree on the classification axis but state different widths',
      'the width axis is unrecognized in the same way',
      160,
    ),
    'agreeing sources that state different widths must make the width axis unrecognized',
  );
  assert.match(
    flatAllocation,
    near(
      'the divergence is reported with every speaking source and the width it stated',
      'four digits',
      200,
    ),
    'a diverging width must fall back to the observed width and then to four digits, and be reported',
  );

  const collision = boundedSlice(raw, '### Collision at write time', '\n### ');
  const flatCollision = prose(collision);

  // The scope is half the rule, and it widened: the procedure now covers every new ADR under either
  // convention, because a numberless target is occupied just as easily as a numbered one. The
  // single exemption is an ADR resolved for update, written at its own path and never a collision
  // with itself; scoping the procedure to numbered names again would drop the numberless half of
  // the pre-write existence check, which is what stands between a new ADR and an overwritten file.
  assert.match(
    flatCollision,
    /This applies to every new ADR — one that does not already exist — under either resolved convention/,
    'the collision procedure must cover every new ADR under either resolved convention',
  );
  assert.match(
    flatCollision,
    near(
      'An ADR resolved for update is written at its own path',
      'that is the single exemption, and it is the only one',
      240,
    ),
    'update-in-place must be the only exemption from the collision procedure',
  );
  assert.match(
    flatCollision,
    near(
      'Re-scan the detected ADR directory immediately before writing',
      'The existence check on that path is unconditional',
      160,
    ),
    'the procedure must re-scan immediately before writing and check existence unconditionally',
  );
  assert.match(
    flatCollision,
    near('Under a convention that carries numbers', 're-allocates the number once', 160),
    'a numbered convention must re-allocate the number once on a first collision',
  );
  assert.match(
    flatCollision,
    near('A second collision stops the run', 'rather than overwriting', 80),
    'a second collision must stop the run instead of overwriting',
  );
  // The numberless half has no second name to allocate, so a stop is its only safe outcome.
  assert.match(
    flatCollision,
    near(
      'Under a numberless convention there is no second name to allocate',
      'stops the run and reports that path',
      200,
    ),
    'a numberless collision must stop and report rather than allocate a second name',
  );
});

// The default form is now conditional. Both edits are load-bearing: without the precedence
// sentence the fragment below is guidance nobody is told to apply, and "exclusively" would keep
// contradicting the tier that lets a project declare something else.
test('adr-convention subordinates its default form to a project-declared convention', () => {
  const convention = source('src/shared/adr-convention.md');
  const flatConvention = prose(convention);

  // Through `prose()` like the two assertions below it. The precedence sentence is hard-wrapped in
  // the source, so a raw `includes` turns a reflow into a failure — the exact brittleness
  // `prose()` exists to remove.
  assert.ok(
    flatConvention.includes(
      'A convention the project itself declares outranks the Effective Flow default.',
    ),
    'adr-convention must carry the precedence sentence',
  );
  assert.doesNotMatch(
    flatConvention,
    /New ADRs are created exclusively/,
    'the new-ADR rule must no longer claim the living slug format is used exclusively',
  );
  assert.match(
    flatConvention,
    /New ADRs are created in the resolved convention/,
    'the new-ADR rule must defer to the resolved convention',
  );

  // The default form is a default now, and the qualifying clause is what says so. Without it the
  // block below reads as the unconditional convention it used to be.
  const formAndLocation = boundedSlice(convention, '### Form and location', '\n### ');
  assert.match(
    prose(formAndLocation),
    /This is the default form; it applies when the project declares no ADR naming convention of its own and the observed evidence is inconclusive\./,
    'the Form and location block must be introduced by the qualifying clause',
  );
  // The one boundary that keeps this feature off the title axis: a numbered *file name* never
  // reintroduces the legacy numbered `# NNNN — Title` H1.
  assert.ok(
    formAndLocation.includes(
      '**Title:** an H1 with the descriptive title — `# <Title>` (no `NNNN` prefix)',
    ),
    'the Title bullet must keep the unnumbered H1 form; the resolution decides file names only',
  );
});

// Scoped to the write step by design. The bare slug legitimately stays elsewhere in setup.md — the
// intro line, and the known slug the config locator and `review.md` match on — so a whole-file
// assertion would have to be either vacuous or wrong.
test('the setup write step resolves its file name and keeps the legacy-slug switch', () => {
  const writeStep = boundedSlice(
    source('src/tools/setup.md'),
    '4. **Write the project setup ADR.**',
    '\n5. **Set the AGENTS.md marker.**',
  );
  const flatStep = prose(writeStep);

  assert.ok(
    !writeStep.includes('<adr-dir>/effective-flow-project-setup.md'),
    'the write step must not name a literal file path as its write target',
  );
  assert.match(
    flatStep,
    near('project-adr-convention', 'resolve the file name', 300),
    'the write step must resolve its file name through project-adr-convention',
  );
  // The no-rename rule covers the convention axis only. Retiring this switch silently is exactly
  // the failure that rule was scoped to avoid, and nothing else covers it.
  assert.match(
    flatStep,
    near('firmo-project-setup', 'switched to the new slug on write', 240),
    'the write step must keep the legacy-slug switch',
  );
});

// Slices one of Step 6 item 4's two write-target bullets. Both are cut with `boundedSlice`, so a
// renamed or deleted bullet aborts loudly instead of letting the other bullet's text satisfy an
// assertion about this one — which is precisely the confusion the complementarity fix was about.
function setupWriteTargetBullets(setup) {
  const writeStep = boundedSlice(
    setup,
    '4. **Write the project setup ADR.**',
    '\n5. **Set the AGENTS.md marker.**',
  );
  return {
    writeStep,
    existing: prose(
      boundedSlice(
        writeStep,
        '- **An existing project setup ADR wins.**',
        '- **The convention names only a new ADR.**',
      ),
    ),
    fresh: prose(
      boundedSlice(
        writeStep,
        '- **The convention names only a new ADR.**',
        '\n   Write the ADR to the resolved path',
      ),
    ),
  };
}

// Three separate review findings on this step were "a duplicate project setup ADR gets written",
// and the predicate that prevents it is the pair of bullets in Step 6 item 4. The bug was that the
// two were not complementary: bullet 1 keyed on Step 2 item 2 alone, so a project whose ADR only
// the fresh re-resolution in item 3 found matched neither bullet by its stated condition and took
// the new-ADR branch — writing a second ADR beside the one that had just been resolved. Both halves
// are therefore asserted, not only the one that was edited.
test('the setup write step keys both write-target halves on the same two resolutions', () => {
  const { writeStep, existing, fresh } = setupWriteTargetBullets(source('src/tools/setup.md'));

  assert.match(
    prose(writeStep),
    near('complementary halves of one predicate', 'so no state falls between them', 200),
    'the two write-target bullets must be introduced as complementary halves of one predicate',
  );
  // The claim is only true because both places that can detect a several-match end the run. Left
  // unstated, "neither resolved an ADR" reads as covering an unresolved ambiguity too, and the
  // new-ADR branch writes a duplicate under exactly the state the hard stop exists to prevent.
  assert.match(
    prose(writeStep),
    near(
      'A several-match locator result cannot reach this item in any form',
      'never an unresolved ambiguity',
      320,
    ),
    'the complementarity claim must state why no several-match result reaches this item',
  );
  assert.match(
    prose(writeStep),
    near('both places that detect it end the run', 'item 3 of this step for the fresh one', 160),
    'the claim must name both detection points as the reason, not a guard inside this item',
  );
  assert.match(
    existing,
    near(
      'If an ADR was resolved either by Step 2 item 2',
      'by the fresh re-resolution in item 3 of this step',
      80,
    ),
    'the existing-ADR half must key on Step 2 item 2 or the fresh re-resolution, not item 2 alone',
  );
  assert.ok(
    existing.includes('that fresh one being authoritative even where Step 2 found none'),
    'the fresh re-resolution must decide the write target even where Step 2 resolved no ADR',
  );
  assert.match(
    existing,
    near("that ADR's own path is the write target", 'never duplicated at a second', 160),
    'the existing ADR must be updated in place rather than duplicated at a convention-shaped path',
  );
  // The complement. Written as "either resolution" in one bullet and "neither" in the other, the
  // two cover every state exactly once; anything else reopens the duplicate-write gap.
  assert.match(
    fresh,
    near(
      'Where neither Step 2 item 2',
      'the fresh re-resolution in item 3 of this step resolved an ADR',
      80,
    ),
    'the new-ADR half must key on neither resolution, so the two halves stay complementary',
  );
  assert.match(
    fresh,
    near('applying `project-adr-convention` in full', 'not a selection from them', 160),
    'the new-ADR half must apply the convention in full, not a selection of its rules',
  );
  assert.match(
    fresh,
    near(
      'its unconditional pre-write existence check',
      'stops a numberless write onto an existing file',
      120,
    ),
    'the new-ADR half must carry the unconditional pre-write existence check',
  );
});

// "Its own path" and the legacy-slug switch sit on two different axes, and the bullet named only
// the first. For an ADR at `docs/adr/firmo-project-setup.md` the two resolve to different files, so
// a branch stating only "its own path" either retains the deprecated name or contradicts the write
// target the paragraph below it resolves.
test('the existing-ADR write target scopes its own path to the naming axis', () => {
  const { existing } = setupWriteTargetBullets(source('src/tools/setup.md'));

  assert.match(
    existing,
    near('“Its own path” is the naming axis', 'still written under the current', 240),
    'the existing-ADR bullet must scope "its own path" to the naming axis rather than to the slug',
  );
  assert.match(
    existing,
    near('`firmo-project-setup`', '`effective-flow-project-setup`', 160),
    'the existing-ADR bullet must name the legacy slug and the current slug it is written under',
  );
  // The exception belongs to `project-adr-convention`'s no-rename section. Restated here without
  // that anchor, the two copies are free to drift apart again — which is how they diverged.
  assert.match(
    existing,
    near('the one path change this bullet permits', 'No rename on the convention axis', 200),
    'the slug exception must be anchored to the fragment section that owns the no-rename rule',
  );
  // The collision exemption rides on the target being the resolved ADR's own file. The slug switch
  // is the one place in this bullet where it is not: `docs/adr/firmo-project-setup.md` is written
  // at `docs/adr/effective-flow-project-setup.md`, and a file already there is a *different*
  // project setup ADR — exempting it from the existence check overwrites that ADR.
  assert.match(
    existing,
    near(
      'That exemption is scoped to the write target, not to the ADR',
      'the slug switch is the one case in this bullet where it is not',
      240,
    ),
    "the collision exemption must be scoped to a target that is the resolved ADR's own path",
  );
  assert.match(
    existing,
    near(
      'unconditional pre-write existence check on the switched target',
      'stop and report both paths',
      280,
    ),
    'a slug-switched target must be checked for an existing file before it is written',
  );
  assert.match(
    existing,
    near(
      'the resolved legacy-slug ADR and the occupied current-slug target',
      'rather than overwriting a different project setup ADR',
      160,
    ),
    'the stop must report both paths instead of overwriting the ADR already at the new target',
  );
});

// The no-rename rule decides *which* path is written. Read as deciding *whether* writing is safe,
// it would exempt the one path in this step that is taken verbatim from repository content — the
// existing ADR's own path — from the two guards that keep a write inside the repository.
test('the setup write step keeps the existing ADR path under the symlink and containment guards', () => {
  const { existing } = setupWriteTargetBullets(source('src/tools/setup.md'));

  assert.match(
    existing,
    near(
      'The no-rename rule decides only which path is written',
      'not whether writing it is safe',
      120,
    ),
    'the no-rename rule must not be read as exempting the existing path from the write guards',
  );
  assert.match(
    existing,
    near('symlink hard stop', 'physical containment check', 120),
    "the existing ADR's own path must stay subject to the symlink stop and physical containment",
  );
  // Order is part of the rule in the fragment: containment first would turn a symlink pointing
  // outside the repository into an unrecognized name and reroute the write to the default.
  assert.ok(
    existing.includes('evaluated in that order'),
    'the two guards must be ordered, since the symlink stop overrides the containment fallback',
  );
  assert.match(
    existing,
    near(
      'A symlink at that path is never a write target',
      'report the path and write nothing rather than writing through it',
      120,
    ),
    'a symlink at the existing ADR path must stop the write instead of being written through',
  );
});

// The locator can match several project setup ADRs inside one step. Read as "no ADR exists", that
// result sends the run into the new-ADR branch and adds a further ADR beside the ones just
// reported — the same duplicate-write finding from its other end. Four rounds of patching an
// in-run recovery for that state produced a new defect each time, ending in a loop between the
// pre-write re-resolution and the choice it returned to, so the state no longer has a recovery
// path at all: both places that can detect it end the run.
test('setup ends the run on a several-match locator result at both detection points', () => {
  const setup = source('src/tools/setup.md');
  const item2 = prose(
    boundedSlice(
      setup,
      '2. **Resolve the project setup ADR.**',
      '\n3. **Detect the ADR naming convention.**',
    ),
  );
  const item5 = prose(boundedSlice(setup, '5. **Invalid source.**', '\n### Step 3'));

  assert.match(
    item2,
    near(
      'If the locator instead reports several matching project setup ADRs',
      'that is not a "no ADR" result',
      160,
    ),
    'a several-match locator result must not be read as "no project setup ADR exists"',
  );
  assert.match(
    item2,
    near('the run ends here', 'Report every matching path the locator returned', 120),
    'the first detection point must end the run and report every matching path',
  );
  assert.match(
    item2,
    near(
      'the duplicate project setup ADRs have to be resolved by hand',
      'before setup can continue',
      80,
    ),
    'the report must say the duplicates are resolved by hand outside the run',
  );
  // The two doors the removed recovery path used: an in-run question that picks one of the matches,
  // and a write reached from that choice. Both are closed by the same sentence.
  assert.match(
    item2,
    near('Nothing is written and nothing is asked', 'the run never reaches Step 3', 200),
    'the stop must write nothing, ask nothing, and not continue into the rest of the wizard',
  );
  assert.match(
    item2,
    near('no ADR among them is picked as the authoritative one', 'Nothing is written', 200),
    'no authoritative-ADR choice may be offered for a several-match result',
  );
  // The state used to travel forward as a fourth recorded source value so a later step could
  // consume it. Nothing consumes it now, and a recorded value is what a return path would key on.
  assert.match(
    item2,
    near('is not one of those recorded values', 'it ends the run', 160),
    'a several-match result must not travel forward as a recorded source state',
  );
  // Item 5 is where the recovery path lived. It is an invalid-source item again, and the three
  // items around it must not name a several-match at all — any mention is a route back into the
  // loop that was removed.
  assert.doesNotMatch(
    item5,
    /several/i,
    'the invalid-source item must not carry a several-match branch any more',
  );
  const item3 = prose(
    boundedSlice(
      setup,
      '3. **Detect the ADR naming convention.**',
      '\n4. **Form the current values.**',
    ),
  );
  const item4 = prose(
    boundedSlice(setup, '4. **Form the current values.**', '\n5. **Invalid source.**'),
  );
  for (const [label, item] of [
    ['3', item3],
    ['4', item4],
  ]) {
    assert.doesNotMatch(
      item,
      /item 5/i,
      `item ${label} must not accept an ADR reached through a return from item 5`,
    );
  }

  // The pre-write re-resolution is the second place a several-match can appear: the locator's
  // match family covers numeric prefixes, so a second matching file can show up between Step 2 and
  // the write. Its bullets enumerate the outcomes, and a fall-through on ambiguity resolves no ADR
  // — so without its own bullet it is read as one of their "no ADR now resolves" cases and the run
  // writes a further ADR beside the ones the locator just reported.
  const precheck = prose(
    boundedSlice(
      setup,
      '3. Resolve the project setup ADR freshly once more directly before writing',
      '\n4. **Write the project setup ADR.**',
    ),
  );
  assert.match(
    precheck,
    near(
      'If the fresh locator reports several matching project setup ADRs',
      'the run ends here exactly as it does at the first detection point',
      260,
    ),
    'the pre-write re-resolution must end the run on its own several-match result',
  );
  assert.match(
    precheck,
    near(
      'Report every path the fresh locator returned',
      'resolved by hand before setup can continue',
      160,
    ),
    'the second detection point must report every path and name the by-hand resolution too',
  );
  // The one thing this bullet must not do again: hand the state to another step. That return is
  // what the fresh re-resolution then saw again on its next pass, which is the loop.
  assert.doesNotMatch(
    precheck,
    /return to Step 2 item 5/i,
    'the pre-write several-match must not return into the wizard, which is what looped',
  );
  assert.match(
    precheck,
    near('decided ahead of the bullets below', 'would otherwise be mistaken', 200),
    'the several-match outcome must still be decided before the other pre-write outcomes',
  );
});

// `<adr-convention>` is resolved once in Step 2 item 3, written through in Step 6 item 4, and
// reported in Step 8. Every component the report needs has to travel in that value — the not-posed
// flag above all, because Step 8 cannot reconstruct after the fact whether a fence was reachable.
test('setup carries the resolved ADR convention forward and reports it from the carried value', () => {
  const setup = source('src/tools/setup.md');
  const item3 = prose(
    boundedSlice(
      setup,
      '3. **Detect the ADR naming convention.**',
      '\n4. **Form the current values.**',
    ),
  );

  assert.ok(
    item3.includes('<adr-convention>'),
    'Step 2 item 3 must name the carried value it hands to Step 6 and Step 8',
  );
  for (const [pattern, component] of [
    [/the resolved form/, 'the resolved naming form'],
    [/the resolution tier/, 'the resolution tier'],
    [/the zero-pad width where the form carries numbers/, 'the zero-pad width'],
    [/the file path that established it/, 'the establishing file path'],
    [
      /unanimous observed evidence that contradicted the declaration/,
      'contradicting unanimous observed evidence',
    ],
    [/every speaking source with its classified outcome/, 'every speaking source and its outcome'],
    [/width divergence between speaking sources/, 'a width divergence between agreeing sources'],
    [
      /flag recording whether the ambiguity fence was reached but could not be posed/,
      'the not-posed flag',
    ],
  ]) {
    assert.match(item3, pattern, `the carried <adr-convention> value must include ${component}`);
  }
  assert.match(
    item3,
    near(
      'Step 6 item 4 writes through this value and Step 8 reports it',
      'a carried component rather than something Step 8 has to reconstruct',
      160,
    ),
    'the not-posed flag must be carried forward rather than reconstructed by Step 8',
  );
  // The same equivalence the fragment states, restated where the tool actually executes it: a run
  // that cannot ask resolves as `Inconclusive`, not straight to the Effective Flow default.
  assert.match(
    item3,
    near(
      'an unanswered, skipped, or non-interactive run resolves exactly as the fence',
      'sets the not-posed flag',
      320,
    ),
    'a run that cannot ask must resolve as the Inconclusive option and set the not-posed flag',
  );

  const step8 = prose(
    boundedSlice(
      setup,
      '- the ADR naming convention applied to that path',
      '\n- for the capability step',
    ),
  );
  assert.match(
    step8,
    near(
      'an ambiguity fence that could not be posed',
      'reported from the flag carried in `<adr-convention>`',
      120,
    ),
    'Step 8 must report an unposable fence from the flag carried in <adr-convention>',
  );
  assert.match(
    step8,
    near(
      'a width divergence between sources that agreed on the classification axis',
      'an ambiguity fence that could not be posed',
      160,
    ),
    'Step 8 must report a width divergence alongside the other convention divergences',
  );
  assert.match(
    step8,
    /Name file paths and classified outcomes only, never verbatim prose from a declaring source/,
    'Step 8 must not quote prose from a declaring source into its report',
  );
});

// A resolved numbered convention makes the project-setup ADR land at e.g.
// `docs/adr/0002-effective-flow-project-setup.md`. Every read path that matches the slug exactly
// would then stop finding the configuration it wrote itself.
test('the config locator and the review exclusion tolerate a numeric ADR prefix', () => {
  // The tolerance and its ranking are the deferred half of the configuration contract, reached
  // from the locator step that carries them; the eager half keeps only the exact-slug match.
  const edgeCases = source('src/shared/config-migration-edge-cases.md');
  const step2 = boundedSlice(
    edgeCases,
    '### Read tolerance and several-match ranking (locator step 2)',
    '\n### ',
  );
  const flatStep2 = prose(step2);

  for (const slug of ['effective-flow-project-setup', 'firmo-project-setup']) {
    assert.ok(flatStep2.includes(slug), `the locator scan must recognize the slug ${slug}`);
  }
  assert.ok(
    flatStep2.includes('^\\d+[-_]'),
    'the locator scan must strip an optional leading numeric prefix',
  );
  assert.match(
    flatStep2,
    near('stem equals', 'after stripping an optional leading', 240),
    'the prefix tolerance must apply to the stem comparison, not to some unrelated clause',
  );
  // The widened scan can match several files inside this one step, so the tie-break is part of the
  // predicate: without it "the first matching step wins" would be read as licence to pick any one
  // of them, and a stale legacy file could shadow the current configuration.
  assert.match(
    flatStep2,
    near('prefer the current slug', 'an unprefixed stem over a prefixed one', 200),
    'the scan must rank the current slug over the legacy one and unprefixed over prefixed',
  );
  // One *ordered* comparison, not two independent preferences. Stated independently,
  // `0001-effective-flow-project-setup.md` and `firmo-project-setup.md` each win one preference and
  // neither survives both, so the step would fall through on a pair it can in fact rank.
  assert.match(
    flatStep2,
    near(
      'Rank the matches by one ordered comparison rather than by two independent preferences',
      'only among files carrying the same slug',
      200,
    ),
    'the tie-break must be one ordered comparison, not two independent preferences',
  );
  assert.match(
    flatStep2,
    near(
      'If more than one match still ties at the top of that ranking',
      'report every matching path and fall through',
      120,
    ),
    'a surviving ambiguity must report every path and fall through instead of picking one',
  );
  // Falling through here is not "no ADR": a writing tool that reads it that way adds a further ADR
  // beside the ones just reported, which is the duplication the whole ranking exists to prevent.
  assert.match(
    flatStep2,
    near(
      'ends its run on a reported several-match result',
      'never reads it as "no project setup ADR exists"',
      240,
    ),
    'a several-match fall-through must end a writing tool\'s run, not read as a "no ADR" result',
  );
  assert.match(
    flatStep2,
    near('reporting every matching path', 'resolves the duplicates by hand', 120),
    'the writer contract must name the report and the by-hand resolution that follows the stop',
  );

  const review = source('src/tools/review.md');
  const adrBullet = prose(boundedSlice(review, '- ADR — ', '\n- Plan files'));
  for (const slug of ['effective-flow-project-setup', 'firmo-project-setup']) {
    assert.ok(adrBullet.includes(slug), `the review exclusion must name the slug ${slug}`);
  }
  assert.ok(
    adrBullet.includes('^\\d+[-_]'),
    'the review exclusion must match its slugs after stripping a numeric prefix',
  );
});

// The remote branch is read as an internal sub-file of `apply-review.md`, so it inherits the
// resolved convention. Its old "no numbered ADR is created" sentence stated the opposite of what
// a numbered project declaration now produces.
test('apply-review-remote defers its ADR file name instead of forbidding a number', () => {
  const remote = prose(source('src/tools/apply-review-remote.md'));

  assert.doesNotMatch(
    remote,
    /no numbered ADR is created/i,
    'the remote branch must not claim that no numbered ADR is created',
  );
  assert.match(
    remote,
    near('project-adr-convention', 'not a form this workflow assumes', 200),
    'the remote branch must defer the ADR file name to the resolved convention',
  );
});
