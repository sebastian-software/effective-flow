# Always-loaded context reduction

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Planning baseline and drift

Planned at `3b44300` and **re-baselined at `51d0dc9`** (`develop`), 2026-09-01, against the review
document `docs/review/2026-08-31-architecture-and-consistency-review.md` (items F-12, F-03, F-04,
F-13, F-14) plus finding `R-0000117`.

**Both prerequisites are satisfied; this plan is clear to start.** The stack #386, #387 and #388
has merged, as has #391, which extracted the base-branch rule into the new fragment
`src/shared/base-branch-resolution.md`. The parallel ownership plan merged as #393, and the agreed
order was ownership first — so its overlap on `build.mjs`, `AGENTS.md`,
`docs/developer-guide/build-system.md` and five `src/agents/*.md` files is behind this plan rather
than ahead of it. The implementing run still starts from an up-to-date `develop` and re-measures.

**#391 changed the numbers, in this plan's favour.** `base-branch-resolution` is eagerly nested in
`worktree-integration`, which now resolves to **931** lines rather than 872, and is separately
eager in `pr` (340 → 469). Phase 3's saving grew accordingly. This is the second time these
figures moved under the plan; re-measure rather than trusting the table below.

All line counts below are **resolved** counts from `dist/claude/effective-flow/`, not source
counts. This distinction is load-bearing: `worktree-integration` is under 500 source lines but
**931** resolved, because it eagerly nests `execution-location`, `worktree-lifecycle` and
`base-branch-resolution`. Planning against source counts understates the largest saving in this
plan by roughly a factor of two.

### Verified baseline

Resolved tool sizes at `51d0dc9`, largest first: `merge-gate` 3175, `iterate` 2661, `refactor`
1856, `maintain` 1652, `apply-issues` 1583, `setup` 1577, `cleanup` 1427, `apply-review` 1401,
`plan-issue` 1137, `apply` 974, `deliver` 736, `review` 687, `apply-plan` 634,
`apply-review-remote` 631, `plan` 621, `apply-review-commit-mechanics` 619, `investigate` 568,
`docs` 567, `build` 535, `plan-review` 487, `pr` 469, `fix` 431, `concept-review` 383, `commit`
306, `concept` 293, `open-plans` 188, `version` 27, `pr-review` 27. Router `SKILL.md`: 142.

Eager fragment cost, resolved lines × eager sites:

| Fragment               | Resolved |               Eager sites | Always-loaded cost |
| ---------------------- | -------: | ------------------------: | -----------------: |
| `worktree-integration` |      931 |                         3 |               2793 |
| `language-rules`       |       79 | 32 (16 tools + 16 agents) |               2528 |
| `issue-tracker`        |      417 |                         5 |               2085 |
| `session-title`        |       56 |                1 (router) |     56 per session |

`base-branch-resolution` (59 resolved lines) is a further eager fragment, nested inside
`worktree-integration` and separately eager in `pr`. Phase 3 defers it wherever it rides along with
`worktree-integration`; whether `pr` should also defer its own copy is out of scope here and is
recorded as a candidate rather than planned.

## Requirement

Effective Flow already has the mechanism that makes a tool cheap to invoke: the two-stage
include resolver, where an ` ```include ` fence inlines a fragment into the built tool and a
` ```lazy-include ` fence turns it into a load-on-demand pointer. The mechanism is applied
unevenly. `build`, `fix`, `docs`, `review` and `plan` expand by 89–116 lines from eager includes;
`iterate`, `refactor`, `maintain`, `cleanup` and `apply-issues` expand by 1036–1885. The same
fragment is deferred in one tool and inlined in another with no stated reason.

The goal is to apply the existing discipline consistently, and to make the remaining backlog
visible in the build output instead of invisible. No behaviour changes: every rule, guard and
gate stays reachable, and every fragment moved to lazy already resolves its own mode or
condition internally — only the load point moves.

Two items from the review are deliberately **out of scope**, both by decision:

- Splitting `config-migration` into an eager core plus a lazy remainder. It nets roughly 385
  lines after the pointers are added back, needs a `setup` exception because `setup` writes
  configuration and depends on the several-match rule in the remainder, and would require
  auditing six existing test assertions for which half they land in. Recorded as a finding
  instead.
- Restructuring `merge-gate` and `iterate` into a route-table shape (review item F-15). That is
  a separate, larger change with its own plan.

## Architecture decisions

- **Budget every tool, ratchet the unconverted ones.** `CONTEXT_BUDGET_LINES` measures 6 of 28
  tools and omits `iterate`, the second-largest. Extending it to every tool turns the conversion
  backlog into a number the build prints on every run. The five converted tools keep their proven
  700; the rest start at their measured size plus a small allowance and come down as phases land.
