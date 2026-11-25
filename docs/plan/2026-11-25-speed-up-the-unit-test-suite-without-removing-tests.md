# Speed up the unit-test suite without removing tests

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

The `Unit tests` step of `.github/workflows/ci.yml` takes 11–21 minutes on `ubuntu-latest` (4 vCPU). Build, distribution smoke and eval evidence together take about 45 s. The investigation `.effective-flow/investigation/investigation-2026-11-25-unit-test-laufzeit-auf-github-runnern-und-entbehrliche-tests.md` found:

- one exponential-time defect in a repo-only script;
- a throughput-bound suite: about 3,058 s of summed test time, run at the `node --test` default of 3 files at a time.

This plan implements the five measures the user selected from that investigation, under the heading "speed-up without removing tests":

1. Fix the exponential subset search in `matchBodyDeltas`.
2. Run the 137 host-driver Python cases with a concurrency of 2.
3. Run the CI suite with `--test-concurrency=4`.
4. Split `test/build-run.test.mjs` and move the 167 s round test out of `test/merge-gate-eval-round.test.mjs`. This lets file-level parallelism and sharding work.
5. Shard the unit tests over a 3-way CI matrix. The required check `Format, test and build` passes only when every shard passed (user decision: gate inside the required job, `if: always()`).

No test is removed, no assertion is weakened, and no deadline or budget is raised. `docs/adr/pragmatic-test-release-policy.md:48-51` forbids all three and keeps the full suite, including host-driver cases, inside the required checks. The measures fit that policy: every test still runs inside the required status.

Out of scope:

- test removals and merges;
- shared build and git fixtures (investigation option 5);
- the duplicate suite run in `release.yml` (option 7), and any change to `release.yml`.

**Workflow rationale:** Refactoring. Nothing changes in product behaviour or test semantics; the goal is runtime. Measure 1 removes a performance defect while preserving the function's exact results, which is a performance-only refactoring of a repo-only script.

## Outcome checkpoint

**Primary source:** user request in this repository (effective-flow, `develop`), based on the investigation report above.

**Original outcome:** median CI wall time to a completed `Format, test and build` drops clearly, with a goal of below 12 minutes, from about 16–18. That is about 6–7 min of shards plus about 1.5–2 min of the gated `build` job. The time is a goal, not a completion gate (user decision); it is measured and documented. Conditions: an unchanged test set, unchanged required checks and no raised deadline.

**Last evaluated attempt:** none.

**No-progress count:** 0

**Cumulative approach:** algorithmic fix, file splitting, CI matrix sharding, file-level and intra-file concurrency, rolled out in stages.

**Continuation decision:** none.

## Architecture decisions

- **`matchBodyDeltas` keeps its exact result.**
  - Today the function returns the numerically smallest mask `1 … 2^n−1` whose deltas, applied in ascending index order, turn the baseline into the working text. A `null` from `applyEdits` fails that mask (`scripts/compare-native-agent-baseline.mjs:594-623`).
  - The new search walks the deltas in declared order with include and skip branches. It applies each included delta incrementally, so every subset gets the same prefix text as today, and it prunes a branch as soon as `applyEdits` returns `null`. Pruning only drops subsets that already fail.
  - It collects **every** complete match and returns the numerically smallest. That is exactly today's winner, so the pinned stdout in `test/execution-profile-rendering.test.mjs:516-554` cannot change.
  - **How matches are compared:** the first leaf a depth-first walk reaches is **not** the smallest mask. Compare collected matches by their included index sets, each sorted descending, position by position: at the first differing position the lower index wins, and a set that runs out of indices first wins (for example `{3}`, mask 8, beats `{0,3}`, mask 9). This ordering is equivalent to the numeric mask for every n; a `BigInt` mask is an equally valid implementation.
  - Rejected alternatives:
    - **Fail on ambiguity:** a behaviour change that could break today's baseline.
    - **Greedy apply-if-present:** rejects valid compositions (`test/compare-native-agent-baseline.test.mjs:234`, `:299`).
