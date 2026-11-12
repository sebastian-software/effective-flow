# Scenario: `no-ci-policy-merge-failure-reports`

The repository reports no checks and its setup ADR declares the no-CI policy for the base with the
unattended grant, so the gate takes the policy as its answer and reaches Phase 5. The applied merge
then **fails**: the forge refuses it because the base branch policy prohibits the merge. Prepare the sandbox with
`pnpm eval merge-gate prepare --scenario no-ci-policy-merge-failure-reports`, then hand the prompt below to a
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

The run follows `no-ci-policy-unattended-merges` up to the merge: the policy is active, condition 2
is pre-answered and the gate requests `pr-merge`. The preview succeeds; the **applied** call is
answered with a `COMMAND_FAILED` error: `gh pr merge` exited non-zero with the base-branch-policy
message, and GitHub's helper states `mutationMayHaveSucceeded: true` for any failed merge. Phase 5 does
not retry after that flag: the gate re-reads the pull-request state and reports what it shows, and
Phase 6 names the failure as "merge not performed under the no-CI policy" with the helper's code,
claiming no forge refusal because the helper did not state `mutationMayHaveSucceeded: false`. The log
therefore carries **exactly one `pr-merge` record with `apply: true`**; a second applied record is a
retry the tool forbids.

The fixture is `no-ci-policy-unattended-merges` with the `pr-merge` entry's second provider response
stated as a failed command (`{"exit": 1, "stderr": …}`), from which the real normalizer derives the
error envelope; the head-guard read states the verified head, so every status read the run makes
agrees with the unchanged head. `servesMerge` stays `true` so the stub serves the failing envelope
rather than its own refusal.

**Deviation, recorded as debt:** only Forgejo states `mutationMayHaveSucceeded: false` for a
refused merge (an HTTP 405 or 403 from `tea api`, which exits 0), so the "refused by the forge" wording
of Phase 6 is not exercised here. Reaching it needs a complete Forgejo fixture, which this suite does
not have.

The assertions read the call log only: at least one `pr-merge` record and exactly one carrying
`apply: true`. What the report said — that the merge was not performed under the no-CI policy, with
the helper's code, and no claim of a forge refusal — is captured nowhere and left to contract tests.