- **Defer whole fragments; do not split unless the fragment resists deferral.** The review
  proposed splitting `language-rules` into a core and a remainder. That is the wrong shape: eight
  tools — including `plan`, `docs` and `review` — already defer the whole fragment today with the
  trigger `when: an artifact output language or delegated language context must be resolved`. A
  split would additionally break `test/build-lib.test.mjs:2913`, which pins the set of files
  containing `plan.markerLanguage` with an exact `deepEqual`. Whole-fragment deferral is simpler
  and saves more.
- **Split only `issue-tracker`, and only where it pays.** This fragment genuinely resists
  whole-fragment deferral in two of its five consumers, because `apply-issues` and `plan-issue`
  are inherently tracker-bound and resolve to a tracker target on every run. The split therefore
  targets `apply` and `cleanup` only, which reach the forge mechanics conditionally or not at all.
- **A fragment may be eager in one tool and lazy in another.** The resolver already supports this
  and ships the shared copy exactly once; `worktree-integration` is the live proof. The only
  constraint is `assertNoEagerLazyOverlap`: a fragment must not be both within the _same_ file.
- **Per-consumer lazy triggers, not one global condition.** `iterate` reads `delivery.baseBranch`
  in Phase 1, before any delivery mode is determined, so the standard trigger would fire too late
  for it. `merge-gate` already demonstrates a bespoke trigger. Each converted site gets the
  trigger that matches its own earliest use.
- **`session-title` leaves the router entirely rather than being compressed in place.** The
  router build path calls `resolveIncludes` but never `resolveLazyIncludes`
  (`build.mjs`, router rendering), so a lazy fence in `src/SKILL.md` registers no fragment and
  throws on the unresolved pointer. Compression in place is not a weaker option; it is not
  buildable. Nothing in the fragment informs the dispatch decision, so the router does not need it.
- **Fix the `session-title` classification gap in the same phase that moves it.** `merge-gate` and
  `deliver` appear in neither the emitting list nor the silent list, so their behaviour is
  undefined — and `deliver` already emits through its own pointer while the contract never names
  it. Moving the fragment and correcting its lists are one edit to one contract, not two.

## Affected files

| File                                                 | Description                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `build.mjs`                                          | Extend `CONTEXT_BUDGET_LINES` to all 28 tools; keep the five proven 700s, ratchet the rest                    |
| `src/shared/language-rules.md`                       | Unchanged content; only its embedding changes                                                                 |
| 16 × `src/tools/*.md`                                | Convert the eager `language-rules` fence to `lazy-include` with a per-tool trigger                            |
| 16 × `src/agents/*.md`                               | Same, with a trigger reflecting that an orchestrated agent receives resolved values                           |
| `src/tools/refactor.md`, `maintain.md`, `iterate.md` | Convert `worktree-integration` to `lazy-include`; `iterate` needs a bespoke trigger                           |
| `src/shared/issue-tracker.md`                        | Reduce to the mode-resolution core; move the forge mechanics to a new fragment                                |
| `src/shared/issue-tracker-forge.md` (new)            | The forge/remote remainder, loaded on demand                                                                  |
| `src/tools/apply.md`, `src/tools/cleanup.md`         | Carry the core eagerly and the remainder lazily                                                               |
| `src/SKILL.md`                                       | Remove the eager `session-title` include                                                                      |
| `src/shared/session-title.md`                        | Classify `merge-gate` and `deliver`; adjust for per-tool loading                                              |
| 16 × `src/tools/*.md`                                | Add a lazy `session-title` fence beside the existing `session-rename` one                                     |
| `test/workflow-contracts.test.mjs`                   | Rewrite the router-carries-session-title assertions; replace the hard-coded list length with a reconciliation |
| `docs/developer-guide/build-system.md`               | Update the budget and mode-gated-fragment documentation                                                       |
| `docs/developer-guide/architecture.md`               | Update the router description and the stale note about budget headroom                                        |

## Implementation details

### Phase 1 — Budget every tool (F-12)

Extend `CONTEXT_BUDGET_LINES` from 6 entries to all 28 `src/tools/*.md` names. Keep
`build`/`fix`/`docs`/`review`/`plan` at 700 and `merge-gate` at its current ratchet. Give every
other tool a limit at its measured size plus a small, stated allowance. The default is a fixed
headroom of about ten lines, following the existing `merge-gate` precedent, whose 3250 sits a
little above its measured 3176. Fixed rather than proportional on purpose: a percentage gives the
largest tools the most room, which is exactly where unwatched growth is most expensive. The
allowance absorbs the roughly four-line pointer Phase 5 adds without hiding a regression, and each
later phase lowers the entries it touches.

