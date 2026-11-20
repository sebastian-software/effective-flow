# Issue-lifecycle receipt for plan-PR continuations

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`effective-flow merge-gate` should offer to close the issue after a merge also for pull requests that continue a published plan PR, and for every issue-sourced `effective-flow autopilot` PR.

Most autopilot issue runs continue an Issue Buddy plan PR. When Issue Buddy skips an issue because its plan is already on the base (`plan-on-base`, `src/shared/autopilot-issue-source.md:81`), autopilot opens its pull request on the "Plan on the base" path instead (`:116-125`). That path has no plan-PR finish.

Today none of these pull requests carries an `effective-flow-issue-lifecycle:v1` receipt. Merge-gate therefore treats them as legacy PRs (`src/shared/issue-lifecycle.md:67-69`), Phase 5.5 reports issue observation as unavailable, and the issue stays open until someone closes it by hand. Only `apply-issues` (`src/tools/apply-issues.md:114`) and remote `apply-review` (`src/tools/apply-review-remote.md:34`) write the receipt.

A related loss: build, fix, refactor and docs continuations also drop the plan PR's `Refs #<N>`. The plan-draft finish rebuilds the body, and the body check keeps only issue references that the caller supplies. Only autopilot supplies one (`src/shared/scored-decisions.md:163`).

A local, uncommitted investigation report (`.effective-flow/investigation/investigation-2026-11-20-autopilot-pr-uses-refs-instead-of-closes.md`) traced this gap for PR #697 and issue #693.

The non-closing `Refs` keyword stays. It is deliberate policy for drafts meant for human review (`docs/adr/automation-tool-category.md`, `docs/user-guide/tools-automation.md:152`). This change adds the durable handoff that merge-gate's completion offer already relies on, and restores the visible `Refs #<N>` on every continuation.

Classification: Feature. It adds new behavior across autopilot, the continuation, `pr` and the merge-gate handoff, and does not repair a broken existing contract.

## Outcome checkpoint

**Primary source:** user request in this session, following the investigation of PR #697 and issue #693 in `sebastian-software/effective-flow`
**Original outcome:** Once an issue-sourced autopilot PR or a plan-PR continuation is merged, merge-gate observes the issue instead of ending as legacy. In a gated run it offers to close the issue when its completion assessment is `complete`, meaning every acceptance criterion of the issue is covered in the merged PR's title or body. Otherwise it reports `incomplete` or `undetermined`. Nothing closes automatically, and `Refs` stays.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Architecture decisions

- **Two producers, one receipt.** This is the user's decision.
  - **Autopilot** builds the receipt in its "Before `pr`" step (`src/shared/scored-decisions.md:160-166`) for every issue-sourced path, plan-PR continuation and plan-on-base alike. The issue comes from the ledger's `source.issue` and `source.repository`, which `autopilot.mjs run-check` returns for the received `Autopilot run:` id (`src/scripts/autopilot-core.mjs:1059-1069`).
  - **`plan-pr-continuation`** builds one for the other continuations (build, fix, refactor, docs) whenever it adds `Finalize plan draft:`, but only when the `pr` delegation does not already carry a receipt line. A pull request therefore never gets two receipt lines, which `issue-lifecycle-receipt-parse` would reject.
- **Not at plan publication.** This is the user's decision. A plan PR merged with only the plan must never trigger a close offer. `plan-publication-core.mjs` stays unchanged.
- **Receipt only, no started transition.** This is the user's decision. Neither producer adds the `effective-flow-issue-in-progress` label, sets an external started state or posts a PR-link comment. Merge-gate's offer eligibility is only a `complete` verdict plus a proven transition path (`src/shared/merge-gate-issue-observation.md:191-196`).
  - Observation step 5 must therefore remove the in-progress label only when it is present. Today the GitHub `issue-label-remove` sends a `DELETE` (`src/scripts/remote-tracker-github-core.mjs:394-402`), and `runChecked` turns the 404 for a missing label into a failure (`src/scripts/remote-tracker-core.mjs:2279-2285`).
  - The decision is made in the fragment, so the helper's error contract stays unchanged.
