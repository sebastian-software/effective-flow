# Name the failed runtime-root check behind UNSAFE_RUNTIME_ROOT

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #798

## Requirement

The pilot-measurement helper rejects an unsafe runtime root with one error code,
`UNSAFE_RUNTIME_ROOT`, whatever check failed. `repositoryGuard` and `gitCall` in
`src/scripts/pilot-measurement-core.mjs` raise it for at least eight different conditions: no
runner, a failing or unexpected `git` call, a root that is not a directory, a toplevel mismatch, a
repository-identity mismatch, a path-resolution error, tracked runtime state, and a runtime path
that is not ignored. The envelope deliberately carries no paths, and that stays. But it also gives
no hint which check failed. An operator, or a workflow deciding whether a later run can succeed,
cannot tell a misconfigured repository from a wrong `repositoryIdentity` or a sandbox in which
`git` cannot run. In an observed `merge-gate` run on T3 Code the pilot `inventory` call failed with
`UNSAFE_RUNTIME_ROOT` in two consecutive dispatches, and the cause could not be determined.

Goal: every `UNSAFE_RUNTIME_ROOT` error carries a `details.reason` from a closed, value-free set,
and for a failed Git call the bare Git subcommand. The envelope passes them through unchanged. The
error code, exit status 3, the constant message and the no-path rule stay unchanged. The
merge-gate fragment tells the orchestrator to report the reason when a pilot call fails.

Workflow rationale: Feature. The helper gains a new, additive envelope field that callers can read.
No existing behaviour is wrong; the change adds diagnostic information. It touches a runtime
script, its tests, one shipped prose fragment and the protocol guide.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #798
**Original outcome:** each failing runtime-root condition returns `UNSAFE_RUNTIME_ROOT` with its own
value-free `details.reason`, visible in the CLI envelope; code, exit status and the no-path rule
are unchanged; CI order passes.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline; no earlier attempt.
**Continuation decision:** none

## Architecture decisions

- **Closed reason set beside the code list.** Export a frozen `UNSAFE_RUNTIME_ROOT_REASONS` array
  from `src/scripts/pilot-measurement-core.mjs`, following the precedent of `ROOT_CHECKS` and
  `UNSAFE_REASONS` in `src/scripts/config-resolve-core.mjs`. Its values are exactly
  `git-unavailable`, `git-failed`, `not-directory`, `toplevel-mismatch`, `identity-mismatch`,
  `path-resolution`, `tracked-runtime-state` and `not-ignored`. Tests and the guide reference this
  list; nothing composes a reason from a runtime value.
- **Git subcommand as its own closed field.** A `git-failed` reason also carries
  `details.subcommand`, one of `rev-parse`, `ls-files` or `check-ignore`. This is `args[0]` of the
  `gitCall` invocation, checked against that closed list; never arguments, paths, stdout, stderr or
  the exit status. No other reason carries `subcommand`.
- **`details` exists only on `UNSAFE_RUNTIME_ROOT`.** `PilotMeasurementError` accepts an optional
  `options.details`. `fail` rejects (as a programming error caught by tests) a `details` whose
  `reason` is outside the closed list. `errorEnvelope` adds `error.details` only when the error
  carries it, so every other code's envelope stays byte-identical. Existing exact `deepEqual`
  assertions on other codes (`test/pilot-measurement-cli.test.mjs` around line 114,
  `test/pilot-measurement-adoption.test.mjs` around line 1973) stay valid.
- **Details survive the pilot-control rewrap.** `controlError` (around line 3310 of the core)
  builds a new `PilotMeasurementError` for `finalize`, the gate observations and `record-incident`.
  It copies `details` from the normalized error, so the neutral `UNSAFE_RUNTIME_ROOT` envelope of
  those operations exposes the same reason as `inventory`.
- **Spawn errors count as `git-unavailable`; runner rejections stay unmapped** (scored decision,
  see "Decided by score"). A missing or non-function runner and a runner result with `error` set
  are `git-unavailable`; the production CLI runner (`src/scripts/pilot-measurement.mjs` lines
  14-39) reports a spawn failure that way and never rejects. `gitCall` does **not** catch a
  rejecting runner. Inside the `try` block of `repositoryGuard` such a rejection still lands in the
  `catch` (`path-resolution`). At the later `ls-files` and `check-ignore` calls it still escapes as
  a non-helper error. This keeps its `fault` classification during `finalize`, the gate
  observations and `record-incident`, which `test/pilot-measurement-timing.test.mjs` (around lines
  402-445) pins with a persisted `finalization-failed` suspension. No failure class changes.