Add a guard that the budget map and the tool set are the same size, so a newly added tool cannot
ship unmeasured. This is the same reconciliation shape the next-steps contract and the router
description already use.

Record in the comment that the non-700 numbers are a backlog, not targets, and that each later
phase lowers the ones it touches.

### Phase 2 — `language-rules` to lazy (F-13a)

Convert all 32 eager sites. For the 16 tools, reuse the trigger already in production in the
eight lazy tools. For the 16 agents, the trigger reflects the existing contract that an
orchestrator resolves every surface once and passes concrete `de`/`en` values down, so an agent
needs the fragment only when invoked directly — the agents already restate that operative rule
inline in about two lines each.

Verify that no agent relies on the fragment for anything the inline restatement does not cover
before converting it. Where one does, keep it eager and record why.

### Phase 3 — `worktree-integration` to lazy (F-03)

Convert `refactor` and `maintain` with the standard trigger; both reference the fragment first at
their delivery-mode determination step, structurally identical to the four tools already lazy.

`iterate` needs its own trigger. It never determines a delivery mode, and its first use is in
Phase 1, where it provisions a PR head checkout and reads `delivery.baseBranch`. The exact wording
is the implementing run's, but the requirement is not: the trigger must fire no later than the
first read of `delivery.baseBranch`, and it must not be phrased in terms of a delivery-mode
determination, because `iterate` never reaches one. A trigger that fires only at Phase 5 is a
defect, not a wording preference — verify it against the tool's own earliest use rather than by
analogy to `refactor` and `maintain`.

Confirm before converting that the nested `execution-location` remains reachable: all seven
consumers already receive it through their lazy `runtime-state-safety` pointer, which includes it
eagerly. This is the assumption the phase rests on and it must be re-verified, not taken from this
plan.

### Phase 4 — `issue-tracker` core and remainder (F-04)

Derive the seam against the prose rather than from a line range in this plan. The core is
everything needed to answer "am I on a tracker target at all?": the intro and scope, the
configuration schema and defaults, the config-migration pointer, the mode-resolution precedence,
the first-invocation query, and the tracker-target handoff including its fail-closed `external`
abort. The remainder is the forge mechanics: helper contract, label convention, body formats,
operations, error cases.

Apply the split to `apply` and `cleanup` only. Leave `apply-issues`, `plan-issue` and
`apply-review-remote` carrying the fragment whole, and record why in each case: the first two are
inherently tracker-bound and resolve to a tracker target on every run, and the third is already
gated at the tool level so that it never loads on a local target.

Check that the existing guard requiring every `issue-tracker` consumer to also load
`tracker-target` still passes: it walks the include closure by name, so the core satisfies it.

### Phase 5 — `session-title` out of the router, and its classification gap (F-14, R-0000117)

Remove the eager fence from `src/SKILL.md` and add a lazy one to each of the 16 work-subject
tools, beside the `session-rename` pointer each already carries.

In the same phase, close the classification gap: `merge-gate` and `deliver` belong to exactly one
of the two lists, and the decision is a real one — `deliver` already emits through its own
pointer, so classifying it silent contradicts shipped behaviour. Decide, state the reason, and
make the guard structural: replace the hard-coded list length with an assertion that the two
lists together cover the exposed tool set, so a tool missing from both fails the build.

The silent-tool list and the `setup` probe carve-out currently reach every session through the
router. Once the fragment is per-tool, confirm where each still lands, and in particular that
`setup`'s probe keeps a loaded authorization for its rename.

### Edge cases

- A converted tool sits close to its budget. `review` has the least headroom of the budgeted
  tools; adding a pointer while removing nothing from it is the one direction that can push a
  tool over. Re-measure after each phase rather than at the end.
- `assertNoEagerLazyOverlap` rejects a fragment that is both eager and lazy in one file. A tool
  that reaches a fragment through two paths must resolve to one form.
- The router has no lazy resolution at all. Nothing in Phase 5 may introduce a lazy fence there.
- Phase 4 creates a new shipped fragment. It must appear in all three targets and be reachable
  from every pointer that names it.

## Acceptance criteria

- [ ] `CONTEXT_BUDGET_LINES` covers all 28 tools, and a guard fails the build when a tool exists
      without a budget entry or an entry without a tool.
- [ ] `node build.mjs` prints a budget line for every tool and exits 0.
- [ ] No `language-rules` eager fence remains in `src/tools/` or `src/agents/`, except sites
      explicitly recorded with a reason.
- [ ] `worktree-integration` is lazy in `refactor`, `maintain` and `iterate`, and `iterate`'s
      trigger names its Phase 1 use rather than a delivery-mode determination.