- **Split out the receipt contract.** This is the user's decision.
  - Today the "Pull-request lifecycle receipt" section (`src/shared/issue-lifecycle.md:35-78`) shares a fragment with the mandatory started transition (`:12-34`), the interrupted-delivery recovery and the existing-PR body-merge rule.
  - The format, validation and helper rules move into a new fragment, `src/shared/issue-lifecycle-receipt.md`. `issue-lifecycle.md` includes the new fragment and keeps the started transition, the recovery, and its existing-PR merge path through `pr-update-body`. `plan-pr-continuation.md` and `scored-decisions.md` lazily include only the new fragment.
  - The receipt-only producers therefore never load rules that contradict them. Include guards apply, but context budgets apply only to tools, and no consumer includes the fragment eagerly (`build-lib.mjs:180-186`, `:5625-5634`).
- **Pass `Refs #<N>` with the receipt.** This is the user's decision. The continuation adds the issue reference `Refs #<N>` only when the delegation does not already carry it. A different `Refs #<M>` already in the delegation is a mismatch: the continuation skips the receipt and reports it.
- **Relationship `refs`, forge target only.** The item uses `relationship: "refs"`, consistent with the keyword. The target is `forge`, with `repository` the canonical repository slug. Plan publication and autopilot issue sources are forge-only (`src/shared/autopilot-issue-source.md` preconditions). An external-tracker, local or hidden-mode run writes no receipt and no added `Refs`.
- **Trusted issue sources, never PR prose.**
  - **Autopilot:** the issue comes from its ledger.
  - **Other continuations:** the issue comes from the archived plan's `**Issue:** #<N>` header, read by the rules of `parseIssueHeader` (`src/scripts/plan-publication-core.mjs:662-676`): header block only, and a malformed or repeated line means the receipt is skipped. When the verified head branch matches `parsePlanBranch`'s shape `^(?:<prefix>/)?plan/issue-<M>$` (`plan-publication-core.mjs:782-801`), `M` must equal `N`. Any other branch name relies on the header alone.
  - PR body text is untrusted data (`docs/adr/input-trust-boundary.md`) and is never parsed for the issue. There is precedent for trusting the header: `agreeingIssue` (`plan-publication-core.mjs:678-687`).
  - A plan without a valid `**Issue:**` header gets neither a receipt nor an added `Refs`.
- **Exact helper call.** Build the receipt with `issue-lifecycle-receipt-build` and no `body`, and use `data.marker` as the machine line. Input: `cwd` `RUNTIME_STATE_ROOT`; `receipt` = `{target: "forge", repository: "<owner/repo>", externalTool: null, items: [{issue: "#<N>", relationship: "refs", container: null, containerMechanism: null}]}`; `context` = `{expectedTarget: "forge", expectedRepository: "<owner/repo>"}`.
  - The receipt sits under `receipt`, because a flat object with `cwd` fails `exactObjectKeys`.
  - The issue is a string reference.
  - `context` is what makes the helper check the repository binding (`src/scripts/remote-tracker-core.mjs:393`, `:418`, `:505-509`; `test/remote-tracker.test.mjs:11651-11663`).
- **No `pr.md` change.** `pr` already accepts the receipt as a machine line (`src/tools/pr.md:118`). Its step 9 strips `<!-- effective-flow-` markers from the draft and then appends supplied machine lines and missing supplied references on the finish (`src/shared/pr-automation-lines.md:21-23`, `src/tools/pr.md:285-288`). Autopilot's `appendix-merge` keeps every line outside its own block (`src/scripts/autopilot-core.mjs:1576-1605`).
- **Recovery stays legacy, and the docs say so.** This is the user's decision. If the finish fails, the recovery is a direct `pr` run on the branch (`src/shared/plan-pr-continuation.md:281-283`, `src/tools/pr.md:280-282`). That run carries no receipt, and the PR stays legacy. Troubleshooting documents that its issue is closed by hand.

## Affected files