- **The concurrency flag lives in the CI invocation, not in `package.json`.**
  - Locally `node --test` keeps its default (cores − 1). On a 12-core machine a fixed `4` would slow local runs.
  - CI passes the flags as `pnpm test --test-shard=<i>/3 --test-concurrency=4`, **without** a `--` separator. The pinned pnpm 12.5.1 forwards `--` to the script, and `node --test -- <flags>` treats the flags as file patterns and exits 1.
  - `release.yml` stays unchanged. A load flake there would block the release and delivery job, and release latency is not the target.
- **Splits are pure moves.**
  - Test titles, bodies, timeouts and assertions stay byte-identical. Only file membership changes, plus imports of the shared helpers moved to `test/support/`.
  - The 167 s merge-gate round test is one mutating state machine (`test/merge-gate-eval-round.test.mjs:1525-2316`). It moves whole into its own file, together with its timing comment at `:1515-1524`, and is not broken into phases (user decision). Phase files would rebuild state per phase and drop the end-to-end check of the phase transitions.
- **The sharding gate sits inside the required job** (user decision).
  - A new matrix job `unit-tests` runs three shards.
  - The job `build` keeps its name `Format, test and build`, declares `needs: unit-tests` and runs under `if: always()`. It is never skipped, also not when a shard fails or the run is cancelled; GitHub counts a skipped required check as passing.
  - Its first step, before checkout, fails unless `needs.unit-tests.result` is `success`. For a matrix job that aggregate is `success` only when every leg succeeded. The value comes in through `env:`, not an inline expression in the script.
  - `unit-tests` declares job-level `permissions: contents: read`, narrower than the inherited workflow default (`ci.yml:8-11`); its checkout inputs stay identical to those of `build`.
  - Branch protection stays unchanged.
- **Rollout in stages, with attribution before any revert.**
  - Stage 1 lands measures 1, 4 and 5 at default file concurrency. Stage 2 adds measure 3, stage 3 adds measure 2, each in its own commit with its own CI measurement.
  - **Attribution (user decision):** a red shard is re-run twice in the configuration of the previous stage (for stage 1: the same shard on the stage-1 commit, via "Re-run failed jobs"). Only if the failure does not recur there, and recurs in the current stage, does it count as load-related; then the flag the current stage added is reverted. A failure that also appears in the previous configuration is a baseline flake: it is recorded in the PR and does not trigger a revert.
  - **Stage 1 has no flag (user decision):** a load-related failure in stage 1 shifts the `build-run` split boundaries so the contending tests share a file again; the round test stays moved whole. If that does not resolve it, the implementation stops and asks the user.
  - A revert removes the flag in `ci.yml`, its literal pin in `test/workflow-contracts.test.mjs` and its mention in the docs, in one commit.
  - Budgets are never raised (ADR).

## Affected files

