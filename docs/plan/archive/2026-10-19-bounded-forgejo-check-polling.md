# Bounded Forgejo check polling

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Make `pr-checks-wait` work on the `tea`-backed `forgejo` provider, which includes Gitea, through bounded API polling inside the shipped Node.js helper. A merge-gate run must wait for pending checks without spending a model turn per polling interval or asking the user merely because `tea` has no native watch command. Checks already completed on the current head must return immediately, without sleeping or asking a capability question.

This is a Feature because the adapter currently refuses this operation deliberately. It adds a supported read capability and changes the gate's provider behavior; it does not relax the merge criterion. The user explicitly requested this plan on 2026-10-19 after observing extra confirmations on already-green checks.

Planning baseline: `f0929fd59767bc6c8e7ea7f438f9bb0b8972704b`, 2026-10-19. The invocation worktree was clean before this plan was created. Implementation starts from `origin/develop`, as required by `AGENTS.md`, and rechecks drift in the files below before editing.

Scope is one helper operation, its consumer contracts, regression evidence, and current documentation. GitHub's existing `gh` watch remains unchanged. Do not add a scheduler, daemon, persistent polling state, dependencies, a new project setting, speculative detection of future `tea` commands, or unrelated review-bot polling changes.

## Architecture decisions

- Keep the loop in `remote-tracker-core.mjs`, using the existing injected runner, `clock`, and `sleeper`. The CLI invokes it once. No new runtime module or `RUNTIME_SCRIPT_FILES` entry is needed.
- Reuse `readPullRequestStatus()` and its Forgejo reader, status normalization, HTTP validation, full-SHA addressing, truncation checks, and selected login. Do not build a second status parser or forge client. The initial implementation accepts the existing three API reads per status snapshot rather than introducing an independent optimized reader.
- Reuse `checksWaitSettings()`: the existing `timeoutMs` / `timeoutMinutes` / `waitMinutes` precedence, 20-minute default, positive integer validation, timer ceiling, and `intervalSeconds` with its existing 10-second default. `mergeGate.checkWaitMinutes` remains the project-level bound. No new configuration key is required.
- Bound the complete Forgejo wait operation after repository resolution, including capability probing, API reads, head confirmation, and sleeps, with one absolute deadline from a monotonic production clock. Preserve clock injection for tests without changing unrelated wait clocks. Validate the wait settings before provider calls. Existing repository/bootstrap resolution remains outside this wait budget and must be described as such. Every provider subprocess is capped by the remaining budget; a poll or head change never resets it. Preserve the process runner's bounded termination/drain grace and document that small cleanup allowance separately from the polling deadline.
- Enable `pullRequestChecksWait` from the existing `teaApiTransport` capability. A `tea` lacking the required status-aware API transport remains unsupported. The capability represents helper support, not the presence of a native `tea` watch command.
- Keep `pr-checks-wait`'s result envelope and distinction between completion and success. All reported checks completed means `complete: true`, including completed failures; the gate's fresh `pr-status-read` still decides whether to repair or merge. An empty or unreported list is never complete.
- Follow the current PR head within the original deadline. Discard snapshots when a changed head is observed. Before returning a terminal snapshot, confirm that its head still matches a fresh PR read. A moving head never combines old checks with a new SHA or earns a new timeout budget. The gate's existing final status read and merge-head guard remain authoritative.
- Keep the prohibition on model-driven polling. Update the written contract to allow bounded polling inside the deterministic helper. Keep the existing once-per-run user interaction for an actual timeout or an unsupported transport.
- Effective Flow owns this provider adapter and workflow orchestration. Apply the ownership check without copying domain playbooks into prompt text; update the ownership manifest/guide only if the consumer relationship changes. Historical archived plans and dated review reports retain their historical statements.

## Affected files