- [ ] `apply` and `cleanup` carry the `issue-tracker` core eagerly and the forge remainder lazily;
      `apply-issues`, `plan-issue` and `apply-review-remote` are unchanged with a recorded reason.
- [ ] The Phase 4 seam is verified by behaviour, not by line count: the core alone is sufficient to
      resolve `tracker.mode` to `local`, `forge` or `external` and to reach the fail-closed
      `external` abort, and it carries no forge helper contract, label vocabulary, body format or
      tracker operation.
- [ ] `src/SKILL.md` carries no `session-title` include, and the resolved router is at most 90
      lines (from 142).
- [ ] Every exposed tool appears in exactly one of the two `session-title` lists, enforced by a
      test that fails when a tool is in neither.
- [ ] Resolved sizes fall to at most: `iterate` 1720, `refactor` 940, `maintain` 740, `cleanup`
      1050, `apply` 600. No other tool's resolved size increases by more than 5 lines. These
      thresholds derive from the `51d0dc9` baseline and are re-derived if the baseline moves again.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.
- [ ] Every fragment moved to lazy ships exactly once under `shared/` in all three targets, and no
      pointer references a missing fragment.

## Validation plan

- The four repository checks in the order `AGENTS.md` prescribes, after every phase rather than
  once at the end, since each phase changes what the next one measures.
- A before/after resolved-size table for all 28 tools plus the router, produced from `dist/`.
- Per phase, a spot check that a deferred rule is still reachable: pick one rule the fragment
  carries, and confirm the consuming tool's pointer fires before the rule is needed.
- For Phase 5, confirm that a tool which does not emit a title loads nothing, and that one which
  does resolves the pointer.
- Adversarial check on the Phase 1 and Phase 5 guards: add a tool without a budget entry, and a
  tool in neither `session-title` list, and confirm each fails. Snapshot files with `cp` before
  such edits and restore from the copy — never `git checkout --`, which discards uncommitted work.
- Confirm no behaviour change: build the pre-change commit into a separate tree and diff the
  resolved `dist/` output, so every delta is an intended include-form change and nothing else.

## Assumptions and open points

- **Assumption:** the four repository checks are the complete gate for this repository. Taken from
  `AGENTS.md`.
- **Assumption:** deferring a fragment does not change behaviour, because every fragment in scope
  resolves its own mode or condition internally and the pointer fires before that resolution is
  needed. Phase 3 states the one place this must be re-verified rather than assumed.
- **Assumption:** the resolved counts in the baseline are current for `3b44300`. The implementing
  run rebuilds and re-measures before trusting them; the review that preceded this plan was twice
  wrong about counts by using source instead of resolved lines.
- **Assumption:** agents need no budget of their own. `CONTEXT_BUDGET_LINES` measures tools only,
  and Phase 2 converts 16 agents that no guard watches. Their sizes are not a stated goal of this
  plan, so the saving there is real but unmeasured. Extending the budget to agents is a candidate
  for a later change, not this one.

## Plan review

**Result:** Approved

The deep review raised one implementation-blocking point — the ordering against the parallel
ownership plan — which is now resolved twice over: the agreed order was ownership first, and that
plan has since merged as #393. No critical finding was raised, and every other finding is
incorporated.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Error cases, Important.** Phase 5 removes a contract that currently reaches every session and
  redistributes it to 16 tools. The silent-tool list is the part with no new carrier, and the
  `setup` probe carve-out is an authorization rather than a prohibition. The plan makes this an
  explicit verification step rather than an assumption; without that step the phase would ship a
  tool whose rename is no longer authorized by any loaded contract.
- **Testability, Important.** Two guards in this plan replace hard-coded expectations with
  reconciliations — the budget map against the tool set, and the two `session-title` lists against
  the exposed tool set. Both must be verified by breaking them, because a reconciliation that
  silently passes is worse than the hard-coded value it replaced. The validation plan names this.
- **Architecture, Note.** The plan deliberately does not unify how a fragment declares its own
  deferability. Each converted site carries its own trigger prose, so the same fragment can be
  deferred with different wording in different tools. A declarative default trigger per fragment
  would be a cleaner design, and is a candidate for a later change rather than this one.
- **Scope, Note.** `config-migration` was removed from scope by decision, on the grounds of the
  worst ratio among the five candidates. It remains a real, if small, improvement and is recorded
  as a finding so the decision is retrievable.
- **Maintainability, Note.** Phase 1's ratchet numbers will read as arbitrary to a later
  contributor unless the comment states that they are measured backlog rather than targets. The
  phase makes that comment part of the work.

## Open points

- No open points.
