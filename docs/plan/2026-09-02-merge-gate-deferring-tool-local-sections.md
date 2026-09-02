# Merge-gate: deferring tool-local sections

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`/effective-flow refactor`)

## Requirement

`src/tools/merge-gate.md` is still the largest tool in the repository by a wide margin. It measures
**2341 source lines** and an always-loaded core of **3147 lines** against a ratchet of 3219 — about
**1.9×** the next largest tool (`iterate`, 1626) and roughly **16 %** of the whole tool corpus
(19659 resolved lines across 28 tools). Every other tool fell during the deferral work of
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

All figures measured on `origin/develop` at `368b7ff` (2026-09-02).

| Measure                                           |           Value |
| ------------------------------------------------- | --------------: |
| `src/tools/merge-gate.md`                         |            2341 |
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

| File                                           | Description                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`                      | Sections extracted to fragments and rationale compressed; every entry gate retained inline                                                    |
| `src/shared/merge-gate-issue-observation.md`   | New. Phase 5.5 steps 1–7 and its `ask` fence (WP1)                                                                                            |
| `src/shared/merge-gate-conflict-resolution.md` | New. Conflict-resolution delegation contract and its resolution step (WP2)                                                                    |
| `test/workflow-contracts.test.mjs`             | 15 known repointings — 11 Phase 5.5 slices (WP1), 3 conflict slices (WP2), 1 literal (WP3) — plus two new entries in the lazy-trigger battery |
| `build.mjs`                                    | `CONTEXT_BUDGET_LINES` entry for `merge-gate` lowered to the achieved size plus its existing headroom                                         |
| `docs/developer-guide/build-system.md`         | The two new single-consumer fragments recorded beside the existing ones                                                                       |

## Implementation details

### Prerequisite: the behavioural eval layer

**No work package below starts until a behavioural eval layer for `merge-gate` exists.** This is a
blocking dependency of this plan, decided in its deep review, and it is not satisfied today.

The reason is specific rather than general. All 671 assertions that guard this file check its
**text**; not one exercises a gate run. A restructure can therefore move a fail-closed rule into a
place the run never reaches and every test still passes, because the wording is still present
somewhere. That is not hypothetical: it is exactly what happened on 2026-09-02, where content
preservation was provably complete and the rule was still unreachable. `merge-gate` is the
security-densest file in the repository — the human-comment guard, the write boundary, the
round bound, and ten merge preconditions all fail closed — so it is the worst candidate for a
text-only safety net.

The eval layer's minimum scope for this plan's purposes: a gate run must be exercised against the
refusal conditions, so that a merge which should be blocked is observed to be blocked. Its design
is out of scope here and belongs in its own plan.

If that plan concludes the eval layer is not feasible, this one is re-opened rather than started
without it.

### Approach

Four work packages, each independently shippable and each ending green. Take them in this order:
WP1 carries the most lines and the most test churn, so it validates the approach before WP2–WP4
build on it. WP4 is compression only and can be dropped without affecting the others.

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

### WP3 — Defer the checkout inapplicability list (≈ 22 lines)

`## Checkout provisioning boundary` lines 160–181 are only meaningful once a checkout has been
provisioned — the same trigger the existing `worktree-integration` pointer already carries, so no
new trigger is needed. Retain the pointer preamble and round one's "do not re-add
`execution-location`" reasoning.

One test literal (`/no deferred pointer to `plan-archival`/`) sits in this range and moves with it.

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

- [ ] **Before WP1 begins:** a behavioural eval layer for `merge-gate` exists and exercises a gate
      run against its refusal conditions, so that a merge which should be blocked is observed to be
      blocked. Named in the pull-request body with the refusal conditions it covers. This gates the
      round; it is not satisfied by the text assertions that already exist.
- [ ] The always-loaded core of `merge-gate`, as the `Always-loaded core (lines/budget)` line of
      `node build.mjs` reports it, is lower than 3147, and the pull-request body states **per
      package** its estimate from this plan, its measured saving, and the deviation between them.
      Source-side arithmetic is not an acceptable measurement.
- [ ] **The criterion above is falsifiable, not self-adjusting.** A package whose measured saving
      falls short of its estimate by more than 25 % stops the round for a reported decision rather
      than silently lowering the bar: round one delivered 310 lines against a planned 412 because
      the remainder turned out to be rule content, and that is exactly the discovery this stop is
      meant to surface while the round can still be re-scoped. WP1 alone must deliver at least
      200 lines, or the extraction-over-compression premise of this plan did not hold and the round
      is reconsidered rather than continued.
- [ ] `build.mjs`'s `CONTEXT_BUDGET_LINES` entry for `merge-gate` is lowered to the achieved size
      plus its existing headroom, so no removed line is re-admitted.
- [ ] Every new `lazy-include` has a `when:` clause whose condition is **decidable from text that
      remains loaded**, and each is pinned by trigger token in the battery at
      `test/workflow-contracts.test.mjs:1270`.
- [ ] For each extraction, the retained entry gate is named in the pull-request body together with
      the reason it could not travel.
- [ ] Every one of the nine currently eager fragments is still eager, `issue-lifecycle` keeps its
      literal eager fence, `delegation-mandate` is not lazy, and `execution-location` is not added.
- [ ] `## Edge cases` is not recreated.
- [ ] Every deleted or moved source line is mapped, in the commit message or the pull-request body,
      to the surviving statement of the same rule.
- [ ] Every fail-closed rule listed under "What must not move" in the analysis is still in the
      always-loaded core, verified by an explicit grep listed in the pull-request body.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass after
      **every** commit, not only at the end.
- [ ] Each adapted assertion is listed with the reason it pins wording rather than behavior.

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
- Resolved in the deep review, recorded here because it changed the plan's shape: the eval layer is
  a **blocking prerequisite**, not a parallel track. See the Approach and the first acceptance
  criterion. This plan neither designs nor creates it.
- Assumption: extracting a workflow **phase** behaves like extracting a contract, given the entry
  gate stays inline. Decided in the deep review and recorded as an architecture decision; it is the
  first phase-shaped extraction here, so WP1 is also the test of that premise — which is why its
  200-line floor stops the round rather than lowering the bar.

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

## Open points

- **Blocking — the behavioural eval layer does not exist yet.** No work package below starts until a
  behavioural eval layer for `merge-gate` exercises a gate run against its refusal conditions, so that
  a merge which should be blocked is observed to be blocked. See "Prerequisite: the behavioural eval
  layer" and the first acceptance criterion, which is the gate. All 671 assertions that guard this
  file check its **text**; not one exercises a gate run, so a restructure can move a fail-closed rule
  into a place the run never reaches while every test still passes — the gap the 2026-09-02
  circularity defect passed through. This plan is therefore complete but **not yet actionable**.
  **Re-entry:** deliver the eval layer, then return here.