| File                                                    | Description                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/remote-tracker-core.mjs`                   | Enable the capability and dispatch a deadline-bound Forgejo polling path before the GitHub watch path; reuse status reads and result normalization.     |
| `src/scripts/remote-tracker-forgejo-core.mjs`           | Replace the wait refusal with a validated first-read command plan; pure builder calls remain side-effect free.                                          |
| `src/scripts/remote-tracker-shared-core.mjs`            | Update provider-specific wait comments and reuse existing settings/transport helpers; change behavior only if a small shared bound helper is necessary. |
| `src/scripts/remote-tracker.mjs`                        | Add scoped cancellation cleanup for polling subprocesses if required by the selected existing process-runner integration.                               |
| `src/tools/merge-gate.md`                               | Remove the blanket Forgejo no-wait preflight claim.                                                                                                     |
| `src/shared/pr-merge-completion.md`                     | Describe native watch or deterministic helper polling and remove the unconditional Forgejo limitation.                                                  |
| `src/shared/pr-review-comments.md`                      | Correct the supported-operation summary without changing review access or writes.                                                                       |
| `src/shared/merge-gate-delegated-run.md`                | Update Phase 2's wait description while retaining timeout, failed-check repair, fresh-status, and once-per-run gates.                                   |
| `src/shared/merge-gate-check-list-waiver.md`            | Replace the claim that Forgejo wait is unsupported; preserve the separate empty/unreported-list handling.                                               |
| `src/shared/review-bot-state.md`                        | Correct the reference to unsupported Forgejo check waits without changing bot observation mechanics.                                                    |
| `test/remote-tracker-polling-cli.test.mjs`              | Isolated real-CLI deadline, descendant termination, SIGINT/SIGTERM and handler-lifecycle regressions.                                                   |
| `test/remote-tracker.test.mjs`                          | Cover capability, pure command planning, state transitions, budgets, head movement, API failures, and shipped CLI termination.                          |
| `test/workflow-contracts.test.mjs`                      | Update assertions for the provider-neutral wait contract; retain the ban on prompt-driven loops and all merge barriers.                                 |
| `test/unattended-planning-contract.test.mjs`            | Update the embedded source assertion that currently freezes the Forgejo no-watch wording.                                                               |
| `docs/user-guide/remote-tracker.md`                     | Document support, settings, deadline scope, timeout/check-list semantics, and command previews.                                                         |
| `docs/user-guide/tools-deliver.md`                      | Update the merge-gate provider description.                                                                                                             |
| `docs/user-guide/configuration.md`                      | Clarify that the existing check-wait bound also governs helper polling.                                                                                 |
| `evals/merge-gate/` and `test/merge-gate-eval.test.mjs` | Add focused provider coverage if needed by the existing suite contract; verify affected evidence and re-record before release.                          |
| `build.mjs`                                             | Adjust only affected context budgets if the measured build report requires it; no new shipped file is planned.                                          |

## Implementation details

### Approach

1. Revalidate the baseline and trace every current assertion that calls Forgejo waits unsupported. Preserve the current GitHub behavior and the exact operation/result contract. Establish regression coverage through injected runner/clock/sleeper fixtures before enabling the capability.
2. Make the Forgejo builder accept `pr-checks-wait`, validate its settings, and return the first PR read as its representative command plan. A pure `buildCommandPlan()` call performs no reads or sleeps. Preserve the existing CLI contract: reads execute immediately, and `--apply` controls mutations only. Do not add an execution dry-run mode for this read operation.
3. Add the Forgejo-specific executor. Establish its deadline once after repository resolution and before probing. Use a scoped runner wrapper so every provider command, including the three reads within a snapshot and terminal-head confirmation, receives at most the remaining time. Check the deadline before and after awaited work. Do not launch commands after expiry, and never pass zero/negative timeouts to Node timers or the process runner.
4. Read immediately. For a nonempty, fully reported list with all checks completed, confirm the head and return without sleeping. For pending, missing, or empty checks, sleep for at most the lesser of the validated interval and the remaining budget, then read again. An entirely completed list is terminal even when some checks are red; it reaches the existing CI repair phase rather than consuming the full wait bound. A mixed red-and-pending list keeps waiting for its pending checks.
5. On an observed head change, invalidate the previous head's retained snapshot and continue within the same deadline. A terminal snapshot is eligible only after its head confirmation succeeds. If the head changes during that confirmation, continue instead of returning the old result. Every unsuccessful repeat, including a head-confirmation mismatch, waits for the bounded interval from step 4; a stream of new heads cannot create a busy loop or bypass cadence limits.
6. At deadline expiry, return a normal wait result with `timedOut: true` and `complete: false`. Retain only the last complete, coherently read snapshot for the most recently observed head. If none exists, report `checksReported: false`, `checkCount: 0`, and an empty list. Do not perform an extra unbudgeted final read or fabricate a fresh check list. Preserve `forcedKill` only when the runner actually reports it.
7. Preserve operational errors as errors: HTTP/auth/permission/rate-limit errors, malformed JSON or structurally invalid status entries, truncated status lists, and process failures do not become successful waits or retryable pending states. Preserve the existing normalization of unknown future status strings as pending, and `skipped` as completed. A subprocess stopped because the operation's deadline elapsed is the bounded-timeout case; a distinct earlier operational failure stays a structured error. Stop on external cancellation and clean up the active subprocess and polling timer using the existing runner lifecycle primitives, without redesigning unrelated operations.
8. Record redacted command previews in actual execution order, with no raw API bodies or credential data. Keep trace growth bounded by the deadline and minimum interval; do not invent a separate progress stream or output one envelope per poll. Validate interval-to-millisecond conversion against timer overflow rather than allowing a huge interval to become a tight loop.
9. Enable the capability and update the consumer prompt fragments, current docs, and source-contract tests together. Do not instruct the model to reconstruct the loop. A supported Gitea/Forgejo run with already-completed checks must no longer ask the unsupported-wait question.

### Edge cases

- Completed failures, errors, warnings, and cancelled states end the wait; they do not satisfy the merge criterion. Mixed completed and pending checks continue waiting.
- Missing/unreported or empty checks can mean that CI has not registered yet. Keep polling until checks appear or the deadline expires, then preserve the existing check-list waiver rules rather than treating absence as green.
- `requiredOnly: true` cannot omit Forgejo statuses because their requiredness is unstated. Continue treating every reported check as blocking, including unknown requiredness.
- Incomplete API status lists retain the existing fail-closed truncation behavior. Do not select only the green page or silently ignore an unparseable entry.
- A late API response after the deadline cannot produce `complete: true`. A subsequent API error does not reuse an earlier green snapshot as a successful result.
- A changed, absent, or malformed head is never resolved through a branch-name fallback. Preserve the existing full-SHA read constraints and incomplete/error behavior.
- Timeout during the first snapshot, capability probing, or head confirmation still terminates within the shared budget plus bounded process cleanup. Capability absence is distinct from a probe killed by expiry.
- SIGINT/SIGTERM during a sleep or active `tea` call must stop the CLI without orphaning an active child or emitting a success envelope. Do not add persistent state for recovery.

## Acceptance criteria

- [x] A supported `tea api` probe advertises `pullRequestChecksWait: true`; an insufficient transport remains false and fails with `UNSUPPORTED_CAPABILITY`.
- [x] One helper invocation polls pending Gitea/Forgejo statuses internally and returns the existing normalized result when they finish. Already-completed nonempty checks return without sleeping, including completed failures.
- [x] Empty/unreported checks never produce completion; delayed check registration is observed, and a timeout preserves the latest valid list or explicitly reports that no list was obtained.
- [x] Injected-clock tests prove one absolute bound across probing, all API reads, head confirmations, and sleeps, with no post-deadline command and no deadline reset on head changes. The shipped CLI proves bounded termination of a hanging provider child, including existing cleanup grace.
- [x] Head-change fixtures prove that checks from an earlier head cannot produce completion after a newer head was observed, including movement during terminal confirmation. Repeated movement retains the polling cadence, bounded command trace, and original deadline.
- [x] Structured API/auth/JSON/truncation/process errors remain failures; deadline expiry is a normal incomplete timeout result. External cancellation leaves no active provider child.
- [x] Pure command-planning tests prove no reads or sleeps and preserve the existing preview contract; read execution remains immediate and invalid settings fail before provider calls. Extreme interval values cannot produce an overflowing timer or busy loop.
- [x] Requiredness, status identity/completeness, fresh-status evaluation, CI repair, review checks, and merge-head protection retain their existing behavior. GitHub watch regressions remain green.
- [x] The built merge-gate contract supports Forgejo polling and does not request continuation merely because native watch is absent when the helper supports the transport. Actual timeouts retain the once-per-run question.
- [x] Current docs and source-contract tests contain no blanket claim that Forgejo `pr-checks-wait` is unsupported. All required repository checks pass; affected behavioral evidence is verified and any new recording obligation is explicit before release.

## Validation plan

During implementation, run focused tests with fake subprocesses, injected time, and sleeper spies: immediate green/red; pending to complete; pending/empty to deadline; delayed registration; mixed states; unknown requiredness; head movement between polls and during confirmation; malformed SHA; truncated status list; API/auth/JSON errors; first-read timeout; probe timeout; hanging child; SIGINT/SIGTERM; invalid/overflowing settings; and pure command previews. Keep real waits short only in shipped-CLI subprocess termination cases. No production API writes or merge are needed.

Run `node --test test/remote-tracker.test.mjs test/workflow-contracts.test.mjs test/unattended-planning-contract.test.mjs` for focused coverage, then CI's required order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. The expected outcome is exit 0 for every command, with no generated `dist/` files committed.

Inspect `node build.mjs`'s measured context report and change only affected budgets if necessary. Run `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, and `pnpm eval next-steps verify` to identify evidence drift because shared sources can affect more than one suite. Re-record the affected suites in fresh sessions before release as their READMEs require; ordinary merging does not require a fresh model run. Unit and source-contract tests remain mandatory for this implementation. If provider behavior needs new behavioral scenarios, maintain fixture fidelity and the suite registry/recording contract.

