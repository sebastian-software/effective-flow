# Merge-gate: deferring tool-local sections

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`/effective-flow refactor`)

## Requirement

`src/tools/merge-gate.md` is still the largest tool in the repository by a wide margin. It measures
**2342 source lines** and an always-loaded core of **3147 lines** against a ratchet of 3219 — about
**1.93×** the next largest tool (`iterate`, 1627) and roughly **15.9 %** of the whole tool corpus
(19833 resolved lines across 28 tools). Every other tool fell during the deferral work of
2026-09-01/02; this one did not.

This is the **second** slimming round. The first
([archive/2026-08-12-merge-gate-context-and-source-slimming.md](archive/2026-08-12-merge-gate-context-and-source-slimming.md))
is implemented and took the core 4744 → 3160 and the source 2626 → 2341 by compressing prose,
dissolving `## Edge cases`, and deferring `worktree-integration` and `language-rules`. This plan
does not repeat any of that and must not undo it.

The goal is the same as round one's and is restated because it governs every decision below: the
file gets shorter **without losing any functionality** — no rule, no guard, and no
anti-simplification argument may be dropped.

### Verified baseline

All figures measured on `origin/develop` at `364f4d0` (2026-09-02), re-measured on the
revision run. The figures moved by one line since `368b7ff`; the shape did not.

| Measure                                           |           Value |
| ------------------------------------------------- | --------------: |
| `src/tools/merge-gate.md`                         |            2342 |
| Eager fences (9)                                  | 27 source lines |
| Eager fragments, fully expanded                   |             893 |
| **Always-loaded core, as `build.mjs` reports it** |        **3147** |
| Current ratchet on `develop`                      |            3219 |

Source composition, read section by section: **≈ 59 % normative mechanics, ≈ 33 % rationale,
≈ 7 % restatement**. Round one measured the pre-slim file at ≈ 39 / 44 / 17 and reported that its
own compression yielded 310 safe lines against a planned 412 "because the remainder was rule
content rather than repetition". **This round must not budget for a second harvest of
restatement** — that surplus is spent.

### Two corrections to the review finding this plan implements

Finding F-15 named four hypotheses. Two survive measurement, one is largely wrong, and stating
that here keeps the implementing run from chasing it:

- **Wrong:** "`## effective-delivery stays out of this run` spends 89 always-loaded lines
  explaining why a skill is not loaded." The section is 89 lines, but 39 are the eleven
  include/lazy-include fences plus blank separators, and 20 (L62–81) scope the delegation mandate
  and carry a security-relevant carve-out naming the reasoning that must stay in-run. The actual
  exclusion prose is **16 lines**, four of which are pinned verbatim by
  `test/workflow-contracts.test.mjs:4862`, and round one already compressed it. **Out of scope.**
- **Understated:** "a large block of contract prose runs before Phase 0." It is lines 1–882 —
  **37.7 % of the source and ≈ 55 % of the resolved core.** But it is not one thing, and only the
  individually decidable parts of it are in scope below.

## Architecture decisions

- **Reverse round one's "nothing moves into a fragment", explicitly.** That plan recorded as an
  architecture decision: _"Every compressed passage keeps its claim and its key terms; only its
  length is reduced. Nothing moves into a fragment, an ADR, or the archive."_ Every candidate worth
  more than 50 lines is an extraction, so round one's ceiling under that rule is ~100 lines of
  further compression — which would leave F-15 materially unaddressed. The decision is reversed for
  this round because the fragment mechanism has since been proven on exactly this shape:
  `issue-post-merge-observation` and `pr-merge-completion` are already single-consumer merge-gate
  fragments, and `docs/developer-guide/build-system.md` records both as legitimate deferred halves.
  Round one's freeze on specific sections was itself scoped — _"This pass does not touch them … a
  scope decision rather than a claim that these passages are incompressible"_ — so it does not bind
  this round. This plan is the pass that says so.
- **A deferred section's entry condition stays inline.** The trigger of a `lazy-include` must be
  decidable from text that remains loaded. This is not a style preference: a defect on
  2026-09-02 (fixed in `4947737`) deferred a literal that its own trigger condition depended on,
  making the trigger undecidable and the fragment silently unreachable, and the locator then read
  the wrong project configuration without reporting it. Every extraction below is checked against
  that failure mode individually, and two candidates are rejected because they fail it.
- **No fragment currently eager becomes lazy, and no new eager include is added.** All nine eager
  fragments are first needed in Phase 0, Phase 1, or run-wide, so none passes the admission test in
  `build-system.md` ("only when it serves one nameable decision point"). The fragment-side seam is
  exhausted; this round's savings come from tool-local text only. In particular
  `execution-location` is **not** re-added as a compensating eager include, and
  `delegation-mandate` stays eager — a lazy pointer would let the host default it corrects skip the
  pointer's own trigger.
