# Scenario: `unparseable-item-filter-aborts`

The caller announces an item filter nobody can read.

A genuine one-thread delegation, built by the shipped `delegation-envelope` helper, whose
`Item filter:` line lost its thread list in transit: `Item filter: threads=` instead of
`Item filter: threads=PRRT_kwDOiterateEvalOpen`. Every other line is exactly what the helper wrote. An
empty `threads=` list is the one form `iterate` Phase 0 step 6 names as unparseable outright, and the
rule it guards is the damaging direction of the filter contract: a run that read the broken line
as "no filter" would classify and implement every open item of the pull request.

Prepare its five slots with `pnpm eval iterate prepare --scenario unparseable-item-filter-aborts` and the pinned
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
Item filter: threads=
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: 38MSK5C0WCW1MAGM7CNK0GCTOR4HI8MP3HEBC6RP
Thread item: A5GNJMA8CMP4RWDS6NEVYP0WGNGPVIX6ANXOXG0S | thread=PRRT_kwDOiterateEvalOpen
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

The run splits the message at the delimiter, finds nothing wrong with the control lines' count or
with the manifest (one `Thread item:` line, no `Item:` line, an empty region below the
delimiter — the one pairing a whitespace-only region is read under), and then fails to parse the
item filter. It returns `ABORT: unparseable item filter` immediately, before Phase 1, so it makes
**no** forge call at all: no probe, no pull-request read, no thread read.

The assertion is a conjunction: the exit-channel report carries `ABORT: unparseable item filter` and
no other `ABORT:` line, **and** the call log holds no forge call.

"No forge call" means no start record outside the shipped helper's pure local operations.
Phase 0 step 1 may parse the pull-request reference through the helper's `reference-parse` before
the refusal, and that operation is pure computation that reaches no provider and touches no runtime
state, so the evaluator does not count it. This deliberately refines the plan's "zero records": its
intent is that nothing is read or written before Phase 1. The thread ledger's `thread-ledger-lookup`
and `thread-ledger-record` are local but read and write runtime state, so they count; so do a
`probe`, any remote read and any write, and a counted call fails whatever runtime root it states.