| File                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/compare-native-agent-baseline.mjs`           | Replace the mask loop in `matchBodyDeltas` with an ordered, pruning include/skip search that collects all matches and returns the smallest by the comparison above.                                                                                                                                                                                                                                                                                  |
| `test/compare-native-agent-baseline.test.mjs`         | Add tests: an ambiguous match (the smallest-mask set wins over a set reached first depth-first, including the `{3}` versus `{0,3}` case); a no-match over 30 inapplicable deltas (2^30 masks before, linear now; test timeout 5 s); a no-match over 12 independently applicable deltas (4,096 leaves; test timeout 10 s). Each timeout must be at least 20 times the measured local duration; adjust k downwards rather than tightening the timeout. |
| `test/host-driver.test.mjs`                           | Register the Python cases inside a `describe` with `concurrency: 2`. Keep test names, `{ timeout }` and `ctx.signal` handling. The win32 skip branch stays outside the `describe` (`test/host-driver-runner.test.mjs:395-412` asserts `# skipped 1`).                                                                                                                                                                                                |
| `scripts/host-driver-tests.mjs`                       | Unchanged. Its `DEFAULT_PYTHON_TIMEOUT` line is pinned by `evals/host-driver/tests/test_liveness_wait.py:111-114`.                                                                                                                                                                                                                                                                                                                                   |
| `test/build-run.test.mjs`                             | Split into about 3–4 files along the existing section boundaries, balanced by measured runtime.                                                                                                                                                                                                                                                                                                                                                      |
| `test/build-run-*.test.mjs` (new)                     | The split-off sections, unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `test/support/build-run-fixtures.mjs` (new)           | Shared helpers moved from `test/build-run.test.mjs:46-176`, plus mid-file helpers used by more than one new file.                                                                                                                                                                                                                                                                                                                                    |
| `test/merge-gate-eval-round.test.mjs`                 | Remove the round lifecycle test (`:1515-2316`, timing comment included).                                                                                                                                                                                                                                                                                                                                                                             |
| `test/merge-gate-eval-round-lifecycle.test.mjs` (new) | That test, unchanged, with its helpers imported or moved to `test/support/`.                                                                                                                                                                                                                                                                                                                                                                         |
| `.github/workflows/ci.yml`                            | New matrix job `unit-tests`. In `build`: `needs`, `if: always()`, a first gate step, the `Unit tests` step removed, and the comment at `:48-50` reworded to the new rule.                                                                                                                                                                                                                                                                            |
| `test/workflow-contracts.test.mjs`                    | Update the `ci.yml` shape assertions (`:12103`, `:12136-12153`) to the new structure and extend them to the shard job (see Approach step 4).                                                                                                                                                                                                                                                                                                         |
| `test/conflict-validation.test.mjs`                   | Restate the expected detector result at `:277-316` per job (see Approach step 4).                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/build-system.md`                | Describe the CI test layout: shards, concurrency flag, gate, re-running a failed shard. Touches the test-order paragraph around `:25-60` and the temp-peak note at `:46`, whose 92,748 KiB figure already disagrees with the 150 MiB threshold in `scripts/test-capabilities.mjs:34`; align it with the code and the new measurement.                                                                                                                |
| `docs/developer-guide/release-and-installation.md`    | At `:73-75` and `:298`: required checks are unchanged; the unit population runs in `unit-tests`, and `Format, test and build` gates on all shards. At `:322`: the evidence step still has no condition, but its job now carries exactly `if: always()`.                                                                                                                                                                                              |
| `docs/adr/merge-gate-conflict-validation.md`          | At `:203-205`: restate why `Format, test and build` is undetected (`job-condition`, `no-test-step`) and name `unit-tests` (`templated-name`, `test-command-not-bare`). A factual correction, no policy change.                                                                                                                                                                                                                                       |

## Implementation details

### Approach

1. **Baseline measurement.**
   - Record the reference from one local full run: the total test count, the per-file durations, and the sorted list of full test title paths (suite and test names joined, from the TAP or spec reporter). Normalise suite nesting so the `describe` wrapper of step 7 does not count as a change.
   - Note that bare `node --test` also counts every `test/support/*.mjs` module as one passing entry named after its path (default pattern `**/test/**/*.mjs`). Each new support module therefore adds exactly one count and one title entry.
   - Record from the last three green `develop` CI runs: the `# tests` count of the `Unit tests` step, the `Format, test and build` job duration and the `Unit tests` step duration, and the run wall time as defined in step 8.
   - Check that no build-context provisional authorization (PR581 flow) is in flight. Every `ci.yml` edit changes the `policyDigest` of `evals/build-context/_scaffold/provisional-release.mjs:32-37`. If one is in flight, stop and ask the user before editing `ci.yml`.
2. **Measure 1, `matchBodyDeltas`.**
   - Implement the ordered include/skip search, keeping the signature `(baselineBody, workingBody, bodyDeltas)` and the return contract: ids in declared order, or `null`.
   - The empty subset stays excluded. Callers only enter when the texts differ, so keep that precondition.
   - Both callers, configuration (`:657`) and body (`:681`), use the same function.
   - Add the three tests. Run `test/compare-native-agent-baseline.test.mjs` and the baseline proof in `test/execution-profile-rendering.test.mjs`; the stdout pin must stay byte-identical.