| File                                                                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/issue-lifecycle-receipt.md` (new)                              | The receipt contract moved out of `issue-lifecycle.md`: format, binding and validation rules, untrusted-data handling, and the helper operations. The new-PR and existing-PR write paths stay out. It names the four producers: apply-issues, remote apply-review, autopilot, and plan-PR continuation.                                                                                                                                                                                                                    |
| `src/shared/issue-lifecycle.md`                                            | Replace the moved text with an include of `issue-lifecycle-receipt`. Keep the started transition, the recovery, and the new-PR and existing-PR write paths. Widen the scope sentence (lines 3-4) only to point at the receipt-only producers.                                                                                                                                                                                                                                                                              |
| `src/shared/plan-pr-continuation.md`                                       | In the finish handoff (around lines 270-283), whenever `Finalize plan draft:` is added and the delegation carries no receipt: read and cross-check `**Issue:**`, build the receipt, and add it as a machine line, plus `Refs #<N>` when the delegation does not carry it. Otherwise skip and report why. Add a `lazy-include` of `issue-lifecycle-receipt` with `when:` "a finish request to `pr` is about to be built without a supplied lifecycle receipt". Extend the "Report" section with one receipt outcome.        |
| `src/shared/scored-decisions.md`                                           | In "Before `pr`" (around lines 160-166), for an issue source: read the ledger through `run-check`, build the receipt from `source.issue` and `source.repository`, and pass it as a machine line beside `Refs #<N>`. A helper error skips the receipt, is recorded, and never blocks the run. Add the same `lazy-include`, with `when:` "an issue-sourced Automation run is about to hand its delivery to `pr`".                                                                                                            |
| `src/shared/merge-gate-issue-observation.md`                               | Step 5 (around lines 320-324) removes `effective-flow-issue-in-progress` only when the issue's most recent fresh read lists it. That read is step 4's re-read when the issue was transitioned, and otherwise step 2's `issue-state-wait` result, which carries `labels` (`:80-82`, `remote-tracker-core.mjs:4437`). Otherwise the removal is skipped without a failure.                                                                                                                                                    |
| `test/workflow-contracts.test.mjs`                                         | Move the receipt assertions (around `:12220`, `:12240`) to the new fragment, and update the include-set assertion at `:12178`. Add source-text assertions for: the continuation's and autopilot's receipt steps and skip cases, the "only when no receipt is supplied" rule, the header and branch cross-check, the `Refs` dedupe and mismatch rule, the "no started transition" rule, `pr` step 9 appending supplied machine lines and missing references on the plan-draft finish, and step 5's label-present condition. |
| `test/remote-tracker.test.mjs`                                             | Near `:11665`: a `refs` forge build under `receipt` with `context` and no `body` returns exactly one canonical receipt line in `data.marker`, which `issue-lifecycle-receipt-parse` accepts for the same repository and rejects for another.                                                                                                                                                                                                                                                                               |
| `test/autopilot-core.test.mjs` / `test/scored-decisions-contract.test.mjs` | Assert that `mergeAppendix` leaves a receipt line intact, that the "Before `pr`" contract passes the receipt for issue sources only, and that autopilot never uses a closing keyword.                                                                                                                                                                                                                                                                                                                                      |
| `evals/merge-gate/` (optional)                                             | Optionally record one `merge-gate` eval round for a continuation PR with a `refs` receipt and no in-progress label, checking the call log for no `issue-label-remove`. New scenarios stay skipped until they are recorded (`test/merge-gate-eval.test.mjs:1233-1239`).                                                                                                                                                                                                                                                     |
| `docs/user-guide/tools-automation.md`                                      | Near lines 62-76 and 152: autopilot PRs keep `Refs #<N>` and now carry a lifecycle receipt. Merge-gate offers to close the issue after merge when every acceptance criterion is covered.                                                                                                                                                                                                                                                                                                                                   |
| `docs/user-guide/remote-tracker.md`                                        | Near lines 998-1010: list autopilot and plan-PR continuations among the receipt producers, with relationship `refs`, no started label and no PR-link comment.                                                                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/tools-deliver.md`                                         | Near lines 554-575: merge-gate observation also applies to autopilot PRs and continued plan PRs, under the coverage condition.                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/troubleshooting.md`                                       | Near lines 135-153: PRs created before this change, and PRs recovered by a direct `pr` run after a failed finish, stay legacy, and closing their issue by hand is the recovery.                                                                                                                                                                                                                                                                                                                                            |

