# Raise the `mergeGate.maxRounds` default from 3 to 10

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Change the documented default of the configuration key `mergeGate.maxRounds` from `3` to `10`
across the Effective Flow distribution sources under `src/`, the user documentation under
`docs/user-guide/`, and the contract tests in `test/` that pin those defaults.

`mergeGate.maxRounds` is the merge gate's total round budget: it bounds the whole run, not one
phase (`src/tools/merge-gate.md`, section "Round accounting"). Raising it lets a gated run spend
more repair rounds before it stops with a report instead of a merge.

The recommendation is **Feature** rather than Documentation or Refactoring: the default is the
value every project that never sets the key inherits, so changing it changes shipped workflow
behavior for those projects. It is not a bug fix and it is not behavior-preserving. The change
carries no `!` and no `BREAKING CHANGE:` footer — it retunes a bound, it does not remove or rename
an interface.

## Architecture decisions

- **The default has no code constant; the prose tables _are_ the source of truth.** A repo-wide
  search for `maxRounds` finds the key only in Markdown sources, in the user guide, and in
  `test/workflow-contracts.test.mjs`. Neither `build.mjs` nor any file under `src/scripts/` reads
  or validates it, and no JSON schema carries it. The change is therefore complete only when
  **every** documented site agrees; there is no single place to edit that propagates.
