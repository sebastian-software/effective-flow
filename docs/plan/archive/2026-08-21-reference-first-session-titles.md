# Put the work reference first in the session title

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `1dbf453` on 2026-08-21 — the tip of `develop`. All line citations below are
against that commit.
**Working state:** the tree carries one modified file (`docs/adr/effective-flow-project-setup.md`,
the `mergeGate.completion` line was removed) and three untracked plan files
(`docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md`,
`docs/plan/2026-08-14-native-chatgpt-desktop-task-titles.md`,
`docs/plan/2026-08-20-plan-publication-before-implementation.md`). None of them is related to this
plan and none may be touched by the implementing run.

## Requirement

A session title produced by Effective Flow today reads `<Subject> · <tool>` and carries no work
reference. `src/shared/session-title.md:35-40` states the rule and closes the door explicitly:

> Append an identifier such as `#123` only where it aids lookup, never in front.

The consequence a user hits in practice: a run that was started from Linear issue `SEB-123`, or one
that produced GitHub pull request `#123`, is listed under a title from which the identifier that
makes it findable has been removed. The session list is the surface on which a user re-finds the run
belonging to a ticket or a PR, and the subject alone does not carry that mapping.

The requirement is to invert that clause: where the run holds a work reference, the reference becomes
the **first** segment of the title, and the existing subject-plus-tool shape follows it unchanged.
A run without a reference keeps today's title exactly.

Two things make this more than a wording change:

1. **The reference is not always known when the subject is.** `src/shared/session-title.md:28-34`
   fixes the title "as soon as the subject exists". For `build`, `fix`, `refactor`, `docs`, and the
   `apply-*` family, the pull request is created **after** that moment, so the very reference the
   user named (`PR#123` "bei Umsetzung") does not exist yet at emission time.
2. **The 60-character cap is a hard external constraint, not a style rule.** The butler mandate in
   `src/shared/session-rename.md:153-158` makes a butler _refuse_ a title longer than 60 characters. A
   reference segment therefore spends part of a fixed budget and must have a defined precedence when
   the budget runs out.

This plan is an instruction-contract change in `src/`. It ships no runtime code: the title is
produced by the model following the contract, and the two established rename paths
(`codex_app__set_thread_title` on ChatGPT Desktop, the butler on Claude Code) are unchanged as
mechanisms.

## Architecture decisions

- **The rule stays in one file.** `src/shared/session-title.md` remains the single carrier of _which_
  title is emitted; `src/SKILL.md:26` eagerly includes it exactly once and
  `test/workflow-contracts.test.mjs:249-317` enforces that no tool or agent duplicates it. The
  reference rule is a title rule and therefore belongs in that fragment, not in the mechanism
  fragment and not in any tool.
- **Decide the subject once, bind the reference late.** The subject is still fixed once, at the
  moment `src/shared/session-title.md:28-34` names. The **reference segment is resolved at the moment
  the title is applied or emitted**. This is the decisive choice: on the Claude Code butler path the
  request is already sent "as the run's last action" (`src/shared/session-rename.md:61-63`), so a PR
  created during the run is known by then and needs no extra machinery at all. Late binding turns the
  hardest half of the requirement into a no-op on that path.
- **The suggestion line moves to the run's completion report.** On a host with no established rename
  path the line is printed by hand-copy anyway, so printing it early — before a PR exists — buys
  nothing and would cost a second line later. Printing it once, at the end, makes it always complete
  and aligns that path with Claude Code, which already sends at the run's last action. The line's
  content, label and non-blocking character are unchanged; only its position in the run moves.
- **A bounded second emission covers the one early-apply path.** After the decision above, exactly
  one path still applies a title before the reference can exist: the ChatGPT Desktop native call
  fires "as soon as the subject is fixed" (`src/shared/session-rename.md:23-25`). Only there does the
  run perform **at most one additional** emission, gated on a real change — the run held no reference
  at first emission, now holds one, and the resulting title differs. This is deliberately not a
  general "keep the title fresh" loop, and it is deliberately not a second suggestion line.
