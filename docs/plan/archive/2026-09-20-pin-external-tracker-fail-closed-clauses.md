# Pin the external-tracker fail-closed clauses

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Planned at:** `75b4e00`, 2026-09-20; drift re-checked at `b3716ca` (after #439), all patterns still unique
**Working state:** clean; no in-scope file carries uncommitted changes

## Requirement

Review finding `R-0000123` (`.effective-flow/review/review-report-2026-09-02-unpinned-fail-closed-clause.md`,
severity Note, complexity Medium, status Open) reports that the fail-closed validation clause for
`tracker.externalStartedState` can be deleted from its source fragment with the whole suite staying
green. The clause is what stops a run from writing a guessed workflow-state transition into an
external tracker on a stale, terminal, read-only, or cross-context value, so its silent removal
would be expensive and invisible. The finding also asked whether `tracker.externalDoneState`
carries the same gap.

Analysis at HEAD `75b4e00` confirms the finding is still live, and resolves the open question about
the done state:

- **Started state — unpinned.** An exhaustive phrase search across `test/` for every distinctive
  fragment of the clause (`Readers validate`, `fresh list of writable states`, `exact configured
tracker context`, `fail closed before code`, `display-name-only`, `before every implementation
run`, `reports the current candidates`) returns zero hits. The one near-miss,
  `/A display-name match is never enough/` at `test/workflow-contracts.test.mjs:9364`, is satisfied
  by **either** of that sentence's two occurrences in `src/shared/tracker-target.md` (`:118`
  started, `:134` done), so it pins neither individually.
- **Done state — partially pinned, not uncovered.** Its _consequence_ half is asserted at
  `test/workflow-contracts.test.mjs:9348`, so deleting the whole sentence fails that test. Its
  _predicate enumeration_ (`stale, non-terminal, read-only, cross-context, not-done-category, and
display-name-only`) is not asserted anywhere — `not-done-category` has zero hits in `test/` — so
  that half can be reworded away with a green suite. The finding's "coverage unknown" therefore
  resolves to "coverage partial".
- **Two pre-existing pins in the same test are themselves weak.** `test/workflow-contracts.test.mjs:8480`
  and `:8485` each match **both** the started-state and the done-state bullet, because the two
  bullets share those sentences verbatim. Deleting the started bullet's copy leaves both green.
  This was not part of the finding; it was discovered while verifying it, and is repaired here by
  the decision recorded under "Architecture decisions".

The goal is to close all of these gaps by extending and repairing the two existing contract tests,
with no change to any shipped source fragment.

## Architecture decisions

- **Pin all three surfaces, not just one.** The finding asked to "pin whichever copy is
  authoritative rather than both". That framing does not hold: the two copies are not duplicates but
  the same rule stated at different altitudes, and both are genuinely loaded on the external path.
  `src/shared/config-migration-edge-cases.md` is the _configuration-contract_ view, reached through
  the `lazy-include` at `src/shared/config-migration.md:41-44` whose pointer ships eagerly in
  **19** tool sources; `src/shared/tracker-target.md` is the _execution_ view, loaded whenever the
  resolved target is `external`. Neither is dead prose, so pinning only one leaves the other
  reworded-away-able. `src/tools/setup.md` is the third surface, because it is where a value is
  first written.
- **Extend the two existing tests; add no new ones.** The tests at
  `test/workflow-contracts.test.mjs:8473` and `:9332` already load exactly these three surfaces into
  `migration`, `tracker`, and `setup` locals. The missing assertions belong inside them, where the
  started/done symmetry stays readable. A third test would fragment one contract across three places.
- **Repair the two weak pre-existing pins in the same change** (`:8480`, `:8485`). They are the same
  defect class as the finding, they sit in the lines this change already edits, and the repair is the
  same technique — a longer, bullet-unique anchor. Leaving a known-weak guard beside a newly
  strengthened one would be the worse outcome. The repair is recorded here rather than made silently,
  because `AGENTS.md` is explicit that a neighbouring guard is never touched opportunistically.