- **Extraction is not test-neutral.** No merge-gate test resolves eager includes; all 82 read the
  raw source. Text moved into a fragment therefore leaves the subject of every whole-file assertion
  and every `section()` slice covering it. Each work package below owns its own test repointing.
- **A workflow phase may be deferred, not only a contract.** WP1 extracts a procedural step, where
  the two existing single-consumer fragments extract contracts. The difference is real — the run is
  stepping through Phase 0→6 and will read a pointer mid-execution — and it is accepted for two
  reasons: Phase 5.5 runs only after an already-successful merge and is explicitly allowed to
  degrade, and its entry gate stays inline, so the decision to enter the phase is taken from loaded
  text and only the steps behind that decision are fetched. This is the first phase-shaped
  extraction in the repository; record it in `build-system.md` as such, so the next one is a
  precedent rather than a rediscovery.
- **The behavioural eval layer is a prerequisite, not a parallel track.** See the Approach.
- **The target is derived, not preset.** Round one set a line target up front and its `## Outcome`
  had to correct two figures as metric artefacts. This plan states per-package measured savings and
  derives the acceptance figure from what the packages actually deliver, measured the way
  `build.mjs` measures it — never from source-side arithmetic, which differs by ~60 lines.

## Affected files

| File                                           | Description                                                                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`                      | Sections extracted to fragments and rationale compressed; every entry gate retained inline                                                                                                                     |
| `src/shared/merge-gate-issue-observation.md`   | New. Phase 5.5 steps 1–7 and its `ask` fence (WP1)                                                                                                                                                             |
| `src/shared/merge-gate-conflict-resolution.md` | New. Conflict-resolution delegation contract and its resolution step (WP2)                                                                                                                                     |
| `src/shared/merge-gate-checkout-boundary.md`   | New. Checkout inapplicability list, reached through the existing `worktree-integration` trigger (WP3)                                                                                                          |
| `test/workflow-contracts.test.mjs`             | 15 known repointings — 11 Phase 5.5 slices (WP1), 3 conflict slices (WP2), 1 literal (WP3) — plus three new entries in the lazy-trigger battery, one per new fragment, so WP3's is pinned like WP1's and WP2's |
| `build.mjs`                                    | `CONTEXT_BUDGET_LINES` entry for `merge-gate` lowered to the achieved size plus its existing headroom                                                                                                          |
| `docs/developer-guide/build-system.md`         | The three new single-consumer fragments recorded beside the existing ones                                                                                                                                      |

## Implementation details

### Prerequisite: the behavioural eval layer — delivered, with a named residual

**This prerequisite is satisfied.** `evals/merge-gate/` landed in #399 (`364f4d0`) and the work
packages may start. What follows records what it covers, because the coverage is partial in a way
that matters to this plan specifically.

The reason is specific rather than general. All 671 assertions that guard this file check its
**text**; not one exercises a gate run. A restructure can therefore move a fail-closed rule into a
place the run never reaches and every test still passes, because the wording is still present
somewhere. That is not hypothetical: it is exactly what happened on 2026-09-02, where content
preservation was provably complete and the rule was still unreachable. `merge-gate` is the
security-densest file in the repository — the human-comment guard, the write boundary, the
round bound, and ten merge preconditions all fail closed — so it is the worst candidate for a
text-only safety net.

**What #399 delivers.** A sandboxed stub forge, a fresh agent handed a prompt that states no
expectation, and assertions evaluated over **every** archived run rather than one, so a scenario
that passes intermittently fails. Two scenarios: `guard-blocks-merge`, where the human-comment
guard is active and the run is observed to refuse — no `pr-merge` requested — and `merge-proceeds`
as the positive control. A merge that should be blocked is therefore observed to be blocked, which
is the sentence this prerequisite was written around.

**The residual, stated because it is specific to this plan.** The covered refusal is merge
precondition **4**, reached in Phase 1. None of the three extraction packages touches it:

| Package | Extracts                                 | Covered by an eval today |
| ------- | ---------------------------------------- | ------------------------ |
| WP1     | Phase 5.5 (post-merge issue observation) | no                       |
| WP2     | Conflict-resolution contract             | no                       |
| WP3     | Checkout inapplicability list            | no                       |

So the harness exists and is sound, while the seams this round actually cuts are still guarded by
text assertions alone. That is a materially better position than the one the deep review objected
to — the harness was the hard part, and a second scenario is now incremental — but it is not the
same as coverage over the changed regions.

**How the round proceeds under that residual.** WP1 is the package that carries the premise and the
most lines, and it is the one whose region has no behavioural cover. Before WP1 is delivered, add
one scenario exercising a refusal the extraction could plausibly break, or state in the pull-request
body why the retained entry gate makes that unnecessary for the region actually moved. WP2 and WP3
inherit the same rule. This replaces the blanket stop with a per-package obligation, which is what
the delivered harness makes possible: writing a scenario is now incremental work rather than
building the mechanism.

### Approach

Four work packages, each independently shippable and each ending green. Take them in the order
**WP3 → WP2 → WP1 → WP4**, which is **not** the order they are written in below; the sections keep
their numbers so every reference to them stays stable.

The order is by **behavioural coverability**, decided in the 2026-09-02 deep review. WP3 is the
smallest extraction and reuses an existing trigger, so it validates the fragment mechanism at the
lowest cost; WP2 follows and can carry a conflict scenario of its own; WP1 comes last because its
region cannot be reached by any eval the delivered harness can express (see the prerequisite
section), so running it first would force the argued-gap escape hatch on the package that most needs
cover. WP4 is compression only and can be dropped without affecting the others.

This reverses the earlier rationale — "WP1 carries the most lines and the most test churn, so it
validates the approach" — which ordered by line count rather than by risk. The consequence is
accepted deliberately: the bulk of the saving now lands last, and WP1's 200-line floor no longer
serves as the round's early premise check. **WP3 takes over that role**: if the fragment mechanism
does not hold on the cheapest extraction, the round is reconsidered there rather than after the
largest one.

### WP1 — Defer the Phase 5.5 body (≈ 295 lines)

`### Phase 5.5: Observe linked issues after merge` is 302 source lines, the largest section in the
file, for a phase that runs **after** an already-successful merge and is explicitly allowed to
degrade.

