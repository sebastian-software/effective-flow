# Scenario: `review-in-flight-aborts`

A configured reviewer is still running and nobody can be asked.

A genuine non-interactive one-thread delegation from which the `Review guard: established` line was
removed, so the caller answers for no reviewer state. The sandbox configuration names one automatic
reviewer, `recensor`, with the check context `recensor`, and the stubbed status read reports that
check as pending on the pull request's head. The fixture is otherwise ordinary: one open review
thread, a green `ci` check, no comments.

Prepare its five slots with `pnpm eval iterate prepare --scenario review-in-flight-aborts` and the pinned
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
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: Z6GOP50X58FWETP7XKBKGWA8IS3ARL5V41L2UJVF
Thread item: TF12CSS5GR6RHNZE9GKO0I8DGO16NVT8ARZ8M4HL | thread=PRRT_kwDOiterateEvalOpen
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

Phase 0 accepts the message: no line is malformed, and an absent `Review guard:` line is the default
rather than a defect. Phase 1 probes the provider, resolves pull request 42 and reads the review
threads, the pull-request status and the submitted reviews at one instant; it may fetch the head
branch, which the sandbox checkout already tracks from a local `origin`. Phase 1.5 does not skip:
local mode does not apply, no guard line was announced, a reviewer is configured and the status
read succeeded. The configured check matches a `PENDING` entry, so `recensor` is **running**. The
run state is `non-interactive`, so the question cannot be asked, and the run returns
`ABORT: review still in flight`, naming `recensor` and the pending check.

The assertion is the forge-reading conjunction: the exit-channel report carries
`ABORT: review still in flight` and no other `ABORT:` line and names `recensor`, **and** the
call log holds `review-threads-read`, `pr-status-read` and `pr-reviews-read` **exactly once each**,
**and** it holds no write operation at all — no reply, no resolution, no comment, dry runs
included. The once is what catches the gated "Wait" branch: it sleeps once and then re-reads the
threads and the status before ending the run, so a run that took it shows those reads twice
whatever its report says.
