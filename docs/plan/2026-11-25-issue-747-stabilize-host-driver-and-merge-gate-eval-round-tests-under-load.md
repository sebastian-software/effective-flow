# Stabilize host-driver and merge-gate eval-round tests under load

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #747

## Requirement

Under host load, a few long-running unit-suite tests time out although their code did not change.
In one `merge-gate` conflict round the resolution was clean (`pnpm agent:check` and
`node build.mjs` passed), but `pnpm test` failed three tests in files nobody touched:

- two cases of `test/host-driver.test.mjs` (the portable host-driver Python cases): one reached the
  150 s Python budget, one failed a fixture-wait deadline assertion;
- `test/merge-gate-eval-round.test.mjs` ("one immutable round provisions, seals, retries, and
  publishes isolated slots") reached its fixed `timeout: 360_000`.

None of the failures carried an environment signature, so the gate counted them as ordinary failures
and did not rerun them. It aborted the merge, pushed nothing, and kept its worktree with lifecycle
status `aborted`. That worktree still had the head branch checked out, so the next `merge-gate` run
for the pull request stopped with "head branch checked out elsewhere" until the worktree was released.
An hour later the same tree passed the full suite with no failures. Each such abort costs a conflict
resolution, a full local suite run of about 15 minutes, and a manual cleanup. Autopilot's
delivery-time conflict attempt uses the same validation contract and is exposed the same way.

Goal:

- The two test files pass reliably under the parallel load that `pnpm test` creates.
- Every changed time budget comes from a recorded measurement.
- The gate's validation and no-rerun rules stay unchanged.
- The gate's report gains two short additions:
  - After any controlled stop on the conflict path, it names how to release the retained worktree.
  - After a validation stop on timeouts it cannot attribute, it says a fresh run re-validates from
    scratch and may pass.

Workflow rationale: Bugfix. The tests fail for timing reasons, not because the code is wrong. That
is unexpected behaviour with a known trigger, and the fix is to correct each budget or wait. The
report additions are corrective clarifications in shipped product source (`src/**/*.md`) and add
no new capability. Speeding up the 31 serial builds of the eval-round test is a separate
optimisation and out of scope.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #747
**Original outcome:** `test/host-driver.test.mjs` and `test/merge-gate-eval-round.test.mjs` pass 20 consecutive runs in the project's container environment while the rest of `pnpm test` runs in parallel. Each changed budget is derived from a measured worst case, recorded next to it. The merge-gate no-rerun rule is unchanged. A conflict-path stop reports the worktree release path, and an unattributed-timeout validation stop reports that a fresh run re-validates, both pinned by a contract test.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: test budgets and waits only, plus two short gate report additions
**Continuation decision:** none

## Architecture decisions

- **Fix the tests, not the gate.** The conflict-round validation, the environment-signature
  classes (`src/shared/environment-signature-classes.md`) and the in-run no-rerun rule stay as they
  are. Making the gate rerun or reclassify timeouts would weaken a fail-closed contract to hide test
  flakiness. The gate changes only its report.

- **Measure before changing any budget.** The issue does not name the two failing host-driver
  cases, does not quote the fixture-wait message, and does not say whether each case's time goes
  into a fixture wait or into the case's own work. The first implementation step measures this
  under load, and each budget change is then decided per case.

- **Three wait mechanisms exist. Each changed budget moves with its own mechanism, and its margin
  is applied to the limit that binds.** The Node runner (`scripts/host-driver-tests.mjs:5-12`)
  passes a case's budget to Python only as a kill timeout. On the Python side:

  - **Mixin case deadline.** The `RemainingStageFixtureMixin` classes are in
    `test_remaining_stage.py`, `test_remaining_stage_admission.py`, `test_remaining_stage_worker.py`
    and `test_pin_canonicalization.py`. They set `case_deadline` in
    `remaining_stage_support.py:45` to `CASE_TIMEOUT_SECONDS - TEARDOWN_MARGIN_SECONDS`, which is
    120 s after `setUp`. The constants are in `liveness_wait.py:16-19`. Mixin fixture waits fail
    against it with assertions such as "batch fixture never reached the injected fault"
    (`test_remaining_stage.py:205-212`) and "reservation fault waited past the case deadline"
    (`:237-240`).
  - **Composed inner deadline.** The composed cases pass their child an absolute deadline of
    `120 if unknown else 180` seconds (`test_remaining_stage_composed.py:114`). The parent's waits
    are capped at that deadline minus `TEARDOWN_MARGIN_SECONDS` (`:142`). They fail with
    `fixture wait failed: … deadline cap reached` (raised by `liveness_wait.wait_until`, called at
    `test_remaining_stage_composed.py:191-193`, `:216`) or with
    `fixture barrier timed out: … deadline cap reached` (`composed_remaining_support.py:230-260`).
    `COORDINATOR_TIMEOUT_SECONDS` also arms the real coordinator's watchdogs
    (`composed_remaining_support.py:498`). This mechanism sits inside exact pins:
    - the runner budget is exactly 30 s above each inner timeout
      (`test/host-driver-runner.test.mjs:113-142`);
    - the AST pins and `COMPOSED_INNER_TIMEOUT_SECONDS == max(120, 180)`
      (`test_composed_release.py:300-318`);
    - every assertion of `test_backstops_nest_inside_enclosing_timeouts`
      (`test_composed_release.py:394-405`).
  - **Fixed literal waits.** Many cases use waits that no case budget reaches, for example
    `test_host_driver.py:547`, `:602-614`, `:745-785`, `test_host_run.py:54-148`, and inside a
    mixin class `test_remaining_stage_admission.py:39` (`barrier.wait(timeout=10)`) and `:47`
    (`future.result(timeout=20)`). Raising a budget gives these waits no more time.

  Which mechanism failed in the incident stays unknown until step 1 measures it. Decided by
  score (see "Decided by score"):

  - **Composed cases: lockstep raise.** If measurement names a composed case, only the inner
    timeout of that branch is raised. The recovery branch is 180 s and the unknown-start branch is
    120 s. The unknown-start branch then gets its own `pythonCaseBudgets` entry.
    `COMPOSED_INNER_TIMEOUT_SECONDS` and the nested backstops (`CHILD_BARRIER_BACKSTOP_SECONDS`,
    `COORDINATOR_TIMEOUT_SECONDS`, `COMPOSED_WAIT_BACKSTOP_SECONDS` and the ready-batch window)
    move only when the raised inner timeout exceeds the current maximum of 180 s. Every assertion
    of `test_backstops_nest_inside_enclosing_timeouts` and every AST pin holds with the new
    literals.
  - **Mixin cases: handoff only when needed.** The environment-variable handoff to
    `case_deadline` is built only if step 2 raises at least one mixin case's runner budget.
  - **Fixed literal waits.** These are directly incorporable, so no score was taken. A failing wait
    is replaced with `liveness_wait.wait_until`, whose backstop is capped by the case's own
    deadline. Where a liveness predicate is not available, the literal is raised by the margin
    rule.

- **Derive the eval-round timeouts from the discovered scenario corpus.** Run time grows with the
  corpus (`discoverSuite(suite).scenarios`, currently 30). The comment at
  `test/merge-gate-eval-round.test.mjs:1516-1517` says an overlaid scenario costs "about five
  times" as much as a plain one. The timeout therefore uses a weighted count,
  `scenarios + 4 × overlaid`. Overlaid scenarios are
  `discoverSuite(suite).scenarios.filter(suite.overlay.applies)`
  (`evals/merge-gate/suite.config.mjs:199-202`). The weight 4 comes from that comment. Step 1 checks
  it against a measurement and records the result. The outer test timeout is the weighted count
  times a measured per-unit cost, never below the current 360 s. Its 11 inner `waitForMarker` calls
  default to a 60 s backstop (`test/support/marker-wait.mjs:15`). Those phases include builds
  followed by an identity pass over every scenario, so they also grow with the corpus. A marker
  wait that reaches the near-budget threshold gets a `timeoutMs` derived the same way.

- **Record measurements beside the budgets.** Each changed constant gets a short comment with its
  measured worst case, load level and base commit. The full run table goes into
  `docs/developer-guide/host-driver-test-profile.md`, which already holds the #695 load procedure
  and timings.

- **Gate report: state each addition once, in the fragment that owns its stop.** Decided by score:

  - **Release path.** It goes into the one bullet of `src/shared/merge-gate-delegated-run.md`
    (`:962-966`) that owns every controlled stop on the conflict path. Those stops are `off`, an
    unanswered `ask`, an `ABORT` from either verification role, and a conflict the run may not or
    cannot resolve. All of them leave an `aborted` worktree with the head branch checked out. The
    release path applies only when that stop transitioned an Effective Flow-owned worktree to
    `aborted`. An in-place run creates no worktree and no record, so there is nothing to release
    (`merge-gate-checkout-boundary.md:24-29`). It is a pointer and does not copy cleanup's
    eligibility rules: "release it with `effective-flow cleanup`, which names any blocker and its
    remedy". Cleanup already reports a dirty tree or an in-progress operation with its remedy
    (`src/tools/cleanup.md:594-606`). The report names no shell command.
  - **Fresh-run clause.** It goes into step 4 of "Resolving a conflict with the base" in
    `src/shared/merge-gate-conflict-resolution.md` (`:158-163`). That is the validation stop, which
    only merge-gate runs and autopilot does not read. It reuses the existing term "a timeout of a
    role's own host tool, and any timeout it cannot attribute" (`:235-236`). It applies when every
    failing check is reported `TIMEOUT`, or when its decisive diagnostic reports only such
    timeouts. It then says that a fresh `effective-flow merge-gate <PR>` re-validates from scratch
    and may pass. The clause reads only the terminal states and diagnostics the validator already
    returns (`src/agents/code-validator.md:120-128`), so the validator contract does not change.

## Affected files

| File                                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/host-driver-tests.mjs`                                                                                                                                                                           | Raise or add `pythonCaseBudgets` entries for measured failing cases. A runner budget is its binding deadline plus `TEARDOWN_MARGIN_SECONDS`, and its Node budget is 30 s higher. Only if a mixin case's budget is raised: pass that budget to the child through one named environment variable.                                                                |
| `evals/host-driver/tests/liveness_wait.py`                                                                                                                                                                | Keep `CASE_TIMEOUT_SECONDS = 150` as a literal. Only with the handoff, add `case_budget_seconds()`.                                                                                                                                                                                                                                                            |
| `evals/host-driver/tests/remaining_stage_support.py`                                                                                                                                                      | Only with the handoff, derive `case_deadline` from `case_budget_seconds()`. Where measurement shows a mixin fixture wait is the slow part, use an explicit fixture-wait budget.                                                                                                                                                                                |
| `evals/host-driver/tests/test_remaining_stage.py`, `evals/host-driver/tests/test_remaining_stage_admission.py`, `evals/host-driver/tests/test_host_driver.py`, `evals/host-driver/tests/test_host_run.py` | Only for a measured failing case: give it an explicit wait budget, or replace a fixed literal wait with `liveness_wait.wait_until`, or raise the literal by the margin rule.                                                                                                                                                                                   |
| `evals/host-driver/tests/test_remaining_stage_composed.py`, `evals/host-driver/tests/composed_remaining_support.py`, `evals/host-driver/tests/test_composed_release.py`                                   | Only if measurement names a composed case: apply the per-branch lockstep raise and update the literal pins and relation pins (`:300-318`, `:394-405`).                                                                                                                                                                                                         |
| `test/host-driver-runner.test.mjs`                                                                                                                                                                        | Update the exact-budget pins: lines 85–111 and the literal-occurrence pin at line 171. For a composed change, also update lines 113–142. Only with the handoff, add a case checking that the runner hands the budget to the child.                                                                                                                             |
| `evals/host-driver/tests/test_liveness_wait.py`                                                                                                                                                           | Only with the handoff: keep the default equality pin and show that it holds with and without the variable set. Add cases for the override, a malformed value, and a value below the default.                                                                                                                                                                   |
| `test/merge-gate-eval-round.test.mjs`                                                                                                                                                                     | Replace `{ timeout: 360_000 }` (line 1527) with a timeout derived from the weighted scenario count, with a 360 s floor. Derive `timeoutMs` for any near-budget marker wait. Update the measurement comment at lines 1503–1523.                                                                                                                                 |
| `src/shared/merge-gate-delegated-run.md`                                                                                                                                                                  | Add the conditional release-path pointer to the controlled-stop bullet (lines 962–966).                                                                                                                                                                                                                                                                        |
| `src/shared/merge-gate-conflict-resolution.md`                                                                                                                                                            | Add the fresh-run clause to step 4 of "Resolving a conflict with the base" (lines 158–163). The shared "Classifying the reported results" paragraph stays unchanged.                                                                                                                                                                                           |
| `test/merge-gate-conflict-validation-contract.test.mjs`                                                                                                                                                   | Add contract tests that name their invariants. Pin the release-path pointer, including its owned-worktree condition, in the controlled-stop bullet. Pin the fresh-run clause in step 4 and confirm it is absent from the shared paragraph. The `AD7_RULE` pins stay unchanged.                                                                                 |
| `docs/developer-guide/host-driver-test-profile.md`                                                                                                                                                        | Add a section for #747 covering the load procedure and level, per-case and eval-round worst cases (marker waits included), the overlay-weight check, the 20-run result, and the chosen budgets, or the "not reproduced" outcome. Update its "120 s or 180 s" mention (line 306) if a composed inner timeout changes. Describe the second checkout generically. |

## Implementation details

### Approach

1. **Measure the baseline.** Work in the project's container environment, running through the
   project runner its developer instructions name.

   - **Calibration load (the acceptance profile).** Run
     `node --test test/host-driver.test.mjs test/merge-gate-eval-round.test.mjs` while a second,
     separate checkout loops `pnpm test` in parallel. Add busy loops until the host `load1` mean is
     at least 8.8. Sample `load1` every 5 s from `/proc/loadavg` and record it. Every budget is
     derived from this profile, which is the same one the acceptance runs use.
   - **Method B only to locate stalls.** Method B of the #695 procedure runs concurrent copies of
     the composed recovery case, the composed unknown-start case and the batch-failure case. It
     shows where a case stalls and prints its `composed-phase-timing:` line. Its durations never
     calibrate a budget, because the guide rules it out as a pass criterion
     (`docs/developer-guide/host-driver-test-profile.md:288-301`).
   - **Censored runs.** A calibration run that ends at a runner kill, a deadline cap or a backstop
     gives only a lower bound. Rerun that case under the same load with a temporarily raised local
     cap, never committed, to measure its real duration, and record both numbers.

   Record:

   - each host-driver case's wall time, and for each mixin or composed case its work-phase time
     against its binding deadline (for composed cases, the `headroomSeconds` of
     `composed-phase-timing:`);
   - the eval-round test's wall time, the longest duration of each `waitForMarker` phase, and the
     overlaid versus plain scenario cost, as a check on the weight 4;
   - each failure point, by its message:
     - a runner timeout ("Python unittest timed out after N ms");
     - a mixin deadline assertion;
     - a composed deadline cap (`fixture wait failed` or `fixture barrier timed out`);
     - a backstop expiry;
     - a plain assertion or `TimeoutExpired` after a fixed literal wait;
     - a marker-wait expiry ("timed out after 60000 ms waiting for …").

   Name the slowest cases. The load during the original gate run is unknown.

2. **Classify each failing or near-budget case.** A case is near-budget when its measured worst
   case reaches at least 80 % of its **binding** limit. For a mixin case that limit is
   `case_deadline`, for a composed case it is the capped wait limit, and for any other case it is
   its fixed wait or its runner budget. The same threshold applies everywhere in this plan. The
   margin rule is fixed before measuring: binding limit = W + `max(30 s, 0.5 × W)`, rounded up to a
   whole 10 s, where W is the measured worst case of the work phase that limit bounds. The margin
   stays above `0.25 × W`, so a run that only repeats W stays below the threshold.

   - Mixin fixture wait is the slow part: give that wait an explicit budget by the margin rule.
   - Other mixin case: raise its `case_deadline` by the margin rule. Its runner budget becomes that
     deadline plus `TEARDOWN_MARGIN_SECONDS`, keyed by exact identity like the existing override,
     with a Node budget 30 s higher.
   - Composed case: apply the per-branch lockstep raise under "Architecture decisions". The inner
     timeout follows the margin rule, and its runner budget is 30 s above it.
   - Fixed literal wait: replace it with `liveness_wait.wait_until`, or raise the literal by the
     margin rule.

3. **Let a raised mixin budget reach its Python deadline.** Run this step only if step 2 raised at
   least one mixin case's runner budget; otherwise skip it.

   - The runner sets `EFFECTIVE_FLOW_HOST_DRIVER_CASE_BUDGET_SECONDS` to whole seconds
     (`pythonTimeout / 1000`).
   - `liveness_wait.case_budget_seconds()` returns `max(CASE_TIMEOUT_SECONDS, value)` for a valid
     positive integer. Otherwise it returns `CASE_TIMEOUT_SECONDS`.
   - `remaining_stage_support.py` computes `case_deadline` from that value minus
     `TEARDOWN_MARGIN_SECONDS`.
   - `CASE_TIMEOUT_SECONDS` stays the literal 150, so the existing pin does not depend on the
     environment.

4. **Derive the eval-round timeouts.** Keep `{ timeout: … }` where the test is registered (line
   1525). At module load, compute `max(360_000, perUnitMs × (scenarios + 4 × overlaid))`.

   - The per-unit cost comes from the step 1 worst case divided by the current weighted count,
     times a safety factor of 1.5. The factor is fixed before measuring and stays above the 1.25
     that the 80 % threshold implies.
   - A marker wait whose longest phase reached the near-budget threshold of 60 s gets a `timeoutMs`
     derived the same way, with a 60 s floor. If none reached it, the measured headroom is recorded
     in the profile guide.
   - The comment states the measurement, the weight with its source, and the factor.
   - A discovery failure must not break the file. A corpus parity error already has its own test
     there, so when `discoverSuite` throws, the timeouts fall back to their floors.

5. **Add the gate report additions** as decided under "Architecture decisions":

   - In `src/shared/merge-gate-delegated-run.md`, add one clause to the controlled-stop bullet:
     when the stop transitioned an Effective Flow-owned worktree to `aborted`, the report names
     that worktree and says to release it with `effective-flow cleanup`, which names any blocker and
     its remedy. The validation-generated paths are already listed in the report.
   - In step 4 of "Resolving a conflict with the base" in
     `src/shared/merge-gate-conflict-resolution.md`, add the fresh-run clause. It applies when every
     failing check is `TIMEOUT`, or when its decisive diagnostic reports only timeouts the role
     cannot attribute. In that case a fresh `effective-flow merge-gate <PR>` re-validates from
     scratch and may pass.

   The no-rerun rule within a run stays unchanged. Both fragments are lazy-loaded (`merge-gate.md`
   loads `merge-gate-delegated-run.md` at `:345`, which loads the conflict fragment at `:351-354`).
   Confirm with the `Always-loaded core` report of `node build.mjs` that no `contextBudget`
   changes.

6. **Pin the additions** in `test/merge-gate-conflict-validation-contract.test.mjs`. Use the file's
   `prose()`/`slice()` helpers and name each invariant in its test title:

   - the release-path pointer sits in the controlled-stop bullet with its owned-worktree condition;
   - the fresh-run clause sits in step 4 with its unattributed-timeout condition and is absent from
     "Classifying the reported results";
   - the `AD7_RULE` text is unchanged.

7. **Verify with 20 consecutive runs**, independent of the step 1 data (see "Validation plan").

   - If a step 7 run fails or a case reaches the near-budget threshold, take that run's worst case
     as the new measurement, repeat steps 2–7 once, and report the repeat.
   - If it fails again, stop and report the case with its timings instead of raising budgets
     further.
   - Write the measurements, the chosen budgets and the 20-run result into the new #747 section of
     `docs/developer-guide/host-driver-test-profile.md`.

### Component structure

Not relevant: no new modules. The changes are constants and waits, an optional environment-variable
handoff between the existing runner and the existing Python helper, computed test options, and two
report clauses.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Measurement does not reproduce a failure** (decided by score). If no host-driver case reaches
  the near-budget threshold under the calibration load, change no host-driver budget. Record the
  measurement and the 20-run result. Report the host-driver part as "not reproduced" in the pull
  request and in the profile guide. Leave that part of #747 open, or move it to a follow-up issue,
  instead of claiming it is fixed. The eval-round and gate-report parts are unaffected.
- **Direct Python invocation.** `python3 -B -m unittest <id>` without the runner sets no
  environment variable, so the case uses the 150 s default and behaves as it does today.
- **Malformed or low environment value.** A non-numeric, non-positive or below-default value never
  shortens a deadline: `case_budget_seconds()` returns at least `CASE_TIMEOUT_SECONDS`.
- **Inherited environment.** The variable also reaches the case's grandchildren, the composed child
  interpreter and `host-run.mjs`. Only `liveness_wait.case_budget_seconds()` reads it.
- **Minimum wait floor.** `remaining_seconds` keeps its `MINIMUM_WAIT_SECONDS` floor, so a raised
  deadline never shortens a wait.
- **Node budget ordering.** Every `nodeTimeout` stays strictly above its `pythonTimeout`. The
  runner's own kill, with its diagnostic, then fires before `node:test` cancels the case.
- **Scenario count shrinks, or discovery throws.** The eval-round timeouts never drop below their
  floors.
- **In-place merge-gate run.** A stop in an invocation checkout that merge-gate reused creates no
  worktree and no record. The release-path clause does not apply, and the report lists only the
  remaining working-tree paths, as it does today.
- **Duration.** The host-driver file runs its discovered Python cases in sequence, and a full suite
  under load took 1385 s (`host-driver-test-profile.md:276`). The 20 runs take several hours, so
  they may be split into recorded batches. "Consecutive" means no run is left out of the record:
  every failed run counts as a failure whatever the load. Only a passing run below the load target
  is discarded, and it is recorded as discarded.

## Acceptance criteria

- [ ] `test/host-driver.test.mjs` and `test/merge-gate-eval-round.test.mjs` pass 20 consecutive counted runs in the project's container environment, with `pnpm test` running in parallel in a second checkout and the host `load1` mean ≥ 8.8. No run fails on a timeout, a deadline or a backstop. The run log is recorded in `docs/developer-guide/host-driver-test-profile.md`: batches, start, end, `load1` mean and peak, the result of each run, and any discarded runs.
- [ ] Every changed time budget has a comment next to its constant giving the measured worst case it is derived from, the load level and the base commit. A budget with no recorded measurement is not changed. If no host-driver case was reproduced, the pull request and the profile guide say "not reproduced" for that part.
- [ ] Each raised host-driver budget reaches the limit that binds that case: a composed case through the per-branch lockstep raise, a mixin case through the environment-variable handoff, and a fixed literal wait through `wait_until` or a raised literal. The affected pins (`test/host-driver-runner.test.mjs`, `test_liveness_wait.py`, `test_composed_release.py`) pass with the new values and keep their stated relations.
- [ ] The eval-round test's outer timeout is computed from the weighted count of `discoverSuite(suite)` scenarios and is at least 360 s. Each marker wait that was near-budget has a derived `timeoutMs` of at least 60 s.
- [ ] The controlled-stop bullet of `src/shared/merge-gate-delegated-run.md` contains the conditional release-path pointer.
- [ ] Step 4 of "Resolving a conflict with the base" in `src/shared/merge-gate-conflict-resolution.md` contains the unattributed-timeout fresh-run clause.
- [ ] Tests in `test/merge-gate-conflict-validation-contract.test.mjs` name their invariants and pin the wording and placement of both additions. The existing `AD7_RULE` pins pass unchanged.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (no `contextBudget` overrun), `pnpm test:distribution`.

## Validation plan

- **Unit tests**
  - `test/host-driver-runner.test.mjs`: budget pins and composed nesting pins.
  - `evals/host-driver/tests/test_liveness_wait.py`, run through `test/host-driver.test.mjs`: the
    default pin with and without the variable, the override, and malformed and below-default
    values.
  - `evals/host-driver/tests/test_composed_release.py`: every relation still holds.
  - `test/merge-gate-conflict-validation-contract.test.mjs`: the new invariants and the existing
    pins.
- **Load run**
  - Run `node --test test/host-driver.test.mjs test/merge-gate-eval-round.test.mjs` 20 times in a
    row in the project container. Meanwhile a second checkout loops `pnpm test` and busy loops hold
    the host `load1` mean at or above 8.8. Sample `load1` every 5 s.
  - Pass condition: 20 of 20 counted runs are green, and no case or marker wait reaches the
    near-budget threshold.
  - A failing run counts and is reported with its timing. It is never retried just to reach a green
    count. The one bounded repeat is defined in Approach step 7.
- **Full CI order:** `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- **Eval evidence:** run `pnpm eval <suite> verify` (read-only) for each of the five suites
  (`merge-gate`, `iterate`, `next-steps`, `build-context`, `focus`). Report the freshness debt they
  show in the pull request. No evidence is re-recorded.

## Assumptions and open points

- Assumption: a parallel `pnpm test` with busy loops at `load1` ≥ 8.8 reproduces the failure well
  enough to measure worst cases. If it does not, the "not reproduced" edge case applies.
- Assumption: editing `src/shared/merge-gate-delegated-run.md` and
  `src/shared/merge-gate-conflict-resolution.md` creates freshness debt in every eval suite whose
  load closure includes them. That is at least `merge-gate`, and probably `build-context`, whose
  seeds are every `tools/*` file. CI reports the debt without failing on it, and re-recording
  evidence is not part of this issue.
- Assumption: a dedicated script for repeating a test N times is not needed. The 20 runs are a
  manual developer procedure, documented in the profile guide like the #695 procedure.
- Known inconsistency, left out of scope: `merge-gate-checkout-boundary.md:64-65` and
  `merge-gate-delegated-run.md:964-965` say `git merge --abort` leaves the checkout clean. However,
  validation-generated changes are left in the working tree
  (`merge-gate-conflict-resolution.md:98-100`), and `git merge --abort` keeps unstaged changes.
  This plan relies on `effective-flow cleanup` to report a dirty tree and does not fix the wording.
  It is a candidate for a follow-up issue.
- Out of scope: reducing the 31 serial `node build.mjs` runs of the eval-round test, and any change
  to the gate's rerun or environment-signature rules.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "If measurement names a composed host-driver case as failing under load, how is it handled?",
    "options": [
      "Lockstep composed raise",
      "Derive composed timeout from budget",
      "Composed out of scope"
    ],
    "scores": [
      {
        "label": "Lockstep composed raise",
        "score": 8,
        "reason": "Matches the existing 30 s nesting pattern, keeps the literal AST pins and stated relations, and does not depend on the conditional P4 handoff."
      },
      {
        "label": "Derive composed timeout from budget",
        "score": 5,
        "reason": "One value would drive both mechanisms, but it rewrites the AST pins, requires deriving every nested backstop, and couples composed handling to the conditional handoff."
      },
      {
        "label": "Composed out of scope",
        "score": 2,
        "reason": "Knowingly leaves the reported fixture-wait failure in place, contradicting the 20-run acceptance goal."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Where does the new merge-gate report sentence (clean and release the retained worktree, then a fresh run is safe) go?",
    "options": [
      "Merge-gate step 4",
      "Shared paragraph plus autopilot substitution",
      "Shared paragraph scoped inline"
    ],
    "scores": [
      {
        "label": "Merge-gate step 4",
        "score": 8,
        "reason": "Step 4 owns the merge-gate-only stop that commits nothing and autopilot never reads it, so the sentence sits once at its decision point without a qualifier or substitution."
      },
      {
        "label": "Shared paragraph plus autopilot substitution",
        "score": 3,
        "reason": "The autopilot substitution would only cancel the sentence and adds text to two fragments for one merge-gate rule."
      },
      {
        "label": "Shared paragraph scoped inline",
        "score": 5,
        "reason": "Keeps it next to the unattributed-timeout clause but puts merge-gate-only text into a paragraph autopilot applies unchanged."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "When does the new gate report sentence apply (worktree release path and a fresh run is safe)?",
    "options": [
      "Always release path, conditional fresh-run clause",
      "Define timeout set and require per-test causes",
      "Strict all-timeouts rule"
    ],
    "scores": [
      {
        "label": "Always release path, conditional fresh-run clause",
        "score": 8,
        "reason": "Every aborted validation leaves a retained worktree, so the release path always applies, while the fresh-run assurance stays limited to failures named as test timeouts or deadline/backstop expiries, covering the issue incident."
      },
      {
        "label": "Define timeout set and require per-test causes",
        "score": 6,
        "reason": "Covers the incident with the same per-test reporting cost but withholds the release path after other aborts that strand the worktree too."
      },
      {
        "label": "Strict all-timeouts rule",
        "score": 2,
        "reason": "Verdicts are per check and the incident included a deadline AssertionError, so the sentence would not fire for its motivating case."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Build the environment-variable handoff that lets a raised mixin runner budget reach its Python case_deadline?",
    "options": [
      "Handoff only when needed",
      "Handoff unconditionally"
    ],
    "scores": [
      {
        "label": "Handoff only when needed",
        "score": 8,
        "reason": "No mixin case has a raised runner budget today, so a conditional handoff avoids an unused channel and its test surface while the plan already specifies it."
      },
      {
        "label": "Handoff unconditionally",
        "score": 4,
        "reason": "Adds a new runner-to-Python channel and its tests that no case uses, against the rule that each change comes from a measured worst case."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Which load profile calibrates the measured worst cases the changed budgets are derived from?",
    "options": [
      "Calibrate on acceptance profile",
      "Calibrate on Method B with censoring",
      "Calibrate on Method B as written"
    ],
    "scores": [
      {
        "label": "Calibrate on acceptance profile",
        "score": 9,
        "reason": "Takes worst cases from the same load as the acceptance gate and uses Method B only for stall location; its edge over Method B with censoring is that budgets are not inflated by a load the profile guide excludes as a pass criterion."
      },
      {
        "label": "Calibrate on Method B with censoring",
        "score": 5,
        "reason": "Handles capped runs correctly but calibrates on a load beyond the composed inner timeout, inflating budgets beyond what acceptance justifies."
      },
      {
        "label": "Calibrate on Method B as written",
        "score": 2,
        "reason": "Capped runs give only lower bounds, not the measured worst case the acceptance criteria require."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Should the gate report sentence offer reusing the retained worktree in place as an alternative to releasing it?",
    "options": [
      "Drop in-place alternative",
      "Keep in-place alternative"
    ],
    "scores": [
      {
        "label": "Drop in-place alternative",
        "score": 8,
        "reason": "In-place reuse cannot release the aborted record, so cleanup is required on every path and a single release path keeps the sentence and its pin shorter."
      },
      {
        "label": "Keep in-place alternative",
        "score": 4,
        "reason": "It still needs cleanup afterwards and risks a branch/OID mismatch at cleanup time, adding report and test surface for little gain."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How is the condition of the gate report fresh-run clause defined?",
    "options": [
      "Reuse unattributed-timeout term",
      "Keep per-test requirement",
      "Unconditional re-validation note"
    ],
    "scores": [
      {
        "label": "Reuse unattributed-timeout term",
        "score": 9,
        "reason": "Reuses the existing any-timeout-it-cannot-attribute contract and matches the validator per-check TIMEOUT and attribution output, so it is checkable without repo-specific vocabulary; its edge over the unconditional note is keeping the decided timeout-only scope."
      },
      {
        "label": "Keep per-test requirement",
        "score": 2,
        "reason": "The validator contract does not list every failing test, so the clause would almost never fire, including for the issue incident."
      },
      {
        "label": "Unconditional re-validation note",
        "score": 4,
        "reason": "Always true but drops the decided timeout-only scope and invites reruns after deterministic failures."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "If calibration finds no failing or near-budget host-driver case, how is that outcome handled?",
    "options": [
      "Report not reproduced",
      "Raise load until failure",
      "Green runs count as fix"
    ],
    "scores": [
      {
        "label": "Report not reproduced",
        "score": 9,
        "reason": "Keeps the no-change edge case and states plainly that the host-driver failure was not reproduced; its edge over raising the load is staying inside the scored acceptance-profile calibration decision."
      },
      {
        "label": "Raise load until failure",
        "score": 3,
        "reason": "Contradicts the scored calibration decision and would inflate budgets beyond what acceptance justifies."
      },
      {
        "label": "Green runs count as fix",
        "score": 2,
        "reason": "Claims a fix without a reproduced failure or a changed budget, hiding that the host-driver failure is unexplained."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Where does the worktree release path go, given that conflict stops at steps 1, 3 and 5 also leave an aborted worktree?",
    "options": [
      "Release path in controlled-stop bullet",
      "Validation stops only"
    ],
    "scores": [
      {
        "label": "Release path in controlled-stop bullet",
        "score": 9,
        "reason": "The merge-gate-delegated-run bullet already owns every conflict-path stop, so the release path is stated once and covers all of them without contextBudget impact; its edge is closing the gap instead of recording it."
      },
      {
        "label": "Validation stops only",
        "score": 3,
        "reason": "Leaves stops at steps 1, 3 and 5 without a release path and scatters the controlled-stop contract across two fragments."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         6 |    2 |
| Testability     |        0 |         4 |    2 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    4 |

### Findings

Internal review (Phase 6):

- Error cases, Important: the plan attributed the issue's fixture-wait failure to the composed cases only. Adjusted: the origin stays unknown until step 1 measures it, and each failure point is recorded by its message.
- Testability, Important: Method B pushes cases past their caps. Adjusted by score: budgets are calibrated on the acceptance load profile, Method B only locates stalls, and a capped run is treated as censored and measured again.
- Error cases, Important: cleanup refuses a dirty worktree. Adjusted, then superseded by the deep review: the release path points to cleanup, which names the blocker and its remedy.
- Testability, Important: a margin below 25 % would trip the 80 % threshold on a repeat of the worst case. Adjusted: the margin and the safety factor are fixed before measuring.
- Maintainability, Note: `test_pin_canonicalization.py` uses the mixin. Adjusted: it is added to the mixin class list.
- Maintainability, Note: reusing the worktree in place leaves its `aborted` record behind. Adjusted by score: cleanup is the only release path.

Deep plan review (Phase 6b):

- Error cases, Important: fixed literal waits form a third mechanism that no budget reaches. Adjusted: they are classified in step 2 and fixed by `wait_until` or by the margin rule.
- Testability, Important: the margin was applied to the runner budget, not to the limit that binds. Adjusted: the margin applies to the binding limit, and the runner budget is derived from it.
- Error cases, Important: the eval-round marker waits keep a 60 s backstop while the corpus grows. Adjusted: they are measured, and any near-budget wait gets a derived `timeoutMs`.
- Error cases, Important: an in-place run has no worktree to release. Adjusted: the release path applies only to an Effective Flow-owned worktree transitioned to `aborted`.
- Maintainability, Important: the clean-tree command copied cleanup's own check in a weaker form. Adjusted: the report points to `effective-flow cleanup` and contains no shell command.
- Error cases, Important: the fresh-run condition introduced new vocabulary that cannot be verified. Adjusted by score: it reuses the existing unattributed-timeout term and the validator's per-check states.
- Testability, Important: acceptance could not tell "fixed" from "not reproduced". Adjusted by score: that outcome is reported as "not reproduced", and that part of the issue stays open.
- Error cases, Note: a below-default environment value could shorten a deadline. Adjusted: `case_budget_seconds()` never returns less than the default.
- Testability, Note: a failed low-load run could have been discarded. Adjusted: every failed run counts.
- Maintainability, Note: the composed lockstep raise was underspecified. Adjusted: it is handled per branch and covers every nesting assertion and AST pin.
- Maintainability, Note: a line reference named the wrong file. Adjusted.
- Architecture, Note: other conflict stops strand the branch in the same way. Adjusted by score: the release path moves to the controlled-stop bullet, which owns every conflict-path stop.
- Error cases, Note: existing contracts claim `git merge --abort` leaves the checkout clean. Recorded as a known inconsistency in "Assumptions and open points", out of scope.
- Testability, Note: the overlay weight was not measured, and a host-specific path was in the plan. Adjusted: step 1 checks the weight, and the path is described generically.

## Open points

- No open points.