- **A second title is not the banned retry.** `src/shared/session-rename.md:25-27` forbids retrying
  "with this or another title". That ban exists to stop a run from hammering a failed or denied
  capability. The additional emission is a different event — a successful call followed by newly
  available information — and the Desktop section must say so explicitly, or an implementer will read
  the existing sentence as forbidding it.
- **Exactly one reference segment, never two.** A remote review finding carries both a tracker
  reference (`#123`) and a finding ID (`R-XXXXXXX`). The tracker reference wins, because it is the
  one that resolves in the forge or tracker UI. `R-XXXXXXX` appears only where no tracker reference
  exists, i.e. the local report flow of `apply-review`.
- **The legacy plan number stays out.** `src/shared/session-title.md:36` strips a legacy `NNNN` from a
  reused plan H1. That stays: a legacy plan number resolves nowhere and is not a lookup handle. This
  was explicitly excluded during clarification.
- **The cap stays 60 and the subject absorbs the cost.** Raising it would break the butler contract
  on the requesting side. Truncation precedence is fixed in the contract rather than left to
  judgment, so two hosts cannot cut the same title differently.
- **No new configuration key.** Reference-first is the behavior, not an option. The project-setup ADR
  gains nothing; `docs/adr/effective-flow-project-setup.md` is not touched.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-title.md`          | Replace the `Subject first` bullet with a `Reference first` bullet: new shape, the reference-source list, one-segment rule, truncation precedence, and the no-reference fallback. Extend the `Once, as soon as the subject exists` bullet with late binding plus the bounded second emission, and reconcile the `One line, never blocking` bullet with it. |
| `src/shared/session-rename.md`         | ChatGPT Desktop section: permit the one additional call and separate it from the existing retry ban. Claude Code section: state that late binding already covers the late reference, so the path stays at one request per run; keep `at most one request per run` at line 222 intact.                                                                      |
| `test/workflow-contracts.test.mjs`     | Update the `ordered(...)` label at line 315 (`Subject first` → the new label) and add assertions for the reference-first shape, the reference-source list, the one-segment rule, the truncation precedence, the bounded second emission, and the Desktop retry-vs-second-title distinction.                                                                |
| `docs/user-guide/getting-started.md`   | Update the example at line 140 to a reference-carrying title, add one sentence on the late PR reference, and correct lines 138-140 (`As soon as a run knows its real subject … it proposes one line`) to say the line arrives with the completion report.                                                                                                  |
| `docs/developer-guide/architecture.md` | Check only. Lines 67-73 justify the fragment sitting in the router; that rationale is unchanged. Touch only if the fragment's growth invalidates a stated number.                                                                                                                                                                                          |

`docs/adr/session-rename-butler.md:67-68` states the cost **per rename**, not per run, and stays
correct because the Claude Code path keeps one request per run. No ADR change is planned; if the
implementing run finds it must add a second butler request after all, that ADR becomes affected and
the change needs a fresh decision.

## Implementation details

### Approach

1. **Rewrite the title-shape bullet in `src/shared/session-title.md`.** New label `Reference first`.
   It must state, in the fragment's existing terse register:
   - the shape `<Reference> · <Subject> · <tool>`, and `<Subject> · <tool>` unchanged when the run
     holds no reference;
   - the separator is the same `·` already in use;
   - the cap stays "at most 60 characters, cut at a word boundary" — the existing phrase survives
     verbatim so the assertion at `test/workflow-contracts.test.mjs:289` keeps its meaning;
   - the surviving parts of today's bullet: reuse an artifact title verbatim, plan H1 without a
     legacy number, issue title without its `[R-XXXXXXX]` prefix, PR title without its Conventional
     Commit type, no workflow-name prefix, no echo of the invocation, no AI attribution.
2. **Add the reference-source list to the same bullet.** Exactly these, rendered verbatim as the
   source renders them:
   - forge issue or pull request → `#<number>`;
   - external tracker issue → the tool-native identifier, e.g. `SEB-123`;
   - review finding without a tracker reference → `R-XXXXXXX`;
   - a reference token is a short, whitespace-free run of letters, digits, `#`, and `-`, at most 16
     characters. The shape is stated generically rather than per tracker, so an unknown external
     identifier is covered without enumerating trackers. A candidate that does not match is omitted,
     never trimmed or sanitized into shape;
   - several issues → the first issue's reference followed by `+N`, so `+N` counts references and
     moves off the subject where it sits today (`src/shared/session-title.md:38-39`);
   - anything else, including a legacy plan number → no reference segment.
