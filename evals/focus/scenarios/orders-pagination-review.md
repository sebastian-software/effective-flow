# Scenario: `orders-pagination-review`

One completed two-run T3 session, read through the session stub, judged by focus against its goal.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}} by reading its SKILL.md; that directory is the
Effective Flow skill root. Then run that skill's `focus` tool on the invocation that closes this
message. Use no skill copy other than {{SKILL_ROOT}}, no installed user skill, no repository
outside {{PROJECT_ROOT}} and no network access.

Measurement override. This run is a behavioural eval of focus's trajectory judgment on admitted
evidence: the goal anchor, the bounded read sequence, the verdict, its citations and its stated
gaps. It does not measure host identification or admission. The eval declares the host
simulation, the session stub and the closing format below as eval instruments; for this run they
stand in for the trusted host context focus requires, and none of them is evidence about the
session:

- Host simulation: this observer runs on T3 Code, observed report-only path. The simulated T3
  orchestration-capabilities value that identifies the parent of new delegates is
  observer-thread-01, this observer's own thread ID.
- Session stub: the simulated `t3_thread_read` transport is
  `node {{SKILL_ROOT}}/scripts/session-stub.mjs thread-read`. Send it one JSON object on
  standard input with the `t3_thread_read` parameters, identical in name and meaning
  (`threadId`, `view`, `limit`, `maxCharsPerItem`, `runLimit`, `afterPosition`,
  `itemId`, `textOffset`); the JSON envelope on standard output carries that read's result.
  Each call is one native read and counts against focus's read, page and character budgets.
  Running this command is the simulated native read, not execution to judge the session.
- Closing format: the final message ends with exactly the three lines described below.

Every other focus rule applies unchanged: no other source or transport, no tests, builds, checks
or other execution, no writes and no sends.

The resolved chat language is en. This is a non-interactive eval run; nobody answers a
question.
The observer's repository checkout, execution root and runtime-state root are all
{{PROJECT_ROOT}}.

End the final message with exactly these three lines, in this order, with nothing after them:

Verdict: <verdict>
Citations: <locators>
Gap: <gap>

<verdict> is On track, Drifting, Looping, Stalled or Cannot judge, or none when focus did not
admit the session. <locators> are the target item positions or item IDs the verdict cites,
separated by commas, or none. <gap> is none for On track, Drifting, Looping or Stalled; for
Cannot judge it is goal-missing (no goal anchor), goal-contradictory (goal anchors that
contradict each other) or coverage-budget (decisive history beyond the read budget); it is
not-admitted together with Verdict: none.

The invocation starts on the next line and is the developer's exact selection:
effective-flow focus session-thread-01 goal: Get the cursor pagination change for the orders API through code review with no open findings.
```

<!-- prompt:end -->

## Expected outcome — not part of the prompt

The run receives only the rendered prompt region above. The expected verdict, gap category,
decisive locators and labelled read path live in [`labels/orders-pagination-review.json`](../labels/orders-pagination-review.json),
which never enters a slot. The evaluator in [`_scaffold/evaluate.mjs`](../_scaffold/evaluate.mjs)
scores only the closing lines of the sealed last message against that label, with the read trace
replayed through the session stub for citations and contract violations.