Move steps 1–7 and the `ask` fence into `src/shared/merge-gate-issue-observation.md`. Reuse the
`when:` clause the existing `issue-post-merge-observation` pointer already carries.

**Retain inline: the heading, the entry gate, and the missing-receipt rule.** The entry condition
is stated in three places, and the third sits _inside_ the candidate region — if the whole section
moves, the run would decide whether it may enter Phase 5.5 using text it has not loaded. That is
the circularity class named in the architecture decisions. With the entry gate retained the trigger
is decidable from Phase 0's two statements plus the retained gate.

Eleven `section()` slices name this heading. A retained stub keeps them non-empty but
content-free, so they fail loudly rather than passing vacuously — the correct direction, and all
eleven are repointed as part of this package.

### WP2 — Defer the conflict-resolution contract (≈ 130 lines)

`## Conflict-resolution delegation contract` (96) plus `#### Resolving a conflict with the base`
(46). The branch is announced from retained text at Phase 2 step 1, and the condition itself is
observed from git rather than from the deferred text, so the trigger is decidable.

**Three things must not travel with it**, each for a stated reason:

1. The `mergeGate.conflictResolution` fail-closed rule in `## Configuration` — an unreadable value
   resolves to `off`, not to the documented `auto`. Deferring it would require resolving the mode
   in order to decide whether to load the text explaining how to resolve the mode. Round one
   already broke and restored this exact rule.
2. The `pre-commit-gate` stand-in in `## Git write boundary` — a security-relevant precondition on
   a write, which must be present before the run acts.
3. The untrusted-head-branch threat model — deferring it makes the exposure readable only from
   inside the branch that creates it, which is the "discovery" the passage exists to prevent. Keep
   it inline, or keep a one-line inline statement of the default and the exposure.

Three `section()` slices to repoint. The `ask` fence travels without issue; five shared fragments
already carry one.

### The eval build stamp is a per-package cost

Discovered while implementing WP3, and it governs every package rather than that one.

`test/merge-gate-eval.test.mjs` binds each archived eval run to a content digest of the built
skill. **Any** edit to `src/tools/merge-gate.md` invalidates all ten archived runs at once, and the
assertion sits inside `pnpm test`, so the suite goes red on a change that is otherwise entirely
correct. That is deliberate — the test states that a content digest cannot tell a reworded comment
from a changed rule — and the only resolution is to re-run the round.

The cost, from `evals/merge-gate/README.md`: about five minutes per run, **five runs per scenario,
non-negotiable**, two scenarios — roughly **one hour** per round. Where the suite must be shortened
the scenario count gives way, never the five-of-five bar, and `merge-proceeds` is the one scenario
that never gives way.

So each of WP3, WP2 and WP1 either carries its own hour or the round batches the source changes and
pays it once. This plan does not decide that: it records the cost, which was not known when the
packages were scoped, and the acceptance criteria are adjusted so the per-commit bar is one a
package can actually meet.

### WP3 — Defer the checkout inapplicability list (≈ 22 lines)

`## Checkout provisioning boundary` lines 160–181 are only meaningful once a checkout has been
provisioned — the same trigger the existing `worktree-integration` pointer already carries, so no
new trigger is needed. Retain the pointer preamble and round one's "do not re-add
`execution-location`" reasoning.