- **A not-ignored path becomes distinguishable.** `check-ignore -q` exits 1 for a path that is not
  ignored. The guard's `check-ignore` call allows statuses 0 and 1 and raises `not-ignored` on 1.
  Every other status (for example 128) stays `git-failed` with subcommand `check-ignore`.
- **The `catch` maps to `path-resolution`.** Non-helper errors in the `repositoryGuard` `try` block
  come from `realpath` or `stat` (of the root, the reported toplevel, the common directory or the
  supplied identity), or from a rejecting injected runner. They map to `path-resolution`. The
  `cause` stays internal and unserialized, as today.
- **Details are constants, validated in one place.** Call sites pass frozen per-reason `details`
  constants (and per-subcommand constants for `git-failed`), so no invalid shape is built at run
  time. The `PilotMeasurementError` constructor still validates `details` (so `controlError` is
  covered too) and throws a module-private error class on a violation. The guard's `catch`
  rethrows that class by `instanceof`, so a programming error never becomes `path-resolution`.
- **Prose in the merge-gate fragment only** (scored decision, see "Decided by score"). One sentence
  goes into step 5 of `src/shared/pilot-measurement.md`, which handles a failed inventory or
  reservation. Build,
  refactor and fix keep reporting the code alone; their fragment already forbids re-sending after
  any error but `LOCKED`.
- **No protocol-digest change.** The error envelope is not part of
  `src/scripts/pilot-measurement-protocol.mjs` or its digest, and the error code list is unchanged,
  so persisted generations stay valid.

## Affected files

