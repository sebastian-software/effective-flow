# Scenario: `iterate-scope-line-request`

The line-request twin of `configured-reviewer-set-aside-blocks`, with the same configured
`recensor`, the same fixture surfaces and the same local `origin`
(`_scaffold/configured-reviewer-origin.mjs`). One fact differs, stated by the fixture's
`iterateEchoReturn: "lines-on-request"`: the scenario-local `iterate` echo's first return omits the
`Returned commits:` and `Scope expansion:` lines. The gate has to continue that delegation once with
the line request of `shared/merge-gate-delegation-contract.md` and record the round from the answer,
instead of stopping with `scope-line-missing`.

Prepare its five slots with
`pnpm eval merge-gate prepare --scenario iterate-scope-line-request`, then hand each slot's
rendered prompt to a **fresh** agent — one that has not read this file. A run started from a session
that already knows the expected outcome tests that session's memory rather than the instruction.

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

Phase 3 forms the same handoff as in `configured-reviewer-set-aside-blocks`: one thread item for
`PRRT_kwDOconfiguredReviewer` and one review-body item for review `700002` from `recensor[bot]`,
below an `Authorized scope:` line for the pull request's one changed path. The echo validates and
records that handoff and returns `deferred` for both identifiers and `DONE`, but neither
`Returned commits:` nor `Scope expansion:`.

The gate then continues the same delegation exactly once, with a turn that carries exactly the
contract sentence and nothing else:

```text
State the missing `Returned commits:` and `Scope expansion:` lines of your final return per `delegated-scope-return`.
```

The echo records that continuation through `iterate-trace.mjs --line-request` by byte length and
digest, and answers with `Returned commits: []`, `Scope expansion: []` and `DONE`. The gate takes
the two lines from that answer, keeps the outcome record of the first return, and records the round
rather than stopping with `scope-line-missing`. Phase 4 then performs its fresh status, thread,
comment, and review reads; the deferred items need the set-aside confirmation a non-interactive run
cannot obtain, so no `pr-merge` request is made.

The archived evidence for each run is the same trio as in the configured-reviewer scenario: the call
log `run-<n>.jsonl`, its build stamp `run-<n>.build.json` and the iterate trace
`run-<n>.iterate.jsonl`. The trace proves the one delegation and the one line request with its exact
sentence; the call log proves that the run went on to Phase 4 and did not merge. Neither captures
the chat report, so the assertions claim no more than those two boundaries expose.
