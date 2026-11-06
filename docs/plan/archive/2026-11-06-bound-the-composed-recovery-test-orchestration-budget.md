# Bound the composed Recovery test orchestration budget

**Plan status:** Implemented
**Source:** Direct approval to plan test-only orchestration budgets during the blocked #624 delivery
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

Give the composed Recovery regression a finite, explicit orchestration budget that
can cover its real validation workload. Preserve the continuous first-six-seals to
next-six-qualifications proof in one admitted invocation. This is a test-contract
change, not an authentication optimization or a demonstrated production deadlock fix.
Bugfix is appropriate because the enclosing test deadline interrupts legitimate
progress and prevents the existing integration assertions from completing.

The initial approval covered planning only. The subsequent explicit
`effective-flow apply docs/plan/2026-11-06-bound-the-composed-recovery-test-orchestration-budget.md`
invocation authorizes the implementation and bounded validation below. It does not
authorize weakening production checks or bypassing delivery gates.

## Outcome checkpoint

**Primary source:** Issue #624 and its approved opaque host-identifier fix, on
`fix/624-encoded-host-identifiers` at source HEAD
`87b7bfc0ce890263c7c5860ac6ad4f4b2a163157`.

**Original outcome:** Deliver #624 after complete native package acceptance; retain
literal identity binding, unchanged evidence validation, and source-only delivery
against `develop`. Supporting test-driver work does not replace that outcome.

**Last evaluated attempt:** Exact-candidate full acceptance failed only in composed
Recovery at the pinned interpreter's 120-second deadline. One bounded diagnostic
then established six genuine first-batch seals and progress in second-batch
authentication at expiry. A subsequent static contract analysis established no safe
authentication removal. Full acceptance and all downstream delivery remain open.

**No-progress count:** Unknown historical continuation count, not reset by this plan.
The current bounded decision authorizes implementation and the finite validation
sequence after the independent plan review and explicit apply invocation.

**Cumulative approach:** The original two-file identifier fix, per-case Python
isolation and owned-group cleanup, and composed release/readiness repairs are
retained. Nine dirty source/test paths existed before this plan. Runner regression
coverage and negative cleanup proof are established; whole-suite acceptance is not.

**Continuation decision:** Preserve the composition claim and all authentication
boundaries. Propose one explicit Recovery-only budget policy, obtain plan approval,
then allow one focused changed-candidate check and one full acceptance attempt. A
failure returns its evidence to the user, without automatic deadline escalation.

## Architecture decisions

- Keep all current authentication, path/ancestry observations, durable reservations,
  cancellation, expiry and no-refund boundaries. No cache, snapshot assumption,
  corpus reduction, alternate concurrency, resumed admission, or seeded replacement
  for the live composed transition is introduced.
- Propose a 180-second pinned-interpreter deadline for Recovery only, enclosed by a
  210-second Python-owner deadline and a 240-second Node-test deadline. The nested
  margins reserve 30 seconds for setup, timeout reporting and owned-group cleanup
  at each outer layer. They are finite engineering allowances, not measured tail
  percentiles or a promise of completion on arbitrary hardware.
- The diagnostic reached all six first-batch seals before the 120-second expiry
  and was still authenticating the final second-batch ordinals. The additional
  interpreter allowance is intended to cover that remaining real work and normal
  completion; its adequacy must be demonstrated by the planned tests, not assumed.
- Select the longer owner budgets using the exact discovered Recovery unittest
  identity, not its module, substring, platform, environment variable, retry count,
  or a permissive override. The shared runner retains its ordinary 150-second child
  default. Unrecognized and unrelated identities retain the existing 180-second
  Node and 150-second Python-owner limits.
- Unknown-start retains its 120-second pinned-interpreter deadline and ordinary
  owner budgets. Discovery retains its existing limit. All other waits, the native
  release's 35 seconds, readiness inactivity's 35 seconds, and production driver,
  qualification and reservation deadlines remain unchanged.
- Keep budget selection small and local to repository test orchestration. Do not
  add a framework, runtime dependency, environment definition or shipped policy.
  Define each JavaScript owner value once in a testable selector and use the same
  selected values in registration and execution. Keep Python's interpreter budget
  explicit at its owning Recovery invocation; regression tests verify the nesting.

## Affected files

