# Run CI checks beside the shards and balance shards by runtime

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

PR #752 (`b66ce1c8`) brought the median wall time until `Format, test and build` completes from 13:52 down to 7:50. A follow-up analysis of run 45805500272 found two remaining costs. That analysis is the addendum to `.effective-flow/investigation/investigation-2026-11-25-unit-test-laufzeit-auf-github-runnern-und-entbehrliche-tests.md`.

- **Unbalanced shards.** `--test-shard` assigns files round-robin by name and ignores runtime. The three shards took 6:54, 3:31 and 5:07, with summed test time of about 1,263 s, 715 s and 943 s. Shard 1 carries `test/merge-gate-eval-round.test.mjs`, whose single tests run 51, 33 and 26 s.
- **Serial build job.** The format check, build, distribution smoke and eval evidence take about 1 min. They do not depend on the tests, but `build` (`needs: unit-tests`) starts them only after every shard has finished.

This plan implements the four measures the user selected from that addendum:

1. Run the build checks in parallel with the shards. A slim gate job keeps the required check name `Format, test and build`.
2. Distribute files to shards by runtime from a checked-in weight table instead of round-robin. A guard ensures every test file runs exactly once.
3. Split `test/merge-gate-eval-round.test.mjs` further, using only test moves as in #752.
4. Measure the two concurrency switches one at a time and remove any switch that does not pay off. They are `--test-concurrency=4` in `ci.yml` and `describe(…, { concurrency: 2 })` in `test/host-driver.test.mjs`. This is investigation measure 5.

The same rules as in #752 apply. No test is removed, no assertion is weakened, and no deadline or budget is raised (`docs/adr/pragmatic-test-release-policy.md:48-51`). Every test still runs inside the required status.

Out of scope:

- shared build and git fixtures (investigation measure 4);
- a fourth shard (measure 6);
- the duplicate suite run in `release.yml` (measure 7) and any change to `release.yml`;
- the budget and wait fixes of `docs/plan/2026-11-25-issue-747-stabilize-host-driver-and-merge-gate-eval-round-tests-under-load.md`.

**Workflow rationale:** Refactoring. CI layout, test distribution and file structure change, but product behaviour, test set and test semantics do not; the goal is wall time.

## Outcome checkpoint

**Primary source:** user request in this repository (effective-flow, `origin/develop` at `d6155334`), based on the addendum of the investigation report above.

**Original outcome:** median wall time until `Format, test and build` completes drops from 7:50 towards about 5:30, measured over at least 3 green CI runs. The time is a goal, not a completion gate, and is measured and documented. Conditions: the test set is unchanged, the required check names are unchanged, no deadline is raised, and a bare `pnpm test` still runs the full suite.

**Last evaluated attempt:** PR #752 (sharding, concurrency switches, file splits, `matchBodyDeltas` fix); evidence: median 7:50 over nine green runs, shard spread 3:31–6:54, no measurable effect of the concurrency switches.

**No-progress count:** 0