| File                                                   | Description                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/pilot-measurement-core.mjs`               | Add `UNSAFE_RUNTIME_ROOT_REASONS`; accept and validate `options.details` in `PilotMeasurementError`; set a reason at every `UNSAFE_RUNTIME_ROOT` site in `gitCall` and `repositoryGuard`; distinguish check-ignore status 1; copy `details` in `controlError`; emit `error.details` in `errorEnvelope`. |
| `src/scripts/pilot-measurement.mjs`                    | No logic change expected: it serializes the core's envelope as is. Keep the stdout and stderr lines unchanged, because `test/pilot-measurement-contract.test.mjs` matches them, and stderr gains no details. Touch it only if verification shows the envelope is rebuilt there.                         |
| `test/pilot-measurement-git.test.mjs`                  | One test per reason against the real-Git fixtures and fake runners, plus the redaction invariant test.                                                                                                                                                                                                  |
| `test/pilot-measurement-cli.test.mjs`                  | One CLI-level test that a rejected root exposes `error.details.reason` in the stdout envelope, with exit status 3, code and message unchanged, and an unchanged stderr line.                                                                                                                            |
| `test/pilot-measurement-adoption.test.mjs`             | Extend the existing `repository identity` neutral-failure row (around line 1936) to assert `details.reason` `identity-mismatch` through `finalize`'s rewrap.                                                                                                                                            |
| `test/pilot-measurement-contract.test.mjs`             | Update a source-text regex only if a guard call line it matches changes (around lines 133-136); the `check-ignore` regex must still match. Add the assertion that the protocol guide lists exactly `UNSAFE_RUNTIME_ROOT_REASONS`.                                                                       |
| `test/pilot-measurement-timing.test.mjs`               | No change: its rejecting-runner `finalize` fault (around lines 402-445) must keep passing unedited.                                                                                                                                                                                                     |
| `test/workflow-contracts.test.mjs`                     | One assertion pinning the new `pilot-measurement.md` sentence (a pilot failure reports the closed `details.reason`).                                                                                                                                                                                    |
| `src/shared/pilot-measurement.md`                      | One sentence in step 5, which handles a failed inventory or reservation.                                                                                                                                                                                                                                |
| `docs/developer-guide/model-tiering-pilot-protocol.md` | Document the optional `error.details` of `UNSAFE_RUNTIME_ROOT`, its closed reasons and `subcommand`, and that it carries no path or Git output, next to the existing envelope and failure-class description (around lines 560-585); clarify "retryable" in the Neutral row.                             |

## Implementation details

### Approach

1. In `src/scripts/pilot-measurement-core.mjs`, add the frozen `UNSAFE_RUNTIME_ROOT_REASONS`
   export and a frozen internal list of the three permitted subcommands.
2. Extend `PilotMeasurementError` with an optional `details` taken from `options.details`. Accept
   it only for `UNSAFE_RUNTIME_ROOT`, only with a `reason` from the closed list, and `subcommand`
   only with `git-failed` and from its closed list. Any other shape throws the module-private
   error class at construction time, covered by a unit test. Store the frozen constant.
3. Rework `gitCall` so it fails with `git-unavailable` for a non-function runner or a result with
   `error`. It leaves a rejected runner promise uncaught, as today. It fails with `git-failed` plus
   the closed subcommand for a status outside `allowed`. It gains a way for the caller to map a
   specific status to its own reason; keep the change small, for example an optional
   status-to-reason map. The status is checked, never echoed.
4. In `repositoryGuard`, raise `not-directory` (line 461), `toplevel-mismatch` (463),
   `identity-mismatch` (470), `path-resolution` (the `catch`, 471-474), and `tracked-runtime-state`
   (476). Raise `not-ignored` for check-ignore status 1 (477-479). Keep the `INVALID_PAYLOAD` check
   for non-absolute input and the `MIGRATION_REQUIRED` check unchanged.
5. In `controlError`, pass `details` of the normalized error into the new error.
6. In `errorEnvelope`, add `details` to `envelope.error` after `exitCode` when present, as a plain
   copy of the closed fields.
7. Confirm `src/scripts/pilot-measurement.mjs` needs no change: stdout carries the full envelope,
   stderr stays `<code>: <message>`.
8. Add the tests listed under "Validation plan".
9. In `src/shared/pilot-measurement.md` step 5 ("If inventory or reservation fails, …"), add one
   short sentence: on `UNSAFE_RUNTIME_ROOT`, this dispatch's report names the skipped observation
   with the code and its closed `details.reason` (and `details.subcommand` when present) as one
   value-free line. Step 5 covers both `inventory` and the `start-gate-observation` reservation,
   which runs the guard again. The sentence carries no no-retry clause and no setup route (scored
   decision, see "Decided by score"): a dispatch has no retry path, and a re-dispatch calls
   `inventory` again and reports again. It does not restate step 5's mode-and-outcome rule. It must
   not disturb the section slices that `test/workflow-contracts.test.mjs` (around lines 3298-3425)
   reads. Add one assertion there, titled after the invariant (a merge-gate pilot failure reports
   the closed `details.reason` of `UNSAFE_RUNTIME_ROOT`), that pins the sentence.
10. Update `docs/developer-guide/model-tiering-pilot-protocol.md` with the envelope field as in
    "Affected files". In the Neutral row of the failure-class table (around line 564), clarify that
    for `UNSAFE_RUNTIME_ROOT` a retry succeeds only once the named check passes, without implying
    that any reason is transient. Add one unit assertion,
    titled after the invariant (the guide lists exactly `UNSAFE_RUNTIME_ROOT_REASONS`), so the
    guide's copy of the reasons cannot drift from the export.
11. Run `pnpm format`, then CI's order.

### Component structure

Not relevant: one module and its tests.

### State management

Not relevant: no persisted state, schema or digest changes. `details` lives only in the error
envelope.

### API integration

The helper's JSON error envelope gains one optional field, `error.details`, for one code. Its shape
is `{ "reason": "<closed value>" }`, plus `"subcommand": "<closed value>"` for `git-failed`.
Consumers that ignore unknown keys keep working; no consumer in this repository deep-compares an
`UNSAFE_RUNTIME_ROOT` envelope today.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- A runner that returns `error` and status 0: `git-unavailable`, because the spawn failed.
- `check-ignore` status 128 (for example a corrupt index): `git-failed` with subcommand
  `check-ignore`, not `not-ignored`.
- `rev-parse --show-toplevel` succeeds but its output cannot be resolved by `realpath`:
  `path-resolution`.
- `realpath(input.repositoryIdentity)` fails because the identity path does not exist:
  `path-resolution`, not `identity-mismatch`. The protocol guide says that both point at the
  supplied identity or root.
- `ls-files` fails (non-zero status): `git-failed` with subcommand `ls-files`; it succeeds with
  output: `tracked-runtime-state`.
- The runtime root path does not exist: `realpath` fails, so `path-resolution`; a regular file:
  `not-directory`.
- `finalize`, `start-gate-observation`, `finalize-gate-observation` and `record-incident` keep
  their neutral classification and `pilotControlOutcome: "none"` and also expose the reason.
- A `MIGRATION_REQUIRED` or `INVALID_PAYLOAD` raised by the guard carries no `details`.
- "Not a Git repository" and Git's `safe.directory` "dubious ownership" refusal both make
  `rev-parse --show-toplevel` exit 128 and share `git-failed` / `rev-parse` by design: exit status
  and stderr are deliberately not inspected, and the reason set stays the issue's eight values.
- A runner result with `status: null` and no `error` (the CLI runner after a signal kill), or a
  runner that resolves a non-object: `git-failed` with the subcommand. One fake-runner test covers
  the `status: null` case.
- An injected runner that rejects keeps today's behaviour: `path-resolution` inside the guard's
  `try`, an unchanged `fault` classification at the later `ls-files` and `check-ignore` calls.

## Acceptance criteria

- [ ] Each of the eight reasons in `UNSAFE_RUNTIME_ROOT_REASONS` is produced by its own named unit
      test in the pilot-measurement tests. Each asserts code `UNSAFE_RUNTIME_ROOT`, exit code 3,
      the unchanged message, and `error.details.reason` equal to that reason.
- [ ] A `git-failed` test asserts `error.details.subcommand` for at least `check-ignore`, and a unit
      test asserts that the subcommand is always one of `rev-parse`, `ls-files` or `check-ignore`.
- [ ] One test, titled after the invariant (no `details` value carries an absolute path or Git
      output), runs every reason case with fixture paths and runner stdout/stderr marker strings. It
      asserts that every `details` value is in its closed list, and that no envelope string value
      contains a fixture path, a `/`-rooted path, or a marker string.
- [ ] A CLI-level test shows `error.details.reason` in the stdout envelope, with exit status 3, code
      and message unchanged, and stderr exactly `UNSAFE_RUNTIME_ROOT: <unchanged message>\n`.
- [ ] The `finalize` neutral-failure row for a foreign repository identity asserts `details.reason`
      `identity-mismatch` and still `pilotControlOutcome: "none"`.
- [ ] Envelopes of every other error code are unchanged (existing exact `deepEqual` tests still pass
      without edits).
- [ ] `test/pilot-measurement-timing.test.mjs` passes unedited, so a rejecting runner after a write
      still persists `finalization-failed`.
- [ ] The new `test/workflow-contracts.test.mjs` assertion passes against the step-5 sentence of
      `src/shared/pilot-measurement.md`, and the new guide assertion passes against
      `docs/developer-guide/model-tiering-pilot-protocol.md`.
- [ ] `node build.mjs` passes with every tool within its `contextBudget`, and CI's order passes:
      `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Validation plan