**Destination:** a new single-consumer fragment `src/shared/merge-gate-checkout-boundary.md`,
following WP1 and WP2. Deliberately **not** `src/shared/worktree-integration.md`: that fragment has
several consumers, and this text is merge-gate-local, so moving it there would carry one tool's
inapplicability list to every other consumer. Reusing the existing trigger decides **when** the
pointer fires, never **where** the text lives. `src/tools/merge-gate.md` is the fragment's only
consumer; record it in `docs/developer-guide/build-system.md` beside the other two.

One test literal (`/no deferred pointer to `plan-archival`/`) sits in this range and moves with it,
repointed to the new fragment like the 14 other repointings in `test/workflow-contracts.test.mjs`.

### WP4 — Compress `## Delegation contract` rationale in place (≈ 45 lines, optional)

Round one put this section out of scope: it is 75 % new and carries the densest test coupling in
the repository. Do **not** extract it — retained text depends on vocabulary it defines (the durable
keys read by Phase 4 conditions 6/7/10, the confirmation, the wisdom record and `## Rules`), and
the mandate precedent argues the message grammar must be known before a delegation is planned, not
discovered while writing one.

Only the rationale passages no other section reads are in scope, as **compression in place**. Drop
this package entirely if it threatens any `near` window.

### Rejected candidates, with reasons

Recorded so a later pass does not re-derive them:

- **`## Unconfigured automatic-reviewer advisory` (52 lines).** Its trigger fires in Phase 1 of
  _every_ run, which is the case `build-system.md` names explicitly: deferring would move the
  measured number without saving anything real. Same reasoning that withdrew `review-bot-state` in
  round one.
- **`## Returned outcome record` (123 lines).** Genuinely undecidable. The section names two
  gate-internal writers that have **no delegation at all** — an empty-bodied review, and a finding
  assessed under an active human-comment guard, in a phase that delegates nothing. A
  delegation-shaped trigger never fires on those paths, yet the gate still writes an outcome from
  the closed vocabulary this section defines and Phase 4 condition 10 still reads it.
