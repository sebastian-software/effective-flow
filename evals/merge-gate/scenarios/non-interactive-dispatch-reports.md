# Scenario: `non-interactive-dispatch-reports`

A **non-interactive caller** dispatches the delegated gate run, and that run ends `DONE` with a
report instead of a merge.

Since the gate moved out of the session that invokes it, every scenario of this suite runs the same
way: the fresh session is the **caller**, runs Phase 0, and hands the rest of the gate to the
delegated run per "Dispatching the delegated run" in `tools/merge-gate.md`. This scenario is the one
whose subject is that handoff. Its prompt is non-interactive, so the caller has to dispatch
`Run state: non-interactive` and, with `mergeGate.completion` at `ask`, pass **no**
`Completion answer:` line — the delegated run refuses one under `non-interactive` with
`ABORT unparseable input line`. The delegated run then reads `mergeGate.completion` itself, finds
`ask` in a non-interactive delegation, and behaves as `report`.

The fixture is [`merge-proceeds`](merge-proceeds.md) with the merge no longer served, and the
project configuration differs in one row: `mergeGate.completion` reads `ask` instead of `merge`
(`NON_INTERACTIVE_DISPATCH_ROWS` in `_scaffold/configured-reviewer-scenario.mjs`). Every other merge
precondition holds, so the completion mode is the one reason left not to merge, and the positive
control beside it shows the same pull request merging under `merge`.

Prepare its five slots with `pnpm eval merge-gate prepare --scenario non-interactive-dispatch-reports`
(or as part of the full round) and the pinned profile flags the suite README names. Its slots run
on a host that lets a spawned agent spawn further agents, and the round attests the per-scenario
depth with the `nesting-by-scenario` tool-policy token (README, "Delegation scenarios and the host's
nesting depth"). Then hand each slot's rendered prompt to a **fresh** agent — one that has not read
this file. A run started from a session that already knows the expected outcome tests that
session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. The round renders
this template into each slot's `prompt.txt`, so hand over that file rather than this text. It is the
`merge-proceeds` prompt unchanged: the two runs differ in their configuration and fixture, never in
what the agent was told.

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

The prompt states no expectation, and that is what makes the run a test. It says which pull request
to gate and where the paths are; it never says what the gate should conclude, and it never mentions
the delegated run, so a run that dispatches one correctly did so from the tool's own rules.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent, and no
assertion reads it.

The caller resolves the reference, reads the pull request and probes the provider (Phase 0), then
dispatches the delegated run with `Run state: non-interactive` and no completion answer. The
delegated run validates its input lines, verifies its roots, re-reads the pull request and probes
the provider again (Entry step 4), resolves the completion mode from configuration as `report`
(Entry step 5), passes the nested-spawn probe, and runs Phases 1 to 4: the guard surfaces, the viewer
identity, the check wait and the fresh Phase-4 batch. Phase 5 merges nothing in mode `report`, Phase
6 reports merge-readiness, and the run returns `DONE`. The caller relays that outcome record as the
gate's result. **No `pr-merge` operation is requested at any point, not even the dry-run preview.**

The assertions in [`test/merge-gate-eval.test.mjs`](../../../test/merge-gate-eval.test.mjs) and the
evaluator in `_scaffold/evaluate.mjs` read only the call log:

- **no `pr-merge` record** — a merge here means a completion answer the caller invented, or a
  `relayed` dispatch from a non-interactive caller;
- **each guard surface read at least twice** — the refusal proxy: the run reached Phase 4, so its
  missing merge is not a dead run;
- **exactly two `probe` starts, both ahead of the first guard-surface read** — the caller's Phase 0
  and the delegated run's Entry re-read. One means the delegated run was never dispatched or aborted
  before Entry step 4, for instance on a `Completion answer:` line it must refuse. Three or more mean
  a second dispatch or an Entry re-run, which a non-interactive caller never has a reason for: it
  never receives `BLOCKED-USER`.

What the log cannot show: the `DONE` keyword and the report themselves, which reach no file, and
whether the delegated run or an inline caller performed the Phase-1 to Phase-4 reads — both reach
the forge through the same stub. That the delegated run did, rather than a caller that fell back
inline after `ABORT nested-spawn-unavailable`, rests on the round's `nesting-by-scenario`
attestation, and the test holds every archived run of this scenario to it.
