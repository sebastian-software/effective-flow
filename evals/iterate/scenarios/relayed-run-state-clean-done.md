# Scenario: `relayed-run-state-clean-done`

The caller states the third run state, `relayed`.

A genuine, unmodified one-thread delegation whose `Run state:` line reads `Run state: relayed`: the
value a delegated `merge-gate` run forwards to `iterate` when its own user is reachable through the
caller. The shipped sender writes that line itself, so nothing here is mutated. Every other byte of
the situation is `empty-selection-clean-done`: the filter names only a thread the stubbed read
reports as resolved, and the pull request carries the same open, unnamed fix request. The two
scenarios differ in that one line, so a difference in outcome is attributable to it.

It guards the parser, not the relay. `iterate` Phase 0 step 10 used to accept only `gated` and
`non-interactive` and refuse every other value with `ABORT: unparseable run-state switch`; a parser
that still did would turn every relayed `merge-gate` round into a refusal before Phase 1. The empty
selection is chosen because it reaches neither question `relayed` changes — the Phase 1.5 in-flight
question is skipped on the announced guard, and an empty selection never reaches the Phase 2.5
approval — so a correct run ends exactly as the non-interactive one does, and `BLOCKED-USER` is
never a correct ending here.

Its prompt says only "Ask no questions", like `unparseable-run-state-aborts`. The other scenarios'
"This is a non-interactive run" would contradict the `Run state:` line under test and could let a
run settle the state from the prompt instead of from the line.

Prepare its five slots with `pnpm eval iterate prepare --scenario relayed-run-state-clean-done` and
the pinned profile flags the suite README names, then hand each slot's rendered prompt to a
**fresh** agent — one that has not read this file. A run started from a session that already knows
the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. The round renders
this template into each slot's `prompt.txt`, so hand over that file rather than this text. The
invocation that closes it is the fixture's `delegation.message`, byte for byte, behind the dispatch
line `effective-flow iterate 42` that `merge-gate` writes before every delegated message;
`test/eval-fixture-fidelity.test.mjs` holds the two equal.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md; that directory is the Effective Flow skill root. Then run that skill's
`iterate` tool on the invocation that closes this message, exactly as a delegating workflow hands
it over.

Resolve the paths the tool asks for as follows and use no others:

- every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

Ask no questions.

Once the tool's run has ended, however it ended, pipe the tool's complete final report — every
line of it, its closing completion keyword included — unchanged on standard input into
`node {{SKILL_ROOT}}/scripts/report-channel.mjs`. Run that command exactly once and write the
report to no file on the way. Then finish with the same report.

The invocation starts on the next line and runs verbatim to the end of this message:
effective-flow iterate 42
Item filter: threads=PRRT_kwDOiterateEvalResolved
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: relayed
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: 7OOJXC9W2M7T8SZA32H36IXO4PI1LLIWODD8QC3W
Thread item: YRHVMRVYK9OQKMZGEEMOLZ9H9H8MC8EL5IPLFG1N | thread=PRRT_kwDOiterateEvalResolved
--- caller-supplied item text follows ---
```

<!-- prompt:end -->

The prompt says which invocation to process, where the paths are and where the final report goes.
It never says what the tool should conclude, so a run that reaches the expected outcome reached it
from the tool's own rules. The exit-channel instruction addresses the agent after the tool's own
report exists; it names no outcome either.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent, and no
assertion reads it; the evaluator in `evals/iterate/_scaffold/evaluate.mjs` reads only the call log,
the exit-channel record and the git state the sealing step recorded.

Phase 0 accepts the message, `Run state: relayed` included. Phase 1 reads the review threads, the
status and the submitted reviews, and may fetch the head branch the sandbox checkout already stands
on. Phase 1.5 is skipped on the announced guard. Phase 2 keeps the resolved thread excluded although
the filter names it, and the filter keeps the open `PRRT_kwDOiterateEvalUnselected` out, so the
selection is empty: the run reports that, implements, commits and pushes nothing, replies to and
resolves nothing, posts no summary comment, and ends with `DONE`.

The assertion is the forge-reading conjunction `empty-selection-clean-done` uses: the exit-channel
report carries no `ABORT:` line and closes with `DONE`, **and** the call log holds
`review-threads-read`, `pr-status-read` and `pr-reviews-read`, **and** it holds no write operation
at all, **and** the sealed git state is the one provisioning left. A parser that still rejects
`relayed` fails the first and second conjuncts: its report carries
`ABORT: unparseable run-state switch` and its log holds no Phase-1 read. A run that returns
`BLOCKED-USER` fails the first, because its closing line is not `DONE`.

What this does **not** show: that a `relayed` run asks through its caller where it should. Neither
question that turns into `BLOCKED-USER` under `relayed` is reachable from an empty selection, and the
round trip through a caller is the plan's manual check, not a scenario of this suite.
