# Remove the /goal mode offering from all workflows

**Plan status:** Implemented
**Source:** /effective-flow build
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Effective Flow currently offers, at the approval boundary of every implementing workflow, an
explicit third option "Autonomous via `/goal`". Choosing it triggers a harness-specific goal-start
action: in native Codex one direct `create_goal` attempt, in Claude and portable targets a
copy-pasteable `/goal` prompt the user has to paste back. That offering is to be removed.

Decided scope (confirmed with the user before planning):

1. The `/goal` offering disappears **everywhere and in every harness** — in `build`, `fix`,
   `refactor`, `docs`, `iterate`, `maintain`, `apply-plan`, `apply-issues` and `apply-review`, for
   the native Claude, native Codex and portable targets alike.
2. The remaining "Goal-driven completion control" **stays, and becomes unconditional**: the
   declared completion condition, independent verification, bounded correction rounds, the visible
   phase task list and the per-phase chat updates apply to every run, not only while a native goal
   is active.

The user-visible effect is that every workflow runs gated, with its regular approval gates, and
that the progress reporting previously reserved for autonomous runs now applies always.

**Planning basis:** branch `develop` at `674b6c1`, clean worktree, 2026-07-28. The line references
below are evidence from that state and are to be re-checked during implementation.

## Architecture decisions

- **Remove the offering, keep the control.** The two concerns live in one fragment today but are
  independent: `src/shared/goal-completion.md:5`–`10` describes how a workflow knows it is done,
  `src/shared/goal-completion.md:12`–`41` describes how a user hands the remaining phases to a
  native goal runner. Only the second is removed. Removing the first as well would strip the
  bounded-correction-round rule that `build`, `fix`, `refactor`, `docs`, `iterate`, `maintain`,
  `apply-review` and `documentation-sync-contract.md:57` all cite by name.
- **Keep the fragment name and its heading.** The fragment stays `goal-completion.md` with the
  heading "Goal-driven completion control". "Goal" here denotes the workflow's own completion
  goal, not the `/goal` command; roughly a dozen tool sources reference the heading verbatim in
  prose. Renaming would multiply the diff without changing behaviour, and the removed section is
  what carried the `/goal` meaning. The fragment's opening paragraph is rewritten so the remaining
  "goal" wording is unambiguously the completion condition.
- **Delete `goal-start-action.md` and the `{{GOAL_START}}` placeholder together.** The fragment
  exists solely to host the placeholder, and the placeholder exists solely to render the
  harness-specific start action. With no authorized autonomous choice left, both are dead: the
  Codex `create_goal` contract and the Claude/portable prompt handoff in
  `build-lib.mjs:1291`–`1306` lose their only trigger. Keeping an unreachable placeholder would
  leave a second, contradictory description of the removed behaviour in the build system.
- **The run-state model collapses from three states to two.** `shared/pr-review-integration.md:32`
  and `:181`–`:186` resolve `delivery.prReview: ask` over _gated_, _under an authorized goal_, and
  _non-interactive without an authorized goal_. Without an authorized goal the middle state cannot
  occur, so the model becomes _gated_ (ask once) and _non-interactive delegation_ (publish nothing
  and report). `shared/worktree-integration.md:432` passes the same state and is reduced likewise.
  The alternative — keeping a state that can never be entered — would leave a rule no run can
  reach.
- **`apply-review` loses its optional `/goal` string but keeps its autonomy statement.** Its
  Phase 2 already establishes that phases 3–8 run without a further regular approval gate
  (`src/tools/apply-review.md:255`); that property comes from the commit-strategy and stash-policy
  decisions, not from a goal. Only the `/goal` framing and the "#### Optional `/goal` string"
  section (`:307`–`:309`) go. The stash-policy guidance for unattended runs (`:305`) is rephrased
  from `/goal` runs to non-interactive delegation, where it still holds.
- **The apply chain hands over "clarified", not "clarified + goal-driven".** `apply.md:114`–`118`
  and `apply-plan.md:87`/`:97` currently pass a confirmed autonomous intent to the target
  workflow, and `build`, `fix`, `refactor`, `docs` each honour that context by skipping their own
  goal query. With the query gone, the handover shrinks to the clarified basis and the target
  workflows lose the corresponding branch.
- **A regression guard replaces the deleted tests.** `test/build-lib.test.mjs:1052`–`1208` asserts
  the goal-start contract in detail. Deleting those assertions without a replacement would leave
  the removal untested. A guard test asserts instead that no built target of any harness still
  contains `{{GOAL_START}}`, `create_goal`, or an "Autonomous via `/goal`" option.

## Affected files

