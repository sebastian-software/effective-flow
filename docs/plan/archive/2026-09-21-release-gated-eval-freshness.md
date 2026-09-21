# Release-gate the merge-gate eval freshness check

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

The behavioural eval evidence for `merge-gate` is re-recorded by hand on roughly every second merge
into `develop`. Nothing in CI runs a model — what turns a pull request red is the build-drift
assertion inside `pnpm test`, and its only remedy is a fresh round of six scenarios times five runs,
documented at roughly three hours of agent sessions.

Verified cost at planning time (HEAD `139273e`, 2026-09-21, clean worktree):

- the hashed load set is 28 built files, including widely edited fragments such as
  `shared/next-steps.md`, `shared/language-rules.md`, `shared/tracker-target.md` and
  `shared/config-migration.md`;
- 31 of the last 60 first-parent commits on `develop` touch a source file that maps into that set;
- `evals/merge-gate/results/` was rewritten 22 times in the 17 days before planning;
- releases are deliberate events: 12 tags in the preceding six weeks.

The effort therefore scales with the number of pull requests, while the claim the evidence supports
is about the build that ships. Between two releases the project pays N rounds for one delivered
build. This plan collapses that to one round per release without weakening the claim: hard
enforcement moves to the release-please pull request, the cheap structural assertions stay on every
pull request, and staleness becomes visible instead of silent.

The goal is a cadence change, not a weakening of the bar. Five-of-five stays, the load set stays as
derived, and no waiver is introduced.

## Architecture decisions

- **The freshness verdict becomes one shared function in the scaffold.** Today the acceptance rule
  lives only in the test — `describeDrift` (`test/merge-gate-eval.test.mjs:300`),
  `isCompatibleLegacyInstrumentPredecessor` (`:331`) and `assertBoundToCurrentBuild` (`:351`) — while
  `round-core.mjs` asks the same question independently inside `ensureCanonicalGeneration`. A third
  consumer makes two divergent copies untenable, so the rule moves next to the identity code it
  belongs to and the callers that **report** on a corpus read it from there. Publication keeps its
  own, deliberately stricter comparison in `evals/merge-gate/_scaffold/evaluate.mjs`: it asks a
  different question — does this run match the round manifest — and grants no legacy-instrument
  waiver, so routing it through the shared verdict would loosen publication rather than remove a
  copy. The honest count is therefore two implementations, kept apart on purpose, and the shared
  one's comment says so.
- **Freshness and structure are split by nature, and only freshness moves.** A missing or
  unreadable stamp, a short round, a log that binds no runtime root, and the five-of-five bar are
  properties of the archived files themselves; they stay hard in `pnpm test` on every pull request.
  Whether the archived stamp still describes the working tree is a property of the _pair_, and that
  question moves out. This is a sharper line than an environment-gated assertion, which was
  considered and rejected: two enforcement paths for one question drift apart, and the failure text
  then has two owners.
- **`pnpm merge-gate-eval verify` becomes the single owner of the freshness question.** A read-only
  subcommand on the existing round CLI, reporting by default and failing only under
  `--mode strict`. A value-taking flag rather than a bare `--strict`, because the existing options
  parser (`evals/merge-gate/round.mjs:49`) requires a value for every flag and a boolean concept
  would reach the CLI rejection test for no gain.
- **Enforcement sits inside the existing required check, not in a new job.** A job skipped by `if:`
  never reports, and a required status check that never reports blocks the pull request forever —
  the repository already documents that deadlock for path filters in
  `docs/developer-guide/release-and-installation.md:188`. `Format, test and build` is already
  required with an empty `bypass_actors` list including administrators, so a step inside it needs no
  ruleset change outside the repository and cannot deadlock.
- **The gate is not added to `release.yml`.** That workflow runs on every push to `develop` and its
  `pnpm test` sits before the `Release Please` step, so a strict check there would block ordinary
  development pushes and stall the release pull request's own updates. After release-please runs,
  the tag already exists. The release pull request is the only point that is both early enough and
  narrow enough.