- **Carry the verified regex literals in the plan.** This plan deliberately contains more literal
  text than an Effective Flow plan usually does, under the "shortest clear form to make a point
  unambiguous" exception. The reason is evidence, not preference: the first draft of this plan
  described one pin in prose as "pin `aborts before code` explicitly", and that phrase matches
  **twice** in `tracker-target.md` and is already covered at `:8495` — an executor following the
  prose would have shipped a pin that stays green after the target sentence is deleted. Every regex
  below was executed against the real files and confirmed to match exactly once, in the intended
  bullet.
- **Test-only change.** The clauses themselves are correct as written and are not touched. This also
  sidesteps the build budget entirely: `setup` (1723/1723) and `apply-issues` (1191/1191) sit at
  **zero** headroom in `CONTEXT_BUDGET_LINES`, so adding even one line to
  `src/shared/config-migration.md` would break the build. Nothing here adds a source line.
- **Pin predicate and consequence separately.** Each clause has halves that fail independently; a
  single regex spanning both would go green again if either half were reworded into the other.

## Affected files

| File                                                                             | Description                                                                                                                                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/workflow-contracts.test.mjs`                                               | Extend the test at `:8473` with the started-state assertions and repair its two weak pins; extend the test at `:9332` with the done-state enumeration assertion |
| `.effective-flow/review/review-report-2026-09-02-unpinned-fail-closed-clause.md` | Set finding `R-0000123` **Status** from `Open` to the resolved value once the fix lands (runtime state, gitignored — not part of the commit)                    |

No file under `src/` changes.

## Implementation details

### Approach

All assertions below are added to existing tests, against the `migration` / `tracker` / `setup`
locals those tests already define. Each pattern is quoted verbatim from the verification run; use it
as written rather than reconstructing it.

1. **In `test('external started-state configuration is tracker-verified and only setup persists suggestions')` at `test/workflow-contracts.test.mjs:8473`**, add the two missing `migration` halves:
   - predicate: `/Readers validate a non-null value against a fresh list of writable states in the exact configured tracker context before every implementation run/`
   - consequence: `/stale, terminal, read-only, cross-context, and display-name-only matches fail closed before code/`
2. In the same test, add the three missing `tracker` assertions:
   - predicate: ``/it must be writable, non-terminal, and normalized as `started`/``
   - the started bullet's display-name sentence, which needs the spanning form because the bare sentence occurs twice: ``/normalized as `started`\. A display-name match is never enough/``
   - consequence: `/A stale, cross-context, terminal, read-only, or missing value aborts before code and reports the current candidates/` — **the full sentence, never the bare phrase `aborts before code`**, which matches twice and is already covered at `:8495`.
3. In the same test, add the missing `setup` assertion: ``/Validate an existing value by stable value, context, normalized `started` category, writability, and non-terminal state/``
4. **Repair the two weak pins in that same test.** Replace, do not add:
   - `:8480` becomes ``/stable state ID, or its exact accepted token only when that connection exposes no ID\. Missing or `null` means unset and never authorizes a guessed transition/`` — the backward anchor is what separates the started bullet (`stable state ID`) from the done bullet (`stable terminal state ID`).
   - `:8485` becomes ``/Only `\{\{SKILL:setup\}\}` writes a confirmed tracker-verified suggestion\. The fixed post-merge observation grace period has no configuration key/`` — forward anchor, since the sentence itself is shared.
5. **In `test('external done-state configuration mirrors the started state and never aborts a merged run')` at `test/workflow-contracts.test.mjs:9332`**, add the one missing half, placed immediately before the existing consequence assertion at `:9348` so the sentence reads in source order: `/stale, non-terminal, read-only, cross-context, not-done-category, and display-name-only matches/`
6. Add a short comment above the new started-state block, in the style of the existing comment at `test/workflow-contracts.test.mjs:9356-9359`, recording _why_ the clause is pinned: mutation testing showed it deletable with a green suite, and its silent removal would let a run write a guessed transition into a live tracker.
7. Run `pnpm format` before the checks — hand-written multi-line `assert.match(` calls will otherwise fail `pnpm agent:check` (`oxfmt --check`).

### Regex construction

These four rules are what the verification run established; each has a confirmed failure behind it.

- **Backticks survive `prose()`.** `prose()` is `flat(text).replace(/\*+/g,'')` — it strips asterisks only. A pattern for a sentence containing `` `started` `` **must keep the backticks**; dropping them yields **zero** matches for both the `tracker` and the `setup` assertion. This is the most likely silent failure in this change.
- **Never shorten the anchors.** The two bullets share long verbatim prefixes. `/terminal, read-only, cross-context/` matches **both** bullets; `/Readers validate … in the exact configured tracker context before/` matches **both**. Only the final words (`and display-name-only`, `every implementation run`) disambiguate. Trimming a pattern "to the shortest distinctive span" reintroduces exactly the wrong-bullet failure this change exists to prevent.
- **Do not copy the done-state pattern and swap a word.** `src/tools/setup.md:441` carries a done twin of the started sentence with a **different field order** (`terminal flag, and writability` versus `writability, and non-terminal state`). A word-swapped copy does not match.
- Write every pattern against the `prose()`-normalized text: no newlines, no `**`, and escape `.` in key names and sentence boundaries.

### Verification of the pin itself

A coverage pin is only worth what its mutation proves, so confirm each new assertion actually fails
when its clause is gone, rather than trusting that it matches:

1. Snapshot the source fragment with `cp` before mutating it — never `git checkout --` to restore, which would discard uncommitted work under validation.
2. Delete the target **sentence** (not the cited line range, which spans sentence boundaries) from the fragment, run `pnpm test`, and confirm the extended test **fails**.
3. Restore the fragment from the `cp` snapshot and confirm the suite is green again.
4. Repeat per clause: started predicate, started consequence, started display-name, tracker consequence, setup validation, done enumeration.

**Expect two assertions to stay green during step 2 and do not read that as a broken pin:** the
repaired `:8480` and `:8485` are anchored to the started bullet, so a mutation of the _done_ bullet
leaves them matching by design. Mutating the started bullet is what must turn them red.

## Acceptance criteria

Each criterion names the sentence whose deletion must turn `pnpm test` red:

- `Readers validate a non-null value … before every implementation run` in `src/shared/config-migration-edge-cases.md`.
- `stale, terminal, read-only, cross-context, and display-name-only matches fail closed before code` in the same file.
- `A stale, cross-context, terminal, read-only, or missing value aborts before code and reports the current candidates` in `src/shared/tracker-target.md`.
- ``it must be writable, non-terminal, and normalized as `started` `` in the same file.
- ``Validate an existing value by stable value, context, normalized `started` category, writability, and non-terminal state`` in `src/tools/setup.md`.
- `stale, non-terminal, read-only, cross-context, not-done-category, and display-name-only matches` in `src/shared/config-migration-edge-cases.md`.
- After repair, deleting the **started** bullet alone turns the assertions at `:8480` and `:8485` red — today it does not.
- Every new and repaired pattern matches exactly **once** in its normalized file, verifiable with a global-regex match count.
- With all fragments intact, the CI sequence passes unchanged: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `node build.mjs` reports no `CONTEXT_BUDGET_LINES` change, because no `src/` file was touched.
- No file under `src/` and no entry in `build.mjs` is modified.

## Stop conditions

- **Stop if any in-scope file changed since `75b4e00`.** Every regex here was verified against that
  exact revision. Re-run the match-count check before editing; a reworded clause invalidates the
  pattern, not the intent.
- **Stop if a pattern matches zero or more than one time.** That is a reworded or newly duplicated
  clause, and the correct response is to re-derive the anchor, never to loosen the pattern until it
  matches.
- **Stop if closing a gap appears to require editing a file under `src/`.** The clauses are correct
  as written; this change pins them. Editing `src/shared/config-migration.md` additionally breaks the
  build outright at zero headroom.
- **Stop if the suite is already red before the first edit** — results could not be attributed to
  this work.

## Plan review

### 2026-09-20 — initial review (`effective-flow plan`)

- **Scope:** Tight and test-only. No source fragment is edited, so the change cannot alter shipped behavior, and the zero-headroom budget entries for `setup` and `apply-issues` are untouched.
- **Evidence vs. assumption:** The gap is verified by exhaustive phrase search over `test/` at HEAD `75b4e00`, including the near-miss at `:9364` that a shallower check would have mistaken for coverage.
- **Acceptance criteria:** Measurable and falsifiable — each is a named sentence whose deletion must turn the suite red.
- **Risk:** Low. The realistic failure mode is a regex matching the wrong bullet.

### 2026-09-20 — deep review (`effective-flow review`)

**Result:** Approved

Judgment by `effective-delivery` (route: Codebase Audit and Plans, mode "Review plan"), with all
factual claims re-verified adversarially against the working tree.

| Area            | Assessment                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture    | Sound. The "two live copies at different altitudes" reading was re-confirmed through the include graph; the decision to pin all three surfaces follows from it.           |
| Security        | Not applicable directly, but the clause guarded is a fail-closed boundary on writes to an external tracker — the reason a silent removal is costly. No secrets involved.  |
| Data protection | Not applicable. No personal data, no new data flow.                                                                                                                       |
| Error cases     | Improved this pass. Stop conditions added; the mutation procedure now names sentence boundaries rather than line ranges, and warns which assertions stay green by design. |
| Testability     | The plan's whole subject. Every criterion is a mutation whose result is observable via `pnpm test`.                                                                       |
| Scope           | Held. One deliberate widening (the two weak pins) was decided explicitly; two adjacent gaps stay out of scope and are recorded below.                                     |
| Maintainability | Good. The pins are anchored so a future reword fails loudly rather than silently passing.                                                                                 |

Findings incorporated this pass:

- **Critical — corrected.** Step 2 previously instructed "pin `aborts before code` explicitly". That phrase matches **twice** in `src/shared/tracker-target.md` and is already satisfied by the existing assertion at `:8495`, so the instruction would have produced a tautological pin that survives deletion of the very sentence it was meant to protect. Replaced with the verified full-sentence pattern.
- **Important — added.** Backticks survive `prose()`; two of the six patterns return zero matches without them. The plan previously warned only about `**` and `.`.
- **Important — added.** The started bullet's `A display-name match is never enough` was in the plan's stated scope but had no pin; the bare sentence occurs twice, so the verified spanning form is now specified.
- **Important — decided.** The two pre-existing non-unique pins at `:8480` and `:8485` are repaired in this change, with verified bullet-unique anchors.
- **Note — corrected.** "twelve tools" → **19** eager `config-migration` includes under `src/tools/`.
- **Note — corrected.** The comment-style reference `:9353-9356` pointed at assertions, not a comment; the comment block is `:9356-9359`.
- **Note — corrected.** Acceptance criteria said "the sentence at `<line range>`" where the ranges span two or three sentences; each criterion now names its sentence.
- **Note — added.** `pnpm format` before the checks, and the drift/working-state header required by the plan contract.

Verified and unchanged: the zero-headroom budget figures, the "no test asserts these sentences"
claim, all remaining line citations, and that `prose()` rather than raw `source()` is the correct
helper here (none of the target sentences carries load-bearing emphasis).

## Assumptions and open points

These are deliberate scope exclusions and standing constraints, not decisions this plan is
waiting on. The review of 2026-09-20 confirmed none of them affects the behavior, scope, or risk
of the implementation below.

- **`src/tools/apply-issues.md:315` carries its own untested fail-closed sentence** ("A missing, stale, ambiguous, non-writable, or unconfirmable external state stops this item before code") in an always-loaded tool core. Deliberately out of scope: it is a use-site restatement rather than the rule. Non-blocking — raise as its own finding if it should be pinned. Re-entry: `effective-flow review` over `src/tools/apply-issues.md`.
- **The user guide mirrors these clauses** at `docs/user-guide/configuration.md:530-531,549,563,575` and `docs/user-guide/remote-tracker.md:227-237`. The done-state test already pins one guide table cell at `:9441-9445`; extending that to the started state is not part of this plan. Out of scope for this plan.
- **The started/done asymmetry in the clause text is deliberate and stays.** `src/shared/tracker-target.md:137-151` argues that the done state must not abort a run whose merge already succeeded. This plan pins that asymmetry rather than removing it; the two tests must not later be refactored into a shared helper that would flatten it. A standing constraint on future edits.

## Open points

- No open points.