| File                                        | Description                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/goal-completion.md`             | Delete the "Explicit goal query for autonomous runs" section incl. the prompt form; rewrite the intro; make control point 4 unconditional |
| `src/shared/goal-start-action.md`           | Delete the file                                                                                                                           |
| `src/shared/pr-review-integration.md`       | Reduce the run-state model to gated / non-interactive delegation (`:32`, `:181`–`:186`)                                                   |
| `src/shared/worktree-integration.md`        | Drop the "gated or under an authorized goal" state handover (`:432`); check the completion wording at `:342`                              |
| `src/shared/documentation-sync-contract.md` | Verify the "Goal-driven completion control" citation still resolves (`:57`)                                                               |
| `src/tools/build.md`                        | Remove the `goal-start-action` include, the third approval option, the standalone query for referenced plans (`:192`, `:216`–`:228`)      |
| `src/tools/fix.md`                          | Same removal (`:69`, `:126`, `:153`–`:163`)                                                                                               |
| `src/tools/refactor.md`                     | Same removal (`:78`, `:135`, `:161`–`:171`)                                                                                               |
| `src/tools/docs.md`                         | Same removal (`:98`, `:179`, `:207`–`:216`)                                                                                               |
| `src/tools/iterate.md`                      | Same removal (`:77`, `:174`–`:185`)                                                                                                       |
| `src/tools/maintain.md`                     | Remove the standalone goal follow-up question after the update selection (`:89`, `:186`–`:196`)                                           |
| `src/tools/apply-plan.md`                   | Remove the autonomy offer in the handoff phase and the goal-driven context (`:49`, `:87`, `:97`)                                          |
| `src/tools/apply-issues.md`                 | Reduce "Phase 3.5: Approval and goal query" to a plain approval gate (`:61`, `:183`–`:218`, `:250`)                                       |
| `src/tools/apply-review.md`                 | Remove the optional `/goal` string and the `/goal` framing (`:255`, `:305`–`:309`, `:411`)                                                |
| `src/tools/apply-review-remote.md`          | Drop the `/goal` string from the mode parity sentence (`:85`, `:122`)                                                                     |
| `src/tools/apply.md`                        | Reduce the handover to a clarified basis (`:114`–`:118`)                                                                                  |
| `src/tools/plan.md`                         | Remove the "optional `/goal` string" derivation from the acceptance-criteria rule (`:247`)                                                |
| `src/tools/review.md`                       | Adjust the completion-condition sentence that ends "nor a `/goal` string" (`:547`)                                                        |
| `build-lib.mjs`                             | Delete `GOAL_START_CODEX`, `GOAL_START_PROMPT_HANDOFF`, `transformGoalStart`, and its call in `renderBody` (`:1291`–`:1319`)              |
| `test/build-lib.test.mjs`                   | Remove the goal-start and explicit-goal-gate tests (`:23`, `:1052`–`:1208`); add the regression guard                                     |
| `docs/user-guide/tools-implement.md`        | Remove the autonomy-option description (`:18`–`:30`); document the now-unconditional progress reporting                                   |
| `docs/user-guide/glossary.md`               | Rewrite the "Goal steering" section (`:35`–`:53`) into completion control without `/goal`                                                 |
| `docs/developer-guide/build-system.md`      | Remove `{{GOAL_START}}` from the placeholder table and the pipeline description (`:46`–`:61`, `:295`–`:296`, `:314`)                      |
| `AGENTS.md`                                 | Remove the `{{GOAL_START}}` row from the placeholder/directive table (`:54`)                                                              |
| `site/index.html`                           | Remove the three autonomy claims on the marketing page (`:442`, `:497`, `:646`) — added during review, no build guard or CI job covers it |

## Implementation details

### Approach

1. **Shared fragments first**, because every tool references them: rewrite `goal-completion.md`,
   delete `goal-start-action.md`, reduce the run-state model in `pr-review-integration.md` and
   `worktree-integration.md`.
2. **Then the tool sources**, one per file, mechanically: drop the `goal-start-action` include
   fence, drop the "Autonomous via /goal" option from the `ask` block, and rewrite the surrounding
   prose so the approval gate reads as a plain approval. Where a workflow branches on a
   "clarified + goal-driven" context from the apply chain, only the clarified branch remains.
3. **Then the build system**: remove the placeholder constants and `transformGoalStart`, and take
   the call out of `renderBody`'s pipeline.
4. **Then tests and documentation**, and finally the full CI sequence.

### Approval gates after the change

Each affected `ask` block keeps its remaining options unchanged in wording and value mapping —
typically "Yes" (approval granted, workflow continues) and "Adjust" (feedback as free text). Only
the third option disappears. `maintain`'s standalone follow-up question and `apply-issues`'
Phase 3.5 goal query disappear entirely; `apply-issues` keeps its yes/no approval gate, renamed
from "Approval and goal query" to an approval phase.

### Unconditional completion control

Point 4 of the goal controls currently opens with "Once the native goal is active — whether
started directly or through a pasted `/goal` prompt — the remaining workflow maintains …". It
becomes an unconditional obligation of every run. The ownership rules inside it (exactly one
workflow owns the overview; `apply-plan` hands ownership to its target workflow; a non-interactive
sub-agent keeps no second overview) stay verbatim, as does the fallback behaviour when the task
tool is unavailable. The sentence "Immediately before goal success …" is rephrased to the
workflow's completion instead of goal success.

### Edge cases

- A user who pastes a `/goal` prompt from an older Effective Flow version is not supported and not
  specially handled: the workflows simply no longer produce such a prompt. No migration or
  deprecation notice is written, since the offering was interactive and left no persisted state.
- `.effective-flow/` wisdom files may record an earlier goal decision. They are per-run temporary
  files and need no migration.
- The words "goal" and "Ziel" appear in unrelated meanings across the sources ("## Goal" headings,
  "non-goals" in `concept-contract.md`, "Goal: …" preambles). Only `/goal`-mode occurrences are
  touched.

## Acceptance criteria

1. No file under `src/` contains `{{GOAL_START}}`, the string `create_goal`, an option labelled
   "Autonomous via `/goal`", or an instruction to output a `/goal` prompt. Check:
   `grep -rn "GOAL_START\|create_goal\|/goal" src` returns no hit that offers or starts the mode.
2. `src/shared/goal-start-action.md` no longer exists, and no `include` fence references it.
   Check: `node build.mjs` succeeds — its include guard fails on a missing target.
3. `build-lib.mjs` exports no `transformGoalStart`, and `renderBody` runs the pipeline
   `ask → (portable worker preparation) → references` without a goal-start step. Check:
   `grep -n "GoalStart\|GOAL_START" build-lib.mjs` is empty.
4. Every built target of all three harnesses is free of the mode. Check: the new guard test in
   `test/build-lib.test.mjs` asserts, for `claude`, `codex` and `portable`, that the rendered tools
   contain none of `{{GOAL_START}}`, `create_goal`, "Autonomous via `/goal`".
5. "Goal-driven completion control" still exists with its four controls, and its progress-reporting
   control is worded unconditionally — no occurrence of "once the native goal is active" or an
   equivalent condition. Check: read `src/shared/goal-completion.md`.
6. `delivery.prReview: ask` resolves over exactly two run states (gated, non-interactive
   delegation) in `src/shared/pr-review-integration.md`, with no unreachable third state.
7. No consumer-facing surface still advertises the mode: the user documentation describes no
   autonomous `/goal` mode, the developer documentation lists no `{{GOAL_START}}` placeholder, and
   the marketing page makes no autonomy promise. Check:
   `grep -rn "/goal\|GOAL_START" docs/user-guide docs/developer-guide site` returns no hit.
8. The full CI sequence is green: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
   `pnpm test:distribution`.

## Validation plan

- `pnpm agent:check` — formatting, no writes.
- `pnpm test` — the unit suite, including the adjusted and new build-lib tests.
- `node build.mjs` — build guards (include targets, exposed tools, agent frontmatter, version
  drift) plus the three rendered targets.
- `pnpm test:distribution` — isolated build/archive/delivery/install smoke suite.
- Manual read-through of one representative rendered tool per harness
  (`dist/claude/effective-flow/tools/build.md`, `dist/codex/effective-flow/tools/build.md`,
  `dist/portable/effective-flow/tools/build.md`) to confirm the approval gate reads coherently
  after the option was removed.

## Assumptions and open points

Not relevant: the decided scope was fixed with the user before planning (removal everywhere, in
every harness; completion control retained and unconditional), so the plan rests on no unresolved
assumption.

## Plan review

**Result:** Approved

### Summary

No separate deep plan review ran. The plan was produced inside `/effective-flow build` Phase 1,
presented with a validation scorecard (status marker, measurable acceptance criteria, validation
plan, concrete affected files, no open points) and explicitly approved by the user before Phase 2
started.

### Findings

- No findings.

## Open points

- No open points.

## Test results

All four CI checks green in the delivery worktree on 2026-07-28:

| Check                    | Result                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `pnpm agent:check`       | All matched files use the correct format                       |
| `pnpm test`              | 385 tests, 0 failures (384 before, plus the split guard tests) |
| `node build.mjs`         | 18 tools (+7 internal) and 15 agents for all three targets     |
| `pnpm test:distribution` | offline checks passed                                          |

The manual read-through confirmed the rendered approval gate in all three targets
(`dist/claude`, `dist/codex`, `dist/portable`): `Implementation plan approved?` now offers exactly
`Yes` and `Adjust`. `grep -rn "/goal\|GOAL_START\|create_goal" src docs/user-guide
docs/developer-guide site AGENTS.md README.md` returns no hit, and `dist/` is free of the same
markers.

The removal is guarded by two new tests in `test/build-lib.test.mjs`: a raw-source scan over
`src/SKILL.md` plus every `.md` under `src/tools`, `src/shared` and `src/agents`, and a
three-harness render pass over the nine tools that carried the gate. The render pass also asserts
positively that "Goal-driven completion control" survives, so the retained half cannot be dropped
unnoticed.

## Review findings

**Date:** 2026-07-28
**Reviewer:** Node.js reviewer (build system, tests), generic product reviewer (workflow sources, documentation)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    18 |
| Open / Not implemented |     2 |

No Critical finding arose. All seven Important findings were fixed before completion, among them
the run-state model that defined "non-interactive delegation" by its producer rather than its
property, `apply-review`'s now-unconditional "no further stop" claim, the conflict between the
unconditional progress overview and the generic task-tracking thresholds, and a guard test that
could pass on empty rendered output.

**External review report:** `.effective-flow/review/review-report-2026-07-28-plan-remove-goal-mode-offering.md`
