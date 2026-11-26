# Link pull requests delivered through a delegated pr run on T3 Code

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #771

## Requirement

On T3 Code, a pull request that `apply-issues` delivers is not linked to the T3 thread. The
delivery runs through `effective-flow pr` without host context, and `src/shared/host-pr-watch.md`
("Linking") states that "a `pr` run inside a sub-agent without T3 running-environment context
links nothing". The pull request stays unlinked unless someone links it by hand. The tracker mode
of `apply-review` (`src/tools/apply-review-remote.md`, Phase 4 remote) delivers the same way and
has the same gap.

Goal: when the `apply-issues` or `apply-review` tracker-mode orchestrator runs with T3
running-environment context, every pull request it creates, reuses or extends is linked to the
thread without a manual step. A link failure is reported in one line and never blocks the run. On
every other host the behaviour stays the same and no link is attempted.

Workflow recommendation: **Bugfix**. The shipped behaviour of an existing workflow is wrong on one
host (a documented link occasion is missed), and the fix restores the intended behaviour without
adding a new capability. The changes are product source under `src/` plus their contract tests.

## Outcome checkpoint

**Primary source:** Issue #771 in `github.com/sebastian-software/effective-flow`. Targets are
`src/tools/apply-issues.md`, `src/tools/apply-review-remote.md`, `src/shared/host-pr-watch.md` and
`test/workflow-contracts.test.mjs`.
**Original outcome:** On T3 Code, every pull request that `apply-issues` creates or reuses is
linked without a manual step, and so is every pull request of `apply-review`'s tracker mode. This
holds when the orchestrator runs with T3 running-environment context, directly or through a
same-session `apply`. A link failure is reported in one line and never blocks. Other hosts are
unchanged and attempt no link. `host-pr-watch.md` "Linking" names the mechanism for delegated `pr`
runs, and a test protects the wording.
**Last evaluated attempt:** none (fresh baseline).
**No-progress count:** 0
**Cumulative approach:** Caller-side linking. The two orchestrators link each delivered pull
request themselves through `host-pr-watch`. `pr` stays unchanged.
**Continuation decision:** none.

## Architecture decisions

