# Scenario: `unparseable-review-fix-validation-aborts`

The caller's review-fix validation candidate cannot be read.

A genuine one-thread delegation built with an authorized scope and a `quick` review-fix candidate, as `merge-gate` sends a bot round, whose `Review-fix validation:` line then carries a short non-SHA operand instead of the full 40-hex base commit. Every other line is exactly what the shipped helper wrote. A run that read past the broken line would either treat the round as `quick` on no evidence or silently drop the line, which is why `iterate` Phase 0 refuses it rather than guessing.

Prepare its five slots with `pnpm eval iterate prepare --scenario unparseable-review-fix-validation-aborts` and the pinned
profile flags the suite README names, then hand each slot's rendered prompt to a **fresh** agent —
one that has not read this file. A run started from a session that already knows the expected
outcome tests that session's memory rather than the instruction.

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

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it.

Once the tool's run has ended, however it ended, pipe the tool's complete final report — every
line of it, its closing completion keyword included — unchanged on standard input into
`node {{SKILL_ROOT}}/scripts/report-channel.mjs`. Run that command exactly once and write the
report to no file on the way. Then finish with the same report.

The invocation starts on the next line and runs verbatim to the end of this message:
effective-flow iterate 42
Item filter: threads=PRRT_kwDOiterateEvalOpen
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Authorized scope: {"version":1,"scope":{"mergeBase":"74e561e66199d2bb0cabd7d28c4b29354b160ea2","head":"11bfd8d43bd2ae45770c613a61e7badd337ea8d8","paths":["docs/iterate-eval-change.md"]},"freeText":"GFQ7TJ6O6382DGZSH439D744QSM0N7CFEHZO6AQX","correction":"53G7KJYENP13QMJE8HT83Y72D84LNY06BBSCK5MF"}
Review-fix validation: quick-candidate 6e1338ee
Boundary token: D215BMKWLC57PE0UDB27HEDZGBHQTOVE8UFQYNUN
Thread item: N9ALP3UVQFQLYR45MBVWS3ZB8IFB1NIE9CA0TQK6 | thread=PRRT_kwDOiterateEvalOpen
--- caller-supplied item text follows ---
```

<!-- prompt:end -->

The prompt says which invocation to process, where the paths are and where the final report goes.
It never says what the tool should conclude, so a run that reaches the expected outcome reached it
from the tool's own rules. The exit-channel instruction addresses the agent after the tool's own
report exists; it names no outcome either.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent, and no
assertion reads it; the evaluator in `evals/iterate/_scaffold/evaluate.mjs` reads only the call log
and the exit-channel record.

The run splits the message at the delimiter, finds every control line exactly once, and reads the
filter, the scope and the other switches without complaint. The `Review-fix validation:` line is
honored here, because the invocation carries the body delimiter and an `Authorized scope:` line
above it, and its operand is not a full lowercase 40-hex commit SHA. It returns
`ABORT: unparseable review-fix validation switch` immediately, before Phase 1, and makes **no**
forge call. It never continues as a `full` or a `quick` round.

The assertion: the exit-channel report carries `ABORT: unparseable review-fix validation switch` and no other
`ABORT:` line, **and** the call log holds no forge call.

"No forge call" means no start record outside the shipped helper's pure local operations.
Phase 0 step 1 may parse the pull-request reference through the helper's `reference-parse` before
the refusal, and that operation is pure computation that reaches no provider and touches no runtime
state, so the evaluator does not count it. The thread ledger's `thread-ledger-lookup` and
`thread-ledger-record` are local but read and write runtime state, so they count; so do a `probe`,
any remote read and any write, and a counted call fails whatever runtime root it states.