- **`## Wisdom accumulation` and `## Rules`.** Not deferrable (wisdom's trigger is "at the start"),
  and round one already harvested their repetition.

### Edge cases

- `## Wisdom accumulation` must stay **after** the `runtime-state-safety` pointer in source order;
  `findRuntimeStateSafetyViolations` walks includes in order and fails the build on a
  `.effective-flow/` mutation not preceded by the guard. Any new fragment carrying such a write is
  subject to the same ordering.
- A `near(a, b, span)` window fails from either direction: compression can push a term out of a
  window as easily as a deletion can remove one. Round one's rule stands — a failure there is a
  signal to restore the text, never to widen the test.
- `boundedSlice()` requires its stop marker. A missing stop makes the slice silently widen and every
  assertion below it goes vacuous while reporting success. Round one froze two prose bounds for this
  reason; both survive this plan.
- Phase 4 must keep at least ten numbered conditions; `mergeCondition()` selects by ordinal.
- No sliced heading may be renamed; `section()` asserts heading existence with a hard failure.

## Acceptance criteria

- [x] **The behavioural eval layer exists.** `evals/merge-gate/` (#399, `364f4d0`) exercises a gate
      run against merge precondition 4 and observes the refusal, over every archived run.
- [x] **Per package, the changed region is behaviourally covered or the gap is argued.** Before each
      of WP1–WP3 is delivered, either a scenario exercises an outcome its extraction could break —
      a refusal, or for a post-merge region the observation outcome itself — or the pull-request body
      states why the retained entry gate makes that unnecessary for the region actually moved.
      Naming precondition 4 does not discharge this for a package that moves Phase 5.5, the conflict
      contract, or the checkout list — none of which precondition 4 reaches.
- [x] **WP1 is delivered last, and not before its region is reachable or the stub question is
      answered.** No eval the delivered harness can express reaches Phase 5.5: the static fixture
      keeps reporting an open pull request after the merge, so the fresh read Phase 5.5 requires as
      proof of the merge never confirms it, and the scenario itself records that a state-carrying
      stub is what would change this. WP1 therefore runs after WP3 and WP2, and its pull-request body
      states which of the two happened — a state-carrying stub now exists and the region is covered,
      or it does not and the gap is argued against the region actually moved.
- [x] The always-loaded core of `merge-gate`, as the `Always-loaded core (lines/budget)` line of
      `node build.mjs` reports it, is lower than 3147, and the pull-request body states **per
      package** its estimate from this plan, its measured saving, and the deviation between them.
      Source-side arithmetic is not an acceptable measurement.
- [x] **The criterion above is falsifiable, not self-adjusting.** A package whose measured saving
      falls short of its estimate by more than 25 % stops the round for a reported decision rather
      than silently lowering the bar: round one delivered 310 lines against a planned 412 because
      the remainder turned out to be rule content, and that is exactly the discovery this stop is
      meant to surface while the round can still be re-scoped. WP1 alone must deliver at least
      200 lines, or the extraction-over-compression premise of this plan did not hold and the round
      is reconsidered rather than continued.
- [x] `build.mjs`'s `CONTEXT_BUDGET_LINES` entry for `merge-gate` is lowered to the achieved size
      plus its existing headroom, so no removed line is re-admitted.
- [x] Every new `lazy-include` has a `when:` clause whose condition is **decidable from text that
      remains loaded**, and each is pinned by trigger token in the battery at
      `test/workflow-contracts.test.mjs:1270`.
- [x] For each extraction, the retained entry gate is named in the pull-request body together with
      the reason it could not travel.
- [x] Every one of the nine currently eager fragments is still eager, `issue-lifecycle` keeps its
      literal eager fence, `delegation-mandate` is not lazy, and `execution-location` is not added.
- [x] `## Edge cases` is not recreated.
- [x] Every deleted or moved source line is mapped, in the commit message or the pull-request body,
      to the surviving statement of the same rule.
- [x] Every fail-closed rule WP2 lists under "Three things must not travel with it" is still in the
      always-loaded core, verified by an explicit grep listed in the pull-request body: the
      `mergeGate.conflictResolution` unreadable-value-resolves-to-`off` rule in `## Configuration`,
      the `pre-commit-gate` stand-in in `## Git write boundary`, and the untrusted-head-branch threat
      model. Those three are the enumeration; there is no separate list elsewhere.
- [x] `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` pass after **every** commit,
      and `pnpm test` passes except for the merge-gate eval build-stamp assertions, which any edit to
      `src/tools/merge-gate.md` invalidates by design (see "The eval build stamp is a per-package
      cost"). `node --test test/workflow-contracts.test.mjs` must be **fully** green after every
      commit — that is the suite this round can actually keep green, and a failure there is a real
      one.
- [x] **The eval round is re-run and the stamps rebound before the round is called finished**, and
      the pull-request body of whichever package carries that re-run names the ten runs and their
      outcomes. Which package carries it is the round's own scheduling decision, recorded when it is
      taken; what is not optional is that no package merges while a stamp still describes a build
      nobody holds.
- [ ] Each adapted assertion is listed with the reason it pins wording rather than behavior.
      **Partly discharged, deliberately left open.** The three pull-request bodies list every
      repointed slice and why its subject moved — including the two that had to change from
      `section()` to `boundedSlice` and the one that had to be split across the seam — but they
      argue the repointing rather than the wording-versus-behaviour question this criterion
      asks. Ticking it on that evidence is exactly the self-adjusting move the criterion four
      rows above forbids.

## Validation plan

- Run the four repository checks after every commit, in the order `AGENTS.md` prescribes.
- Prove behaviour invariance from the **built** output, not the source: for each extracted section,
  show that every consumer still reaches it — inline or through a pointer the build's lazy closure
  actually ships — in all three targets.
- Adversarially verify each new trigger: remove the pointer, confirm the fragment is unshipped and
  that a test now fails, then restore. The closure test covers `src/shared/*.md` since `368b7ff`.
- Confirm no unresolved placeholder and no raw `include` fence reaches `dist/`.
- Diff the built `dist/` tree against a build of the parent commit and account for every changed
  file.

## Assumptions and open points

- Assumption: the ~60-line gap between source arithmetic and the build-side figure is the metric
  artefact round one recorded, not a new discrepancy. The acceptance criteria avoid depending on it
  by measuring only the build-side number.
- Assumption: WP1's retained entry gate is sufficient for decidability. This is reasoned, not
  executed — the implementing run must re-verify it against the text it actually leaves behind.
- Resolved: the deep review made the eval layer a blocking prerequisite; it landed in #399 and the
  block is lifted. What remains of it is a **coverage limitation**, not a dependency: the delivered
  scenarios reach merge precondition 4, which no work package touches. Acceptance criterion 2 carries
  the obligation that follows, per package.
- Limitation: **WP1's region cannot be reached by any eval this harness can express.** The static
  fixture reports the pull request as open after the merge, so Phase 5.5's own merge proof never
  succeeds and the phase is never entered; `evals/merge-gate/scenarios/merge-proceeds.md` names a
  state-carrying stub as what would change that. This is handled by ordering rather than by a stop —
  WP1 runs last — and its acceptance criterion requires the implementing run to state which of the
  two applies by then. It is therefore a documented condition on WP1, not an unanswered question
  blocking the round.
- Assumption: extracting a workflow **phase** behaves like extracting a contract, given the entry
  gate stays inline. Decided in the deep review and recorded as an architecture decision; it is the
  first phase-shaped extraction here. WP1 keeps its 200-line floor, but after the reordering it is no
  longer the round's early premise check — WP3 is, being the cheapest extraction of the same
  mechanism.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Architecture, Important — reversing a recorded decision.** The plan reverses round one's
  "nothing moves into a fragment". Incorporated: the reversal is stated as an explicit architecture
  decision with its grounds (the mechanism is now proven on two single-consumer merge-gate
  fragments, and round one's freeze was scoped to that pass), rather than performed silently.
- **Security, Important — deferring a guard would weaken a write boundary.** Three fail-closed
  rules sit adjacent to WP2's candidate region. Incorporated: each is named individually with the
  reason it cannot travel, and an acceptance criterion requires a grep proving all of them remain
  in the always-loaded core.
- **Testability, Important — extraction removes text from assertion subjects.** No merge-gate test
  resolves eager includes. Incorporated as an architecture decision, and each work package owns its
  own repointing rather than leaving it to a final sweep.
- **Error cases, Note — a stub keeps slices non-empty.** WP1's retained stub makes the eleven
  Phase 5.5 slices fail loudly rather than pass vacuously. Recorded as the intended direction.
- **Scope, Note — WP4 is optional.** It touches the densest test coupling in the repository for
  ≈ 45 lines. Recorded as droppable without affecting the other packages.

### Deep review, 2026-09-02

Three findings were incorporated directly; two were put to the user as decisions.

- **Testability, Important — the target criterion was unfalsifiable.** "Lower by at least the sum
  of the packages taken" adjusts itself to whatever the packages deliver and can never fail.
  Incorporated: per-package estimate, measurement and deviation are reported, a shortfall over
  25 % stops the round, and WP1 carries an absolute 200-line floor.
- **Error cases, Important — no rule for an under-delivering package.** Round one delivered 310
  lines against a planned 412. Incorporated with the stop rule above, so the discovery surfaces
  while the round can still be re-scoped.
- **Testability, Note — the test-repointing count was vague.** "~20 slices" replaced by the 15
  known repointings, attributed per work package.
- **Architecture, Important — extracting a phase is a new pattern (decided).** The existing
  single-consumer fragments are contracts; WP1 defers a procedural step, so the run reads a pointer
  mid-execution. Decided: proceed, because Phase 5.5 follows a successful merge, may degrade, and
  keeps its entry gate inline. Recorded as an architecture decision and to be documented in
  `build-system.md` as the first phase-shaped extraction.
- **Error cases / Testability, Important — the safety net is text-only (decided).** All 671
  assertions check wording; none exercises a gate run, which is the gap the 2026-09-02 circularity
  defect passed through. Decided: the behavioural eval layer becomes a **blocking prerequisite**
  rather than a non-blocking note. Recorded in the Approach and as the first acceptance criterion.
  This plan is therefore complete but **not yet actionable**.

### WP3 implementation pass, 2026-09-04

WP3 is implemented and verified but not merged; the round paused here to record what the pass found.
Measured saving **21 lines** (3147 → 3126) against an estimate of 22 — a −4.5 % deviation, well
inside the −25 % stop. Budget lowered 3219 → 3198, keeping its headroom of 72.

- **Testability, Critical — the eval build stamp invalidates on every source edit (recorded, not
  resolved).** `pnpm test` cannot reach zero failures for any package of this round without a full
  eval re-run. See "The eval build stamp is a per-package cost"; the per-commit acceptance criterion
  is adjusted accordingly and a new criterion requires the re-run before the round is called
  finished. This was not knowable when the packages were scoped and is the kind of cost that can
  re-scope a round.
- **Testability, Important — two plan details were wrong, corrected for WP2 and WP1.** The battery
  to register a new pointer in is the **merge-gate-specific** one (`every merge-gate lazy pointer
names the decision point that loads it`), not the shared-fragment battery, whose comment scopes it
  to fragments reachable only from inside another fragment; a pointer living in a tool is not that
  case. The plan's `test/workflow-contracts.test.mjs:1270` reference is stale — that region now holds
  `setup.md` tests. And WP3's "one test literal" was **one literal in two places**: besides the regex,
  the assertion subject reading the tool body had to move too, or it would have passed vacuously
  against text that had left the file. Expect the same shape in WP2's three slices: check the
  assertion subject, not only the pattern.
- **Architecture, Note — WP3's fail-closed content was checked and is safe to defer.** The plan
  enumerates what must not travel for WP2 but does no such analysis for WP3, whose moved range
  carries the checkout lifecycle rules. They are safe: the normative summary survives in the
  always-loaded `## Rules` ("Leave no checkout mid-merge … no run ends with an `active` record"), and
  the deferred text loads at the moment a checkout is provisioned, before any stop or error path can
  need it. Recorded so a reader does not have to re-derive it.

### WP2 implementation pass, 2026-09-07

Measured saving **119 lines** (3126 → 3007) against an estimate of ≈ 130 — a −8.5 % deviation,
inside the −25 % stop. Budget lowered 3198 → 3079, keeping its headroom of 72. Content preservation
accounted for 142 lines with **0 unaccounted**.

Three things the pass found that the section above did not predict:

- **Four slices to repoint, not three, and two of them had to change instrument.** The fragment ends
  after `#### Resolving a conflict with the base`, so a `section(…, '\n## ')` cut over the contract
  no longer stops where it used to: it runs to the end of the file and swallows the step. Two
  assertions about the contract would then have been satisfiable by the step's prose. Both are now
  `boundedSlice` with the step heading as the explicit stop. This is the same failure shape the
  2026-09-04 note warned about one level up — check the assertion subject, not only the pattern —
  with a second half it did not name: an unchanged `section()` call can widen silently rather than
  miss loudly, and a widened cut still passes.
- **The threat model is retained verbatim and uncompressed.** WP2's own text above offered "or keep
  a one-line inline statement of the default and the exposure" as an alternative. It was not taken:
  the passage's closing sentence states that it exists so the exposure is a configuration decision
  rather than a discovery, which is an argument for the passage, not for a summary of it.
- **The fragment is the first single-consumer fragment assembled from two non-adjacent regions of
  one tool.** Legitimate because both are reached from the same decision point, and recorded in the
  build-system guide rather than only here, since it is now a precedent other extractions can cite.

**Acceptance criterion 2 is met by the argued-gap branch, not by a scenario.** The Approach above
expected WP2 to "carry a conflict scenario of its own"; it does not, and this is the deviation to
weigh. The argument is region-specific in the sense the criterion demands: the eval fixture is a
fixed document that produces no conflicting head, so no scenario reachable by the delivered harness
loaded the moved text before the extraction either — the ten runs are unchanged evidence about the
paths they cover, not weakened evidence about this one. What decides whether the moved text is
needed stayed in the always-loaded core and was verified there by grep: the controlled stop with its
`git merge --abort`, the rejected-push rule that deliberately does not abort, and the threat model.
A conflict scenario needs a fixture producing a conflicting head, which is scaffold work at the
scale of its own package. Note for whoever builds it: the sandbox ADR sets
`mergeGate.conflictResolution: off`, so a conflict scenario against today's scaffold would exercise
the controlled stop rather than the resolver, and covering the `auto` path means changing that value
too.

### WP1 implementation pass, 2026-09-07

Measured saving **292 lines** (3007 → 2715) against an estimate of ≈ 295 — a −1 % deviation, the
closest of the three packages. Budget lowered 3079 → 2787, keeping its headroom of 72. Content
preservation accounted for 271 lines with **0 unaccounted**.

The section's split ran where WP1 above says it should: the heading, the entry condition and the
missing-receipt rule stay in the always-loaded core, and steps 1–7 plus the `ask` fence moved. All
three retained rules were verified by grep in the **built** core, and the four step-body literals
that must no longer be there were verified absent there.

Three things the pass found that the section above did not predict:

- **Eleven slices became twelve subjects.** The count was right; the shape was not. One of the
  eleven — `merge-gate supports already-merged observer re-entry with terminal-only reconciliation`
  — asserts the entry condition **and** step content from a single subject. That subject now spans
  the seam, so it had to be split in two: reading both halves from one slice would let the retained
  gate satisfy a step pin, or a step satisfy the gate pin. A twelfth site had to move as well: the
  `ask`-fence test locates the fence by raw `indexOf` on the tool source rather than through a
  slice, so it does not appear in a `section()` count at all.
- **A fragment's own orientation paragraph can satisfy the assertions about what stayed behind.**
  The paragraph introducing a single-consumer fragment necessarily restates why the retained text
  is retained, so it names the entry condition and the missing-receipt rule. Had the eleven slices
  opened at the fragment's `##` heading, they would have run to end of file and included it. The
  steps therefore carry their own `### Observation steps` heading and every repointed slice targets
  that, which excludes the orientation. This is the WP2 widening lesson from the other side: there
  the danger was the moved text satisfying assertions about the contract, here it is the fragment's
  **new** text satisfying assertions about the core.
- **The pointer's trigger names more than the phase number.** `issue-post-merge-observation` pins
  `/Phase 5\.5/` and that is enough for it, but the steps run once the phase is _entered_, and
  entry is exactly what the retained gate decides. The battery entry therefore requires the phase
  number **and** the proof that opens it, so a `when:` reduced to the phase number alone — still
  correct behaviour today — fails the moment the entry gate is what moves.

**Acceptance criterion 2 is met by the argued-gap branch, as this plan predicted it would have to
be.** The deep review established that WP1's region is unreachable by construction: `merge-proceeds`
records that the static fixture keeps reporting an open pull request after the merge, so Phase 5.5's
own merge proof never succeeds and the phase is never entered. That is unchanged by this pass and
was re-observed in this round's logs. The reordering to WP3 → WP2 → WP1 was made so this package
would not be the round's first argued gap, and it is not: WP3 and WP2 shipped ahead of it.

### Round delivery record, 2026-09-07

Three of the four packages are delivered and merged, in the order this plan settled on:

| Package | Pull request | Estimate | Measured | Deviation | Core after |
| ------- | ------------ | -------: | -------: | --------: | ---------: |
| WP3     | #400         |       22 |       21 |    −4.5 % |       3126 |
| WP2     | #401         |    ≈ 130 |      119 |    −8.5 % |       3007 |
| WP1     | #402         |    ≈ 295 |      292 |      −1 % |       2715 |

Total measured saving **432 lines**, 3147 → 2715, against a planned ≈ 447 — a −3.4 % deviation for
the round, well inside the −25 % stop. The budget tracked it down at every step and kept its
headroom of 72 throughout: 3219 → 3198 → 3079 → 2787. Two full eval rounds were run and the stamps
rebound, once for WP2 and once for WP1; the WP1 branch was later replayed onto `develop` after WP2
squash-merged, and its stamps survived that because the replayed tree is byte-identical.

**WP4 is the only package left, and the plan status stays `Not implemented` because of it.** It is
compression rather than extraction — the `## Delegation contract` rationale, ≈ 45 lines — and this
plan already records that it "can be dropped without affecting the others". Two endings are
therefore legitimate: implement it, or record it as deliberately dropped. Neither has been chosen,
and until one is, the status line is accurate rather than stale.

The acceptance criteria above are ticked against that state. One is deliberately left open, and its
own row says why: the criterion asking each adapted assertion to be listed with the reason it pins
wording rather than behaviour was not discharged in that form by the three pull-request bodies.

### Revision, 2026-09-02 (eval prerequisite resolved)

Revised in place after `evals/merge-gate/` landed in #399. The plan's own re-entry note directed
this return. **This subsection supersedes the deep review's closing "not yet actionable" above**,
which is retained because earlier passes stay readable, not because it still holds.

**Result:** Approved — the one critical finding was incorporated, not carried forward.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        1 |         2 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

- **Error cases / Testability, Important — the blocking prerequisite is discharged.** The deep
  review made the eval layer a hard gate. It exists: a sandboxed stub forge, a fresh agent given a
  prompt stating no expectation, and assertions over every archived run. `guard-blocks-merge`
  observes a refusal with no `pr-merge` requested. The open point and the first acceptance criterion
  are updated from "must exist" to "exists", and the plan becomes actionable.
- **Testability, Important — the coverage does not reach the changed regions.** Verified rather than
  assumed: the covered refusal is merge precondition 4, in Phase 1, while WP1–WP3 extract Phase 5.5,
  the conflict contract and the checkout list. Incorporated as a **per-package** obligation in the
  acceptance criteria instead of either a blanket stop or silence, on the ground that the harness —
  the expensive part — now exists, so a further scenario is incremental.
- **Scope, Note — the baseline was refreshed** to `364f4d0`. Source 2341 → 2342, corpus 19659 →
  19833, ratio 1.9× → 1.93×. The shape of the finding is unchanged; the figures are restated so the
  implementing run measures against the tip it starts from.

- **Testability, Critical — WP1's region is unreachable by construction, and the criterion forced
  the escape hatch there (decided).** `merge-proceeds` records that the static fixture keeps
  reporting an open pull request after the merge, so Phase 5.5's own merge proof never succeeds and
  the phase is never entered; the scenario names a state-carrying stub as the fix and assigns it
  elsewhere. WP1 defers exactly that phase. The per-package criterion therefore offered WP1 a
  coverage branch that cannot be taken, leaving only the argued gap — on the largest package and the
  first phase-shaped extraction. Decided: **reorder the round to WP3 → WP2 → WP1**, by coverability
  rather than by line count. Incorporated in the Approach, in a new acceptance criterion, and as an
  open point with a re-entry note. The consequence is stated rather than smoothed over: the bulk of
  the saving now lands last, and WP3 takes over WP1's role as the round's early premise check.
- **Testability, Important — the criterion demanded a refusal for a region that has none.** Phase
  5.5 runs only after a successful merge, so "a scenario exercises a refusal its extraction could
  break" is unsatisfiable there for a second, independent reason. Incorporated directly: the
  criterion now reads "an outcome its extraction could break — a refusal, or for a post-merge region
  the observation outcome itself".
- **Testability, Note — the replacement criterion is weaker than the one it replaces, deliberately.**
  "Cover the region **or argue the gap**" carries an escape hatch, and the deep review above caught
  exactly this shape once: a criterion that can always be satisfied by writing prose is not fully
  falsifiable. It is accepted here because the alternative reinstates the blanket stop this revision
  was asked to lift. Two things narrow it: the argument must be about the region **actually moved**,
  and naming precondition 4 is explicitly ruled out as an answer. An implementing run that finds
  itself writing a general argument rather than a region-specific one should read that as the
  criterion failing, not passing.

No work package, rejected candidate, or edge case was changed by this revision.

## Open points

- No open points.