- **The caller links each pull request after delivery** (scored decision S-CLR, see "Decided by
  score"). With T3 running-environment context, the `apply-issues` orchestrator and the
  `apply-review` tracker-mode orchestrator each link the pull request of every delivered work item
  themselves. They do this right after the delivery returns, with one `link_pull_request` call per
  pull request. This is the existing `merge-gate` pattern ("the caller, once per gate run").
  `pr.md`, its input lines and its no-link rule stay unchanged. Rationale: one mechanism covers all
  three delivery results (`created`, `reused`, and a pushed target PR that never calls `pr`).
  Passing `Host: t3-code` to `pr` would add a validated input to `pr.md` and widen the pinned "one
  exception" of the host dispatch table. The target-PR path would still need its own caller-side
  link.
- **The procedure stays in `host-pr-watch.md`.** The orchestrators reach the fragment only through
  a `lazy-include` pointer whose `when:` clause names the running environment identifying T3 Code.
  Their own text names no `watch_pull_request`, `link_pull_request` or `unwatch_pull_request`
  tool. The fragment owns the link contract and the callers only point to it. This follows the
  fragment's own ownership sentence and the existing contract test "appear only in
  host-pr-watch".
- **Host identity comes from the orchestrator's own running-environment context**, under the
  existing rule in `host-pr-watch.md` lines 15–17. The plan adds no new host signal: no `Host:`
  line, no tool-visibility check and no shell check. An orchestrator without T3
  running-environment context links nothing (scored decision S-BAT, "Narrow the criterion, verify
  same-session apply"). The implementer verifies and cites how `apply` starts `apply-issues` and
  `apply-review`: `src/tools/apply.md` lines 141–145 and the adapter sentence at line 169. The
  caller bullet in `host-pr-watch.md` names the limit in one clause.
- **No double link.** The caller decides from how it started `pr` (in this session or not), never
  from the `pr` report, because `pr` step 12 reports no "linked" field. A `pr` run in this session
  in a T3 context links under its own bullet, so the caller makes no second call for it. The caller
  links when its `pr` run did not execute in this session, and on the target-PR path, which makes
  no `pr` call at all.
- **This change touches only `apply-issues` and `apply-review` tracker mode** (scored decision
  S-BAT, "Verify only, follow-up for new gaps"). Other callers that deliver through `pr` are only
  verified. Each audited caller is recorded with file:line and invocation mode in the pull-request
  description. A further gap becomes a follow-up issue and is not part of this change.

## Affected files

| File | Description |
|---|---|
| `src/shared/host-pr-watch.md` | Add `apply-issues` and `apply-review` (tracker mode) to the "Loaded by" opening sentence. Add one "Linking" bullet for these two callers (occasion, URL source, no double link, limit without T3 context, one-line failure report). Extend the `pr` bullet's last sentence so it names caller-side linking as the mechanism for a delegated `pr` run. Keep the bullet's opening `` `{{SKILL:pr}}`: right after step 10 `` unchanged. |
| `src/tools/apply-issues.md` | In Phase 4, add one link step with one `lazy-include` pointer to `host-pr-watch` between "Sufficient issues" step 3 and step 4. Step 3 performs the push for both the `pr` path and the target-PR path, so this one placement covers both. In Phase 5, name the one-line link-failure report. Raise `contextBudget` only if the build report requires it. |
| `src/tools/apply-review-remote.md` | In Phase 4 remote, add the same link step and lazy pointer after step 4's `pr` result or after the target-PR push, before step 5. In Phase 7/8 remote, name the one-line link-failure report in the summary. Raise `contextBudget` only if the build report requires it. |
| `test/workflow-contracts.test.mjs` | Update and extend the "Issue #635" `host-pr-watch` block (around lines 27469–27700) as described under "Validation plan". |
| `test/model-tiers-contract.test.mjs` | Conditional. Add one `SPAWN_MENTION_ALLOWLIST` entry per new block only if the spawn-candidate test flags it (see Approach step 6). |

## Implementation details

### Approach

1. **`host-pr-watch.md`, opening sentence.** Name the two new loaders: `apply-issues`, and
   `apply-review` in its tracker mode (the internal sub-file `apply-review-remote`). Use the same
   `{{SKILL:…}}` / path style as the existing names. Keep the sentence that the fragment owns the
   procedure and that callers only point to it.
2. **`host-pr-watch.md`, "### Linking".** Add one bullet for the delegating callers, after the
   `merge-gate` bullet. It states:
   - On T3 Code, the orchestrator links each pull request a work item delivered: a `pr` result of
     `created` (a `mutationMayHaveSucceeded` match included), a `pr` result of `reused`, or a
     target PR the item pushed new commits to.
   - Timing: right after that result or push, before the item's PR-link comment.
   - The URL is the pull-request URL `pr` returned. For a target PR, it is the `url` from the
     helper's `pr-read` of that pull request after the push, never URL text taken from the issue.
     The caller links it only when that read returns `state` open and `sameRepository === true`.
     Otherwise it makes no link call and reports one summary line.
   - One call per distinct pull request per run.
   - No call for a `pr` run that executed in this session. The caller decides this from how it
     started `pr`.
   - An orchestrator without T3 running-environment context links nothing.
   - A link failure is reported as one line in the run's summary.

   Extend the `pr` bullet's last sentence so it names this as the mechanism for a delegated `pr`
   run, for example "…links nothing; its delegating caller links per the bullet below". Keep the
   bullet's opening anchor unchanged. State nothing about failed deliveries here: they deliver no
   pull request, so the occasion does not arise.
3. **`apply-issues.md`, Phase 4.** Add exactly one step and one pointer, between "Sufficient
   issues" step 3 and step 4 ("Immediately after a successful push or PR creation"). Step 3
   already pushes in both cases: it delivers through `{{SKILL:pr}}` without a target PR, and
   pushes to the existing PR with one. This one placement therefore covers the `created`,
   `reused` and target-PR push results. Add nothing to the earlier "new commit on existing PR"
   list (lines 332–342). The step is one sentence: on T3 Code, link the pull request per
   `host-pr-watch`. Next to it goes the `lazy-include` pointer. Its `when:` clause names both the
   running environment identifying T3 Code and a work item's pull request that was created,
   reused or pushed. Do not name any T3 tool in this file.
4. **`apply-issues.md`, Phase 5.** Add the one-line link-failure report to the report list, at
   most one line per failed link, worded so it is clearly not a run failure.
5. **`apply-review-remote.md`.** In Phase 4 remote, make the same addition at the same decision
   point: after step 4's `pr` result or after the target-PR push, before step 5's optional PR-link
   comment. In Phase 7/8 remote, add the one-line link-failure report to the summary.
6. **Wording for the spawn-mention guard.** `test/model-tiers-contract.test.mjs` (lines 36–40 and
   697–737) treats every block that contains `sub-agent`, `subagent` or `fan-out` as a spawn
   instruction. Such a block needs a spawn-site marker or an allowlist entry. Word the new blocks
   without those words, for example "a `pr` run that did not execute in this session". If a block
   cannot avoid them, add one `SPAWN_MENTION_ALLOWLIST` entry for it with an "instructs no spawn"
   reason. The existing entry anchored on `` `{{SKILL:pr}}`: right after step 10 `` (lines 618–622)
   must keep matching a spawn candidate, because the guard also fails on a stale entry (lines
   730–734). So the extended `pr` bullet either keeps the words "inside a sub-agent", or that
   allowlist entry is removed in the same change.
7. **Context budgets.** Run `node build.mjs` and read the `Always-loaded core (lines/budget)`
   report for `apply-issues` and `apply-review-remote`. Raise a `contextBudget` only when the new
   built count exceeds it, to the new count plus at most ten lines of headroom, as AGENTS.md
   requires.
8. **Tests.** Make the test changes listed under "Validation plan". Every new or changed test
   names the invariant it protects in an `// Invariant:` comment and in its title.
9. **Verification of other callers (no edits).** The audit list is every `src/` source that
   matches `grep -rln "{{SKILL:pr}}" src/`, except `host-pr-watch.md`, `next-steps.md` and the two
   target files. For each listed source that delivers through `pr`, record file:line and
   invocation mode (same session or not) in the pull-request description. Today's matches include
   `worktree-integration.md`, `deliver.md`, `deliver-committed-range.md`, `plan-publication.md`,
   `plan-pr-continuation.md`, `autopilot.md`, `autopilot-blockers.md` and
   `autopilot-delivery-conflict.md`. A source that only mentions `pr` without delivering through
   it is recorded as such. Also record how `apply` starts `apply-issues` and `apply-review` (`src/tools/apply.md`
   141–145, 169). A caller with the same gap is named as a follow-up issue candidate and gets no
   edit in this change.

### Edge cases

- **Non-T3 host:** the lazy pointer never loads, and no link call or link message appears. The
  orchestrator's path is unchanged.
- **Orchestrator without T3 running-environment context** (for example a cross-agent adapter from
  `apply`): it links nothing. This matches the existing `pr` rule, since host identity never comes
  from tool visibility. The caller bullet names this limit.
- **`pr` run in this session in a T3 context:** `pr` links under its own bullet, and the caller
  makes no second call.
- **Parallel work items:** each item links its own pull request. Items that share one target PR
  run in sequence, and only the first successful one links it.
- **`pr` reports `mutationMayHaveSucceeded` with a recovered match:** link the recovered pull
  request URL that `pr` returned.
- **Target PR named in untrusted issue text:** link the `url` that `pr-read` returns for the
  pushed pull request, never the issue's URL text.
- **Target PR closed, merged or not of this repository:** the post-push `pr-read` does not return
  `state` open with `sameRepository === true`, so there is no link call and one summary line.
- **Delivery failed** (rejected push, failed creation, failed delegation): there is no pull
  request to link, so no link is attempted, and the item's existing failure handling applies.
- **Tool not loadable or call rejected:** one summary line. The call is not retried and no other
  transport is tried. The run continues, and the item's result is unaffected.

## Acceptance criteria

- [ ] `src/shared/host-pr-watch.md` "### Linking" contains a bullet for the delegating callers
      `apply-issues` and `apply-review` tracker mode. The bullet names:
      - caller-side linking after a `created`, `reused` or pushed target pull request;
      - the URL `pr` returned, or for a target PR the `pr-read` `url`, linked only when that read
        is open and same-repository;
      - one call per distinct pull request;
      - no call after a `pr` run in this session;
      - no link without T3 running-environment context;
      - a one-line failure report that never blocks.

      The `pr` bullet's last sentence points to that caller-side linking, and its opening
      `` `{{SKILL:pr}}`: right after step 10 `` is unchanged.
- [ ] `src/tools/apply-issues.md` Phase 4 has exactly one link step "per `host-pr-watch`" and
      exactly one `host-pr-watch` pointer. Both sit after "Sufficient issues" step 3 and before
      step 4's "Immediately after a successful push or PR creation". The pointer's `when:` clause
      names T3 Code and a created, reused or pushed pull request. Phase 5 names the one-line
      link-failure report.
- [ ] `src/tools/apply-review-remote.md` Phase 4 remote has the same link step and lazy pointer
      before step 5. Phase 7/8 remote names the one-line link-failure report.
- [ ] None of `watch_pull_request`, `link_pull_request` or `unwatch_pull_request` appears in
      `apply-issues.md` or `apply-review-remote.md`.
- [ ] `includeHostsOf('host-pr-watch')` returns `eager: []` and exactly these lazy hosts:
      `tools/apply-issues.md`, `tools/apply-review-remote.md`, `tools/capture.md`,
      `tools/iterate.md`, `tools/merge-gate.md` and `tools/pr.md`.
- [ ] `src/tools/pr.md` is byte-for-byte unchanged, and so are the dispatch table and the "one
      exception" sentence of `host-pr-watch.md` (lines 8–17).
- [ ] The pull-request description lists every audited caller from Approach step 9 with file:line
      and invocation mode, plus any follow-up issue candidate.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (no context-budget
      overrun) and `pnpm test:distribution`.

## Validation plan

- `test/workflow-contracts.test.mjs`, "Issue #635" block:
  - In "host-pr-watch is lazy in merge-gate, iterate and pr and eager nowhere", add
    `src/tools/apply-issues.md` and `src/tools/apply-review-remote.md` to the lazy-pointer loop,
    and update the title and invariant comment.
  - In "host-pr-watch pointers keep decision-scoped loading, …", pin the two new pointers. Their
    trigger requires both halves, for example
    `/(?=[\s\S]*T3 Code)(?=[\s\S]*(?:created|reused|push))/`, in the same style as the `iterate`
    pin. Extend the exact `includeHostsOf('host-pr-watch')` expectation to the six hosts. Update the
    invariant comment: "Exactly these four tools" becomes six.
  - In "… appear only in host-pr-watch, not in the merge-gate, iterate or pr sources", add the two
    files to the list and update the title.
  - Add a new test with the invariant "a delegated `pr` run is linked by its caller". It asserts
    that:
    - the "### Linking" section names the caller-side bullet for both orchestrators, with the
      one-call-per-pull-request rule, the open and same-repository `pr-read` condition for a
      target PR, the no-call-after-a-same-session-`pr` rule, the limit without T3 context and the
      one-line non-blocking failure;
    - the `pr` bullet points to that caller-side linking;
    - `apply-issues.md` places its "per `host-pr-watch`" link sentence after the step 3 `pr`
      delivery and before step 4's "Immediately after a successful push or PR creation";
    - `apply-review-remote.md` places its link sentence before Phase 4 remote step 5;
    - `apply-issues.md` Phase 5 and `apply-review-remote.md` Phase 7/8 remote each name the
      one-line link-failure report.
- `test/model-tiers-contract.test.mjs`: confirm the spawn-candidate test passes, and that the
  anchor `` `{{SKILL:pr}}`: right after step 10 `` still matches. Edit the allowlist only if the
  test flags a new block (Approach step 6).
- Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Behavioural-eval evidence: editing `host-pr-watch.md` creates freshness debt for the
  `merge-gate`, `iterate` and `build-context` suites. Editing `apply-issues.md` and
  `apply-review-remote.md` creates it for `build-context`. Run the read-only checks
  `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and `pnpm eval build-context verify`,
  and name the debt in the pull-request description.
- Scope of the checks: the contract tests cover the wording, placement and pointer gating. The
  behaviour ("linked without a manual step", "no link attempt on other hosts") is checked only by
  an optional manual run on T3 Code, set up per `docs/developer-guide/t3-acceptance-runs.md`. Run
  `apply-issues` on one small issue that names a target PR, because that path certainly uses the
  caller-side link. Confirm the pull request is linked to the thread, and confirm a run on another
  host makes no link attempt. The pull-request description states whether this run happened and,
  for each linked pull request, whether `pr` ran in this session.

## Assumptions and open points

- Verified context:
  - `host-pr-watch.md` lines 8–17 (host dispatch, identity rule) and 34–46 ("Linking").
  - `apply-issues.md` Phase 4 (target-PR path, steps 2–4) and Phase 5 (lines 435–447).
  - `apply-review-remote.md` Phase 4 remote steps 3–5 and Phase 7/8 remote (lines 209–212).
  - `merge-gate.md` lines 176–178 (the caller links once per gate run).
  - `pr.md` line 254 (pointer gated on T3 Code); `pr.md` accepts no `Host:` input line.
  - `apply.md` lines 141–145 and 169 (how `apply` starts its target skills).
  - The pinning tests in `test/workflow-contracts.test.mjs` (around 27469–27700) and
    `test/model-tiers-contract.test.mjs` (lines 36–40, 615–632, 697–737).
- Assumption, checked in Approach step 9: `autopilot`, `deliver` and the `worktree-integration`
  handback reach `pr` in the session that holds the host context, so they have no gap of their
  own. The source text of some of them allows a cross-agent adapter. A caller found with the gap
  becomes a follow-up issue candidate under the S-BAT decision and is not changed here.
- Verified gap in the source: `apply-issues.md` step 3 (lines 367–376) does not say whether `pr`
  runs in this session or not. The issue states that it does not. That is why the caller decides
  at runtime from how it started `pr`, and why the manual check uses the target-PR path.
- Assumption: the exact sentence wording is the implementer's choice within the constraints above,
  as long as the acceptance criteria hold.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site":"S-CLR","question":"Which linking mechanism should apply-issues (and apply-review remote mode) use for pull requests delivered through a delegated pr run on T3 Code?","options":["Caller links after delivery","Pass Host: t3-code to pr","Decide later"],"escape":["Decide later"],"stop":[],"scores":[{"label":"Caller links after delivery","score":9,"reason":"One caller-side link per pull request covers created, reused and target-PR deliveries, follows the merge-gate caller-links pattern and leaves pr unchanged; its edge is one mechanism instead of two without widening the host-identity exception."},{"label":"Pass Host: t3-code to pr","score":4,"reason":"It adds a validated input to pr.md and widens the pinned one-exception wording, yet the target-PR path still needs a caller-side link, leaving two mechanisms."}]},{"site":"S-BAT","question":"How should the plan bound the audit of other workflows that deliver through pr?","options":["Verify only, follow-up for new gaps","Extend scope to all ambiguous callers","Keep step 8 with a listed criterion","Decide later"],"escape":["Decide later"],"stop":[],"scores":[{"label":"Verify only, follow-up for new gaps","score":9,"reason":"Limits the change to the two callers the plan found with the gap. Each audit claim gets a file:line and its mode, so the uncited audit is fixed. Its edge over option 3: any new gap goes to a follow-up issue, so the scope cannot grow mid-build."},{"label":"Extend scope to all ambiguous callers","score":3,"reason":"The audit says deliver, autopilot and the worktree handback run pr in the same session; adding linking text there is paid on every run without shown evidence of a gap and breaks the rule that deliver needs no pointer of its own."},{"label":"Keep step 8 with a listed criterion","score":5,"reason":"The criterion makes the audit checkable, but the scope stays open. About 50 grep hits with an unclear cross-agent or same-session clause could still lead to unplanned edits and tests during the build."}]},{"site":"S-BAT","question":"How should the plan handle an apply-issues or apply-review orchestrator that runs without T3 running-environment context of its own (for example a cross-agent adapter from apply)?","options":["Narrow the criterion, verify same-session apply","apply links one level up","Assumption plus follow-up issue","Decide later"],"escape":["Decide later"],"stop":[],"scores":[{"label":"Narrow the criterion, verify same-session apply","score":8,"reason":"apply.md:141-145 starts the skill directly, which points to a same-session run. Checking this and citing it shows the criterion holds in practice. The limit is named where it applies, so the plan claims only what it can deliver."},{"label":"apply links one level up","score":6,"reason":"It covers the cross-agent case, but apply must then know how its adapter ran, widening scope to a third caller with duplicate-link risk; if apply is nested the gap moves up a level. Not needed if same-session is confirmed."},{"label":"Assumption plus follow-up issue","score":4,"reason":"It leaves the gap the judgment found unchecked. An unverified assumption lets the plan claim the criterion without showing it is met, and the follow-up issue only moves the work elsewhere."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 1 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 2 | 1 |
| Testability | 0 | 3 | 4 |
| Scope | 0 | 1 | 1 |
| Maintainability | 0 | 1 | 1 |

### Findings

Internal review (Phase 6):

- Testability, Important. New blocks that mention a sub-agent would trip the spawn-mention guard
  in `test/model-tiers-contract.test.mjs`. Incorporated as Approach step 6, a conditional row in
  Affected files and a check in the Validation plan.
- Maintainability, Important. The claim that no eval suite loads these sources was wrong. Incorporated:
  the Validation plan names the freshness debt for `merge-gate`, `iterate` and `build-context`
  and adds their read-only `verify` checks.
- Scope, Important. The audit of other `pr` callers was uncited and left the scope open. Resolved
  by scored decision S-BAT ("Verify only, follow-up for new gaps"): Approach step 9 lists each
  caller to verify, and an acceptance criterion requires the audit in the pull-request
  description.
- Error cases, Important. An orchestrator started without T3 running-environment context could
  leave the outcome claimed but unmet. Resolved by scored decision S-BAT ("Narrow the criterion,
  verify same-session apply"): the outcome and acceptance criteria are narrowed, and the limit is
  named in the caller bullet.
- Testability, Important. The `apply-review` tracker-mode failure report and its summary
  location were missing. Incorporated: Phase 7/8 remote is named in Approach step 5, in the
  acceptance criteria and in the new test.
- Testability, Note. The pointer trigger and the placement of the link step were not measurable.
  Incorporated: a two-half trigger pin and ordering assertions.
- Security, Note. A target PR comes from untrusted issue text. Incorporated: the link uses the
  forge-normalized URL of the pushed pull request of this repository.
- Error cases, Note. The no-double-link rule depended on an unstated signal. Incorporated: the
  caller decides from how it started `pr`, never from the `pr` report.
- Maintainability, Note. A redundant failed-delivery sentence in the fragment was dropped. It is
  kept only as a plan edge case.
- Testability, Note. The main behaviour has no automated check. Incorporated: the Validation plan
  states the scope of the checks and requires the pull-request description to record the optional
  T3 run.

Deep review (`plan-review`):

- Testability, Important. A second link sentence or pointer in the "new commit on existing PR"
  list would precede step 3 and break the ordering test. Incorporated: one step and one pointer
  between "Sufficient issues" step 3 and step 4, which covers all three delivery results.
- Error cases, Important. The source and checks for the target-PR URL were not named.
  Incorporated: the URL comes from the post-push `pr-read`, and the link happens only when that
  read is open and same-repository; otherwise there is one summary line.
- Testability, Note. The `pr` invocation mode in `apply-issues` is not stated in the source, so a
  manual run might pass through `pr`'s own link. Incorporated: recorded under assumptions, and the
  manual check uses a target-PR issue.
- Testability, Note. Rewording the `pr` bullet could make its allowlist entry stale.
  Incorporated: Approach step 6 keeps "inside a sub-agent" or removes the entry.
- Scope, Note. The audit list missed `plan-pr-continuation.md`, `deliver-committed-range.md` and
  `autopilot-delivery-conflict.md`. Incorporated: the list is defined by the `{{SKILL:pr}}` grep.

## Open points

- No open points.
