import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assertNoUnresolvedEagerIncludes,
  renderBody,
  resolveEagerIncludes,
} from '../build-lib.mjs';

const repositoryRoot = new URL('..', import.meta.url);

// These helpers are a deliberate copy of the block in `test/workflow-contracts.test.mjs`, which is
// how every suite in this directory carries its source-reading helpers. Keep the two copies
// identical: an edit to either one belongs in both.

function source(path) {
  return readFileSync(new URL(path, repositoryRoot), 'utf8');
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

function ordered(text, ...fragments) {
  let position = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, position + 1);
    assert.notEqual(next, -1, `missing ordered fragment: ${fragment}`);
    assert.ok(next > position, `fragment is out of order: ${fragment}`);
    position = next;
  }
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

  // Load-bearing clauses: only an explicitly established host-native path may
  // target the caller, arbitrary cross-session renames stay forbidden, and the
  // title stays a reference-first emission decided once. This is an instruction
  // contract; it does not claim to execute either host's operation.
  const contract = prose(fragment);
  // The permission is shaped by the absence of an id rather than by naming a host, and
  // the two established paths spell that absence differently - an omitted task id on
  // ChatGPT Desktop, a sentinel the host itself resolves on Claude Code. The rule is
  // pinned together with both of its spellings, so a path that merely hands over "the
  // current session id" cannot read as established: a wrong session id is exactly what
  // the retired Claude Code mechanism sent from a forked session.
  assert.match(
    contract,
    near('host-native path that carries no id at all', 'an omitted task id', 200),
  );
  assert.match(
    contract,
    near(
      'an omitted task id',
      'fixed sentinel the host itself resolves to the calling session',
      160,
    ),
  );
  assert.match(contract, /apply the title silently instead of proposing it/);
  assert.match(contract, /never retitle another session/);
  assert.match(contract, /never probe speculatively/);
  assert.match(contract, near('later automatic title', 'replace one the user set manually', 200));
  // The Claude Code half of the same rule, whose absence was only half covered: the removed
  // standing-mandate carve-out is pinned further down, but the sentence that replaced it was
  // not, so deleting it left the suite green. Consent sits with the host there, and the
  // consequence is the operational one - the run never reads the session back to find out who
  // set the current title.
  assert.match(
    contract,
    near(
      'Claude Code path the host owns that consent',
      'neither licenses reading the session back',
      250,
    ),
  );
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
  // than forced into shape - a rename call refuses control characters outright, so
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

  // The re-derivation must enumerate the native calls it applies to rather than resting on
  // the class term alone, or a host that later gains an early-applying path inherits it
  // silently. Both calls are now named, so both are pinned; and it stays gated on all three
  // conditions together.
  assert.match(
    contract,
    near(
      'ChatGPT Desktop and Claude Code native calls',
      're-derives the title when its inputs change',
      160,
    ),
  );
  ordered(
    contract,
    'ChatGPT Desktop and Claude Code native calls',
    'carried no reference',
    'one now exists',
    'the resulting title differs',
  );
  // ordered() pins sequence but not distance, so the three gates would survive
  // being scattered into separate bullets - where they read as three independent
  // permissions rather than one conjunction. This binds them into one window.
  assert.match(contract, near('carried no reference', 'the resulting title differs', 120));

  // How often a re-derived title is applied belongs to the mechanism fragment and not
  // here: both of its native sections license exactly one further call today, and they
  // have not always agreed - the retired Claude Code path sent on every character-exact
  // change, six times per run at most. A per-run count stated here contradicts whichever
  // section moves next, whatever number it names, so the delegation is pinned positively
  // and the count this contract used to carry is pinned absent - restoring "may emit once
  // more per run" beside the delegation would otherwise leave the suite green on the
  // positive pin alone.
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

  // The categorical rule, pinned on the rendered form. It used to carry a carve-out
  // permitting a mandated second session to honor a cross-session rename request; with
  // that mechanism retired the rule stands unqualified, and the pin moved with it - a run
  // renames the session it is in, through a path that carries no id, and never another
  // session. The pin's location is older than its subject: it sat on the rendered
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
      near('host-native path that carries no id at all', 'never retitle another session', 400),
      harness,
    );
    // The retired carve-out is pinned absent on every harness too: restoring a standing
    // rename mandate here would re-permit a cross-session rename that no mechanism
    // implements any more, and the positive pin above would stay green beside it.
    assert.doesNotMatch(prose(rendered), /standing rename mandate/i, harness);
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
//
// Both hosts with an established path now take a native call of their own, so the row that
// matters most is the third: a host outside the two named ones dispatches to no section at
// all. The two host cells are pinned to their own section titles rather than to a shared
// shape, because that is what stops the Desktop operation from being read as the Claude
// Code one, or either as a generic Codex mechanism.
test('session-rename dispatches each established host to its own native section', () => {
  const fragment = source('src/shared/session-rename.md');
  const dispatch = section(fragment, '## Session rename');

  const hosts = firstColumnCells(dispatch);
  assert.deepEqual(
    hosts.filter((host) => !/^[-:]+$/.test(host)),
    ['Host', 'ChatGPT Desktop, Codex tab', 'Claude Code', 'Codex CLI or any other running host'],
  );
  assert.match(tableRow(dispatch, 'ChatGPT Desktop, Codex tab'), /calling task directly/);
  assert.match(tableRow(dispatch, 'Claude Code'), /rename this session directly/);
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

// The Claude Code path, pinned in the idiom of the Desktop section above and for the same
// reason: these describe what a run must ask the host to do, and prove no host-side
// behavior. What they protect is the property the whole retirement was for - the run
// addresses itself with a sentinel the host resolves, so no session id is assembled
// anywhere on this path and the id that used to be sent cannot be the wrong one.
test('the Claude Code section renames the calling session by sentinel and never by id', () => {
  const fragment = source('src/shared/session-rename.md');
  // The last `###` in the file, so this slice runs to EOF - which is exactly the section
  // here only because it carries no subsections. A `####` added below it would fall inside
  // this cut and would have to be sliced out, the way the retired version of this section
  // needed a `'\n#### '` stop to keep its first pin from going vacuous.
  const claude = section(fragment, '### Claude Code: rename this session directly');
  const contract = prose(claude);

  assert.match(contract, near('currently `set_session_title`', 'literal sentinel `"self"`', 200));
  assert.match(
    contract,
    near('Call it once, as soon as the subject is fixed', 'exactly the already-cut `title`', 200),
  );

  // The load-bearing clause of the retirement. `"self"` being a sentinel *and not an id* is
  // what makes the diagnosed forked-session defect unreachable: the retired path failed by
  // sending a session id it had resolved from the wrong environment, and an id that is never
  // assembled, resolved, read back or sent cannot be resolved wrongly. A rewrite that keeps
  // the sentinel while permitting "the session id, where one is available" would restore the
  // whole defect surface, so the ban is pinned beside the sentinel rather than on its own.
  assert.match(
    contract,
    near(
      '`"self"` is a sentinel and not an id',
      'never assemble, resolve, read back or send a session id on this path',
      200,
    ),
  );
  assert.match(contract, /never name another session/);
  assert.match(contract, /never list sessions/);
  assert.match(contract, /never retry with this or another title/);
  // The other half of "no id crosses a boundary": no second session takes part at all, so
  // there is nothing to discover, authenticate, or send a payload to.
  assert.match(
    contract,
    near('The call itself is the whole path', 'no second session takes part in it', 300),
  );

  assert.match(contract, near('call succeeded', 'stay silent', 200));
  // Silence is owed to a *reported* success only, and the one line is owed to everything
  // else. Pinned as a sequence over all three failure spellings so that dropping one of them
  // - the absent capability, the error, the call that reports no success at all - leaves a
  // hole a run would have to fill by inventing an outcome.
  ordered(
    contract,
    'capability is absent or denied',
    'the call errors',
    'no successful result is reported',
    'Suggested session title:',
  );
  assert.match(contract, near('Do not block the workflow', 'claim that a title was applied', 200));

  // Same carve-out as the Desktop section: the retry ban above does not swallow the one
  // further call a late-bound reference licenses, and that licence is bounded at one.
  assert.match(
    contract,
    near('after a successful call is not the retry', 'licenses exactly one further call', 240),
  );
  assert.match(contract, near('licenses exactly one further call', 'nothing after that', 200));

  // The failure mode observed while planning this change: both session tools had to be
  // loaded by name before they could be called. A run reading "not in my tool list" as
  // "capability absent" prints a suggestion line on a host where the rename works, which
  // looks like a supported degradation rather than like the bug it is.
  assert.match(contract, /An unlisted tool is not an absent capability/);
  assert.match(
    contract,
    near('loaded by name', 'only a refusal or an error from the call itself is a failure', 250),
  );

  // A host that refuses the sentinel, and a Claude Code context carrying no session tools at
  // all, are ordinary outcomes of this path. Stated as errors instead they would invite a
  // report, a retry, or a second mechanism - which is the fallback this change removed.
  assert.match(
    contract,
    near('refuses the `"self"` sentinel', 'ordinary outcomes of this path rather than errors', 300),
  );

  // Consent is the host's, and the fragment adds no reasoning of its own about who set the
  // current title. The second pin is the operational half: inferring ownership would mean
  // reading the session back, which is the one read this path must never perform.
  assert.match(
    contract,
    near(
      'Consent belongs to the host',
      'replaces a title the user set only after the app asks them',
      300,
    ),
  );
  assert.match(
    contract,
    near(
      'add no reasoning of your own about who owns the current title',
      'never read the session back to find out',
      200,
    ),
  );

  // The retirement, proved by absence over the whole fragment rather than over this section:
  // a section-scoped negative pin stays green while a retired subsection survives further
  // down, and half a mechanism left standing is worse than either shape alone. Checked
  // against `prose()` so a reflowed line cannot hide a match.
  const whole = prose(fragment);
  for (const retired of [/butler/i, /Effective Flow rename butler/i, /send_message/i]) {
    assert.doesNotMatch(
      whole,
      retired,
      'the retired second-session rename mechanism must leave no residue in session-rename.md',
    );
  }
  // The abandoned ordering, pinned by absence over the whole fragment - which now means it
  // guards both native sections rather than only the retired one it was written for. "Send
  // it as the run's last action" is still live repository history (see the archived plan
  // `2026-08-21-early-butler-rename-request.md`), so the wording remains reachable for a
  // rewrite of either section, and the positive timing pin above cannot catch it: that pin
  // stays green while a "last action" sentence sits beside it.
  assert.doesNotMatch(
    whole,
    /last action/i,
    'no section of session-rename.md may reinstate the abandoned last-action ordering',
  );
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

test('setup No and a failed probe never persistently disable later rename attempts', () => {
  const setup = source('src/tools/setup.md');
  const step = section(setup, '### Step 7: Session rename capability (optional)', '\n### Step 8');
  const contract = prose(step);
  const desktopStep = prose(
    section(
      step,
      '#### ChatGPT Desktop, Codex tab: the native capability needs no installation',
      '\n#### ',
    ),
  );
  const claudeStep = prose(
    section(step, '#### Claude Code: the native capability needs no installation', '\n#### '),
  );
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
  // Both probes carry the call-local guarantee in their own words, so each is pinned inside
  // its own sub-step: pinned against the whole step, either copy alone satisfies the
  // assertion and the other can be dropped with the suite green.
  assert.match(
    desktopStep,
    near('this setup probe failed', 'Later eligible runs still attempt the operation', 200),
  );
  // The Claude Code half, including the outcome that only its path has: a host that refuses
  // the sentinel. That is the accepted cost of retiring the second-session fallback, so it
  // has to read as one more failed probe rather than as a capability switched off.
  assert.match(
    claudeStep,
    near(
      'a refused sentinel, or a failed call means only that this setup probe failed',
      'Later eligible runs still attempt the operation',
      200,
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
  // Claude Code stays on the suggestion-only list, but for the one reason left after the
  // second-session fallback was retired: the host declining the native rename. Pinned with
  // that condition attached, so the host cannot quietly drop off the list once its usual
  // outcome is a successful rename.
  assert.match(
    contract,
    near('suggestion-only', 'Claude Code when the host declines the native rename', 300),
  );
  assert.match(contract, near('suggestion-only', 'Codex CLI', 300));
  assert.match(
    contract,
    near('suggestion-only', 'other host without a (?:supported|established)(?: title)? path', 300),
  );

  // A user who followed the earlier instructions is still keeping a second session alive for
  // a mechanism nothing contacts any more. Nothing breaks, which is exactly why the guide
  // has to say so - an inert session that looks configured is otherwise never closed.
  assert.match(
    contract,
    near('setup no longer contacts it', 'you can close it', 200),
    'the guide must tell an owner of the retired helper session that it is inert',
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
  // The one surface that legitimately names the mechanism: the ADR *is* the record of its
  // retirement, so it is exempted here rather than dropped from the loop, which keeps its
  // other retired-transport pins in force. Every other page in this list - the two user-guide
  // pages and the build-system guide included - carried the residue check only as a one-shot
  // manual grep until now, so a butler paragraph reintroduced there stayed green.
  const retirementRecord = 'docs/adr/session-rename-butler.md';

  for (const path of activeSurfaces) {
    const content = source(path);
    for (const retired of [
      /hooks\.Stop/,
      /codex app-server/i,
      /session-title\.json/,
      /session-title-hook\.json/,
      ...(path === retirementRecord ? [] : [/butler/i]),
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

// setup's probe and the mechanism fragment must describe the same call, or setup proves a
// path that ordinary runs do not take. The literal they have to agree on is no longer a
// marker title - there is no second session to discover - but the operation, the sentinel,
// and the fixed probe title, all three of which the fragment defines and setup repeats. Both
// files are read here rather than only setup, so this fails when either side drifts.
//
// The old form of this test also required setup to reach a pasteable mandate *by reference*
// to `shared/session-rename.md`. That requirement is gone with the block it protected: setup
// now prints nothing owned by the fragment, so there is no second wording that could drift.
// What survives from it is the negative half - setup must inline no mandate - widened to the
// whole retired mechanism, because an instruction to set up a second session is exactly the
// kind of paragraph a deletion this size leaves behind.
test('setup probes the same native call the rename fragment defines', () => {
  const setup = prose(source('src/tools/setup.md'));
  const fragment = prose(source('src/shared/session-rename.md'));

  assert.match(setup, /`set_session_title`/);
  assert.match(setup, near('sentinel `"self"`', 'Effective Flow setup check', 120));
  for (const shared of [/`set_session_title`/, /`"self"`/, /`Effective Flow setup check`/]) {
    assert.match(fragment, shared, 'the fragment must define what setup probes');
    assert.match(setup, shared, 'setup must probe what the fragment defines');
  }

  // setup keeps its own copy of the deferred-tool rule because its probe makes the call
  // itself; the two copies exist to stay identical, so the clause is pinned on both sides.
  // Without this, deleting it from setup left the suite green while deleting the fragment's
  // copy failed - and a probe that reads "not in my tool list" as "capability absent"
  // reports a failed probe on a host where the rename works.
  assert.match(
    setup,
    near('an unlisted tool is not an absent capability', 'only a refusal or an error', 200),
  );

  assert.doesNotMatch(setup, /Standing mandate for this session/);
  assert.doesNotMatch(setup, /butler/i);
  assert.doesNotMatch(setup, /Effective Flow rename butler/i);
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
