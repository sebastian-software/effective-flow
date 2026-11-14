# Scenario: `repeated-ineffective-repair-stops`

The refusing half of the repair-accounting pair beside `repair-after-base-merge-merges`, with the
same configured `recensor`, the same real-commit `origin` (`_scaffold/repair-origin.mjs`) and the
same `iterate` echo. Here neither repair resolves the finding, and the gate has to stop automatic
repair after the second ineffective attempt.

Prepare its five slots with
`pnpm eval merge-gate prepare --scenario repeated-ineffective-repair-stops`, then hand each slot's
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

The fixture's `originHeads` declares three heads in order: `seed`, `repair-1` and `repair-2`. Every
read is answered from the head the bare `origin` carries. Every reviewer thread is anchored on line
5 of `src/limits.mjs`, the one path the pull request changes, and the forge never reports `BEHIND`.
`mergeGate.maxRounds` is 8, so the round cap is never what ends the run.

1. **`seed`.** `recensor` has run and thread `PRRT_kwDOrepairCauseOne` is unresolved. The gate
   reads the authorized scope before its first delegation and hands that thread to `iterate`. The
   echo lands the capping repair as `repair-1` and returns it with `implemented`.
2. **`repair-1`.** The first thread is resolved, and `recensor` re-reports the finding as
   `PRRT_kwDOrepairCauseTwo` on the changed line. That makes it the same cause after one
   ineffective attempt, which does not stop the run. The gate delegates the second thread. The echo
   lands a second repair as `repair-2`, which changes the same line and leaves the finding in place.
3. **`repair-2`.** `recensor` has run on the new head and re-reports the finding as
   `PRRT_kwDOrepairCauseThree` on the line the second repair changed. That is fresh evidence that
   the second verified repair of the same cause is ineffective. The gate stops at configured-reviewer
   Phase 3 step 5 before any further delegation and ends with the repair-progress report: no third
   delegation, no base merge, no push and no `pr-merge`.

A gate without the stop would delegate the third thread long before eight rounds are used. That
third delegation is what the evaluator rejects, together with any push and any merge request.

The evidence for each run is the call log `run-<n>.jsonl`, its build stamp `run-<n>.build.json` and
the repair trace `run-<n>.iterate.jsonl`, one indivisible unit. The trace holds exactly two
delegation records and no push record. The call log holds no `pr-merge`, and it shows a review-thread
read after the second delegation, so a stop rests on fresh evidence. Neither file captures the chat
report, so the content of the repair-progress block is left to the contract tests.