3. **Measure 4, splits.**
   - Move the common helpers of `test/build-run.test.mjs` into `test/support/build-run-fixtures.mjs`.
   - Cut the file at section boundaries. Candidates: `:178-1440` control/terminal, `:1441-2420` evidence/locks, `:2422-4900` refusal/archive/hidden delivery, `:4906-5342` plan authorization. Merge or shift boundaries so each new file lands near equal summed runtime.
   - Move the merge-gate round test into `test/merge-gate-eval-round-lifecycle.test.mjs`.
   - Compare against the baseline: the same test count and the same sorted title list, apart from one entry per new `test/support/` module.
4. **Measure 5, sharding.**
   - **`ci.yml` constraints:**
     - The `on:` header and the set of top-level keys stay literal (`src/scripts/protected-validation-protocol.mjs:875-901`).
     - Conditions use only `${{ … }}` or plain expressions, and lists are single-line flow lists or block lists. The YAML subset parser rejects tags and multi-line flow collections (`src/scripts/conflict-validation-core.mjs:171-173`, `:468`).
   - **Add the `unit-tests` job before `build`,** so the `build:` slice used by `test/workflow-contracts.test.mjs:12136` stays delimited:
     - name `Unit tests (${{ matrix.shard }}/3)`, `strategy.fail-fast: false`, `matrix.shard: [1, 2, 3]`, job-level `permissions: contents: read`;
     - checkout with `fetch-depth: 0`, pnpm, Node 24 and install, all with the existing SHA pins;
     - step `Unit tests` running exactly `pnpm test --test-shard=${{ matrix.shard }}/3`, so every shard keeps the preflight. Step 6 later adds `--test-concurrency=4`.
   - **In `build`:**
     - add `needs: unit-tests` and `if: always()`;
     - add a first step `Unit test shards` that reads the result through `env:` and exits non-zero unless it is `success` (`failure`, `cancelled` and `skipped` all fail);
     - remove the `Unit tests` step;
     - keep the remaining order: format check, build, distribution smoke, eval evidence;
     - reword the comment at `:48-50` to "the only job condition is `always()`; never let this required job be skipped".
   - **`test/workflow-contracts.test.mjs`** protects these invariants. Each relaxed assertion carries its reason as the invariant comment ("a skipped required check passes"):
     - The job names `Format, test and build` and `Shellcheck` stay literal.
     - `build` carries `needs: unit-tests`, and its only job-level condition is exactly `if: always()`.
     - Its first step is the gate: no `if:`, no `continue-on-error`, reads the result via `env:` and requires `success`.
     - `unit-tests` has `fail-fast: false` and a matrix whose length equals the `N` in `--test-shard=${{ matrix.shard }}/N`.
     - Its test step command is pinned literally.
     - No `if:` and no `continue-on-error` on the job or its test step.
     - `unit-tests` carries job-level `permissions: contents: read`.
     - No name or skip filter flags (`--test-name-pattern`, `--test-skip-pattern`, `--test-only`) appear.
     - `build` keeps the order `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution`, `Behavioural eval evidence`.
   - **`test/conflict-validation.test.mjs:277-316`** keeps its invariant: this repository's own CI is not recognized by the quick detector, so it falls back to full validation. The basis changes, so restate the exact expected result per job:
     - `unit-tests` stays `undetected` with the reasons `["templated-name","test-command-not-bare"]`. The YAML subset parser reads `[1, 2, 3]` as strings, so `dynamic-matrix` does not fire (`src/scripts/conflict-validation-core.mjs:796-799`, `:1070-1078`, `:1147-1198`).
     - `build` stays `undetected` with the reasons `["job-condition","no-test-step"]`.
     - These lists come from a detector probe on the planned shape; take the final lists from the detector output on the real `ci.yml` and pin them.
     - The `step-before-test` path stays covered by the synthetic cases at `:779-829`; confirm that and leave them unchanged.
