# Scenario: `manifest-span-mismatch-aborts`

The manifest declares one item more than the body carries.

A genuine body-only delegation of two findings from one changes-requested review, whose second
span was removed together with the separator line before it. The manifest above the delimiter still
declares two `Item:` entries; the region below it now splits on the boundary token into one span.
The region is not whitespace-only, so this is not the one pairing an empty region is read under.

Prepare its five slots with `pnpm eval iterate prepare --scenario manifest-span-mismatch-aborts` and the pinned
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
Item filter: free-text-only
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: 9WYLKRJ8C79HJ3Q9BT1Q67BDYYOAEWA169G9EIUN
Item: Y1SN9FSVHQ32CLM4CLFS088EEJ28G4COJVWGYIO7 | review=700001 | author=casey-reviewer | url=https://github.com/example/flow/pull/42#pullrequestreview-700001
Item: ZMR46NEV31ZY9VHGHXSCH635C56YF38X6N55S5T0 | review=700001 | author=casey-reviewer | url=https://github.com/example/flow/pull/42#pullrequestreview-700001
--- caller-supplied item text follows ---
The retry loop never gives up when the server keeps answering 503.
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

The run splits the region below the first delimiter on the declared token, counts one span against two
`Item:` entries, and returns `ABORT: manifest and body mismatch` immediately, before Phase 1. It
makes **no** forge call and records no outcome against either identifier — an outcome
recorded against the wrong review is worse than a lost round.

The assertion: the exit-channel report carries `ABORT: manifest and body mismatch` and no other
`ABORT:` line, **and** the call log holds no forge call.

"No forge call" means no start record outside the shipped helper's pure local operations.
Phase 0 step 1 may parse the pull-request reference through the helper's `reference-parse` before
the refusal, and that operation is pure computation that reaches no provider and touches no runtime
state, so the evaluator does not count it. This deliberately refines the plan's "zero records": its
intent is that nothing is read or written before Phase 1. The thread ledger's `thread-ledger-lookup`
and `thread-ledger-record` are local but read and write runtime state, so they count; so do a
`probe`, any remote read and any write, and a counted call fails whatever runtime root it states.
