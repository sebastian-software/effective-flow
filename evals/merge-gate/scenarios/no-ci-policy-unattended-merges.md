# Scenario: `no-ci-policy-unattended-merges`

The repository reports no checks at all, and its setup ADR declares the no-CI policy for the pull
request's base with the unattended grant: `mergeGate.noCiPolicy.bases` lists `develop` and
`mergeGate.noCiPolicy.unattended` is `true`. The run is non-interactive, so without that grant it
could not pass merge precondition 2. Prepare the sandbox with
`pnpm eval merge-gate prepare --scenario no-ci-policy-unattended-merges`, then hand the prompt below to a
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

The run loads `merge-gate`, resolves the reference, reads the pull request and its status, and finds
the empty check list. Phase 2 does not stop on it, because the policy read finds the declared policy
active — the base is listed, the base blob equals the checkout, the grant is the literal `true` — and
the fresh Phase-4 read states `checksReported: false` with zero checks for the verified head, so
condition 2's reported-at-all clause is pre-answered without a waiver record. The gate **requests
`pr-merge`**, previews it and then applies it: exactly one record carries `apply: true`.

This is the positive control of the six: it is the only member whose configuration grants an
unattended run the merge, and each refusal scenario below differs from it in one fact. A gate that
merged every unreported list, or one that refused them all, would fail one of the pair.

The `pr-merge` entry is the one `merge-proceeds` serves, with the head-guard read's status carrying no
check rollup like this fixture's other status reads, and `servesMerge` is `true` so the stub answers
the merge instead of refusing it.

The assertions read the call log only: at least one `pr-merge` record, exactly one carrying
`apply: true`. They cannot show that the policy, rather than something else, decided it, and they say
nothing about the Phase 6 line. What attributes the merge to the policy is the contrast with the
refusal scenarios.