5. **Docs** (stage 1 commit, describing stage 1 only).
   - Update the two developer guides and the ADR passage listed in Affected files, including that re-running only `Format, test and build` does not clear a failed shard; re-run the shard or use "Re-run failed jobs".
   - Steps 6 and 7 each add their own doc sentence in their own commit, so a revert removes code, pin and doc together.
   - AGENTS.md's local check order stays valid and is not touched.
6. **Measure 3, concurrency flag** (own commit, after 1/4/5 are green).
   - Extend the shard step to `pnpm test --test-shard=${{ matrix.shard }}/3 --test-concurrency=4` and update the literal pin.
   - Remeasure the temporary-space peak locally with `--test-concurrency=4` against the 150 MiB preflight threshold (`scripts/test-capabilities.mjs:26-30`). If it exceeds the threshold, report the measurement; changing the threshold is not part of this plan.
7. **Measure 2, host-driver concurrency** (own commit, last).
   - Wrap the registration loop in `describe('portable host-driver Python tests', { concurrency: 2 }, …)`, with the win32 skip branch outside it.
   - Confirm that `{ timeout }` and `ctx.signal` behave the same inside `describe` (Node 24 docs or a local probe).
   - Run `test/host-driver-runner.test.mjs`. It copies and executes `test/host-driver.test.mjs` byte-wise and asserts runner behaviour. Adjust only expectations about registration shape, never about budgets.
8. **Validation in CI order** (see Validation plan), then the CI measurement per stage:
   - One measurement round per stage commit: attempt 1 of the PR run for that head plus two "Re-run all jobs" attempts of the same run. A green attempt re-run for measurement is not a "rerun" in the sense of the acceptance criteria; a re-run of a failed job is, and follows the attribution rule.
   - A run cancelled because a newer push superseded it does not count and does not break the series.
   - **Wall time** is the attempt's `run_started_at` to the `completed_at` of the `build` job, read from the GitHub API. Queue time before `run_started_at` is excluded.
   - Record per attempt: per-shard durations and `# tests` counts, `Format, test and build` duration, wall time, and every failed-job re-run with its attribution result, in the PR description.

### Component structure

Not relevant: there is no product component change.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Ambiguous delta match** (two subsets yield the same text): the smallest-mask set wins, exactly as today, even when depth-first order reaches another set first. The new test pins this.
- **No match:** returns `null`.
  - Pruning keeps inapplicable deltas linear.
  - k independently applicable deltas still span 2^k leaves; the measured real cost is 5–17 ms per sidecar.
  - The second no-match test bounds this case.
- **A shard fails, is skipped or is cancelled:** `build` still runs (`always()`) and fails in its gate step, so the required check is red, never skipped.
- **Whole run cancelled** (manual cancel or a newer push in the concurrency group): `build` still runs and its gate fails at once, before checkout. The cancelled SHA shows a red required check and blocks a merge. A newer SHA gets its own complete run. Because the gate job still needs a runner, the superseded run holds the workflow concurrency group until that job finishes, which adds runner pickup latency before the new run starts; this is why the wall-time definition in step 8 starts at `run_started_at`.
- **Shard balance:** `--test-shard` assigns files round-robin over the sorted file list (verified with a local Node 24 probe), not by duration. Adding or renaming a test file reshuffles every shard. The split in step 3 lowers the floor; record the per-shard durations. Rebalancing via an explicit file list is not part of this plan.
- **Format failure:** it is now reported only after all shards finish, because `build` waits on them. This is accepted with the user's gate decision.
- **Load-related failures:** attributed and handled by the rollout rules from Architecture decisions, never by raising budgets.
- **Baseline flakes** (publication lock, six-worker recovery): a failure that recurs in the previous stage's configuration is recorded and triggers no revert.
- **A new test file added later** is picked up automatically by `node --test` and by sharding; no file list needs maintenance.