## Implementation details

### Approach

1. Create `src/shared/issue-lifecycle-receipt.md` from the receipt contract in `issue-lifecycle.md` (format, binding, validation, untrusted data, helper operations). Replace that text in `issue-lifecycle.md` with an include, and keep its write paths, started transition and recovery there. Run the build so the include guards confirm the new edges.
2. Autopilot: in `scored-decisions.md` "Before `pr`", for an issue source, read `source` with `autopilot.mjs run-check`, build the receipt with the exact helper call above, and add `data.marker` as a machine line beside the existing `Refs #<N>`.
3. Continuation: in `plan-pr-continuation.md`, at the point where `Finalize plan draft:` is added, do the following only when the delegation carries no receipt line.
   - Read `**Issue:**` from `A` by the `parseIssueHeader` rules and apply the branch cross-check.
   - Build the receipt, add it as a machine line, and add `Refs #<N>` unless it is already present.
   - Skip and report: a missing or malformed header, a branch mismatch, a different `Refs #<M>` in the delegation, an external or local target, hidden mode, and a helper error.
4. Merge-gate observation: change step 5 to remove the label only when the most recent fresh read lists it.
5. Update the docs and add the tests listed above, then run the full checks, including the eval freshness status.

### Component structure

Not relevant: this is a contract and documentation change with no UI.

### State management

The pull request body is the only state. No ledger field, memory or tracker label is added.

### API integration

Only existing helper operations are used: `issue-lifecycle-receipt-build`, `autopilot.mjs run-check`, and `pr-update-body` through `pr`'s finish. There are no new provider calls.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Autopilot on the plan-on-base path:** autopilot builds the receipt, there is no continuation, and the PR carries exactly one receipt.
- **Autopilot on the plan-PR path:** autopilot supplies the receipt. The continuation sees it and adds none.
- **Non-autopilot plan without a valid `**Issue:**` header, or a branch mismatch:** no receipt and no added `Refs`. The report says why, and the PR stays legacy.
- **Delegation already carries a different `Refs #<M>`:** the continuation skips the receipt and reports the mismatch.
- **Archival collision or failed probe:** there is no `Finalize plan draft:`, so there is no finish. Autopilot's own receipt still reaches `pr`.
- **Failed finish and recovery by a direct `pr` run:** the body is rebuilt without a receipt, and the PR stays legacy. This is documented.
- **Issue acceptance criteria not fully covered in the merged PR:** merge-gate reports `incomplete` or `undetermined` and offers no close. This is existing behavior.
- **Issue already terminal before merge:** observation step 2 reports it as done or cancelled, and step 5 decides from step 2's labels.
- **In-progress label absent at step 5:** the removal is skipped, and no failure is reported.
- **Non-interactive merge-gate run:** the verdict is reported and the issue is never closed. This is existing behavior.
- **PRs created before this change:** they stay legacy. There is no backfill.

## Acceptance criteria

- [ ] `src/shared/issue-lifecycle-receipt.md` exists and holds the receipt contract. `issue-lifecycle.md` includes it and keeps its started transition, recovery and write paths. `plan-pr-continuation.md` and `scored-decisions.md` lazily include only the new fragment, and `node build.mjs` passes its include guards.
- [ ] Autopilot's "Before `pr`" passes a `refs` forge receipt built from the ledger for every issue source and none for a plan source. The continuation passes one, plus `Refs #<N>` when it is absent, only when no receipt is supplied, and skips and reports every skip case. Source-text assertions in `test/workflow-contracts.test.mjs` and `test/scored-decisions-contract.test.mjs` pin this.
- [ ] `test/remote-tracker.test.mjs` proves the exact helper call returns one canonical receipt line that parses for the same repository and is rejected for another.
- [ ] Contract assertions in `test/workflow-contracts.test.mjs` pin that `pr` step 9 strips `<!-- effective-flow-` markers and then appends supplied machine lines and missing supplied references on the plan-draft finish. `test/autopilot-core.test.mjs` pins that `mergeAppendix` keeps a receipt line. No closing keyword is introduced anywhere.
- [ ] Merge-gate observation step 5 removes the in-progress label only when the most recent fresh read lists it. A source-text assertion in `test/workflow-contracts.test.mjs` pins this.
- [ ] The user guide (automation, remote tracker, deliver, troubleshooting) describes the receipt for autopilot and continuations, the coverage condition for the offer, and the legacy recovery case.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.

