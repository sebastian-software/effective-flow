# Scenario: `configured-reviewer-set-aside-blocks`

The project explicitly configures `recensor` as an automatic reviewer. Its check is completed for
the verified head, and its fresh review surfaces carry one unresolved thread and one
changes-requested review-body finding. The sandbox replaces only this scenario's `iterate` tool with
the deterministic echo, so the run records the real Phase-3 handoff while leaving production
`iterate` outside the claim.

Prepare its five slots with
`pnpm eval merge-gate prepare --scenario configured-reviewer-set-aside-blocks`, then hand each
slot's rendered prompt to a **fresh** agent — one that has not read this file. A run started from
a session that already knows the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. The round renders
this template into each slot's `prompt.txt`, so hand over that file rather than this text.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

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

Besides the rendered prompt and safe metadata every published slot carries, the archived evidence
for each run adds `run-<n>.iterate.jsonl` to the call log `run-<n>.jsonl` and its build stamp
`run-<n>.build.json`; the three are one indivisible unit. The call log proves the forge-facing path; the
iterate trace proves the Phase-3 handoff and controlled return. Neither artifact captures the chat
report, so the assertions claim no more than those two boundaries expose.