## Acceptance criteria

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass locally in CI order.
- [ ] The local full run reports the baseline test count plus exactly the three tests added in measure 1 plus one entry per new `test/support/` module. The normalised sorted title diff shows only those additions.
- [ ] On every recorded CI attempt, the `# tests` counts of the three shards add up to the baseline `# tests` count of the last green `develop` CI run plus the same additions.
- [ ] The baseline proof in `test/execution-profile-rendering.test.mjs:516` passes with byte-identical pinned stdout and takes under 30 s locally (previously about 262 s on CI).
- [ ] `test/compare-native-agent-baseline.test.mjs` passes, including the three new tests.
- [ ] The contract tests in `test/workflow-contracts.test.mjs` and `test/conflict-validation.test.mjs` pass and enforce every invariant listed in Approach step 4, and the pinned per-job detector reason lists.
- [ ] The multiset of timeout, deadline and budget literals across `test/`, `scripts/host-driver-tests.mjs` and `evals/host-driver/` is identical before and after (moved lines count as unchanged). `release.yml` is unchanged.
- [ ] The final stage's measurement round (step 8) has three green attempts with no failed-job re-run. A measure reverted under the attribution rule counts as implemented with a negative result, documented in the PR description.
- [ ] The PR description records, per stage, the measured wall times and the median of the final round against the baseline median and the 12-minute goal. The time is documented, not gated (user decision).

## Validation plan

- Local: run `test/compare-native-agent-baseline.test.mjs` and `test/execution-profile-rendering.test.mjs` first after measure 1. Then the full CI order: `pnpm agent:check`, `pnpm test` (with `pnpm test:preflight`), `node build.mjs`, `pnpm test:distribution`.
- Before/after comparison of the test count and the normalised sorted title lists (measures 4 and 2).
- Local probe that `pnpm test --test-shard=1/3` reaches `node --test` as a flag and runs a strict subset, and that the three subsets add up to the full count.
- `test/host-driver-runner.test.mjs` and `test/host-driver.test.mjs` after measure 2, plus a local run with `--test-concurrency=4` to see contention.
- `pnpm eval merge-gate verify` and `pnpm eval build-context verify` (both read-only), to confirm that the test move and the `ci.yml` edit create no unexpected integrity errors. Freshness debt is reported, not repaired here.
- Before/after multiset comparison of timeout, deadline and budget literals (a small throwaway script in the scratchpad, not committed).
- CI after each stage: the measurement round and recording defined in Approach step 8.

## Assumptions and open points

- **Verified (environment):**
  - CI uses Node 24, and `--test-concurrency` and `--test-shard` exist in Node 24. The engines field says `>=22`, but CI runs only 24.
  - `--test-shard` assigns files round-robin over the sorted list.
- **Verified (unaffected sources):**
  - No test or guard enumerates test file names, and no eval `suite.config.mjs` hashes a `test/` file, so splits need no registry or instrument update.
  - `evals/merge-gate/README.md:99` links the file `test/merge-gate-eval-round.test.mjs`, which stays, so the README is not edited.
  - `scripts/compare-native-agent-baseline.mjs` is repo-only (absent from `RUNTIME_SCRIPT_FILES`), so measure 1 has no shipped-runtime effect.
- **Verified (pnpm):** pnpm 12.5.1 forwards a `--` separator to the script. The CI commands therefore pass flags without `--`.
- **Assumption (baseline proof):** the baseline-proof test stays in the PR suite after the fix, since it then takes seconds. Moving it to a path-filtered job is not part of this plan.
- **Assumption (runner minutes):** sharding costs about three times the runner minutes for the test step, plus one short gate job on cancelled runs. The repository is public, so standard runners are free; the user accepted this with measure 5.
- **Assumption (cancelled runs):** `if: always()` makes a superseded SHA show a red required check instead of a cancelled one. Merging happens only on the current head, so this blocks nothing real.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         2 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    3 |
| Testability     |        0 |         5 |    5 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         0 |    4 |

### Findings

#### Deep interactive review, 2026-11-25

13 findings (4 Important, 9 Note), all incorporated; no finding remains open.