## Validation plan

- Run the targeted `node --test` suites for `test/workflow-contracts.test.mjs`, `test/remote-tracker.test.mjs`, `test/autopilot-core.test.mjs`, `test/scored-decisions-contract.test.mjs` and `test/plan-publication.test.mjs`.
- Run the full checks: `pnpm agent:check`, `pnpm test`, `node build.mjs` (include guards), and `pnpm test:distribution`.
- Check the merge-gate eval freshness status in `test/merge-gate-eval.test.mjs`. Editing `merge-gate-issue-observation.md` may mark archived rounds stale. Report that status, and record a new round only if it is required.
- Manual check after release: the next issue-sourced autopilot PR shows exactly one `effective-flow-issue-lifecycle:v1` line with `relationship: "refs"` and one `Refs #<N>`. After merge, a gated `effective-flow merge-gate <PR>` enters issue observation instead of the legacy ending. It offers the close only when the issue's acceptance criteria are covered, and otherwise reports the verdict.

## Assumptions and open points

- Assumption: the ledger's `source.repository` equals the canonical repository slug that the receipt binding expects. Implementation confirms this against `repository-resolve`.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         4 |    2 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    1 |

### Findings

Internal plan review:

- **Error cases, Important, incorporated:** observation step 5 would fail on an absent in-progress label, because the GitHub `DELETE` returns 404 and that is not tolerated. Step 5 now skips the removal when the label is absent.
- **Error cases / Scope, Important, incorporated (user decision):** non-autopilot continuations lose `Refs #<N>` on the finish. The continuation now adds `Refs #<N>` with the receipt.
- **Error cases, Important, incorporated (user decision):** a direct `pr` recovery after a failed finish carries no receipt. It stays legacy, and troubleshooting documents this.
- **Testability / Scope, Important, incorporated (user decision):** the close offer needs every acceptance criterion of the issue to be covered in the merged PR. The condition is stated in the outcome, the edge cases, the docs and the validation plan.
- **Error cases / Testability, Note, incorporated:** the receipt is built without `body`. The edge case and test now cover the receipt-line-only build.
- **Security, Note, incorporated:** the issue number is cross-checked, and the receipt is skipped on a mismatch.
- **Maintainability, Note, incorporated:** the include mechanism is named.
- **Scope, Note, incorporated:** `pr.md` already keeps machine lines on the finish. That is pinned by a test, with no change to `pr.md`.

Deep interactive review (2026-11-20):

- **Architecture, Important, incorporated (user decision):** autopilot's plan-on-base path has no plan-PR finish. Autopilot now builds the receipt from its ledger for every issue source, and the continuation adds one only when none is supplied.
- **Error cases, Important, incorporated:** the helper call shape was wrong (flat input, numeric issue, no `context`). It now uses the exact `receipt` and `context` input and `data.marker`.
- **Security, Important, incorporated:** the branch cross-check used `plan/issue-<N>` without the prefix. It now uses `parsePlanBranch`'s shape and the `parseIssueHeader` rules.
- **Maintainability, Important, incorporated (user decision):** lazy-including all of `issue-lifecycle.md` would load the started transition and other rules that contradict receipt-only. The receipt contract is split into `issue-lifecycle-receipt.md`.
- **Testability, Important, incorporated:** there is no `test/pr-*` file, and merge-gate evals replay recorded rounds only. The criteria now use source-text contract assertions, an optional recorded eval round, and an eval freshness check.
- **Error cases, Note, incorporated:** step 5's "fresh read" is defined, the alternative helper change was dropped, and the `Refs` dedupe and mismatch rule is explicit.

## Open points

- No open points.
