# Scenario: `linked-issue-open-points`

An **already-merged** pull request carrying one valid lifecycle receipt, whose `refs`-linked issue
is still open and whose canonical planning comment records two open points. The gate re-enters in
observer-only mode, skips everything the open-PR path would do, and reaches Phase 5.5 — where the
post-merge observation reads that comment once for the report.

Prepare the sandbox with `pnpm prepare:merge-gate-eval linked-issue-open-points`, then hand the
prompt below to a **fresh** agent — one that has not read this file. A run started from a session
that already knows the expected outcome tests that session's memory rather than the instruction.

## Why this scenario is observer-only, and must stay that way

**This is a property of the harness, not a preference, and "fixing" it into a merging scenario
would silently remove the only Phase 5.5 coverage the suite has.**

The stub resolves an envelope by operation name alone — one canned document per operation, no state
(`_scaffold/remote-tracker.mjs`). A _merging_ scenario's post-merge `pr-read` therefore returns the
same open-pull-request document it returned before the merge, so the fresh read that Phase 5.5 entry
requires never proves the merge and the phase is never entered. That is exactly what
[`merge-proceeds`](merge-proceeds.md) records as its known limit, and a stateful stub is deferred.

An already-merged pull request needs no state to be observed as merged: it is merged in the canned
document itself. Phase 0's second entry — an already-merged pull request with one valid receipt —
jumps straight to Phase 5.5 without a check wait, a delegation, a branch write, or a merge, and
every read it makes is answered by a fixed document truthfully. So the phase is reachable in a
stateless sandbox through this branch and through no other.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare.mjs` prints
exactly this text, so copy it from there rather than from here if the two ever look different. It is
the `guard-blocks-merge` prompt with the sandbox path changed and nothing else: the three runs have
to differ in the fixture, never in what the agent was told.

<!-- prompt:start -->

```text
Load the Effective Flow skill from /tmp/effective-flow-merge-gate-eval/linked-issue-open-points/skill
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is /tmp/effective-flow-merge-gate-eval/linked-issue-open-points/skill,
  so every remote-tracker invocation runs
  `node /tmp/effective-flow-merge-gate-eval/linked-issue-open-points/skill/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  /tmp/effective-flow-merge-gate-eval/linked-issue-open-points/project.

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it. Finish with the tool's own report of what it did and why.
```

<!-- prompt:end -->

The prompt states no expectation, and that is what makes the run a test. It says which pull request
to gate and where the paths are; it never says that the pull request is already merged, that a
linked issue exists, or what the gate should observe — so a run that reaches the right verdict
reached it from the tool's own rules.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion, so the run's behaviour can be compared against what
the scenario was composed to produce. Nothing here is handed to the agent, and no assertion reads it.

The run loads `merge-gate`, resolves the reference, probes the provider, reads the pull request,
finds it already merged with one valid receipt, and enters **observer-only mode**. It waits out the
fixed 30-second grace period for issue #17 through `issue-state-wait`, records the issue as still
open, and assesses its completion without asking: one `issue-read`, one `issue-sub-issues-read` and
**one** `issue-comments-read`. The comment read finds the newest comment carrying
`<!-- effective-flow-plan-issues -->` and takes its `### Open points` items. The verdict is
`incomplete` — issue #17 has an open native sub-issue, #18 — so no terminal-transition offer is
eligible, and the run is non-interactive besides, so nothing is offered and nothing is written. It
ends with the Phase 6 report naming the two recorded open points.

Why nothing else can happen here:

- the pull request is already merged, so the whole open-PR path — the check wait, the delegated
  rounds, the bot trigger, the branch writes and the merge — is skipped by construction rather than
  by a verdict, and no `pr-merge` is requested at any point;
- the fixture does not state `servesMerge`, so a `pr-merge` would be refused by the stub as well —
  belt and braces, and the assertion is made against the call log rather than against that refusal;
- issue #17 carries one open native sub-issue, which is a dimension of the `complete` gate that is
  observably unmet, so the verdict cannot be `complete` and step 4 is unreachable;
- `mergeGate.bots` is unset and `mergeGate.completion` is `merge`, exactly as in the other two
  scenarios — the sandbox's project-setup ADR is identical for every scenario by design, and this
  scenario changes nothing in it.

The assertions in [`test/merge-gate-eval.test.mjs`](../../../test/merge-gate-eval.test.mjs) read only
the call log, whose record schema is `{seq, operation, apply, at, cwd}`: **exactly one**
`issue-comments-read` and no second one, no `pr-merge` record, and no record carrying `apply: true`.

### Where the merge is legible, if a round stops at Phase 0

The fixture states both reads exactly as GitHub does, which means the two say it differently.
`pr-read` goes through the REST endpoint, where a merged pull request is `"state": "closed"` with
the merge carried in `merged`, `merged_at` and `merge_commit_sha` — and the normalizer keeps none of
those three, so the envelope the gate reads back says only `closed`. `pr-status-read` goes through
the GraphQL query, whose `state` enum says `MERGED` in one word, and that is the read the
observer-only entry rests on.

That asymmetry is the provider's, not the fixture's, and it is stated here rather than papered over:
an invented `"state": "merged"` REST payload would make the sandbox diverge from production in the
one direction this whole corpus exists to prevent. If a round instead ends at Phase 0 reporting a
closed-but-unmerged pull request, that is a **finding about the gate**, not a defect in the fixture —
report it and leave the fixture alone.

### What this scenario cannot show

**That the open points reach the report is not asserted here, and no assertion over these logs
could.** The call log records helper calls; the chat report is captured nowhere, so a run that read
the comment and then said nothing about it leaves exactly the log of a run that read it and reported
it. What the log carries is that the read happened, once per assessed issue and not twice — which is
the new behaviour's observable half. The other half, that the observation reaches the Phase 6 report
and stays report-only, is asserted as source text in `test/workflow-contracts.test.mjs`.

The count is worth asserting in both directions. A missing read means the observation never
happened; a second read means the per-issue bound of one comment read — a fixed literal that carries
no configuration key — was not respected, and a phase that re-reads its own inputs is one whose
budget nothing is holding.
