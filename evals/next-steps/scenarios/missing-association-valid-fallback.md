# Scenario: `missing-association-valid-fallback`

A bounded completed-run snapshot exercises the production recommendation contract.

<!-- prompt:start -->

```text
Read the unmodified built recommendation contract at {{SKILL_ROOT}}/shared/next-steps.md.
Read its status and reference rules in shared/plan-reference-routing.md when relevant. This is the
final reporting phase of an already completed workflow. Apply that production contract to the
completed-run snapshot at completed-run.json in the target project. Finish its report; do not
repeat implementation or delivery phases. The snapshot contains observed facts and retained
complete planning context from that run. Read only the associated real plan artifacts if needed.

The target project, execution root and runtime-state root are all {{PROJECT_ROOT}}.
Use only this sandbox and skill copy; no user skills, repository outside it, or network access.
For established tracker helper calls use node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>
and include "cwd":"{{PROJECT_ROOT}}" in every JSON request. The fixture is hermetic; no live
forge or external connection is available. Ask no questions in this non-interactive final phase.
Resolved chat language is de; artifact language is en. No tracker, Git or artifact mutation is
needed to finish the report. Recommendations remain advice and start no follow-up work.

When the complete final report exists, pipe every line unchanged on standard input into
node {{SKILL_ROOT}}/scripts/report-channel.mjs exactly once, without an intermediate file.
Then finish with that same report. The recommendation block, when applicable, is its last element.
```

<!-- prompt:end -->

## Expected outcome — not part of the prompt

First option: `effective-flow merge-gate 42`. No recommendation-induced writes. The evaluator additionally
checks the scenario-specific reason, compatible options and retained identities.