3. **State the one-segment rule and the precedence** (tracker reference over finding ID) in one
   sentence.
4. **State the truncation precedence** in one sentence: cut the subject at a word boundary first; if
   the title still exceeds 60 characters, drop the `<tool>` segment; never truncate the reference; if
   the bare reference alone would exceed the cap, emit no reference and fall back to today's shape.
5. **Extend the emission-timing bullet** (`src/shared/session-title.md:28-34`) with two clauses:
   late binding (the subject is decided at subject fix, the reference is resolved when the title is
   applied or emitted), and the bounded second emission with its three gates — no reference at first
   emission, a reference now, and a differing resulting title. Cap it at one additional emission per
   run and say that a host which applies the title late needs none — which, after step 6, is every
   path except the ChatGPT Desktop native call.
   Keep the bullet's existing label: the **subject** is still decided exactly once, which is what the
   label asserts, and the `ordered(...)` list at `test/workflow-contracts.test.mjs:310-316` pins it.
6. **Move the suggestion line to the completion report** in the same
   `One line, never blocking` bullet (`src/shared/session-title.md:41-44`). State that where no
   established rename path applies, the single line is printed **in the run's completion report**, by
   which time the reference is bound — never earlier, and never twice. Keep every other clause
   verbatim: the label, "never in place of the run's own output", the conversation-language rule, and
   the secrets prohibition. This bullet label is pinned by the same `ordered(...)` list and must not
   be renamed. With the line moved, "one line" stays literally true and no per-emission wording is
   needed.
7. **Amend the ChatGPT Desktop section** of `src/shared/session-rename.md` (lines 22-27 and the two
   result bullets at 33-37). Keep "never retry"; add that a newly available reference after a
   **successful** call is not a retry and licenses exactly one further call with the reference-first
   title. A failed, denied, or absent capability licenses nothing — that stays the suggestion-line
   fallback.
8. **Amend the Claude Code section** of `src/shared/session-rename.md` around lines 60-69: one
   sentence stating that because the request is the run's last action, the reference is already bound
   when it is sent, so this path needs no second request and stays at one per run. Leave the
   "differing title stops sending for good" clause and the degradation table untouched.
9. **Update the tests**, then the user guide, then run the full CI sequence.

### Component structure

Not relevant — no code modules change.

### State management

The only state introduced is per-run and lives in the model's own reasoning: "a title was already
applied or emitted this run, and it carried no reference". Deliberately no runtime file, no receipt,
and no entry under `.effective-flow/`. This keeps the change inside the instruction layer and away
from `runtime-state-safety`.

### API integration

Not relevant. `codex_app__set_thread_title` is called with the same single `title` argument and still
without `threadId`; only the string differs and the call may now happen a second time under the
stated gates.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **No reference at all** (`concept`, `investigate`, a free-text `build`) → today's title, byte for
  byte. This is the majority case and must not regress.
- **Issue and PR share the `#` space on GitHub.** `#123` in a title may be either. Accepted
  deliberately: the `<tool>` segment carries the context, and the alternative (`PR#123`) was not the
  rendering chosen during clarification. Record it as an assumption, not as an open defect.
- **Reference known at subject fix, then a PR is created** → one reference already stands; no second
  emission, because the gate "held no reference at first emission" fails. The issue reference is the
  more durable handle.
- **Several issues, mixed targets** — the gateway already refuses a list mixing tracker targets
  (`src/shared/plan-input-gateway.md`, "Mixed issue list"), so the title never has to render a
  cross-target `+N`.
- **Butler already reported a differing title** → `src/shared/session-rename.md:66-69` stops all
  further requests for the session. That rule outranks the second emission; the second emission must
  not be written in a way that reopens it.
