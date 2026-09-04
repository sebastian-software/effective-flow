# Scenario: `merge-proceeds`

The suite's **positive control**, and the counterpart of `guard-blocks-merge`. It is the same
situation with the one unresolved review thread removed: no item holds the human-comment guard,
every other merge precondition is satisfied by construction, and the gate is supposed to merge.

Its value is entirely in failing. A refusal scenario's green result cannot distinguish a gate that
correctly declined from a gate — or a harness — that never gets far enough to decide anything, and
both look identical in a call log. This scenario is what separates them: if a run here records no
merge, the refusal scenario's result means less than it appears to. Read the two together or
neither.

Prepare the sandbox with `pnpm prepare:merge-gate-eval merge-proceeds`, then hand the prompt below
to a **fresh** agent — one that has not read this file. A run started from a session that already
knows the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare.mjs` prints
exactly this text, so copy it from there rather than from here if the two ever look different. It is
the `guard-blocks-merge` prompt with the sandbox path changed and nothing else: the two runs have to
differ in the fixture, never in what the agent was told.

<!-- prompt:start -->

```text
Load the Effective Flow skill from /tmp/effective-flow-merge-gate-eval/merge-proceeds/skill
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is /tmp/effective-flow-merge-gate-eval/merge-proceeds/skill,
  so every remote-tracker invocation runs
  `node /tmp/effective-flow-merge-gate-eval/merge-proceeds/skill/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  /tmp/effective-flow-merge-gate-eval/merge-proceeds/project.

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
submitted reviews, establishes its own identity through `viewer-read`, finds **no** item holding the
human-comment guard, satisfies every merge precondition, and reaches Phase 5. **It requests
`pr-merge` twice: once for the dry-run command preview Phase 5 asks it to inspect, then once with
`--apply`.**

Why nothing holds the guard here:

- the pull request carries **no review thread at all** — that single emptied read is the one and
  only difference from `guard-blocks-merge`'s fixture, and the whole reason the two verdicts differ;
- the top-level pull-request comment is authored by the viewer login `flow-gate`, so guard rule 2
  excludes it, exactly as it does in the other scenario;
- `casey-reviewer`'s submitted review is `APPROVED`, and only a **changes-requested** review counts
  for the guard, so it does not hold one — again unchanged from the other scenario;
- `mergeGate.bots` is unset, so the bot list is empty and merge preconditions 5, 7 and 10 are
  satisfied by construction;
- the single check is green, reported and required; the pull request is mergeable, not a draft, and
  its title is a valid Conventional Commit subject under `delivery.mergeMethod: squash`;
- `mergeGate.completion` is `merge`, so the run genuinely reaches for a merge.

The stub **serves** this merge rather than refusing it, because the fixture states `servesMerge:
true`. Nothing is merged — there is no forge — and the call is recorded exactly as a refused one
would be; what the flag changes is the envelope the gate reads back. Every other fixture in the
suite leaves the flag unset and keeps the refusal, so a refusal scenario cannot lose its protection
by accident.

### A known limit of a static fixture

The canned `pr-read` and `pr-status-read` envelopes describe an **open** pull request, and they keep
describing one after the merge, because the fixture is a fixed document rather than a model of forge
state. So the fresh read Phase 5.5 requires as proof of the merge does not confirm it, and the run
skips the issue observation and reports what it saw. That is correct behaviour on the gate's part
given what it was told, and it is downstream of everything this scenario asserts: the `pr-merge`
records are already written by then. Phase 5.5 entry reachability is WP6's subject and needs a stub
that carries state, which this one deliberately does not.

The assertions in [`test/merge-gate-eval.test.mjs`](../../../test/merge-gate-eval.test.mjs) read only
the call log: at least one `pr-merge` record, and exactly one of them with `apply: true`.
