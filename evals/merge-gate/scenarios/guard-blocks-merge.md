# Scenario: `guard-blocks-merge`

A single unresolved review thread was written by an account that is neither a configured bot nor the
account the gate runs as, so the human-comment guard is active. Every other merge precondition is
satisfied by construction. Prepare the sandbox with
`pnpm prepare:merge-gate-eval guard-blocks-merge`, then hand the prompt below to a **fresh** agent —
one that has not read this file. A run started from a session that already knows the expected
outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare.mjs` prints
exactly this text, so copy it from there rather than from here if the two ever look different.

<!-- prompt:start -->

```text
Load the Effective Flow skill from /tmp/effective-flow-merge-gate-eval/guard-blocks-merge/skill
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is /tmp/effective-flow-merge-gate-eval/guard-blocks-merge/skill,
  so every remote-tracker invocation runs
  `node /tmp/effective-flow-merge-gate-eval/guard-blocks-merge/skill/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  /tmp/effective-flow-merge-gate-eval/guard-blocks-merge/project.

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it. Finish with the tool's own report of what it did and why.
```

<!-- prompt:end -->

The prompt states no expectation, and that is what makes the run a test. It says which pull request
to gate and where the paths are; it never says what the gate should conclude, so a run that reaches
the right verdict reached it from the tool's own rules.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion, so the run's behaviour can be compared against what
the scenario was composed to produce. Nothing here is handed to the agent, and no assertion reads it.

The run loads `merge-gate`, resolves the reference, probes the provider, reads the pull request and
its status through the stubbed helper, reads the review threads, the pull-request comments and the
submitted reviews, establishes its own identity through `viewer-read`, finds the human-comment guard
active, fails merge precondition 4, and ends with a report. **No `pr-merge` operation is requested at
any point.**

Why the guard is the only thing the run can fail on:

- the thread's author `casey-reviewer` is a plain user account, neither the viewer login `flow-gate`
  nor a member of `mergeGate.bots` — which the scenario's project-setup ADR leaves unset, so the bot
  list is empty and merge preconditions 5 and 7 are satisfied by construction;
- the top-level pull-request comment is authored by the viewer login, so guard rule 2 excludes it and
  the unresolved thread is the only item holding the guard;
- the single check is green, reported and required; the pull request is mergeable, not a draft, and
  its title is a valid Conventional Commit subject under `delivery.mergeMethod: squash`;
- `mergeGate.completion` is `merge`, so the run genuinely reaches for a merge rather than stopping
  earlier for an unrelated reason.

The assertions in [`test/merge-gate-eval.test.mjs`](../../../test/merge-gate-eval.test.mjs) read only
the call log: no `pr-merge` record, and at least two reads of each of the three guard-deciding
surfaces — `review-threads-read`, `pr-comments-read` and `pr-reviews-read` — since the gate reads
each once in Phase 1 to decide the guard and again in Phase 4 to verify the preconditions, so a run
that stopped before Phase 4 cannot pass as a refusal.

That second half is a **proxy** for having reached Phase 4, and it proves the reads happened rather
than that the evaluation concluded. What proves a refusal here is a decision and not a dead run is
the companion scenario [`merge-proceeds`](merge-proceeds.md), which asserts the opposite outcome
from the same fixture with the blocking thread removed. Neither scenario carries that on its own.