- **Subject cut to nothing.** A 40-character reference plus separators can leave no room. The
  truncation precedence must produce a title that is still non-empty and still contains the
  reference; drop the tool segment before the subject reaches zero.
- **Reference containing a control character or exceeding a sane length** — a tracker-native ID is
  machine-derived, but the butler refuses newlines, control characters, and code fences
  (`src/shared/session-rename.md:153-158`). A reference that does not match its documented shape is
  omitted rather than sanitized.
- **`setup`'s capability probe** uses the fixed title `Effective Flow setup check` and derives none.
  Unaffected, and the tests around `src/tools/setup.md` must keep passing untouched.

## Acceptance criteria

- [x] `src/shared/session-title.md` contains a bullet labelled `Reference first` that states the
      shape `<Reference> · <Subject> · <tool>`, retains the phrase `at most 60 characters`, and no
      longer contains the clause `never in front`.
- [x] The same bullet names all four reference sources (`#<number>`, a tool-native identifier such as
      `SEB-123`, `R-XXXXXXX`, and `+N` for several issues) and states that a legacy plan number is not
      a reference.
- [x] The same bullet states the one-segment rule with tracker reference over finding ID, the
      truncation precedence subject → tool segment → never the reference, and the generic reference
      shape (letters, digits, `#`, `-`, no whitespace, at most 16 characters, non-matching candidates
      omitted rather than sanitized).
- [x] `src/shared/session-title.md` states that the reference is resolved when the title is applied or
      emitted, and permits **at most one** additional emission per run, gated on all three conditions.
- [x] The `One line, never blocking` bullet states **unconditionally** that the suggestion line is
      printed in the run's completion report — wherever it is emitted at all, including on a host
      whose rename path failed or was denied — keeps its label and every other clause, and still
      says "one line". The scope is not narrowed to "where no established rename path applies": that
      wording was this plan's first draft, and the deep review below reversed it because it left
      ChatGPT Desktop with a failed capability printing an early, reference-less line.
- [x] No path other than the ChatGPT Desktop native call can reach the second emission — the contract
      names that path explicitly rather than describing a class.
- [x] `src/shared/session-title.md` grows by **at most 12 net lines** against `1dbf453` — added
      minus removed, not added alone. Check with
      `git diff --numstat 1dbf453 -- src/shared/session-title.md`, and pin it in the suite as an
      absolute line-count cap so the guard also holds in an exported tree with no history. The
      fragment is eagerly loaded in every session on all three targets, so this makes the
      maintainability note enforceable rather than advisory.
- [x] `src/shared/session-rename.md` keeps its retry ban and additionally states that a further call
      carrying a newly available reference after a successful call is not a retry.
- [x] `src/shared/session-rename.md` states that the Claude Code path stays at one request per run,
      and the string `at most one request per run` is still present at the end of that section.
- [x] `test/workflow-contracts.test.mjs` asserts each of the contract points above and its
      `ordered(...)` list names the new bullet label instead of `Subject first`, while
      `Once, as soon as the subject exists` and `One line, never blocking` keep their positions.
- [x] `docs/user-guide/getting-started.md` shows a reference-carrying example title and names the late
      PR reference in one sentence.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass, in
      that order, with no new warnings and with `build` and `plan` still inside the 700-line context
      budget the build reports.

## Validation plan

- `pnpm agent:check` — oxfmt over the edited Markdown, no writes.
- `pnpm test` — the full `node:test` suite, including the extended
  `test/workflow-contracts.test.mjs`. Confirm the two existing session-title tests
  (`the session-title contract ships in the router …` and `every work-subject tool carries the
session-rename lazy pointer …`) still pass; the second reads its tool list out of the fragment and
  is the regression guard against an accidental structural edit.
- `node build.mjs` — the eager-include rendering of `src/SKILL.md` plus the context-budget guard.
  Read the reported `Always-loaded core (lines, budget 700)` values and record them.
- `pnpm test:distribution` — isolated archive/delivery layout.
- Manual read-through of the rendered `dist/portable/effective-flow/SKILL.md` to confirm the inlined
  fragment reads coherently in the copy that actually ships.
