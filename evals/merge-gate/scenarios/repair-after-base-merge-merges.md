# Scenario: `repair-after-base-merge-merges`

The project configures `recensor` as an automatic reviewer, as in
`configured-reviewer-set-aside-blocks`, and the pull request has real history: the sandbox `origin`
is a local bare repository (`_scaffold/repair-origin.mjs`) whose head the run moves through real
commits. The sandbox replaces only this scenario's `iterate` tool with the deterministic echo, which
lands one seeded repair per delegation. That keeps production `iterate` outside the claim while the
gate's own repair accounting runs against real `git` history. It is the merging half of the
repair-accounting pair, modelled on #641 and #659: a finding re-reported on a base-merge head,
then resolved by a real fix.

Prepare its five slots with
`pnpm eval merge-gate prepare --scenario repair-after-base-merge-merges`, then hand each slot's
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

The fixture's `originHeads` declares four heads in order: `seed` (the pull-request commit),
`repair-1`, `base-merge` and `repair-2`. Every read is answered from the head the bare `origin`
carries at that moment. Every reviewer thread is anchored on line 5 of `src/limits.mjs`, the one path
the pull request changes. `mergeGate.maxRounds` is 8, so the round cap is never what ends the run.

1. **`seed`.** Checks are green, `recensor` has run, and thread `PRRT_kwDOrepairCauseOne` is
   unresolved. Before its first delegation the gate reads the authorized scope (`src/limits.mjs`,
   at the seeded head and its merge base) and hands that one thread to `iterate`. The echo lands the
   capping repair as `repair-1`, and moves `develop` forward by one commit that touches only
   `docs/changelog.md`. It returns that commit under the thread's identifier with `implemented`.
2. **`repair-1`.** The first thread is resolved, and the stub serves `recensor`'s re-report of the
   finding as the new thread `PRRT_kwDOrepairCauseTwo` on the changed line. The forge reports the
   head `BEHIND`, so Phase 2 step 1 (trigger (a)) merges `origin/develop` into the head branch in
   place and pushes that one merge commit before Phase 3 reaches `evaluate`. The receive hook records
   the push and labels it `base-merge`.
3. **`base-merge`.** `recensor` has run again and still reports the second thread, so the gate first
   classifies the re-report here, at its own base-merge head: the same cause, with one repair
   attempt. The base merge used **no** repair attempt, so the run continues. The gate delegates the second thread with the same
   stored scope. The echo makes the effective repair on top of the base-merge head and labels it
   `repair-2`.
4. **`repair-2`.** Both threads are resolved, and `recensor` has run and approved. The cause is
   resolved, the Phase-4 conditions hold, and the gate merges: one preview and one applied
   `pr-merge`, after the second repair landed.

A gate that counted its own base merge as a repair attempt would reach two attempts at step 3. It
would then stop there with a single delegation and no merge, which is what the evaluator rejects.

The evidence for each run is the call log `run-<n>.jsonl`, its build stamp `run-<n>.build.json` and
the repair trace `run-<n>.iterate.jsonl`, one indivisible unit. The trace holds exactly two
delegation records and one push record between them. The call log shows exactly one applied
`pr-merge`, timed after the second delegation. Neither file captures the chat report, so the
repair counts and the reason the gate went on are left to the contract tests.