| File                                                       | Planned change                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/host-driver/tests/test_remaining_stage_composed.py` | Apply the Recovery-only interpreter budget while keeping Unknown-start bounded separately and the entire coordinator inside its child process. |
| `scripts/host-driver-tests.mjs`                            | Expose the minimal exact-identity owner-budget selector without changing general execution defaults or cleanup behavior.                       |
| `test/host-driver.test.mjs`                                | Use selected Python and Node owner limits for each discovered identity.                                                                        |
| `test/host-driver-runner.test.mjs`                         | Protect exact selection, default preservation, actual timeout propagation and bounded cancellation behavior.                                   |
| `evals/host-driver/tests/test_composed_release.py`         | Replace the obsolete unconditional 120-second source assertion with distinct Recovery/Unknown-start and whole-coordinator-boundary coverage.   |

The identifier fix, production host-driver files, readiness implementation,
`test_remaining_stage.py`, manifests, lockfiles, generated distribution and workflow
configuration are outside implementation scope. This plan is the only new file
authorized in the current planning step.

## Implementation details

1. Capture the current bytes/modes/status baseline and protected product hashes.
   Confirm the source and exact discovered Recovery identity before editing.
2. Introduce the explicit Recovery interpreter allowance and the exact-identity
   owner-budget selection. Preserve process ownership, unsuccessful cancellation,
   original errors, TERM/KILL escalation and the stopped-group completion check.
3. Update focused regressions at each owning boundary. Do not replace the existing
   continuous integration assertions, hardcode a passing summary, or mock real
   admission/authentication in either composed real-case check.
4. Retain timeout diagnostics: in the composed wrapper, surface available captured
   stdout/stderr on interpreter timeout, then re-raise the original exception. Do
   not swallow it or retry. Test this reporting path with a bounded synthetic
   subprocess; do not publish fixture contents or private raw logs.

### Edge cases

- Similar names, another case in the same class/module and discovery never acquire
  the Recovery exception. The exact test ID is covered by a positive assertion;
  representative near-matches and Unknown-start are covered negatively.
- Timeout or owner cancellation remains a failed run and cleans owned descendants
  before result settlement. Increased allowances do not authorize retries.
- Syntax/import/discovery errors stay failures, not valid regression discrimination.
- A passing instrumented diagnostic does not substitute for untouched candidate
  acceptance. No implementation is declared complete from elapsed time alone.

## Acceptance criteria

- Only the exact Recovery identity receives the proposed nested 180/210/240-second
  budgets. Unknown-start, discovery and unrelated cases retain their current limits.
- The entire real coordinator remains inside one bounded pinned interpreter; no
  admission restart or continuation is introduced.
- Recovery still executes six real native jobs, verifies six real seals and twelve
  wrapper starts, and verifies next-batch qualification after the closures in the
  same admitted invocation. Unknown-start still blocks batch two without refund.
- All original closure, foreign/future artifact, accounting, cancellation and
  mutation-rejection assertions remain intact. No authentication boundary is
  removed, cached or substituted.
- Fast regressions establish policy selection, nesting, timeout propagation,
  original-exception preservation and descendant cleanup. A narrow disposable
  mutation reverting Recovery selection is rejected by these assertions.
- Both actual composed cases pass once sequentially in the qualified private
  Git-aware runtime copy; retained stage timings distinguish inner interpreter
  time from outer Node time and disclose the observed budget margin.
- The same exact candidate then passes the full CI-order package sequence and all
  five report-mode eval verifiers, with native counts, exits, source integrity and
  owned cleanup recorded. No skipped or filtered full suite counts as acceptance.

## Validation plan

This planning run executes no project checks, real cases or full suite.
After implementation is separately approved:

1. Use `t3-project` with the existing `ef-policy-node24-git` environment, fresh doctor
   and global active/incomplete inspection. Do not change runner resource policy.
2. Run preflight, scoped formatting for supported files, Python syntax and focused
   budget/runner/release regressions. Preserve ordinary cleanup regressions and add
   the narrow negative proof in a disposable copy only. No real 180-second sleep
   is needed to assert numeric selection; short real subprocess deadlines exercise
   timeout mechanics.
3. Run Recovery and Unknown-start once sequentially, using the validated private
   Git/dependency transport. Keep inner deadlines truthful; an outer diagnostic
   envelope of 600 seconds is a finite transport cap, not a new native test limit.
4. If focused gates pass, run `pnpm agent:check`, `pnpm test`, `node build.mjs`, then
   `pnpm test:distribution`, followed by report-mode verification for `merge-gate`,
   `iterate`, `next-steps`, `build-context` and `focus`. Reuse a measured 4,800-second
   outer executor envelope; never use it to relabel a native timeout as success.
5. Stop downstream gates on the first package failure. Keep all raw diagnostics
   private, verify exact candidate hashes/status and owned process cleanup, and
   return the specific failing gate. No blind repeat or automatic budget increase.

## Assumptions and open points

- The proposed allowances are deliberately scoped, provisional test policy. Existing
  evidence proves budget exhaustion, not a worst-case bound; acceptance must
  demonstrate that the revised policy covers the preserved scenario.
- No production performance improvement, provider/model qualification, new
  behavioral-model run, or real macOS validation is claimed by this test change.
- Original supporting repairs and the #624 product fix remain uncommitted. Approval
  of this plan alone changes neither their delivery status nor tracker state.

## Plan review

### Independent review — 2026-11-06

**Result:** Approved

Checked all five implementation files, exact Recovery selection and unchanged
defaults, deadline nesting including cleanup, the continuous composition proof,
regression discrimination, retained timeout output, and finite validation/stop
rules. No Critical, Important or Note findings were reported.

The 180/210/240-second allowances remain provisional, not a measured runtime
guarantee. This approves the technical plan only: implementation permission and
complete package acceptance for #624 remained outstanding at review time. The review executed no
checks and changed no files.

## Open points

- No open points.
