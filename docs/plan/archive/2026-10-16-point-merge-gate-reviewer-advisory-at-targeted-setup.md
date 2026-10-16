# Point the merge-gate reviewer advisory at targeted setup

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

The merge gate ends with a non-blocking configuration advisory when it observes an automatic
reviewer whose login is missing from `mergeGate.bots` or whose entry has no `.check`
(`src/tools/merge-gate.md` Phase 6, around lines 1084–1097). Today that advisory routes the user
through the whole Guided wizard: `setup guided` → Advanced settings → Block 9 (`mergeGate`) → add
the login → trigger → `.check`. The archived plan
`docs/plan/archive/2026-08-25-suggest-setup-for-unconfigured-automatic-reviewers.md` chose that
route because setup had no targeted update mode. It named "setup gains a direct targeted update
mode" as the trigger to revisit the decision.

`docs/plan/2026-10-16-targeted-free-text-setup-changes.md` (draft PR
sebastian-software/effective-flow#558) adds that mode: `effective-flow setup <free text>` changes
individual configuration keys, and `mergeGate.*` changes go through Block 9's own questions for the
touched reviewer. This plan makes the advisory lead with one targeted invocation built from the
observed evidence, and keeps the Guided route as the fallback.

Workflow recommendation: **Feature**. It changes user-visible advice in the merge gate's final
report.

## Architecture decisions

- **Hard dependency on the targeted setup mode.** Implementation starts only after the targeted
  free-text setup plan is implemented and merged into `develop`. Before any edit, verify these three
  behaviours of `src/shared/setup-targeted-change.md` on `develop`:
  - Step 0 of `src/tools/setup.md` selects **Targeted** for a non-keyword argument;
  - an _ask_ operation exists: a change request without a value, or with a placeholder value, runs
    the owner's question and never writes the placeholder;
  - adding a reviewer to `mergeGate.bots` asks that reviewer's `.trigger` and `.check` through
    Block 9.

  If any of the three is missing, stop and report that this plan is blocked by #558. An advisory
  that names an invocation setup cannot carry out would be worse than today's route. The targeted
  plan was revised on 2026-10-16 to include the last two behaviours.

- **One combined invocation, then the fallback.** The advisory emits one targeted invocation that
  covers every retained candidate, so the user gets one setup run with one preview and one
  confirmation. After it comes one fallback line with the existing Guided route (`setup guided` →
  Advanced settings → Block 9 (`mergeGate`)).
- **Exact keys, and setup asks for the values.** The suggested free text names the configuration
  keys literally (`mergeGate.bots`, `mergeGate.bots.<login>.check`). That leaves setup's interpreter
  no ambiguity, in particular none between `mergeGate.*` and `delivery.prReview`. It carries no
  value the gate has not verified: for `.check` it asks setup to ask the user ("ask me for its
  `.check`"). The user therefore answers Block 9's own `.check` question, with its guidance and its
  "not set" answer, and a pasted invocation never writes a guessed context.
- **No "publishes no check" branch in the gate.** The gate retains per candidate only the
  classification, the login spelling, compact evidence and whether a check list was reported
  (`src/tools/merge-gate.md:367-370`, `:422-426`). It never knows that a reviewer publishes no check,
  and `checksReported: false` does not mean that. The `.check` clause is therefore never conditional:
  every candidate's invocation asks for `.check`. Whether it stays unset is decided by the user in
  setup's question. The existing pointer stays: this pull request's checks list when the record says
  one was reported, otherwise a recent pull request reviewed by the same tool.
- **Trigger stays with setup.** For a missing login, adding the reviewer makes Block 9 ask its
  trigger as well. For a missing `.check` only, the configured login and trigger are kept, and only
  `.check` is asked. The advisory keeps its sentence that a trigger is set only when the reviewer
  supports one.
- **Unchanged guarantees.** The advisory stays non-blocking and chat-only. It stays the final
  conditional summary item before the next-step block, says that setup is the sole ADR writer, and
  says that the advisory changed neither this gate result nor the pull request. It writes nothing
  and starts no setup run.
- **Hidden mode.** The advisory text does not depend on visibility. A targeted setup run in hidden
  mode writes the local configuration file, and `mergeGate.*` is not a forced key there.

## Affected files

| File                               | Description                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`          | Phase 6 final advisory (around lines 1084–1097): lead with the targeted `{{SKILL:setup}}` invocation per the rules above, then the Guided route as the fallback. All existing guarantees and evidence pointers stay.                                                  |
| `build.mjs`                        | `CONTEXT_BUDGET_LINES['merge-gate']` (1940 against a measured 1937, so 3 lines of headroom): raise it to the new measured count plus at most ten lines. The new wording will very likely exceed the current headroom.                                                 |
| `test/workflow-contracts.test.mjs` | Update `Phase 6 gives the complete setup route before the literal final next-step block` (around line 16508). See the acceptance criteria for the new assertions. Every existing regex stays, including both `near()` windows (180 and 220 characters).               |
| `docs/user-guide/configuration.md` | Around lines 498–504: describe the targeted invocation as the recommended route and the Guided route as the fallback.                                                                                                                                                 |
| `docs/user-guide/tools-deliver.md` | Around lines 501–506, the unconfigured-reviewer hint: the same change.                                                                                                                                                                                                |
| `evals/merge-gate/results/`        | A re-recorded merge-gate round before the next release. `tools/merge-gate.md` is a load-set seed of that suite (`evals/merge-gate/suite.config.mjs:65-75`), so the edit changes the skill digest in the stamp. This is owed before the release, not before the merge. |

## Implementation details

### Approach

1. Verify the three precondition behaviours on `develop`. Stop if any is missing.
2. Rewrite the setup-route sentence of the Phase 6 advisory.
   - **Missing login:** suggest an invocation shaped like
     `{{SKILL:setup}} add <login> to mergeGate.bots and ask me for its trigger and mergeGate.bots.<login>.check`.
   - **Missing `.check` only:** suggest
     `{{SKILL:setup}} ask me for mergeGate.bots.<login>.check`.
   - **Several candidates:** join their clauses with "and" in one invocation.
   - **Fallback:** the Guided route as today, in one shorter sentence.
3. Keep the existing evidence, no-invention, sole-writer and unchanged-result sentences unchanged.
4. Measure with `node build.mjs` and set the merge-gate budget.
5. Update the Phase 6 route test and the two user-guide passages.
6. Run the completion checks. Run `pnpm eval merge-gate verify` and name the owed round in the PR
   description.

The invocation shapes in step 2 are examples of the suggested wording, not a fixed grammar. `<login>`
is filled with the spelling the gate retained, so the invocation is copy-paste ready. It contains no
placeholder the user has to replace.

### Component structure

Not relevant.

### State management

Not relevant. The advisory still reads only the wisdom record's retained candidates.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Login with a `[bot]` suffix:** the invocation uses the spelling the gate retained for that
  reviewer: the first observed login for a missing reviewer, the configured spelling for a missing
  `.check`. Setup's collapse rule handles bare and `[bot]` spellings.
- **Reviewer that publishes no check:** the gate cannot know this. The invocation still asks for
  `.check`, and the user answers "not set" in setup's question.
- **Several candidates:** one invocation, each reviewer listed once.
- **No retained candidate:** nothing is emitted, as today.
- **Setup without a configuration:** the targeted run stops and points to the full setup. The
  advisory needs no extra branch for this, because the fallback line already names the full setup.

## Acceptance criteria

- [ ] The updated Phase 6 route test asserts all of the following, and every claim it already
      asserted still passes:
  - the targeted `{{SKILL:setup}}` invocation appears before the Guided route;
  - the invocation names `mergeGate.bots` and `mergeGate.bots.<login>.check` literally;
  - the `.check` part asks setup to ask, and Phase 6 contains no check-name placeholder in the
    invocation;
  - the `.check` clause is not conditioned on `checksReported`;
  - the Guided route (`{{SKILL:setup}} guided`, Advanced settings, Block 9 (`mergeGate`)) remains as
    the fallback.
- [ ] `docs/user-guide/configuration.md` and `docs/user-guide/tools-deliver.md` show the targeted
      invocation first and the Guided route as the fallback.
- [ ] `CONTEXT_BUDGET_LINES['merge-gate']` is at least the measured count and at most ten lines
      above it.
- [ ] Completion check: `pnpm agent:check`, `pnpm test`, `node build.mjs` and
      `pnpm test:distribution` exit 0. `pnpm eval merge-gate verify` reports the merge-gate round as
      owed, and the PR description names that owed round.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, in CI order.
- `pnpm eval merge-gate verify`, to make the owed re-record visible. The round itself is recorded by
  hand before the next release, per `evals/merge-gate/README.md`.
- Manual check in a scratch repository with an existing ADR:
  - paste a missing-login invocation unchanged into `effective-flow setup`: Block 9 asks the
    reviewer's trigger and `.check`; the preview shows the `mergeGate.bots` member and the answered
    rows; nothing is written before confirmation;
  - paste a missing-`.check` invocation unchanged: only `.check` is asked, and the login and trigger
    rows stay byte-identical.

## Assumptions and open points

- Assumption: the targeted free-text setup mode lands as planned in
  `docs/plan/2026-10-16-targeted-free-text-setup-changes.md` (revised 2026-10-16). If its accepted
  phrasing differs, adapt step 2 before implementing; the precondition check stops the run if a
  required behaviour is missing.
- Assumption: no `evals/merge-gate/scenarios/*.md` scenario produces an advisory candidate, so the
  re-record changes no expected outcome. The advisory text is therefore checked only by the prose
  test; a behavioural scenario for it is out of scope.
- Assumption: the iterate and next-steps suites do not seed `tools/merge-gate.md`
  (`evals/iterate/suite.config.mjs:52`, `evals/next-steps/suite.config.mjs:24`), so only the
  merge-gate round is owed.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         0 |    2 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

All findings come from the 2026-10-16 review and have been incorporated into this revision.

**Critical**

- **Architecture / Error cases:** the "gate knows the reviewer publishes no check" branch had no
  data source and invited inferring it from `checksReported: false`. Removed. Every invocation asks
  for `.check`, and a test asserts that the clause does not depend on `checksReported`.

**Important**

- **Error cases:** a literal `<exact check context>` placeholder would have been written as the
  check name when pasted unchanged. The invocation now asks setup to ask. The targeted plan gained
  the _ask_ operation and treats a placeholder value as no value.
- **Architecture:** the trigger follow-up for a newly added reviewer was not guaranteed by the
  targeted plan. That plan now treats adding a reviewer as touching its `.trigger` and `.check`, and
  the precondition check verifies it.

**Note**

- **Testability:** no merge-gate scenario exercises the advisory. Recorded as a known gap.
- **Maintainability:** the eval wording was corrected to "skill digest" of a load-set seed.
- **Testability:** the test update keeps every existing regex and both `near()` windows.
- **Scope:** the budget raise is now planned rather than conditional.

## Implementation notes

Implemented by `effective-flow build` on 2026-10-16, on the branch of the plan pull request. Before
implementing, `origin/develop` (with the targeted setup mode of #558) was merged into the plan
branch as an ordinary merge commit, because `develop` had already changed `build.mjs`,
`docs/user-guide/configuration.md` and the contract test. Deviations from the plan above:

- **Trigger key named literally.** The missing-login invocation reads
  `add <login> to mergeGate.bots and ask me for mergeGate.bots.<login>.trigger and mergeGate.bots.<login>.check`.
- **`.check` rule worded normatively.** The advisory states that `.check` is left unset only by
  answering "not set" in setup, for a reviewer without its own check context. An existing test
  forbids the older phrasing in `src/tools/merge-gate.md`.
- **Order stated explicitly.** The advisory lists the reviewers first, then gives the targeted
  invocation, then the Guided fallback.
- **Fallback chain kept in full.** The Phase 6 test pins every step of the Guided route, so it was
  not shortened.
- **Classification item aligned.** "Unconfigured automatic-reviewer advisory" item 1 now says setup
  asks for the trigger and the exact `.check` context and the user decides on both.
- **Docs.** The older duplicate targeted sentence in `docs/user-guide/configuration.md` was replaced
  by the advisory description.
- **Budget.** merge-gate measures 1941 lines; `CONTEXT_BUDGET_LINES['merge-gate']` is 1944.

## Test results

**Date:** 2026-10-16

| Check                         | Result                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| `pnpm agent:check`            | pass                                                                    |
| `pnpm test`                   | 2256 pass, 1 skipped, 1 fail (environmental, see below)                 |
| `node build.mjs`              | pass; merge-gate 1941/1944                                              |
| `pnpm test:distribution`      | pass                                                                    |
| `pnpm eval merge-gate verify` | stale, as expected: a re-recorded round is owed before the next release |
| `pnpm eval iterate verify`    | all 6 scenarios current                                                 |
| `pnpm eval next-steps verify` | all 11 scenarios current                                                |

The failing test, `the shared seed commit disables inherited automatic Git maintenance before
baseline capture`, fails identically on `develop` on this machine (unreadable global Git ignore
symlink) and is unrelated. Mutation probes confirmed that the updated Phase 6 test fails when the
Guided route comes first, when a placeholder or a check value enters an invocation, when the
missing-check form is removed, and when a sentence conditions the `.check` clause on
`checksReported`.

## Review findings

**Date:** 2026-10-16
**Reviewer:** generic product reviewer (prompt source and docs, reduced depth), Node.js reviewer
(test), code validator (tooling and documentation)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    13 |
| Open / Not implemented |     0 |

One suggestion was closed without a change: shortening the Guided fallback chain, which the
existing Phase 6 test pins step by step.

## Open points

- No open points.
