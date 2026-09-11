# Scenario: `unreported-checks-block-merge`

The pull request's status read carries **no check rollup at all**, so the helper reports
`checksReported: false`. Nothing holds the human-comment guard and every other merge precondition is
satisfied by construction, so merge precondition 2 is the only thing standing between this run and a
merge — and it is one a non-interactive run cannot satisfy, because the operator answer that clears
its reported-at-all clause can only be given in a gated run. Prepare the sandbox with
`pnpm prepare:merge-gate-eval unreported-checks-block-merge`, then hand the prompt below to a
**fresh** agent — one that has not read this file. A run started from a session that already knows
the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare.mjs` prints
exactly this text, so copy it from there rather than from here if the two ever look different.

<!-- prompt:start -->

```text
Load the Effective Flow skill from
/tmp/effective-flow-merge-gate-eval/unreported-checks-block-merge/skill
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is
  /tmp/effective-flow-merge-gate-eval/unreported-checks-block-merge/skill,
  so every remote-tracker invocation runs
  `node /tmp/effective-flow-merge-gate-eval/unreported-checks-block-merge/skill/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  /tmp/effective-flow-merge-gate-eval/unreported-checks-block-merge/project.

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
its status through the stubbed helper, observes that the status read reports no check list, and ends
with a report instead of merging. **No `pr-merge` operation is requested at any point.**

Where exactly it ends is the one thing this scenario deliberately does not pin, because two
different rules of the same tool both refuse this pull request in a non-interactive run and either
ending is correct:

- **Phase 2's unreported-list rule** is reached first. The loop does not leave on the check
  criterion while the list is unreported; it reports that and asks once, and an unanswered or
  non-interactive run ends there without merging.
- **Merge precondition 2** is where the same fact blocks if a run ever gets past that stop.
  `checksReported: false` blocks the condition outright unless the Phase-4 **no-check-list waiver**
  cleared its reported-at-all clause, and that waiver is posed only in a gated run whose resolved
  completion mode is `merge`.

Both stops are the same property seen twice: an unreported check list is an unproven one, and only
an operator can say that its absence is expected. A non-interactive run has no operator to ask, so a
repository whose checks never report is not mergeable from one at all. That is the fact this
scenario exists to observe.

The fixture is `merge-proceeds` with exactly one fact changed: the `pr-status-read` entry carries a
null `statusCheckRollup` on its head-commit node, which the real normalizer turns into
`checksReported: false`, `checkCount: 0` and `checks: []`. Everything else is untouched, so the
difference in behaviour between the two scenarios is attributable to that one field:

- `pr-checks-wait` still reports its single green `ci`, deliberately. The gate takes its criterion
  from a fresh `pr-status-read` rather than from the wait — `src/scripts/remote-tracker-core.mjs`
  says so where it normalizes the wait — so the wait's list is not what decides this, and changing
  it too would have moved a second fact;
- the thread list is empty and the one top-level comment is authored by the viewer login, so the
  human-comment guard is inactive and precondition 4 is satisfied;
- `mergeGate.bots` is unset, so preconditions 5, 7 and 10 are satisfied by construction;
- the pull request is mergeable, not a draft, and its title is a valid Conventional Commit subject
  under `delivery.mergeMethod: squash`;
- `mergeGate.completion` is `merge`, so the run genuinely reaches for a merge rather than stopping
  earlier for an unrelated reason;
- the fixture sets no `servesMerge` and defines no `pr-merge` entry, so a merge this scenario was
  composed to refuse is recorded and refused rather than served.

The assertions in [`test/merge-gate-eval.test.mjs`](../../../test/merge-gate-eval.test.mjs) read only
the call log: no `pr-merge` record, and at least one `pr-status-read` record — the read that carries
the absent check list, and the only place in a call log where the gate can have observed it.

That second half is a **proxy**, and a weaker one than the refusal pair's. It proves the gate
performed the read whose content this scenario turns on; it does not prove the gate evaluated
anything against it, and it cannot show which of the two stops above the run ended at, because the
log records helper calls rather than verdicts. This scenario is therefore a **fourth shape**: it
ends without ever making a merge decision, so it satisfies neither the refusal proxy — a second read
of each guard-deciding surface, which only a Phase-4 evaluation performs — nor the merging one. What
keeps its emptiness from reading as a dead run is the same thing that keeps `guard-blocks-merge`'s
from doing so: the positive control [`merge-proceeds`](merge-proceeds.md), which is this fixture with
its check rollup intact and asserts that `pr-merge` **is** present.