- Manual title trace on paper for four cases before implementation is called done: a `plan-issue` run
  on `SEB-123`, an `iterate` run on `#368`, a `build` run with no reference that later opens a PR, and
  an `apply-review` run in the local report flow. Each must yield exactly one well-formed title of at
  most 60 characters, and only the third may reach the second emission.

## Assumptions and open points

- A pull request is rendered `#123`, identical to an issue reference; the `<tool>` segment carries the
  disambiguation. This follows the rendering chosen during clarification and is recorded here because
  it is the one place where the title is deliberately ambiguous.
- `codebase-improvement` is **not installed in this environment**, so Phase 4 and Phase 6 of this
  planning run applied the documented minimal generic fallback (over-engineering, scope creep,
  unspoken assumptions, non-measurable criteria, edge cases, implementation risks) instead of that
  skill's full judgment. A `review docs/plan/2026-08-21-reference-first-session-titles.md` on a host
  where the skill is available would deepen the plan-level review; nothing in this plan depends on it.
- The Claude Code butler path is assumed to send its request late enough that a PR created during the
  run is known — this reads directly off `src/shared/session-rename.md:61-63` ("send the request as the
  run's last action, after the run's own output") and was not observed live. If an implementing run
  finds a tool that emits earlier on that path, the bounded second emission applies there too and
  `docs/adr/session-rename-butler.md` needs revisiting.
- Moving the suggestion line to the completion report means a long run no longer offers a title while
  it is still working. That was weighed against a doubled line and decided in the deep review: the
  line is hand-copied anyway, so one complete line beats an early incomplete one. A user who wants a
  title immediately still gets one from the host's own first-message derivation.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         1 |    1 |

### Findings

- **Architecture, Important — the second emission was nearly designed for a path that does not need
  it.** A first reading of the requirement suggests a general "re-emit when the PR appears" rule for
  every tool. Reading `src/shared/session-rename.md:61-63` shows the Claude Code request is already
  the run's last action, so late binding alone covers that path. The plan was changed to make late
  binding the primary mechanism and the second emission a bounded fallback for early-apply hosts
  only. Incorporated in "Architecture decisions" and step 5.
- **Error cases, Important — the retry ban would have blocked the feature silently.**
  `src/shared/session-rename.md:25-27` forbids retrying "with this or another title". Without an
  explicit carve-out an implementer reads that as forbidding the second call and ships a contract that
  contradicts itself. Incorporated as step 7 and as its own acceptance criterion.
- **Scope, Important — the 60-character cap is external, not stylistic.** The butler refuses longer
  titles outright (`src/shared/session-rename.md:156`), so a reference prefix cannot simply be
  prepended. Truncation precedence is now fixed in the contract rather than left to per-host judgment.
  Incorporated as step 4 and as an acceptance criterion.
- **Security, Note — reference text is machine-derived and stays so.** Reference tokens come from the
  forge, the tracker, or a finding ID, never from free-text prose, and a token not matching its
  documented shape is omitted rather than sanitized. The existing butler refusal rules for control
  characters and code fences remain the backstop. No new injection surface.
- **Testability, Note — the existing structural test is the real guard.** The test at
  `test/workflow-contracts.test.mjs:320-360` derives the sixteen work-subject tools from the fragment's
  own list. An edit that damages that list fails there rather than in the new assertions, which is why
  the plan requires confirming both existing tests still pass rather than only the new ones.
- **Maintainability, Note — the fragment is eagerly loaded in every session.** Every added line is
  paid once per session on all three targets. The plan therefore extends two existing bullets rather
  than adding a section, and keeps the reference-source list to five short items.

### Deep review, 2026-08-21

Run interactively on the plan file. `codebase-improvement` is not installed in this environment, so
the judgment came from the documented minimal generic fallback; that limitation is disclosed here
rather than presented as full-depth review.

- **Error cases, Important — the plan contradicted the contract bullet it did not touch.**
  `src/shared/session-title.md:41-44` (`One line, never blocking`) reads as one line per run, while
  the plan permitted a second emission. Left as written, an implementer would ship a fragment that
  argues with itself. Incorporated as step 6, together with the decision below that removes the
  conflict entirely rather than papering over it.
- **Architecture, Important — decision taken: the suggestion line moves to the completion report.**
  On a host with no rename path the line was printed at subject fix, before any PR exists, so the
  second emission would have produced two `**Suggested session title:**` lines on every `build` and
  `fix` run. Three options were weighed: accept two lines, move the first line to the completion
  report, or restrict the second emission to auto-applying hosts (which leaves Codex CLI without the
  PR reference — the reported case). The user chose the move. It yields exactly one line, always
  carrying the reference, and narrows the second emission to the single ChatGPT Desktop native path.
  The cost — no title offered during a long run — is recorded under assumptions.
- **Security, Important — the reference shape was under-specified.** The plan required omitting a
  reference that "does not match its documented shape" without documenting a shape for external
  tracker identifiers, which vary per tool. A generic shape is now specified (letters, digits, `#`,
  `-`, no whitespace, at most 16 characters) instead of enumerating trackers, and a non-matching
  candidate is omitted rather than sanitized into shape. Incorporated as step 2 and as an acceptance
  criterion.
- **Maintainability, Important — the fragment-growth note was advisory and therefore inert.**
  `src/shared/session-title.md` is eagerly loaded in every session on all three targets, but nothing
  bounded the growth this plan causes. A measurable cap is now an acceptance criterion: at most 12
  added lines, checked with `git diff --numstat` against `1dbf453`. This supersedes the advisory
  maintainability note above.

## Test results

**Date:** 2026-08-21
**Command sequence:** the one `AGENTS.md` names as CI's, run from the delivery worktree

| Check                    | Result                                             |
| ------------------------ | -------------------------------------------------- |
| `pnpm agent:check`       | pass — 296 files format-clean                      |
| `pnpm test`              | pass — 704 tests, 0 failures                       |
| `node build.mjs`         | pass — three targets emitted, no build guard fired |
| `pnpm test:distribution` | pass — offline checks passed                       |

Context budget reported by the build: `build 535, fix 431, docs 564, review 685, plan 619` — both
plan-relevant tools are far inside the 700-line limit.

The rendered routers were checked at their real paths (`dist/<target>/effective-flow/SKILL.md`, not
`dist/<target>/SKILL.md`): all three carry the `Reference first` bullet and the completion-report
clause, with no unresolved include fence. The retired strings `never in front` and
`where no established rename path applies` are absent from the entire `dist/` tree.

Three assertions were mutation-proved by the orchestrator against a full copy of the worktree, after
the review found they did not bite: deleting the new Claude Code paragraph, inverting the
legacy-plan-number exclusion, and re-scoping the completion-report rule with wording that avoids the
retired phrase each now fail the suite, and the restored tree returns to green.

## Review findings

**Date:** 2026-08-21
**Reviewer:** `effective-flow-nodejs-reviewer` (test code), `effective-flow-code-validator` (tooling
and documentation buckets)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     8 |
| Open / Not implemented |     2 |

The review's decisive result was that three newly added contract-pinning assertions did not bite.
One was fully vacuous: it advertised the new Claude Code clause but matched a pre-existing sentence
about 13 000 characters away, because `section()` slices to end-of-file for the last `###` section
and swallowed the degradation subsection. Two more passed the exact wrong contracts they existed to
reject. All three are fixed and mutation-proved. Two findings were deliberately not implemented: an
inconsistency in where sibling assertions pin (fragment versus rendered router), which the reviewer
established is not a live hole, and a dead assertion inside the pre-existing `ordered()` helper,
which this change does not touch.

Two defects were also found in this plan itself and corrected here: the acceptance criterion for the
`One line, never blocking` bullet still carried the first draft's "where no established rename path
applies" scope, contradicting the deep review recorded above and the delivered test; and the
line-budget criterion read as added lines beside a `--numstat` command while meaning, and being
tested as, net lines.

**External review report:** `.effective-flow/review/review-report-2026-08-21-plan-reference-first-session-titles.md`

## Open points

- No open points.