Review emphasis: deadline composition across nested reads and probes; head-bound snapshot coherence; distinguishing completed red from successful CI; error versus timeout; child cleanup; and preserving the independent final merge gates.

## Assumptions and open points

- Existing API transport is available on supported installations; its absence remains a documented capability result. Future native watch support is a separate adapter change and is not guessed from a version number.
- The initial polling cadence remains the existing ten seconds. The existing interval payload can be supplied by programmatic callers; this plan adds no user-facing tuning surface.
- The standard status reader's extra commit-date read is accepted for initial correctness. Optimizing request count is outside this change.
- Revalidate at implementation time if the status reader, timeout/result contract, runner lifecycle, or merge-gate Phase 2 has changed since the baseline; revise only invalidated parts rather than rejecting unrelated line movement.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- 2026-10-19: gap analysis incorporated preserving immediate read execution instead of inventing a dry-run mode, updating `pr-review-comments`, throttling retries after head movement, and using a monotonic production clock.
- 2026-10-19: independent final plan review found no remaining findings. Clarity, verification, grounded context, purpose, no-code boundary, code frugality, and workflow fit passed the plan-quality scorecard. The documentation-target criterion does not apply to this Feature plan.
- 2026-10-19: the user requested the additional deep interactive review. It found no further deficiencies or implementation-blocking decisions. The plan remains ready for its recommended workflow.

