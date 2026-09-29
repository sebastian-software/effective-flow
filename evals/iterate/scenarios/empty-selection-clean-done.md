# Scenario: `empty-selection-clean-done`

The only filtered thread was resolved before the run began.

A genuine, unmodified one-thread delegation — `Item filter: threads=PRRT_kwDOiterateEvalResolved`,
`Review guard: established`, `Run state: non-interactive` — whose only thread the stubbed thread
read reports as resolved: someone resolved it between the caller's read and this delegation. No
free text travels with it. This is the other half of the filter contract the unparseable-filter
scenario covers: a filter that matches nothing yields a clean empty run and never falls back to
processing every item.

The pull request carries a second thread, `PRRT_kwDOiterateEvalUnselected`: open, unaddressed, and
not named by the filter. It is what makes the fallback observable. Without it a run that fell back
to "process all items" would find nothing to process either and pass; with it, such a run selects
the open thread and attempts a reply or a resolve, which is a forge write the evidence records. The
filter still decides the selection alone, so exactly one rule fires.

Prepare its five slots with `pnpm eval iterate prepare --scenario empty-selection-clean-done` and the pinned
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
Item filter: threads=PRRT_kwDOiterateEvalResolved
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: NF40IWZYTKEDKS1AY6NGAEU4X0UDC830R9PYKE8X
Thread item: ILTXARRECELWRTBFW1JBE8XI9N2OK1YF7MJ9A5VZ | thread=PRRT_kwDOiterateEvalResolved
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

Phase 0 accepts the message. Phase 1 reads the review threads, the status and the submitted reviews,
and may fetch the head branch the sandbox checkout already stands on. Phase 1.5 is skipped on the
announced guard. Phase 2 keeps the resolved thread excluded although the filter names it, and the
filter keeps the open `PRRT_kwDOiterateEvalUnselected` out, so the selection is empty: the run
reports that, implements nothing, pushes nothing, replies to and resolves nothing, posts no summary
comment, and ends with `DONE`. The report may list the open thread as deselected; that is a correct
Phase-6 summary, so the evaluator does not require the report to leave it unnamed.

The assertion is the forge-reading conjunction: the exit-channel report carries no `ABORT:` line
and closes with `DONE`, **and** the call log holds `review-threads-read`, `pr-status-read` and
`pr-reviews-read`, **and** it holds no write operation at all. A push would reach only the
sandbox's local `origin` and is not observed by this evidence; what is observed is every forge
write, which is where a fallback to "process all items" would show first — as a reply to, or a
resolve of, the open thread.
