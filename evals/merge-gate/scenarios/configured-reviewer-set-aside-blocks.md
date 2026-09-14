# Scenario: `configured-reviewer-set-aside-blocks`

The project explicitly configures `recensor` as an automatic reviewer. Its check is completed for
the verified head, and its fresh review surfaces carry one unresolved thread and one
changes-requested review-body finding. The sandbox replaces only this scenario's `iterate` tool with
the deterministic echo, so the run records the real Phase-3 handoff while leaving production
`iterate` outside the claim.

Prepare the sandbox with
`pnpm prepare:merge-gate-eval configured-reviewer-set-aside-blocks`, then hand the prompt below to a
**fresh** agent — one that has not read this file. A run started from a session that already knows
the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare.mjs` prints
exactly this text, so copy it from there rather than from here if the two ever look different.

<!-- prompt:start -->

```text
Load the Effective Flow skill from /tmp/effective-flow-merge-gate-eval/configured-reviewer-set-aside-blocks/skill
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is /tmp/effective-flow-merge-gate-eval/configured-reviewer-set-aside-blocks/skill,
  so every remote-tracker invocation runs
  `node /tmp/effective-flow-merge-gate-eval/configured-reviewer-set-aside-blocks/skill/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  /tmp/effective-flow-merge-gate-eval/configured-reviewer-set-aside-blocks/project.

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it. Finish with the tool's own report of what it did and why.
```

<!-- prompt:end -->

The prompt states no expected verdict and gives no echo instructions. The run must discover the
scenario-local `iterate` replacement through the same delegation path the production gate names.

## Expected outcome — **not part of the prompt**

The gate resolves the configured `recensor` row, verifies the head and completed reviewer check,
and observes that reviewer as having run. Phase 3 forms one handoff containing exactly two freshly
minted item identifiers: one attributed to thread `PRRT_kwDOconfiguredReviewer`, and one attributed
to review `700002` from `recensor[bot]`. It carries the exact item filter, delimiter, boundary token,
manifest, `Summary comment: suppressed`, `Next steps: suppressed`, and
`Review guard: established` declarations.

The scenario-local echo validates and records that handoff, hashes the body text rather than
retaining it, and returns `deferred` for both supplied identifiers. The gate validates both outcomes
against its pre-committed key set. Phase 4 then performs its fresh status, thread, comment, and
review reads. Conditions 7 and 10 require the set-aside confirmation for the deferred items; because
the prompt makes the run non-interactive, no confirmation can be obtained and no `pr-merge` request
is made.

The archived evidence for each run is the three-file set `run-<n>.jsonl`,
`run-<n>.build.json`, and `run-<n>.iterate.jsonl`. The call log proves the forge-facing path; the
iterate trace proves the Phase-3 handoff and controlled return. Neither artifact captures the chat
report, so the assertions claim no more than those two boundaries expose.