## Open points

- No open points.

## Implementation outcome

**Date:** 2026-10-19

The Forgejo adapter now advertises checks waiting when the status-aware tea API transport is available. One monotonic deadline covers probing, status snapshots, terminal-head confirmation and sleeps after repository bootstrap. Every provider subprocess receives the remaining budget. Completed red checks finish the wait and remain subject to the independent fresh-status and merge gates; empty checks keep waiting. Observed head changes immediately discard older snapshots, including when the new snapshot cannot finish before expiry. Operational errors remain structured failures. The CLI terminates active process groups on SIGINT/SIGTERM and removes its scoped handlers after the operation. GitHub watch behavior and the shared process runner remain unchanged.

Current user documentation and consumer contracts describe deterministic helper polling and retain the prohibition on model-driven polling. The documentation sync found no impact on README entry points, technical guides, runbooks or repository conventions; no ownership relationship changed.

The implementation continues the published plan branch and PR #578. A dedicated owned sibling worktree isolated the work; the invocation checkout and unrelated work were preserved.

## Test results

- Focused tracker/workflow/unattended contract suites: 810 passed before the final test-only review correction.
- Real CLI regressions: 7 passed, including TERM-resistant provider descendants, both cancellation signals during API calls and polling sleeps, and handler cleanup. No fixture processes remained. POSIX process cases explicitly skip Windows; Windows was not exercised here.
- Required CI order: pnpm agent:check, pnpm test, node build.mjs, pnpm test:distribution all exited 0. The full suite reported 2,850 tests, 2,849 passed and one intentional existing skip: archived behavioral freshness is checked separately by the eval verifier. All three distribution targets and context budgets passed; offline distribution smoke passed.
- The final test-only correction passed 24 targeted cases. Independent final verification then passed the whole current tracker suite (382/382, no skips) and formatting. All four reviewed runtime blob hashes were identical to the green full-suite state, so the broad suite was not repeated for test additions alone.
- Durable injected-clock tests consume time in probes, status reads and head confirmation; they cover late success, no post-deadline start, partial new-head expiry, actual forced termination, and operational errors at the deadline.
- Behavioral verifiers for merge-gate, iterate and next-steps all exited 0. Evidence was already fully stale at the immutable pre-implementation commit: 8/8 scenarios (40 runs), 7/7 (35), and 11/11 (55), respectively. The implementation adds affected source/instrument hashes without changing those stale counts. All three suites require re-recording in fresh sessions before the next release; no new model run is claimed here, and ordinary merge does not require one.

## Review findings

**Date:** 2026-10-19
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     1 |
| Open / Not implemented |     0 |

The review found one Important testability gap: the first stored deadline fixture advanced time only during sleep. One Quality correction added provider-time and deadline-edge regressions. Independent re-review confirmed the gap fixed, with no remaining Critical, Important or Note findings. Complexity: Medium (1).