- **The round lifecycle test stops borrowing live freshness.** `test/merge-gate-eval-round.test.mjs`
  copies the repository's real `results/` into a temporary publication root and calls
  `publishRound`, which re-evaluates every carried-forward scenario against a freshly built tree. A
  drifted working tree fails that test for a reason unrelated to what it asserts, and gating it
  instead would drop publication-lifecycle coverage exactly when drift is most common. Its copy is
  re-stamped to the current identity, and the rejection path it loses that way is restored as an
  explicit synthetic case.
- **The binding evidence moves with the enforcement.** `evals/merge-gate/README.md:475` makes the
  suite binding through prose rather than a check: every pull request of the deferral round carries
  the suite's output in its body. The release gate replaces that binding, so the body convention
  narrows to the one pull request that actually re-records a round — it carries date, commit,
  per-scenario run count and result, because it is the pull request that produces the evidence and
  the only place the recording profile is stated in the history. Every other pull request carries
  nothing, and the green check on the release pull request is what binds.
- **No waiver.** The gate is fail-closed: without a current round there is no release. This matches
  the existing five-of-five hardness, where a single deviating run is already a finding.

## Affected files

| File                                               | Description                                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/merge-gate/_scaffold/build-identity.mjs`    | Gains the shared freshness verdict and the drift describer moved out of the test, with their rationale comments                                                                                      |
| `evals/merge-gate/_scaffold/round-core.mjs`        | Gains `verifyFreshness`: builds once into a throwaway root, computes per-scenario identities, reads `results/`, writes nothing and takes no publication lock                                         |
| `evals/merge-gate/round.mjs`                       | Gains the `verify` command in `COMMAND_OPTIONS`, `usage()` and the dispatch chain, with `--mode report\|strict`                                                                                      |
| `test/merge-gate-eval.test.mjs`                    | Drops the freshness half of `assertBoundToCurrentBuild` from the per-scenario test, keeps the structural half, imports the moved helpers, and carries one always-skipped marker naming the new owner |
| `test/merge-gate-eval-round.test.mjs`              | Lifecycle test becomes independent of corpus freshness; gains a synthetic drifted-carry-forward rejection case and CLI cases for `verify`                                                            |
| `test/workflow-contracts.test.mjs`                 | Pins the new CI step, its placement inside the required job, and the release-please head-ref prefix                                                                                                  |
| `.github/workflows/ci.yml`                         | Job `build` gains the always-reporting `Merge-gate eval evidence` step                                                                                                                               |
| `evals/merge-gate/README.md`                       | Corrects the unqualified "not in CI" statements, adds `verify` to the command table, states the release cadence, and narrows the PR-body evidence convention to the re-recording pull request        |
| `docs/developer-guide/release-and-installation.md` | Documents the gate in the release procedure and beside the required-check list                                                                                                                       |
| `docs/developer-guide/build-system.md`             | Adjusts the invalidation paragraph: a re-record is owed before the next release, not before the next merge                                                                                           |
| `AGENTS.md`                                        | Short paragraph naming `pnpm merge-gate-eval verify` and when a round is owed                                                                                                                        |

`package.json` is deliberately unchanged: `verify` is a subcommand of the existing
`merge-gate-eval` script.

## Implementation details

### Approach

1. **Extract the verdict.** Move `IDENTITY_PARTS`, `DRIFT_LIST_LIMIT`, `describeDrift`,
   `changedFiles`, `PREDECESSOR_LEGACY_INSTRUMENT_DIGEST`, `TRACKER_STUB_PATH` and
   `isCompatibleLegacyInstrumentPredecessor` from `test/merge-gate-eval.test.mjs` into
   `_scaffold/build-identity.mjs`, beside `isVersionStampOnlyPredecessor`, and keep their comments
   with the code. Export one verdict function that, given an archived stamp, a scenario and the
   current identity, returns a state — current, accepted under a named waiver, or stale with the
   moved-file lines. The test keeps the three literal-stamp tests that already exercise the waivers
   (`:388`, `:583`) by importing them from their new home. Carry the one-generation scope of the
   legacy-instrument waiver across with its comment: moving it from a test file into shipped
   scaffold code must not quietly promote a deliberately temporary exception into a permanent one.
   Verify: `node --test test/merge-gate-eval.test.mjs` exits 0 with the same case names.

2. **Split structure from freshness in the per-scenario test.** In the loop at
   `test/merge-gate-eval.test.mjs:923`, keep the assertion that a stamp exists, is readable and is
   bound by its metadata, and drop the comparison against the current identity. Add one test that
   always skips, whose skip reason names `pnpm merge-gate-eval verify` as the owner of the freshness
   question, so `node --test` prints a visible pointer instead of a silent gap.
   Verify: `node --test test/merge-gate-eval.test.mjs` exits 0 and prints that skip reason.

3. **Add `verifyFreshness` to the scaffold.** Build the portable skill once into a throwaway root as
   the test does — never into the checkout's `dist/` — compute `pristineScenarioBuildIdentity` per
   discovered scenario, and walk `evals/merge-gate/results/`. Return per scenario: the run count, a
   verdict per run, and the moved-file lines for the first stale run. Absent and short scenario
   directories are reported as their own state, distinct from stale.
   Verify: a unit case asserts current on the repository corpus and stale on a mutated stamp.

4. **Add the `verify` command.** Register `verify: new Set(['mode'])` in `COMMAND_OPTIONS`, add the
   line to `usage()` next to the existing "No command launches a model" note, and dispatch to
   `verifyFreshness`. Default mode `report` prints the per-scenario verdict and exits 0. Mode
   `strict` additionally exits 1 when any scenario is stale, absent or short — at a release point
   "nothing was observed" is not an acceptable state, even though it is a legitimate skip in a fresh
   checkout. An unknown `--mode` value is an error, not a silent fall-back to `report`.
   **Separate a verdict from an operational error.** Report mode exits 0 for every verdict it can
   reach, including stale; it exits nonzero only when it cannot produce one — a build that fails, an
   unreadable archived file, a results directory it cannot enter. Without that split a broken build
   would make the required check red on ordinary pull requests through the very step added to stop
   that, and the existing CLI error path at `evals/merge-gate/round.mjs:178` exits 1 for any thrown
   error.
   Verify: the CLI rejection test at `test/merge-gate-eval-round.test.mjs:1196` gains the
   inapplicable-flag and unknown-value cases; `pnpm merge-gate-eval verify` exits 0 on a clean tree.

5. **Make the lifecycle test independent of corpus freshness.** In
   `test/merge-gate-eval-round.test.mjs` around the publication section, after the copy of the
   repository results, re-stamp each carried-forward `run-N.build.json` to the current identity and
   update the matching `run-N.metadata.json` `buildDigest` so the binding check in
   `ensureCanonicalGeneration` still holds. The behavioural logs stay untouched, because they are
   what `evaluateEvidence` judges. Then add a separate, smaller case that leaves one carried-forward
   stamp at a foreign digest and asserts `publishRound` rejects it, so the drift-rejection path is
   covered on purpose rather than incidentally.
   Verify: `node --test test/merge-gate-eval-round.test.mjs` exits 0 both on a clean tree and on one
   with a deliberately drifted load-set file.

6. **Add the CI step.** In `.github/workflows/ci.yml`, job `build`, as its **last** step, add one
   named `Merge-gate eval evidence` with no `if:` at job or step level, so the required check always
   reports. Last rather than next to `Unit tests`: a strict failure on a release pull request would
   otherwise abort the job before `Build distribution` and `pnpm test:distribution`, hiding a real
   build failure behind an owed round. The step runs `verify`, appends its output to `$GITHUB_STEP_SUMMARY`, and selects
   `--mode strict` from inside the step when the event is a pull request whose `github.head_ref`
   starts with `release-please--`; otherwise `--mode report`. No new `uses:` is introduced, so the
   pinning contract at `test/workflow-contracts.test.mjs:7982` is unaffected; the job name
   `Format, test and build` stays untouched for the ruleset.
   Verify: `node --test test/workflow-contracts.test.mjs` exits 0, including the new placement
   assertion.

7. **Pin the gate in the workflow contract test.** Assert that `ci.yml` contains the step, that it
   sits inside the required job and after its distribution steps, that it carries no `if:` that
   could stop it reporting, and that the literal `release-please--` prefix appears in its strict
   condition. Without this, a rename of the
   branch prefix or a well-meant `if:` silently turns the gate off while CI stays green.
   Verify: mutating either property in a scratch copy fails the new assertions.

8. **Update the documentation.** `evals/merge-gate/README.md` at lines 3, 265, 311-331, 365-370 and
   475-477 currently states without qualification that this layer stays out of CI; that stays true
   for running a model and becomes false for reporting and release enforcement, so each site is
   qualified rather than deleted, and the command table gains `verify`.
   `docs/developer-guide/release-and-installation.md` documents the gate beside the required-check
   list at 165-195 and in the release procedure, including that the re-record lands as its own pull
   request into `develop` and never on the release branch. `docs/developer-guide/build-system.md`
   at 149-161 changes "forcing the evidence to be re-recorded" into "owing a re-record before the
   next release". `AGENTS.md` gains a short paragraph so an agent knows when a round is owed.
   Verify: `pnpm agent:check` and `node build.mjs` exit 0.

### Edge cases

- **A release pull request with no drift** reports current and proceeds without a round. The
  existing version-neutral digest already absorbs the version bump itself, so an ordinary release
  owes nothing.
- **A release pull request whose evidence went stale after its CI ran.** The develop ruleset
  deliberately does not use the strict up-to-date policy, so a stale green is possible in principle.
  release-please updates its pull request on every push to `develop`, which re-triggers CI, so the
  window is small; it is documented rather than closed, because enabling the strict policy would
  change merge behaviour for every pull request.
- **A re-record while a release pull request is open.** The round lands as an ordinary pull request
  into `develop`; release-please then refreshes its own branch. Never commit evidence onto the
  release branch, which release-please owns and force-pushes.
- **Release-please renames its head-branch prefix.** The gate would silently stop being strict. The
  contract test pins the literal; the `autorelease: pending` label is the documented alternative
  signal if the prefix ever has to change.
- **An empty or short corpus** is reported as its own state and fails strict mode, while
  `pnpm test` keeps treating zero archived runs as a skip in an ordinary checkout.
- **A stale `dist/`** never affects the verdict: `verifyFreshness` builds into a throwaway root, as
  the existing test helper does.
- **A `build.mjs` change that moves every built file at once** produces a drift list that the shared
  describer already truncates past eight entries per part.

## Acceptance criteria

- [ ] `pnpm merge-gate-eval verify` exits 0 on an unmodified `develop` checkout and reports all six
      scenarios as current.
- [ ] After a one-line edit to a load-set source such as `src/shared/next-steps.md`, `verify`
      reports stale and names `shared/next-steps.md` among the moved files, and
      `verify --mode strict` exits 1.
- [ ] On that same drifted tree, `pnpm test` exits 0, and both `test/merge-gate-eval.test.mjs` and
      `test/merge-gate-eval-round.test.mjs` pass rather than skip.
- [ ] `verify` in report mode exits 0 on a stale verdict and nonzero on an operational error, and a
      named test case covers both directions.
- [ ] A missing, unreadable or metadata-mismatched stamp still fails `pnpm test` on a clean tree.
- [ ] `node --test test/merge-gate-eval-round.test.mjs` proves that `publishRound` rejects a
      carried-forward run whose stamp does not match the current identity.
- [ ] `ci.yml` carries a `Merge-gate eval evidence` step as the last step of the job named
      `Format, test and build`, with no `if:` at job or step level, and selects strict mode from a
      `release-please--` head ref; `test/workflow-contracts.test.mjs` asserts all four properties.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0.
- [ ] Each of the four documentation sites that today claims this layer stays out of CI states what
      CI now does: never run a model, report freshness on every pull request, enforce it on the
      release pull request.
- [ ] `evals/merge-gate/README.md` states that the suite's output belongs in the body of the pull
      request that re-records a round, and no longer in every pull request that touches the load
      set.

## Validation plan

| Purpose                | Command                                                                                                          | Expected result                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Format                 | `pnpm agent:check`                                                                                               | exit 0                                              |
| Unit suite             | `pnpm test`                                                                                                      | exit 0, with the freshness marker printed as a skip |
| Build guards           | `node build.mjs`                                                                                                 | exit 0                                              |
| Distribution           | `pnpm test:distribution`                                                                                         | exit 0                                              |
| Focused                | `node --test test/merge-gate-eval.test.mjs test/merge-gate-eval-round.test.mjs test/workflow-contracts.test.mjs` | exit 0                                              |
| Clean verdict          | `pnpm merge-gate-eval verify`                                                                                    | exit 0, six scenarios current                       |
| Strict on a clean tree | `pnpm merge-gate-eval verify --mode strict`                                                                      | exit 0                                              |

Drift simulation, performed in a scratch worktree so the checkout is never left modified: append one
comment line to `src/shared/next-steps.md`, then confirm that `pnpm test` still exits 0, that
`verify` reports stale and names the file, and that `verify --mode strict` exits 1. Discard the
worktree afterwards.

No model run and no re-recorded round are part of this change. The archived corpus is current at the
planning HEAD, verified by a full `node --test test/merge-gate-eval.test.mjs` run on 2026-09-21
(31 of 31 passing).

The CI step is validated through the workflow contract test rather than by pushing a throwaway
release branch; the step's two modes are a shell condition over `github.head_ref`, which the
contract test can assert without a GitHub run.

## Assumptions and open points

- Planned against HEAD `139273e` with a clean worktree. Re-read the two eval test files before
  executing if they moved: the plan names line numbers that a later commit can shift, and step 5
  depends on the publication section still copying the repository's `results/`.
- Verified during implementation, not assumed: release-please opens its pull request from
  `release-please--branches--develop--components--effective-flow`. CI matches the `release-please--`
  prefix rather than the full name, so the component suffix may change with the manifest without
  disarming the gate; `test/workflow-contracts.test.mjs` pins that literal.
- Verified during implementation, not assumed: the `develop` ruleset requires exactly
  `Format, test and build` and `Shellcheck`, its bypass-actor list is empty and its enforcement is
  active. No ruleset change is part of this plan. Should that ever change, the gate reports but no
  longer blocks, and the ruleset has to be adjusted outside the repository.
- Assumed: releases stay deliberate. One round per release is the intended cost, and a project that
  released several times a day would not benefit from this change.
- Accepted risk: a gate regression in `merge-gate` is observed at the release pull request rather
  than in the pull request that introduced it. The per-pull-request stale report carries the list of
  moved files, which is the bisect list for that case, and a round may still be recorded voluntarily
  before merging a risky change to `tools/merge-gate.md` itself.
- Deliberately out of scope: narrowing the 28-file load set further, including the conditional
  `shared/typography-rules.md` pointer, which is a recorded decision; making a round itself cheaper
  by reducing scenarios or slots; any change to the five-of-five bar; enabling the strict
  up-to-date policy on the `develop` ruleset.

## Test results

All four repository checks pass in the delivery checkout:

| Purpose      | Command                  | Result                              |
| ------------ | ------------------------ | ----------------------------------- |
| Format       | `pnpm agent:check`       | exit 0, 455 files                   |
| Unit suite   | `pnpm test`              | exit 0, 1113 pass / 1 skip / 0 fail |
| Build guards | `node build.mjs`         | exit 0, no context-budget breach    |
| Distribution | `pnpm test:distribution` | exit 0                              |

The single skip is the intended freshness marker, whose reason names `pnpm merge-gate-eval verify`.

Behavioural evidence gathered by the independent validation:

- `verify` reports all six scenarios current and exits 0; `--mode strict` exits 0 on a clean tree.
- On a deliberately drifted tree, `verify` reports stale and names the moved file, `--mode strict`
  exits 1, and the **full** `pnpm test` still exits 0 — the empirical proof that no second freshness
  door remains.
- The structural half still fails hard: a deleted `run-N.build.json` and a mismatched metadata
  `buildDigest` each make `pnpm test` exit 1.
- `verify` writes nothing: a 417-file SHA-256 inventory plus an mtime inventory of
  `evals/merge-gate/results/` and `dist/` are unchanged across both modes.
- All three ways of silently disarming the CI gate — adding an `if:`, renaming the branch prefix,
  moving the step ahead of the distribution steps — fail `test/workflow-contracts.test.mjs`.

## Review findings

**Date:** 2026-09-21
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-code-validator

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    12 |
| Open / Not implemented |     1 |

No external review report was written. The one finding left open — `verify` tolerates a stray file
in a scenario directory where `publishRound` refuses it — is inherited from the existing structural
test rather than introduced here, carries no demonstrated cost, and publication still rejects that
shape. The one deferred improvement, deleting the legacy-instrument waiver now that no archived
stamp carries its digest, is recorded in the code at the place its future reader will look, together
with the re-check and the delete-together list; a runtime report file would be a weaker record of it
than the comment already is.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

- **Error cases, Important — a second drift dependency would have made the change a no-op.**
  Removing the assertion from `test/merge-gate-eval.test.mjs` alone leaves
  `test/merge-gate-eval-round.test.mjs` failing on drift through `publishRound`, so per-pull-request
  red would have persisted while the plan claimed otherwise. Incorporated as step 5 and as its own
  acceptance criterion.
- **Testability, Important — moving an assertion out must not silently delete coverage.** Two
  properties would have been lost without compensation: the structural half of the stamp check, and
  the rejection of a drifted carry-forward inside publication. Both are now explicit — the first
  stays in `pnpm test`, the second becomes a synthetic case that is stronger than the incidental
  coverage it replaces.
- **Architecture, Note — the gate deliberately lives in an existing required job.** A separate job
  would be the more readable structure, but a required check that a job-level `if:` can skip never
  reports and blocks the pull request permanently; the plan trades structure for a property the
  repository has already been bitten by.
- **Scope, Note — the cadence change is not a cost reduction of the round itself.** Making a round
  cheaper is a separate, legitimate improvement and is listed as out of scope so it does not get
  folded in.
- **Architecture, Important — the enforcement moved but its binding prose did not (deep review).**
  The recorded reason the suite is binding at all is a pull-request-body convention, which the
  release gate supersedes. Leaving both in place would have left the repository claiming a
  per-pull-request duty that a release-gated cadence can no longer satisfy. Decided in the deep
  review: the convention narrows to the pull request that re-records a round.
- **Error cases, Important — report mode must not fail on a broken build (deep review).** The CLI's
  shared error path exits 1 for any thrown error, so a build failure inside `verify` would have
  turned the required check red on ordinary pull requests through the step introduced to prevent
  exactly that. Incorporated as an explicit split between a verdict and an operational error, with a
  test case in both directions.
- **Error cases, Important — a strict failure must not mask a build failure (deep review).** Placing
  the step next to `Unit tests` would abort a release pull request's job before the distribution
  steps ran. Incorporated: the step is the job's last, and the contract test asserts the placement.
- **Maintainability, Note — a one-generation waiver must not become permanent by relocation.**
  `isCompatibleLegacyInstrumentPredecessor` carries a hardcoded predecessor digest and a
  deliberately temporary scope. Moving it from test code into shipped scaffold code is exactly the
  kind of change that silently promotes it, so the plan requires its scope comment to travel with
  it.
- **Maintainability, Note — the gate's weak point is a string.** The `release-please--` prefix and
  the required job name are both literals that a rename would break silently; both are pinned in
  `test/workflow-contracts.test.mjs`, which is the repository's established way of making a CI
  contract fail loudly.

## Open points

- No open points.
