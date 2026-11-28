# Stop Autopilot safely when T3 issue classification times out

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

On T3 Code, Autopilot must not end its issue preflight while telling the user it will continue automatically when no reliable continuation has been established. In the run for issue #837 on 2026-11-27, the delegation tool returned `waitTimedOut: true`, a running classifier, and an instruction saying completion would wake the parent (activity position 20). The classifier completed at 20:59 CET, but the parent ended at 21:01 CET without continuing. The user asked for status at 22:05 CET and then asked it to continue (positions 24–33). The record does not establish whether the result was undelivered or delivered but not processed.

The fix is to end that unqualified wait explicitly, with an accurate status and manual re-entry. It does not restore unattended operation for cases where classification takes longer than the host wait. The trigger was observed while processing #837; this plan does not implement that issue. Bugfix is the right workflow because the change corrects one existing preflight transition and needs a focused regression check.

## Outcome checkpoint

**Primary source:** 2026-11-27 session retrospective of the T3 Autopilot run for #837 in `sebastian-software/effective-flow`; planning baseline: local `origin/develop` at `6fa28284`.

**Original outcome:** A classification deadline never leaves the user with a false promise of continuation; valid terminal classifications continue normally without weakening the read-only preflight.

**Last evaluated attempt:** None for this fix. The triggering run is incident evidence, not an implementation attempt.

**No-progress count:** 0.

**Cumulative approach:** Bounded retrospective and source review; no implementation or live host check performed.

**Continuation decision:** Plan the safe stop in Effective Flow. Repairing or qualifying T3 result delivery is separate and needs host evidence.

## Architecture decisions

- Own the timeout branch at the classifier's existing dispatch site. Keep the classifier a read-only leaf with a subtype-only return. A generic promise to wake, a task ID, or a running state is not a terminal result or qualification for this dispatch site.
- Keep preflight write-free: no early `run-init`, planning claim, ledger, worktree, branch, or forge write. The timeout is a parent preflight stop, not a failed classification or a scored blocker. Do not extend the generic host adapter, add host polling, or change the PR-watch protocol.
- Manual recovery starts a fresh preflight with the same issue reference. It does not adopt a stale classification or create a resumable run. A late completion from a stopped attempt cannot authorize `run-init` or launch Issue Buddy, even if the host later delivers it.

## Affected files

| File                                   | Planned change                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/shared/autopilot-issue-source.md` | Own the T3 timeout decision at `autopilot-issue-source/issue-classification` before the `run-init` boundary.      |
| `test/workflow-contracts.test.mjs`     | Guard the authored contract: explicit stop and re-entry before mutation, while preserving the valid subtype path. |

## Implementation details

### Approach

1. On the current `origin/develop`, recheck Phase 1 of `src/tools/autopilot.md`, the classifier dispatch, and the existing contract tests. If the exact dispatch is already covered by a newer fix, validate that path rather than adding a second rule. The no-wake stops from `4f6480b9` and `6fa28284` concern PR watches, not this delegate.
2. At the T3 classifier dispatch, distinguish a terminal tool result from `waitTimedOut: true` with outstanding work. Follow the normal path only after receiving one valid, terminal `plain-issue` result for this attempt. For the timeout case, end preflight in the current turn and report the cause, that no run or PR was created, and the exact re-entry invocation for the same issue in the active client syntax. Do not promise automatic continuation, poll, or retry in the background. If a late completion starts a new turn despite the stop, do not act on it without an explicit fresh user invocation.
3. Keep the existing handling of invalid subtypes, failed or declined delegation, and malformed output. Do not change plan-file inputs, other hosts, or post-`run-init` delegation. If the host cannot distinguish the timeout at this site from a successful terminal result, stop implementation and document the missing signal rather than guessing from text or timing.

### Edge cases

- Re-entry that times out again is another visible no-write stop, not a retry loop or proof of a T3 defect.
- Wrong task results, duplicate late delivery, and malformed output cannot cross the preflight boundary. A separate successful fresh attempt still follows the existing planning-claim protection.

## Acceptance criteria

- [ ] A T3 classification that returns a running delegate after the synchronous wait ends visibly before `run-init`, names the manual re-entry, and does not promise a wake or create workflow or forge state.
- [ ] Completion of the timed-out delegate, including duplicate delivery where supported, does not start the stopped attempt. The user can make a fresh attempt; if it returns a valid `plain-issue` within the wait, it reaches `run-init` once.
- [ ] Unsupported subtypes and failed or malformed results still stop; the plan-source path and non-T3 contract are unchanged.

## Validation plan

- Add a focused `test/workflow-contracts.test.mjs` assertion at the existing Autopilot contract checks. It must fail on the previous contract. Verify the timeout branch is scoped to the classifier and exits before `run-init`; the source assertion is not proof of host behavior.
- In a T3 Code/Codex acceptance run using an isolated fixture and instrumented or stubbed mutation boundaries, make a read-only classifier finish after the wait and observe the parent report, tool calls, and any late completion. Require zero `run-init`, Issue Buddy, claim, or PR mutations on that attempt. In a fresh invocation return a valid terminal subtype before the deadline and observe one `run-init` at the stub boundary. Include a malformed or unsupported classification as a negative control. Do not test against #837 or a live issue with writes enabled. If the fixture cannot safely exercise the host path, record that acceptance remains unverified; do not treat the source assertion as a host pass.
- Run the focused contract test, then the repository's qualified runner lane and required CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. Check the generated context budgets and reported behavioral-evidence debt; do not claim fresh model evidence from a build alone.

## Assumptions and open points

- The reported T3 timeout shape is available to Autopilot at this dispatch site; verify on implementation. No claim is made about T3 internals or automatic wake reliability on other sites.
- A safe stop intentionally gives up unattended completion on this timeout path. Any future automatic continuation requires separate end-to-end proof of delivery to the matching parent attempt and duplicate-safe resumption.

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

- No findings in the internal review. It checked scope, timeout and re-entry behavior, the no-write boundary, and the distinction between contract tests and host acceptance. Host acceptance remains an implementation check.

## Open points

- No open points.