- `node --test test/pilot-measurement-git.test.mjs test/pilot-measurement-cli.test.mjs
test/pilot-measurement-adoption.test.mjs test/pilot-measurement-contract.test.mjs` while iterating.
- `node --test test/workflow-contracts.test.mjs` after the prose edit, to confirm the
  `pilot-measurement.md` section assertions still hold.
- Then CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs` (read the
  `Always-loaded core (lines/budget)` report; `pilot-measurement.md` is lazy-included, so no
  budget is expected to move), `pnpm test:distribution`.
- `pnpm eval merge-gate verify` (read-only) to record whether the prose edit creates
  behavioural-eval freshness debt. CI reports such debt without failing; the PR names it.

## Assumptions and open points

- Verified: the only `UNSAFE_RUNTIME_ROOT` sites are in `gitCall` and `repositoryGuard` of
  `src/scripts/pilot-measurement-core.mjs`. `details` exists nowhere in that module today.
  `errorEnvelope` lives in the core and the CLI only serializes it. `controlError` drops all
  options except the control fields.
- Verified: `src/shared/pilot-measurement.md` never names `UNSAFE_RUNTIME_ROOT`; it handles any
  inventory error in step 1 and step 5.
- Verified: `src/shared/setup-targeted-change.md` line 239 names `UNSAFE_RUNTIME_ROOT`, and
  `test/workflow-contracts.test.mjs` pins that sentence. It stays unchanged: setup reports by code
  and routes to setup, which is still correct.
- Assumption: no caller outside this repository deep-compares an `UNSAFE_RUNTIME_ROOT` envelope. The
  helper is internal to Effective Flow.
- Not in scope: the undefined-`repositoryIdentity` cause suspected in #737. A missing or
  non-absolute identity fails `INVALID_PAYLOAD` before the guard; this plan only makes the
  remaining causes visible.
- Deliberately not incorporated: the issue's "never retry on `identity-mismatch` or
  `tracked-runtime-state`". A merge-gate dispatch has no retry path, and holding the rule across
  dispatches would need a new wisdom-file record. The scored decision keeps the sentence to
  reporting; the protocol guide states that a retry succeeds only once the named check passes.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site":"S-CLR","question":"Where should the shared-prose instruction about reporting details.reason (and not retrying on identity-mismatch / tracked-runtime-state) be added?","options":["pilot-measurement.md only","Both fragments","pilot-measurement-workflow.md only","Decide later"],"escape":["Decide later"],"scores":[{"label":"pilot-measurement.md only","score":7,"reason":"Places the sentence at the merge-gate inventory-error handling where the observed failure occurs, matches the issue literally, and adds no prompt length to build/refactor/fix runs."},{"label":"Both fragments","score":6,"reason":"Broader coverage for build/refactor/fix, but exceeds the issue scope, costs prompt length on three workflows and partly duplicates the existing never-re-send rule."},{"label":"pilot-measurement-workflow.md only","score":3,"reason":"Misses the merge-gate path that never loads this fragment and only restates an existing no-retry rule."}]},{"site":"S-BAT","question":"How should the plan treat a runner that rejects (throws) during the guard Git calls?","options":["Leave rejections unmapped","Reclassify rejections","Fault after write","Decide later"],"escape":["Decide later"],"scores":[{"label":"Leave rejections unmapped","score":9,"reason":"The production runner never rejects, so the issue spawn-error case arrives as a result with error and maps to git-unavailable; this keeps every failure class and the timing test intact, which is its edge over reclassifying."},{"label":"Reclassify rejections","score":4,"reason":"Uniform reasons, but it turns post-write rejections from a persisted fault into a neutral error without suspension and requires reworking a deliberate test for a case the production runner never produces."},{"label":"Fault after write","score":2,"reason":"Reshapes the neutral/fault contract for guard failures after a write, well outside the scope of naming the failed check."}]},{"site":"S-DEC","question":"How should the merge-gate sentence handle the no-retry part across dispatches?","options":["Wisdom-file line","Current dispatch only","Report now, defer no-retry","Decide later"],"escape":["Decide later"],"scores":[{"label":"Wisdom-file line","score":5,"reason":"Only option that enforces no-retry across dispatches, but it adds a new wisdom-file record, a preflight skip branch and a contract test, paid in prompt length on every run, to avoid one cheap read-only call."},{"label":"Current dispatch only","score":8,"reason":"One honest sentence that fits the existing structure: there is no in-dispatch retry path and each re-dispatch reports the reason again, so the only cost is a repeated report, without a no-op clause."},{"label":"Report now, defer no-retry","score":6,"reason":"Same prompt text as current-dispatch-only while keeping the no-retry ask on record, but a follow-up issue for skipping one cheap read-only call costs more tracking than it returns."}]}]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |         3 |    3 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    5 |

### Findings

Internal review (gap analysis and plan review, 2026-11-26); every finding is incorporated.

- Error cases, Critical: catching runner rejections in `gitCall` would have turned the pinned
  mid-finalize fault of `test/pilot-measurement-timing.test.mjs` into a neutral failure without a
  suspension. Incorporated by scored decision: rejections stay unmapped, no failure class changes,
  and the timing test must pass unedited.
- Error cases, Important: "do not re-dispatch" could have suppressed the merge gate's own
  legitimate re-dispatches. Incorporated: the sentence governs only the pilot `inventory` call.
- Testability, Important: the merge-gate fragment has no "degradation report". Incorporated: the
  sentence names the gate's final report as the destination, one value-free line, and a contract
  test pins it.
- Maintainability, Note: the protocol guide calls `UNSAFE_RUNTIME_ROOT` retryable. Incorporated:
  the Neutral row clarifies retrying after the state is corrected.
- Maintainability, Note: details validation was described in two places and a validation error
  could be disguised as `path-resolution`. Incorporated: the constructor alone validates and the
  guard's `catch` rethrows it.
- Maintainability, Note: the guide's copy of the reason list could drift. Incorporated: one
  assertion ties the guide to `UNSAFE_RUNTIME_ROOT_REASONS`.
- Scope, Note: "not a repository" and `safe.directory` refusals share `git-failed` / `rev-parse`.
  Incorporated as a documented edge case; the reason set stays the issue's eight values.

### Deep review (2026-11-26)

Deep plan review of the revised plan; every finding is incorporated. The summary table above
counts both rounds; this round adds two Important and five Note findings, all resolved.

- Error cases, Important: a no-retry clause could not hold across merge-gate dispatches, and a
  reason from an earlier dispatch would never reach a later report. Incorporated by scored
  decision: the sentence only reports in the current dispatch and carries no no-retry clause.
- Error cases, Important: setup does not repair a repository-identity mismatch. Incorporated: the
  sentence carries no setup route.
- Maintainability, Note: the sentence restated step 5's mode-and-outcome rule. Incorporated: it no
  longer does.
- Error cases, Note: the reservation call also runs the guard. Incorporated: the sentence moves to
  step 5, which covers inventory and reservation.
- Maintainability, Note: the guide clarification implied that some reasons are transient.
  Incorporated: a retry succeeds only once the named check passes.
- Error cases, Note: a plain validation error would still become `path-resolution`. Incorporated:
  frozen constants at the call sites and a module-private error class the `catch` rethrows.
- Error cases, Note: `status: null` and non-object runner results were unmapped. Incorporated as
  edge cases with one fake-runner test.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-27
**Workflow:** `effective-flow build`, unattended under `effective-flow autopilot` run
`ap-20261126T230940Z-96747c67`

### Requirement

Every `UNSAFE_RUNTIME_ROOT` error of the pilot-measurement helper names the failed check through a
closed, value-free `details.reason` (plus `details.subcommand` for `git-failed`), while code, exit
status 3, message and the no-path rule stay unchanged.

### Architecture decisions

- Implemented as planned, including the three scored decisions.
- `gitCall` keeps `allowed = [0]` and takes an optional status-to-reason map; the `check-ignore`
  guard passes `{ 1: 'not-ignored' }`. Other statuses stay `git-failed` with the subcommand.
- The `PilotMeasurementError` constructor refuses an `UNSAFE_RUNTIME_ROOT` without valid closed
  details (review hardening), so a missed lookup is a programming error, never a reasonless error.

### Affected files

- `src/scripts/pilot-measurement-core.mjs`
- `src/shared/pilot-measurement.md`
- `docs/developer-guide/model-tiering-pilot-protocol.md`
- `test/pilot-measurement-git.test.mjs`, `test/pilot-measurement-cli.test.mjs`,
  `test/pilot-measurement-adoption.test.mjs`, `test/pilot-measurement-contract.test.mjs`,
  `test/workflow-contracts.test.mjs`
- `src/scripts/pilot-measurement.mjs` and `test/pilot-measurement-timing.test.mjs` are unchanged.

### Test results

- Targeted: the five pilot-measurement test files (108 pass) and `test/workflow-contracts.test.mjs`
  (623 pass), run after the last correction.
- Full run before the review corrections: `pnpm test` reported 8 timeout-shaped failures in
  untouched suites on a host at load average about 58 (`host-driver`, `issue-buddy-pass`,
  `merge-gate-eval-round`, `merge-gate-eval-round-lifecycle`, `protected-validation-operator`).
  All pass on the unchanged base and pass again by identity on this change at normal load; their
  attribution stays unknown. `node build.mjs` (no budget violation), `pnpm test:distribution` and
  `pnpm eval merge-gate verify` (freshness debt only) passed.

### Review result

The Node.js review found four Notes, no Critical or Important findings; all four were fixed and
re-checked. No findings were offloaded.

## Review findings

**Date:** 2026-11-27
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     4 |
| Open / Not implemented |     0 |