- **Testability, Important:** new `test/support/` modules are counted by bare `node --test`. The count, title-diff and shard-sum criteria now expect one entry per new support module.
- **Error cases, Important:** the revert rule had no stage-1 path and no attribution method. User decisions: a red shard is re-run twice in the previous stage's configuration before attribution; a stage-1 load failure shifts the `build-run` split boundaries, else stop and ask. A revert removes flag, pin and doc together.
- **Testability, Important:** the final CI criterion was not executable. Step 8 now defines the measurement round (attempt 1 plus two "Re-run all jobs"), what counts as a rerun, superseded runs, and wall time from `run_started_at` to `build` completion via the API.
- **Testability/Scope, Important:** no completion condition when the time goal is missed. User decision: the time is a documented goal, not a gate.
- **Testability, Note:** corrected the predicted detector reasons (`dynamic-matrix` does not fire); the lists are pinned from the real detector output.
- **Security, Note:** `unit-tests` gets job-level `permissions: contents: read`, with a contract assertion.
- **Maintainability, Note:** added `release-and-installation.md:322`, `docs/adr/merge-gate-conflict-validation.md:203-205` and the stale temp-peak figure in `build-system.md:46` to Affected files.
- **Maintainability, Note:** docs now land per stage, so a revert stays self-contained.
- **Architecture/Testability, Note:** the match comparison now covers a set that runs out of indices; the new tests have fixed n, k and timeouts with a 20× margin rule.
- **Testability, Note:** the shard sum compares against the CI baseline count; the acceptance criterion cites all step-4 invariants; corrected the step reference for the `describe` wrapper.
- **Error cases, Note:** documented that `always()` lets a superseded run hold the concurrency group a little longer.
- **Error cases, Note:** an in-flight PR581 authorization now stops the run before `ci.yml` is edited.
- **Testability, Note:** the timeout check compares literal multisets, so moved lines do not count as changes.

#### Internal review, 2026-11-25

The internal review on 2026-11-25 found 12 findings. All were incorporated; no finding remains open.

- **Error cases, Important:** `pnpm test -- <flags>` would have passed the flags to `node --test` as file patterns, because pnpm 12.5.1 forwards `--`. All commands now pass the flags without `--`, and the contract test pins the shard command literally.
- **Security, Important:** `if: ${{ !cancelled() }}` could have left the required check skipped, and therefore passing, after a manual cancel. Changed to `if: always()`, the form the user's gate decision named. The gate step runs first and fails on any non-`success` result.
- **Testability, Important:** the `conflict-validation` coupling cannot be moved one-to-one. The plan now states the expected `undetected` result and reason basis per job and keeps the synthetic `step-before-test` cases.
- **Error cases, Important:** known load-dependent flakes were not covered by the fallback. Added the staged rollout (1/4/5, then 3, then 2) and the revert rule for any load-related failure.
- **Testability, Important:** there was no CI proof that the shards together run the full suite. Added the per-shard test-count sum criterion.
- **Security, Important:** the contract invariants did not forbid `continue-on-error`, step conditions or filter flags. These are now forbidden, and the gate reads the result via `env:`.
- **Maintainability, Note:** the `ci.yml` comment at `:48-50` and the relaxed guard now state the new rule and its reason.
- **Testability, Note:** the plan now spells out the match comparison (by highest index, not the first depth-first leaf) and adds a no-match test with applicable deltas.
- **Maintainability, Note:** reference corrections:
  - `DEFAULT_PYTHON_TIMEOUT` lives in `scripts/host-driver-tests.mjs`;
  - the round test is cited as `:1515-2316`, with its timing comment;
  - the win32 skip branch stays outside the `describe`.
- **Architecture, Note:** the `ci.yml` constraints are in place: literal `on:` header and top-level keys, the YAML parser subset, and a check of the build-context `policyDigest` plus `pnpm eval build-context verify`.
- **Scope, Note:** the shard assignment is verified, and the outcome estimate now includes the time of the gated `build` job.
- **Scope, Note:** two scope decisions and two additions:
  - `release.yml` stays unchanged (decided in the plan: release stability before latency);
  - the round test moves whole (user decision);
  - the plan now gives the title-diff method;
  - the docs now cover re-running a failed shard.

## Open points

- No open points.