**Cumulative approach:** algorithmic fix, file splitting, 3-way CI matrix, concurrency switches (#752); now parallel check job, weighted shard assignment, a further split, and an A/B decision on the switches.

**Continuation decision:** continue with a materially new approach (job parallelism and weighted assignment); no further continuation is planned after this one.

## Architecture decisions

- **The gate keeps its name; the work moves out.**
  - `ci.yml` gets a new job `checks` without `needs`. It runs the same setup plus `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution` and `Behavioural eval evidence`, in today's order, in parallel with the shards. It gets `permissions: { contents: read }`, like the shard job: no `ci.yml` step exports a GitHub token, and the `gh api` reader in `evals/build-context/provisional-release.mjs` is not called by `ci.yml`. Its display name must not collide with a required check name; `Build checks` is suggested.
  - The `build` job keeps its key and the name `Format, test and build`. It also keeps `needs`, now `[unit-tests, checks]`, and `if: always()`, and has no `continue-on-error`. It gets an empty token (`permissions: contents: none`, which sets every other scope to `none` as well; implementation correction: the conflict-validation YAML parser rejects the flow mapping `{}`, which would make `ci.yml` unparsable) and no checkout or setup. Its only step is the gate: one env value per needed job (`UNIT_TESTS_RESULT`, `CHECKS_RESULT`, each from `needs.<job>.result`), and it fails unless every value is exactly `success`.
  - Rejected alternative: making `checks` itself the required check. The required context `Format, test and build` lives in the GitHub ruleset outside the repository, so a rename would need a ruleset change and would orphan the old context during the transition.
- **Weighted assignment with a checked-in table.** This is a user decision.
  - **Location and name.** A repo-only script `scripts/shard-tests.mjs` with its table `scripts/shard-weights.json`. It is not shipped: it is not listed in `RUNTIME_SCRIPT_FILES` and does not live under `src/scripts/`. Neither name may match a Node default test pattern; a `test-*` name would be run as a test by every bare `node --test`, as `scripts/test-capabilities.mjs` is today.
  - **Discovery.** The script discovers the same file set as a bare `node --test` on the CI Node version (24). It does not filter that set, because filtering would change the test population. It uses an explicit pattern list copied from the Node 24 documentation:
    - the type-stripping TypeScript forms (`*.test.{cts,mts,ts}` and siblings), not only the `.mjs`/`.cjs`/`.js` forms;
    - dot directories and `node_modules` excluded, as Node does;
    - the result therefore keeps `test/support/*.mjs`, the fixture modules and `scripts/test-*.mjs`, which a bare run reports as passing entries today.

    The pattern list is pinned by the unit test and cited to the Node documentation. The unit test also asserts that the `node-version` in `ci.yml` equals the Node major the list was copied for, so a version bump fails a test and points at the population check. `--list` prints the total discovered file count (161 on `origin/develop` at `d6155334`).

  - **Assignment by simulated duration.** This is a user decision. `node --test` starts its file arguments in alphabetical order, whatever order they are passed in (verified by probe), so summed weights alone can mislead: a heavy file that sorts late can set its shard's end time.
    - The script simulates each shard's run: its files in alphabetical order, started on `k` slots, where `k` is the forwarded `--test-concurrency` or Node's default for the runner.
    - It places files heaviest first, ties broken by path, each on the shard whose simulated finish time is lowest after adding the file; ties go to the smaller growth, then the lowest index. (Implementation correction: "grows least" alone put nearly every heavy file on shard 1, because a shard with an idle slot grows by 0.)
    - `--list` prints each shard's files, summed weight and simulated duration.
    - The result is deterministic for a given table, file set and `k`.
  - **Spawn.** The script spawns `node --test <forwarded options> <shard files>`: options **before** the files, because `node --test` silently ignores flags placed after the file list.
    - It forwards only an allowlist: `--test-concurrency=<n>` and `--test-reporter=<x>`. Any other argument, including `--test-shard`, `--test-only`, `--test-name-pattern` and `--test-skip-pattern`, exits non-zero with a message. A forwarded `--test-shard` would shard the shard and silently drop files.
    - It exits with the child's exit code, and non-zero if the child dies by a signal.
    - A shard with no files fails with a message. It never spawns a bare `node --test`, which would run the whole suite.
    - Run without a shard argument, the script prints usage and exits non-zero. It is never discovered as a test, so this cannot affect `pnpm test`.
  - **Weight table.** The table maps a repository-relative path to its wall time in seconds. A `--measure` mode of the script times each discovered file alone with `node --test <file>` and writes the JSON. It runs on a CI runner for generation, and the same mode refreshes the table later. Summing per-test durations would overstate `test/host-driver.test.mjs`, whose cases run in parallel, and Node's reporters print no per-file total.
    - A file missing from the table gets one documented default weight, so a new test file never breaks CI.
    - A table entry whose file no longer exists fails the script's unit test, so renames and deletions force a table update.
  - **Invocation.** `package.json` gains `test:shard`, which runs `node scripts/test-capabilities.mjs`, then the shard script. CI calls `pnpm test:shard <i>/3 [switches]` without a `--` separator, for the reason the #752 plan records; pnpm appends the arguments to the last command. `pnpm test` stays unchanged, so `release.yml` and local runs keep the full unsharded suite.
  - Rejected alternative: loading weights from the last CI run as an artifact. That needs artifact access, a fallback and more moving parts for a small gain. This is a user decision.
- **The split is a pure move with a 180 s cap per file.** This is a user decision. A file cannot be split across shards, so its wall time is a floor for its shard. The cap keeps every resulting file at or below about 180 s of standalone wall time, in line with the existing floors of 160 s (`merge-gate-eval-round-lifecycle`) and 155 s (host-driver), so the split never raises the critical path. Tests move unchanged in title, body, timeout and assertions. A helper used by a single new file moves with it. A helper used by several files goes to `test/support/merge-gate-round-helpers.mjs`, next to the existing `test/support/merge-gate-round-fixtures.mjs`.
- **Each switch is decided by its own A/B measurement.** This is a user decision.
  - The two switches are measured independently, because their mechanisms differ. The host-driver group (about 155 s with `concurrency: 2`) is a lower bound for one shard, while `--test-concurrency` acts across files.
  - A switch stays only if it shortens the median duration of the slowest unit-test shard by at least 30 s, compared to the variant without it. Otherwise it is removed together with its pins and doc mentions.
  - **Measurement.** A shard's duration is its job's `completed_at − started_at` from `gh api repos/<owner>/<repo>/actions/runs/<id>/attempts/<n>/jobs`, so queue time is excluded. The slowest shard is the maximum of the three within one attempt, and the median is taken over attempts. The end-to-end metric is the gate job's `completed_at` minus the attempt's `run_started_at`. The PR table records the raw per-attempt values.
  - Removing the host-driver switch removes only the `{ concurrency: 2 }` option. The `describe` wrapper stays, because `test/host-driver-runner.test.mjs` copies and runs that file.
- **Guards change shape, not strength.** The `ci.yml` contract tests are rewritten for the new layout and asserted per job. The job order in the file becomes `unit-tests`, `checks`, `build`, `shellcheck`.
  - **Gate (`build`):** `if: always()`, no `continue-on-error`, an empty token (`contents: none`), exactly one step with no `uses` or checkout; the env keys equal the `needs` list exactly, and every needed job's result must be `success`.
  - **Shard job:** no `if`, no `continue-on-error`, `fail-fast: false`, and the matrix stays consistent with the `<i>/N` in the run line.
  - **`checks`:** no `if` and no `continue-on-error` on the job or any step, `permissions: { contents: read }`. The evidence-order slice is the `checks` job, bounded by `  checks:\n` and `\n  build:`; its ordered list starts at `pnpm agent:check`. The `Build-context provisional PR581 release disposition` exclusion (today `:12273`) applies to this slice.
  - **Checkout parity:** asserted between `unit-tests` and `checks` (today between the shards and `build`, `:12222-12227`).
  - **Filter flags:** the text ban on `--test-name-pattern`, `--test-skip-pattern` and `--test-only` covers `ci.yml` and the `test:shard` script string. For `scripts/shard-tests.mjs`, which must name these flags to reject them, a behavioural unit test replaces the text ban.

  No assertion loses a case.

- **The conflict-validation detector result stays `undetected`; its reasons change.** Here `src/scripts/conflict-validation-core.mjs` counts only `scripts.test`, and `pnpm test:shard` does not match it as a word. The reasons the implementer expects and confirms are:
  - `unit-tests`: `templated-name` and `no-test-step`, where `no-test-step` replaces `test-command-not-bare`;
  - `checks`: `no-test-step`;
  - `build`: `job-condition` and `no-test-step`, unchanged.

  The test expectation, its comment and the ADR explanation are updated accordingly.

## Affected files

| File                                                              | Description                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                                        | add the `checks` job (setup plus the four check steps moved from `build`); `build` becomes a gate over `unit-tests` and `checks` with an empty token (`contents: none`); shard run line becomes `pnpm test:shard ${{ matrix.shard }}/3` plus any switch that survives step 5                               |
| `package.json`                                                    | add the `test:shard` script; `test` unchanged                                                                                                                                                                                                                                                              |
| `scripts/shard-tests.mjs` (new)                                   | discovery, assignment by simulated duration, `node --test` spawn (allowlisted options before files), exit-code propagation, empty-shard failure, a `--list` mode (files, summed weight, simulated duration, discovered count) and a `--measure` mode that writes the table                                 |
| `scripts/shard-weights.json` (new)                                | per-file wall time in seconds, measured per file on a CI runner                                                                                                                                                                                                                                            |
| `test/shard-tests.test.mjs` (new)                                 | discovery pattern list and its Node-major pin against `ci.yml`; partition disjoint, complete and deterministic; simulated-duration assignment; default weight; stale-entry failure; spawned argv order; rejection of every non-allowlisted argument; exit-code and signal propagation; empty-shard failure |
| `test/workflow-contracts.test.mjs`                                | rewrite the shard/gate test (`:12145-12236`, including job order `:12158-12161` and checkout parity `:12222-12227`) and the evidence-order test (`:12250-12273`, slice moves to `checks`) per the guard decision; keep the required-name test (`:12127-12143`) passing unchanged                           |
| `test/conflict-validation.test.mjs`                               | update the pinned per-job reasons and their comment (`:278-306`) to the reasons listed above                                                                                                                                                                                                               |
| `docs/adr/merge-gate-conflict-validation.md`                      | `:203-208`: update the reason list explaining why this repository's CI stays undetected                                                                                                                                                                                                                    |
| `test/merge-gate-eval-round.test.mjs`                             | tests move out into at least two new files                                                                                                                                                                                                                                                                 |
| `test/merge-gate-eval-round-*.test.mjs` (new)                     | receivers of the moved tests, for example the verify cluster (`:1305-1843`) and the publication/retry group                                                                                                                                                                                                |
| `test/support/merge-gate-round-helpers.mjs` (new, only if needed) | helpers shared by several of the split files                                                                                                                                                                                                                                                               |
| `test/merge-gate-eval.test.mjs`                                   | `:938`: comment referring to the eval-round file's contents                                                                                                                                                                                                                                                |
| `evals/merge-gate/README.md`                                      | `:99-102`: description of what the eval-round test files hold; not an instrument file (`evals/merge-gate/suite.config.mjs:147-165`), so editing it creates no eval evidence debt                                                                                                                           |
| `test/host-driver.test.mjs`                                       | `:16` keeps or loses `{ concurrency: 2 }` per step 5                                                                                                                                                                                                                                                       |
| `docs/developer-guide/build-system.md`                            | `:37-53` and `:68`: new job layout, weighted assignment, table generation and refresh procedure, final switch state                                                                                                                                                                                        |
| `docs/developer-guide/release-and-installation.md`                | `:73-77` and `:300-305`: `Format, test and build` gates shards and `checks`; required contexts unchanged                                                                                                                                                                                                   |

## Implementation details

### Approach

1. **Precondition.** Every `ci.yml` edit changes the `policyDigest` in `evals/build-context/_scaffold/provisional-release.mjs:32-37`, as the #752 plan records. Before each push to the delivery branch that edits `ci.yml`, read the repository variables `BUILD_CONTEXT_PR581_AUTHORIZATION_BLOB` and `BUILD_CONTEXT_PR581_AUTHORIZATION_SHA256` with `gh variable get`. Continue only if both are unset or reference no open pull request; otherwise stop and report. If they cannot be read, ask the user. Pushes to the throwaway measurement PR of step 5 never become a release candidate and need no check.
2. **Split (measure 3).**
   - Measure per-test durations of `test/merge-gate-eval-round.test.mjs` once with `--test-reporter=spec` and record the slowest tests by title.
   - Move whole `test(...)` blocks into new files so that no file exceeds about 180 s of standalone wall time; this may need three or more receiving files.
   - Move or extract helpers per the architecture decision.
   - Prove the move: the normalized text of every `test(...)` block, as a multiset that keeps duplicate titles, is identical before and after. Then run each split file alone, timing it against the cap, and all of them together.
   - Update `evals/merge-gate/README.md:99-102` and the comment at `test/merge-gate-eval.test.mjs:938`.
3. **Weighted sharding (measure 2).**
   - Write `scripts/shard-tests.mjs` and its unit test.
   - Generate the weight table with `--measure` on a CI runner, with steps 1–2 applied, on the throwaway measurement draft PR of step 5, never on the delivery branch.
   - Add `test:shard` and switch the shard run line to it.
   - Check the population on Linux with Node 24, through `t3-project` or a CI job. Compare the `tests`, `suites`, `pass` and `skipped` totals summed over the three shards with an unsharded `pnpm test` on the same commit. Record both sets and the discovered file count in the PR description.
4. **Parallel checks (measure 1).** Add the `checks` job, reduce `build` to the gate, and rewrite the contract tests and the conflict-validation expectations. Run the detector expectation test to confirm `ci.yml` stays `undetected` with the listed reasons.
5. **Switch measurement (measure 5).** With steps 1–4 in place, run three variants, at least 3 completed CI runs each:
   - A: both switches on, as today;
   - B: without `--test-concurrency=4`;
   - C: without host-driver `concurrency: 2`.

   Run the variants on a throwaway draft PR from a measurement branch, because CI runs only for pull requests and pushes to `develop`. Collect repeat runs with "Re-run all jobs" on a completed run, never with stacked pushes, because a new push cancels the run in progress. Compare the median slowest-shard duration, measured as defined under "Architecture decisions", of A with B and with C, and apply the 30 s rule per switch. Close the draft PR afterwards; none of its commits enter the delivered history.

   When a switch is removed, also update its pin in `test/workflow-contracts.test.mjs` and its mention in `build-system.md`. When the host-driver switch is removed, regenerate the `test/host-driver.test.mjs` table entry, because its wall time roughly doubles. When `--test-concurrency=4` is removed, check the `--list` simulation again with the runner's default `k`. Record the measurement table in the PR description.

6. **Documentation.** Update the docs listed above. `build-system.md` gains the procedure for the weight table: the `--measure` mode, when to refresh, the default-weight rule, and the alphabetical start order the simulation models.
7. **Final measurement.** Take at least 3 green runs of the final state. Record the median time until `Format, test and build` completes and the median of each shard in the PR description, plus the spread between the fastest and slowest shard median.

### Component structure

Not relevant: CI and test tooling only.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **A new test file is not in the table.** It gets the default weight and runs exactly once. The balance degrades slightly until the table is refreshed.
- **A file in the table is renamed or deleted.** `test/shard-tests.test.mjs` fails and names the stale entry.
- **A Node upgrade changes default discovery.** The Node-major pin in `test/shard-tests.test.mjs` fails on a `node-version` bump and points at a fresh population check (step 3). A minor-version change within Node 24 shows up only as a changed discovered count in `--list`.
- **A forwarded flag is not allowlisted.** The script exits non-zero and names the flag; nothing runs.
- **A shard ends up empty.** The script fails with a message; it never falls back to a bare `node --test`.
- **The child `node --test` fails or is killed.** The script exits non-zero, so the shard is red.
- **`checks` fails while the shards pass, or the reverse.** The gate fails, and its log names the failing job and result.
- **A shard is cancelled by the concurrency group.** The gate sees `cancelled` and fails, as today.
- **A re-run of a failed shard.** It re-runs the same deterministic file list, because the table and the algorithm are fixed per commit.
- **A local `pnpm test`.** It is unchanged, runs everything with Node's default concurrency, and does not discover the shard script.
- **`checks` writes `GITHUB_STEP_SUMMARY`.** The eval verdict summary now appears under the `checks` job; the content is unchanged.
- **Interaction with the #747 plan.** That plan changes budgets in `test/merge-gate-eval-round*.test.mjs`. Because step 2 only moves tests and keeps their text, whichever change lands second rebases by test title, not by line number.

## Acceptance criteria

- [ ] The required checks are still exactly `Format, test and build` and `Shellcheck`. The test `ci.yml keeps the job names the develop ruleset requires` passes unchanged.
- [ ] `Format, test and build` passes only when every unit-test shard and `checks` report `success`. The rewritten contract test asserts this for `success`, `failure`, `cancelled`, `skipped` and an empty value per needed job, and asserts that the env keys equal `needs`.
- [ ] `checks` has no `needs`, no `if` and no `continue-on-error`, has `permissions: { contents: read }`, and runs format check, build, distribution smoke and eval evidence in today's order. The gate job has an empty token (`permissions: contents: none`) and exactly one step.
- [ ] On Linux with Node 24, the `tests`, `suites`, `pass` and `skipped` totals summed over the three shards equal those of an unsharded `pnpm test` on the same commit. Both sets are recorded in the PR.
- [ ] `test/shard-tests.test.mjs` passes and covers every property listed for it under "Affected files".
- [ ] The predicted balance holds: `scripts/shard-tests.mjs --list` shows a simulated duration per shard within 15% of the mean. The actual spread of shard medians is recorded in step 7.
- [ ] The split of `test/merge-gate-eval-round.test.mjs` keeps the normalized `test(...)` block multiset identical, and no resulting file exceeds about 180 s of standalone wall time, measured in step 2.
- [ ] Each concurrency switch is kept or removed per the 30 s rule. The A/B table (variants A, B, C, at least 3 attempts each, raw per-attempt job durations as defined under "Architecture decisions") is in the PR description.
- [ ] The conflict-validation detector still classifies this repository's `ci.yml` as `undetected`, with the per-job reasons listed under "Architecture decisions".
- [ ] `release.yml` and the `test` script in `package.json` are unchanged, and no shipped file (`RUNTIME_SCRIPT_FILES`, `src/`) changes.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass locally, and the final PR runs are green.
- [ ] The median time until `Format, test and build` completes over at least 3 green final runs is recorded in the PR. About 5:30 is the goal, not a completion gate.

## Validation plan

- `node --test test/shard-tests.test.mjs test/workflow-contracts.test.mjs test/conflict-validation.test.mjs` after each CI or script change.
- `node scripts/shard-tests.mjs --list 1/3` (and `2/3`, `3/3`) to check balance, file count and coverage before pushing.
- The `test(...)` block multiset comparison of the merge-gate eval-round files before and after the split.
- CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- CI A/B measurement on a throwaway draft PR as described in step 5, then at least 3 final green runs; durations from the run and job timings (`gh run view` or the CI log tool).

## Assumptions and open points

- **Assumption:** Node's default discovery on Node 24 can be mirrored exactly with an explicit pattern list (TypeScript forms included, dot directories and `node_modules` excluded). Step 3's population check verifies this; a mismatch blocks the PR.
- **Assumption:** the simulation of Node's alphabetical start on `k` slots predicts real shard durations well enough for balancing. Contention under concurrency is not modelled; step 7's spread shows the error.
- **Assumption:** the per-file wall times of one CI measurement are stable enough for a static table. Step 7's per-shard medians and spread show how well it holds.
- **Observation, not changed:** `docs/plan/2026-11-25-speed-up-the-unit-test-suite-without-removing-tests.md` still says `Not implemented` on `origin/develop`, although #752 shipped it. An untracked copy also sits in the local checkout and will block a fast-forward of `develop`.
- **Prerequisite from the addendum:** an earlier local run with `--test-concurrency=4` hit a merge-gate test's 360 s limit. If that recurs during this work, it belongs to the #747 plan and is not fixed here by raising a budget.

## Plan review

**Result:** Approved

### Summary

Both review rounds of this run combined; every finding is incorporated.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    1 |
| Security        |        0 |         0 |    2 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    2 |
| Testability     |        0 |         5 |    3 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    3 |

### Findings

#### Round 1: internal plan review

- **Architecture, Important:** a `test-*` script name would be discovered and run as a test by every bare `node --test`. The script and table are named `shard-tests.mjs` and `shard-weights.json`, and the naming rule is recorded.
- **Error cases, Important:** forwarded flags placed after the file list are silently ignored by `node --test`. Options now go before the files, and the argv order is tested.
- **Error cases, Important:** exit-code propagation and the empty-shard case were unspecified, and an empty shard would run the whole suite. Both are specified, tested and in the acceptance criteria.
- **Testability, Important:** the discovery pattern list was unspecified; Node 24 also matches TypeScript forms and skips dot directories. The explicit list, its pin and drift visibility are added.
- **Testability, Important:** Node's reporters print no per-file durations, and summing per-test times overstates the parallel host-driver file. Weights are per-file wall time, with one method for generation and refresh.
- **Testability, Important:** the guards did not cover `checks`, did not tie gate env keys to `needs`, and did not cover the new script path. All three are added.
- **Architecture, Note:** the detector reasons change (`test-command-not-bare` becomes `no-test-step`), so the expected reasons are listed and the ADR and test-comment edits are required.
- **Scope, Note:** the split threshold referred to a table that did not exist yet. Superseded by the round-2 decision on the 180 s cap.
- **Testability, Note:** comparing titles alone does not prove a pure move. It is a multiset comparison of normalized `test(...)` blocks, and two missing references are added (`test/merge-gate-eval.test.mjs:938`, `evals/merge-gate/README.md:99-102`).
- **Error cases, Note:** the A/B procedure lacked a run-collection method, a history mechanism and a table refresh. Added: throwaway draft PR, "Re-run all jobs", entry regeneration.
- **Security, Note:** the gate job gets `permissions: {}`.
- **Testability, Note:** the 15% criterion is labelled as predicted balance, and the actual spread of shard medians is recorded.

#### Round 2: deep interactive review

- **Scope, Important (user decision):** a file cannot be split across shards, so a 390 s file cap would keep the slowest shard above the 5:30 goal. Decided: cap at about 180 s per file, in line with the existing 160 s and 155 s floors.
- **Architecture, Important (user decision):** `node --test` starts its file arguments alphabetically, so balancing summed weights can mislead. Decided: assignment by simulated duration (alphabetical start on `k` slots), with the 15% criterion on simulated duration.
- **Testability, Important:** "slowest-shard median" had no defined measurement. It is now defined from job `started_at`/`completed_at`, excluding queue time, with raw per-attempt values recorded.
- **Error cases, Important:** forwarding any option let `--test-shard` or filter flags silently drop tests, and a text ban could not cover a script that must name those flags. Forwarding is now an allowlist with a behavioural test.
- **Testability, Important:** the contract-test rewrite missed the job-order, checkout-parity, evidence-slice and PR581-disposition assertions. The new job order, slice bounds and parity pair are specified.
- **Security, Note:** `checks` gets `permissions: { contents: read }`; no step needs `actions: read`.
- **Maintainability, Note:** discovery drift had no standing guard. A Node-major pin against `ci.yml` is added.
- **Testability, Note:** the population check named no platform and one number. It runs on Linux with Node 24 and compares four totals.
- **Maintainability, Note:** weight generation was neither reproducible nor clearly placed. A `--measure` mode runs on the throwaway measurement PR; the host-driver entry is always regenerated when its switch goes.
- **Error cases, Note:** the policy-digest precondition was undefined. It is now a `gh variable get` check before delivery-branch pushes only.
- **Maintainability, Note:** the README edit is no longer conditional; the README is not an eval instrument file.

## Open points

- No open points.
