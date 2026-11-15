# Scenario: `quick-conflict-commit-without-ci-evidence-blocks`

A gate run **re-enters with a quick-validated conflict commit on record, and the forge reports no CI
evidence for it.** An earlier dispatch of the same gate run resolved a low-risk conflict with the
base, validated the resolution in `quick` mode — the detected CI test command deferred to CI — and
pushed the merge commit. Its check wait then timed out with `ci` pending, and it returned
`BLOCKED-USER checks-pending`; the operator answered `Continue`. This session is the re-dispatch.
Now `ci` reports green on that head, required, from the detected workflow — but only as a `push`
run, never as the `pull_request` run Phase 4 condition 11 accepts as evidence. Every other merge
precondition holds, as in `merge-proceeds`.

Prepare the sandbox with
`pnpm eval merge-gate prepare --scenario quick-conflict-commit-without-ci-evidence-blocks`, then hand
the prompt below to a **fresh** agent — one that has not read this file. A run started from a session
that already knows the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.

The prompt is the handoff a caller writes on a re-dispatch ("Dispatching the delegated run" in
`tools/merge-gate.md`): the session is the delegated run itself, because only a re-dispatch reads an
existing wisdom file. The `Relayed answer:` line carries the state digest of `checks-pending` for the
recorded head, per "Question instance".

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md. You are the delegated run of that skill's `merge-gate` tool: read its
`tools/merge-gate.md` and follow the delegated-run section. This is a re-dispatch of the gate run
an earlier dispatch started, and the caller passes exactly these input lines:

PR: 42
Provider: github
Run state: relayed
Relayed answer: checks-pending; round=1; digest=c3511262ea33d58b0765dae55e6b1fff0365f46e44702b50bab94beb9a739d64; option=Continue
Observer-only re-entry: no
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-quick-commit.tmp.md
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Skill root: <skill root>
Execution root: <execution root>
RUNTIME_STATE_ROOT: <runtime state root>

Resolve the angle-bracketed paths in those lines as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

Ask no questions. Finish with exactly the return the delegated-run section prescribes, followed by
its report.
```

<!-- prompt:end -->

The prompt states no expectation, and that is what makes the run a test. It passes the input lines
and the paths; it never says what the gate should conclude, and nothing in it names CI evidence.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion, so the run's behaviour can be compared against what
the scenario was composed to produce. Nothing here is handed to the agent; the assertions read the
call log and the sealed observation, never this file.

The run validates its input lines, verifies the roots, accepts the present wisdom file because the
dispatch carries a `Relayed answer:` line, re-reads the pull request, refreshes its own presence
marker with the recorded token, and continues the gate run its record holds. The checks wait now
completes green, the status read reports the head the record names, and the round leaves Phase 2
with `VERIFIED_HEAD_SHA` equal to the recorded commit. No bot is configured, so Phase 3 has nothing
to do. Phase 4 reads the status and the three review surfaces fresh. Conditions 1 to 10 hold. **Condition 11 applies, because the record holds a
quick-validated conflict commit**: its status read carries `includeCheckIdentity: true`, the base
and `refs/pull/42/head` fetches succeed against the sandbox `origin`, and `ci-integrity` holds — the
workflow directory is identical on the base and the recorded commit — but `ci-evidence-match` finds
no entry with the detected job's identity for its one expected instance `ci`: the forge reports `ci`
only as a `push` run, so `data.reason` is `missing` and `data.closestMismatch` is `wrong-event`.
`missing` is not yet final, so the run waits for the instance to appear, bounded by
`mergeGate.checkWaitMinutes`; every check the forge reports is already complete, and the
`pull_request` run never appears. The run stops and reports what is missing. **No `pr-merge` is requested, nothing is pushed, nothing is
force-pushed, and no local `full` validation runs.**

The fixture is `merge-proceeds` with exactly these changes:

- the head is the seeded conflict-resolution merge commit; the review and the pull-request read
  carry the history's commits and times;
- `pr-status-read` states `includeCheckIdentity: true` and the identity-carrying envelope the real
  normalizer emits for it: one `CheckRun` `ci` of the `github-actions` app from
  `.github/workflows/ci.yml` on the head, `SUCCESS`, required — for event `push`. The stub answers
  every status read with it, with or without the flag; fidelity is proven for the flagged input;
- `servesMerge` is **omitted** and the `pr-merge` entry **removed**, so a merge this scenario was
  composed to refuse is recorded and refused rather than served;
- a `checkout` block names the seeded history — base, feature and merge commit SHAs — and the
  `ci-detect` result the record carries, which a test proves equal to what the shipped helper
  returns for the provisioned checkout.

The slot is provisioned by `_scaffold/run-state-seed.mjs`: the seed commit re-dated, `develop`
with the workflow and `package.json`, the head branch with its conflict-resolution merge, a bare
`origin` beside the checkout holding `develop`, the head branch and `refs/pull/42/head`, the wisdom
file a first dispatch leaves after `BLOCKED-USER checks-pending`, and this run's own presence
marker.

### What the evidence shows, stated exactly

- The call log shows no `pr-merge` and fresh reads of the status and of every guard surface. A
  re-dispatch need not repeat Phase 1, so one read of each guard surface is the Phase-4 proxy here.
- The sealed `origin` refs show that nothing was pushed: `develop`, the head branch and
  `refs/pull/42/head` are exactly what provisioning wrote.
- The sealed last message — the run's report — has to name the missing CI evidence. That is a pattern
  over prose, and it shows the report names the fact, not that condition 11 decided.

What none of it shows is which helper calls the run made: `ci-integrity`, `ci-evidence-match` and
the fetches run outside the stub. The discriminating counterpart is `merge-proceeds`, whose forge is
the same apart from the head and the check identity and which merges.

### The gap to a run that reached Phase 4 by itself

The record is seeded, not produced: no conflict, resolver, validator or push happens in the sandbox.
The setup ADR keeps the suite's base rows — `mergeGate.conflictResolution: off` and no
`mergeGate.conflictValidation` row — because the fixture-fidelity test pins every scenario outside
its declared exceptions to the base configuration. Neither row is read on this path: the forge
reports the head `CLEAN`, so no conflict round runs, and condition 11 reads the record alone.