- **Six table sites plus four prose sites carry the number.** Four key/values/default tables
  (`src/tools/merge-gate.md`, `src/tools/setup.md`, `src/shared/config-migration.md`, the user
  guide's "Block `mergeGate`" table), two user-guide plain overview tables, and four prose
  passages. All ten are listed individually under "Affected files".
- **Sites that name the key without its value stay untouched.** `src/tools/merge-gate.md` lines
  126, 348, 562, 848, 940, 989, 1005, 1026, 1182, 1255, 1724 and 1768,
  `src/tools/setup.md` lines 461 and 810, `src/tools/iterate.md` line 292,
  `src/shared/pr-review-comments.md` line 177, and `docs/user-guide/tools-deliver.md` lines 218
  and 293 all reference `mergeGate.maxRounds` as a bound without naming a numeric value. They are
  correct at any default and must not be edited. `docs/plan/archive/` records history and is never
  rewritten.
- **`src/shared/goal-completion.md` line 9 is a false positive and must not be touched.** Its
  "Bound the internal correction rounds (guideline: three)" is the generic goal-completion loop's
  guideline, a different bound that has nothing to do with `mergeGate.maxRounds`. A careless
  search-and-replace on the word "three" would corrupt it.
- **The two per-round-consent sentences keep a concrete number.** See "Re-deriving the prose"
  below.
- **The round-economy argument is re-derived default-independently.** See "Re-deriving the prose"
  below.
- **No configuration migration entry is needed.** `src/shared/config-migration.md` already states
  that a missing line means the default, so an upgrading project that never set the key simply
  starts resolving `10`. A project that wants the old bound writes `mergeGate.maxRounds: 3` into
  its project-setup ADR. The migration contract itself is unchanged; only its defaults table is.
- **This repository's own project-setup ADR does not set the key**, so no local configuration has
  to be adjusted alongside the source change.

### Re-deriving the prose

Three of the four prose sites do not merely restate the number — they derive word-forms and, in
one case, an argument from it. Each is settled here:

1. **`src/tools/merge-gate.md` line 967 and `docs/user-guide/configuration.md` lines 282–283 —
   keep the concrete number, substitute it.** These two are the same statement written for two
   audiences (workflow source and user guide). Their job is to warn that
   `mergeGate.conflictResolution: ask` asks **per conflicted round**, unlike
   `mergeGate.completion`'s once-per-run entry question, and the number makes the recurrence
   concrete. At a default of ten the sentence stays exactly as accurate and its warning gets
   _stronger_, not weaker: ten possible prompts is a more vivid reason to understand the key than
   three. Substituting `10` / "ten" is therefore the right move, and both sites must carry the same
   numeral and the same claim so the two audiences are never told different things.
   - merge-gate.md target sentence: "With the default `mergeGate.maxRounds: 10` a run may therefore
     pose it up to ten times."
   - configuration.md target clause: "… and with the default `mergeGate.maxRounds: 10` a single run
     may therefore pose the question up to ten times."
2. **`src/tools/merge-gate.md` line 1020 — drop the numeric derivation and re-ground the
   argument.** The current sentence reads "Counting them separately would spend two of the default
   three rounds on a pull request whose findings a single round can assess." Its entire rhetorical
   force is scarcity: two of three is two-thirds of the run's budget. Mechanically substituting
   "ten" keeps the sentence _accurate_ — two of ten is still two of ten — but destroys the
   argument, because twenty percent of the budget reads as a rounding error and the reader is left
   wondering why the rule exists at all.

   The real ground for "one Phase-4 evaluation performs at most one return" was never the specific
   value of the default. It is that spending two rounds on work a single round completes halves the
   number of _genuine_ repair attempts the bound allows, at **any** configured value. Re-deriving
   the sentence on that ground makes it stronger, makes it true at `3` and at `10` alike, and makes
   it immune to the next default change.
   - Target sentence: "Counting them separately would spend two rounds on a pull request whose
     findings a single round can assess, and would at worst halve how many genuine repair attempts
     `mergeGate.maxRounds` allows — at any configured value."
   - "at worst" is deliberate and load-bearing: the halving is the worst case in which both
     returning conditions are unmet in every evaluation, not a guaranteed outcome. A bare "halves"
     would be an overclaim.

3. **`src/tools/setup.md` line 66 — plain substitution.** The block-9 prose reads
   "`maxRounds` (positive integer, default `3`)" inside a long enumeration of the `mergeGate` keys.
   It derives nothing; only the literal changes.

## Affected files

| File                                               | Description                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md` (line 503)               | Configuration table row `` `mergeGate.maxRounds` ``: Default column `` `3` `` → `` `10` ``. Values column (`positive integer`) unchanged.                                                                                                                                                                                                                  |
| `src/tools/merge-gate.md` (line 967)               | Per-round-consent prose under `mergeGate.conflictResolution: ask`: `` `mergeGate.maxRounds: 3` `` → `` `mergeGate.maxRounds: 10` `` and "up to three times" → "up to ten times".                                                                                                                                                                           |
| `src/tools/merge-gate.md` (line ~1020)             | "Round accounting" paragraph: replace "would spend two of the default three rounds on a pull request whose findings a single round can assess" with the default-independent re-derivation given above. Adds one further mention of the token `` `mergeGate.maxRounds` `` in that paragraph.                                                                |
| `src/tools/setup.md` (line 66)                     | Block-9 `mergeGate` prose enumeration: "`maxRounds` (positive integer, default `3`)" → "default `10`".                                                                                                                                                                                                                                                     |
| `src/tools/setup.md` (line 438)                    | Block-9 wizard table row `` `mergeGate.maxRounds` ``: Default column `` `3` `` → `` `10` ``.                                                                                                                                                                                                                                                               |
| `src/shared/config-migration.md` (line 104)        | Shared defaults table row `` `mergeGate.maxRounds` ``: Default column `` `3` `` → `` `10` ``. **Not covered by any contract test** — see "Edge cases".                                                                                                                                                                                                     |
| `docs/user-guide/configuration.md` (line 146)      | Full defaults overview table: `mergeGate.maxRounds` value `3` → `10` (plain value column, no backticks in this table).                                                                                                                                                                                                                                     |
| `docs/user-guide/configuration.md` (line 255)      | "Block `mergeGate`" table row `` `maxRounds` ``: Default column `` `3` `` → `` `10` ``.                                                                                                                                                                                                                                                                    |
| `docs/user-guide/configuration.md` (lines 282–283) | `conflictResolution: ask` bullet: `` `mergeGate.maxRounds: 3` `` → `` `mergeGate.maxRounds: 10` `` and "up to three times" → "up to ten times". Must stay consistent with `src/tools/merge-gate.md` line 967.                                                                                                                                              |
| `docs/user-guide/configuration.md` (line 490)      | "What a project gets without configuring anything" table: `` `mergeGate.maxRounds` `` `` `3` `` → `` `10` ``.                                                                                                                                                                                                                                              |
| `test/workflow-contracts.test.mjs` (line 4021)     | Test `setup carries the mergeGate.* and delivery.mergeMethod configuration keys with their defaults`, pair list read through `defaultCell` against setup.md's block-9 table: the pair ``['mergeGate.maxRounds', '`3`']`` becomes ``['mergeGate.maxRounds', '`10`']``.                                                                                      |
| `test/workflow-contracts.test.mjs` (line 4068)     | Test `the user guide disambiguates mergeGate.* from the pre-existing delivery.prReview key`, pair list read through `defaultCell` against the user guide's ``## Block `mergeGate` `` section: the pair ``['maxRounds', '`3`']`` becomes ``['maxRounds', '`10`']``. Note the bare leaf key here — that table's first column carries no `mergeGate.` prefix. |

Verified test non-changes — every other `maxRounds` reference in `test/workflow-contracts.test.mjs`
is number-free and must stay as it is: line 3263 (comment), 3277 / 3424 / 5829
(`near(...)` on "never with a merge"), 3459 (the one-return-one-round rule, no number), 3986
(comment), 3994–3995 (`near(...)` on "bounds"), 4048 (presence-only key list for the user guide),
and 4615 (presence-only key list for the shared fragment). No other file under `test/` mentions
`maxRounds` at all, and no build guard or JSON schema carries the default.

## Implementation details

### Approach

1. Edit the six table sites (`src/tools/merge-gate.md` 503, `src/tools/setup.md` 438,
   `src/shared/config-migration.md` 104, `docs/user-guide/configuration.md` 146, 255, 490). Each is
   a one-cell change in the Default column; leave column alignment to `pnpm format`.
2. Edit the plain-substitution prose site `src/tools/setup.md` 66.
3. Edit the two per-round-consent sentences (`src/tools/merge-gate.md` 967 and
   `docs/user-guide/configuration.md` 282–283) to the target wordings above, then read them side by
   side to confirm they still state the same rule with the same number.
4. Rewrite the round-accounting sentence in `src/tools/merge-gate.md` (~1020) to the
   default-independent form. Re-read the surrounding paragraph afterwards: the preceding sentences
   establish "one Phase-4 evaluation performs at most one return, and consumes exactly one round",
   and the new sentence must still read as that rule's justification.
5. Update the two `defaultCell` pair-list entries in `test/workflow-contracts.test.mjs`.
6. Run `pnpm format` so oxfmt re-wraps the edited prose and re-aligns the touched tables, then run
   the validation sequence below.
7. Do not touch `dist/` — it is generated and gitignored.

### Edge cases

- **oxfmt reflow.** "three" → "ten" shortens a line and the round-accounting rewrite lengthens a
  paragraph; oxfmt re-wraps Markdown prose, so the diff will contain reflowed neighbouring lines
  that are not semantic changes. Run `pnpm format` before `pnpm agent:check` so the check does not
  fail on wrapping alone.
- **The shared fragment's Default column is not test-pinned for this key.** The contract tests
  assert the Default column only in `src/tools/setup.md` (block 9) and in the user guide's
  "Block `mergeGate`" section, both through the same `defaultCell` helper
  (`test/workflow-contracts.test.mjs` line 131), which reads the column named `Default` rather than
  the whole row. The third defaults test — `the shared configuration fragment documents every
merge-gate key and the legacy fallback`, around line 4599 — lists `mergeGate.maxRounds` at line
  4615 in a **presence-only** loop and deliberately omits it from its own `defaultCell` loop. So
  `src/shared/config-migration.md` line 104, and both user-guide overview tables (146, 490), carry
  the number with **no** assertion behind them and a missed edit there is silent — while the test
  file's comments speak of "the three places" agreeing. Acceptance criterion 2's repo-wide grep is
  the guard that catches it. Widening the contract tests to cover the shared fragment is adjacent
  scope and is deliberately not part of this change (recorded as a Note finding).
- **Do not edit the sibling worktrees.** `.claude/worktrees/` holds two further checkouts of this
  repository with the same files at shifted line numbers. They are separate working trees; every
  edit in this plan applies to the main checkout on `develop` only, and a repo-wide replacement
  must not reach into them.
- **New token occurrence.** The round-accounting rewrite introduces one additional
  `` `mergeGate.maxRounds` `` mention in that paragraph. Any assertion that counts occurrences of
  the token, or that matches on proximity within a character window (`near(...)` helpers exist in
  `test/workflow-contracts.test.mjs`), must be re-read after the edit rather than assumed
  unaffected. `pnpm test` is the concrete check.
- **Archived plans keep the old number.** `docs/plan/archive/` contains several plans quoting
  `prReview.maxRounds`/`mergeGate.maxRounds` with `3`. Those are historical records of decisions
  made at the time and are not rewritten.
- **Worst-case wall clock grows.** With `mergeGate.checkWaitMinutes: 20`, a run that spends its
  full budget waiting can now wait roughly 200 minutes instead of roughly 60. No document states a
  wall-clock bound derived from `maxRounds`, so no further site needs editing; the consequence is
  accepted, not overlooked (see "Assumptions and open points").

### Component structure

Not relevant — no code structure changes.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

## Acceptance criteria

- [ ] All ten source and documentation sites in "Affected files" read `10` (tables and the
      `setup.md` prose) or "ten" (the two per-round-consent sentences).
- [ ] `grep -rn "maxRounds" src docs/user-guide test build.mjs` returns **no** occurrence pairing
      `mergeGate.maxRounds` (or the bare `maxRounds` row in the user guide's block table) with the
      value `3`, and no remaining "three times" / "three rounds" / "default three" in a
      `maxRounds` context.
- [ ] `src/tools/merge-gate.md` line 967 and `docs/user-guide/configuration.md` lines 282–283 both
      name `` `mergeGate.maxRounds: 10` `` and both say "up to ten times" — verified by reading the
      two sentences side by side.
- [ ] The round-accounting paragraph in `src/tools/merge-gate.md` contains **no** numeric default:
      a search of that paragraph for `three`, `3`, or `ten` returns nothing, and its justification
      sentence holds at any configured `mergeGate.maxRounds`.
- [ ] `test/workflow-contracts.test.mjs` lines 4021 and 4068 expect ``'`10`'``, and no other
      assertion in `test/` still expects `` `3` `` for this key.
- [ ] `pnpm agent:check` exits 0.
- [ ] `pnpm test` exits 0 with no failing or newly skipped test.
- [ ] `node build.mjs` completes with no guard failure.
- [ ] `pnpm test:distribution` exits 0.
- [ ] `git status` shows modified files only under `src/`, `docs/user-guide/`, `test/`, and
      `docs/plan/`; nothing under `dist/` is staged or tracked.

## Validation plan

Run the sequence AGENTS.md prescribes for edits to distribution sources, in this order:

1. `pnpm format` — apply oxfmt to the edited Markdown and JS (writes; run before the check).
2. `pnpm agent:check` — oxfmt in CI mode, no writes. Catches wrapping and table alignment.
3. `pnpm test` — the `node:test` unit suite, including `test/workflow-contracts.test.mjs`. This is
   the check that proves the two updated `defaultCell` assertions match the edited tables, and that
   no neighbouring proximity assertion broke.
4. `node build.mjs` — build native Claude, native Codex, and portable targets into `dist/`,
   exercising the build-time guards (include resolution, version drift, next-steps coverage).
5. `pnpm test:distribution` — the isolated build/archive/delivery smoke suite.
6. Manual read-through of the three rewritten prose passages in the built portable output under
   `dist/portable/effective-flow/` to confirm the include and placeholder expansion left them
   intact.

## Assumptions and open points

- Assumption: `10` is the intended new value exactly as given; the plan does not second-guess it.
  Its accepted consequence — the worst-case wait roughly triples at the default
  `mergeGate.checkWaitMinutes: 20` — is recorded above as a known effect, not as an objection.
- Assumption: the commit for this change uses the Conventional-Commit type `feat` (changed default
  behavior for projects that never set the key), with no `!` and no `BREAKING CHANGE:` footer, per
  the versioning section of AGENTS.md. No manual version bump; release-please owns the version.
- Assumption: raising the bound is a retune of the budget only. The plan deliberately does **not**
  revisit whether `mergeGate.conflictResolution: ask` should still ask once per round now that ten
  prompts are possible — that is a behavior change, out of scope here, and the per-round rule's own
  justification (each round's conflict is a different conflict) is unaffected by the bound.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Testability, Note — the shared defaults table has no contract test.**
  `src/shared/config-migration.md` line 104 and the two user-guide overview tables (lines 146, 490)
  carry the default with no assertion behind them, while the test file's own comments describe
  "the three places" as kept in agreement. Widening `test/workflow-contracts.test.mjs` to pin those
  cells would close the gap permanently. Deliberately **not** implemented here: it is a coverage
  improvement adjacent to the requested default change, and pulling it in would widen a
  ten-site substitution into a test-design change. The gap is mitigated within this plan by
  acceptance criterion 2's repo-wide grep. Recommended as a separate follow-up.
- **Maintainability, Note — one prose site stops depending on the default.** Re-grounding the
  round-accounting argument removes one of the four places a future default change would have to
  revisit. The two per-round-consent sentences deliberately keep their numeral, so a future change
  still touches nine sites plus two assertions rather than ten plus two.
- **Scope, Note — behavior change is documented, not hidden.** The change silently moves every
  project that never set the key from three rounds to ten. The plan records this under
  "Architecture decisions" and pins the commit type to `feat` so it surfaces in the changelog
  release-please generates, which is the project's own mechanism for exactly this.
- **Error cases, Note — the worst-case wait grows.** A run that spends its full budget waiting on
  pending checks can now wait roughly 200 minutes rather than 60. No document states a derived
  wall-clock bound, so nothing else needs editing; recorded as an accepted consequence rather than
  silently absorbed.
- **Architecture, Note — no code constant exists.** The absence of any runtime or build-time
  validation of `maxRounds` is what makes this a ten-site prose substitution rather than a one-line
  change. That is a property of the current design, not a defect introduced here, and the
  affected-files table is exhaustive precisely because nothing propagates automatically.

Plan-quality judgment note: the recommended central skill `codebase-improvement` is not installed
in this environment, so the minimal generic fallback checklist from the skill-discovery contract was
applied (over-engineering, scope creep, unspoken assumptions, non-measurable acceptance criteria,
edge cases, implementation risks). No specialist owner was loaded — the relevance gate keeps a
narrow engineering change narrow.

## Open points

- No open points.

## Test results

Implemented by `effective-flow build` on 2026-08-21 in the delivery worktree on branch
`effective-flow/build/merge-gate-max-rounds-default-10` (base `origin/develop`).

Validation ran twice: once after implementation, and again after the single review correction.
Both passes were green, and the second was verified independently by `effective-flow-code-validator`
rather than by self-assessment.

| Check                    | Result                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm agent:check`       | Passed — 294 files, correct format                                                                                 |
| `pnpm test`              | Passed — 693 tests, 693 pass, 0 fail, 0 skipped, 0 todo                                                            |
| `node build.mjs`         | Passed — Claude, Codex and portable targets built; no guard failure; always-loaded core within the 700-line budget |
| `pnpm test:distribution` | Passed — `distribution-smoke: offline checks passed`                                                               |

Beyond the command results, the validator confirmed:

- All 48 `mergeGate.maxRounds` default sites across `src/`, `docs/user-guide/` and the three built
  targets read `10`. The only surviving `3` values are in `docs/plan/archive/`, which is historical
  record and deliberately untouched.
- The rewritten round-accounting prose and the per-round-consent sentence survived `include` and
  `{{…}}` placeholder expansion byte-identically into `dist/claude`, `dist/codex` and
  `dist/portable`.
- `src/shared/goal-completion.md` is unmodified — its unrelated "guideline: three" is intact.
- Nothing under `dist/` is tracked or staged.

No new unit, component or end-to-end test was written. The change adds no runtime behavior surface —
it has no code constant, and its entire enforcement is two existing contract assertions, both updated
here and both verified live by a mutation probe. No user flow was added.

The one pre-existing environment warning (`[WARN] … /Users/bs5/.npmrc EPERM`) is a sandbox permission
on the developer's home npmrc, emitted on every `pnpm` invocation and unrelated to this change.

## Review findings

**Date:** 2026-08-21
**Reviewer:** `effective-flow-generic-product-reviewer` (the `src/` distribution sources),
`effective-flow-nodejs-reviewer` (the contract tests), `effective-flow-code-validator` (the
documentation bucket and both validation passes)

Both reviewers were asked for all three severities, so this run's audit trail is complete rather than
filtered to Critical and Important.

### Summary

| Status                 | Count |
| ---------------------- | ----- |
| Fixed                  | 2     |
| Open / Not implemented | 8     |

No Critical findings. Two Notes were fixed before completion, both of them this run's own doing and
both in the rewritten round-accounting sentence:

- the `at worst halve` claim was a proportional statement that integer flooring falsified at small
  budgets, so it became `at worst halve, rounding down` — exact at every value, including
  `maxRounds: 1`, where ⌊1/2⌋ = 0;
- the clause's trailing em dash became a spaced en dash, matching the two adjacent clauses in the
  same paragraph.

The three Important findings are all **pre-existing** defects that raising the default makes
material, not defects this change introduces. Each needs either a product decision or a cross-file
reconciliation well outside a default-value change, and both reviewers judged that none blocks the
merge. They are carried forward rather than absorbed silently.

One further Note is recorded here rather than in the report, because it carries no action: the
monotonicity argument used during implementation to clear the proximity assertions was wrong on both
halves — there is one `assert.doesNotMatch(near(…))` use, and `near()` is not monotone under text
inserted _between_ a matching pair, which is exactly what the rewrite did. The conclusion survived,
but only because the reviewer re-established it empirically: every affected match span is
byte-identical before and after. The durable lesson for future prose edits inside asserted slices of
this file is to check span growth between paired tokens, not occurrence counts.

**External review report:** `.effective-flow/review/review-report-2026-08-21-plan-merge-gate-max-rounds-default-10.md`
