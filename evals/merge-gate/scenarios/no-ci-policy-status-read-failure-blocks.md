# Scenario: `no-ci-policy-status-read-failure-blocks`

The status read **fails**, under a setup ADR that declares the no-CI policy for the base with the
unattended grant. A read that errors states no `baseRef` and no check list, and the policy never
applies to it. Prepare the sandbox with
`pnpm eval merge-gate prepare --scenario no-ci-policy-status-read-failure-blocks`, then hand the prompt below to a
**fresh** agent — one that has not read this file. A run started from a session that already knows
the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare.mjs` prints
exactly this text, so copy it from there rather than from here if the two ever look different.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

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

The sandbox's setup ADR states `mergeGate.completion: merge` and `mergeGate.requireAllChecks: false`
— the setting a repository without any required check needs for the check wait to restrict itself to
required checks — and the scenario's policy rows below. `no-ci-checkout.mjs` gives the sandbox the
local `origin` the resolver's base-blob guard needs: a bare repository holding the seeded `develop`,
whose setup ADR is the one in the working checkout, so `origin/develop` and the checkout carry the
same `mergeGate.noCiPolicy.*` rows and the base comparison reads `equal`. The scenario is observed
only as the presence or absence of `pr-merge` in the call log; the chat report, where the Phase 6
policy line stands, is captured nowhere.

The shared base of the six fixtures is `unreported-checks-block-merge` with the pull request unchanged; unless the paragraphs below say otherwise the status read
carries a null `statusCheckRollup`, which the real normalizer turns into `checksReported: false`,
`checkCount: 0` and `checks: []`. The `pr-checks-wait` entry restricts itself to required checks
(`requiredOnly: true`) and the provider answers it with empty output, so the wait reports no check
list either. The thread list is empty, the one top-level comment is authored by the viewer login,
`mergeGate.bots` is unset, and the pull request is mergeable, not a draft, based on `develop` and
titled with a valid Conventional Commit subject under `delivery.mergeMethod: squash`.

The run loads `merge-gate`, reads the pull request and its status once — the empty check list — and
then every later status read fails with a structured error (`INVALID_PAYLOAD`, malformed JSON). The
policy stays inactive for a failed read, so the gate neither skips the unreported-list stop nor
pre-answers condition 2 from anything it remembers of the first read, and it ends with a report.
**No `pr-merge` operation is requested at any point.**

The fixture is `no-ci-policy-unattended-merges` with the `pr-status-read` entry **sequenced**: element
1 is that fixture's status envelope, element 2 is an error envelope the real normalizer emits for a
truncated provider response, and `repeatLast` is `true`, so every read from the second on fails. A
run that never makes a second read has not observed the failure.

The assertions read the call log only: no `pr-merge` record, and at least two `pr-status-read`
records. This scenario therefore has a validity rule in its assertion, as
`unreported-checks-at-phase-four` has one: a run with a single status read is reported as one that
never reached the deciding position. The count shows the failing element was served, never that the
gate evaluated anything against the failure.
