# Scenario: `bot-login-excluded`

The `merge-proceeds` situation plus one top-level pull-request comment from `coverage-reporter`, an
automated account the forge types as a **user**, not a bot. The project lists that login in
`mergeGate.botAccounts`, so guard rule 1 excludes the comment, no item holds the human-comment
guard, and the gate is supposed to merge.

Without the row this comment would fall to the catch-all and hold the guard for the whole run,
exactly as an unresolved thread does in `guard-blocks-merge`. Read this scenario against
`merge-proceeds`: the two fixtures differ in the one comment and the one configuration row, so a
run that merges there and refuses here points at the `mergeGate.botAccounts` case of rule 1.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario bot-login-excluded`, then hand
the prompt below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. It is the
`merge-proceeds` prompt unchanged: the runs have to differ in the fixture and the configuration,
never in what the agent was told.

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

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent, and no
assertion reads it.

The run loads `merge-gate`, reads the pull request, its status, the review threads, the
pull-request comments and the submitted reviews through the stubbed helper, establishes its own
identity through `viewer-read`, and finds **no** item holding the human-comment guard:

- `coverage-reporter`'s top-level comment is typed `User` and matches no `mergeGate.bots` entry, but
  the scenario's project-setup ADR appends `mergeGate.botAccounts: coverage-reporter`, so rule 1's
  `mergeGate.botAccounts` case excludes it on an exact login comparison;
- the gate's own comment from `flow-gate` is excluded by rule 2, and `casey-reviewer`'s `APPROVED`
  review does not count, both exactly as in `merge-proceeds`;
- `mergeGate.bots` is unset, so no reviewer is expected, and every other merge precondition holds by
  construction.

It reaches Phase 5 and **requests `pr-merge` twice: once for the dry-run preview, then once with
`--apply`.** The fixture states `servesMerge: true`, so the stub serves the merge. Its Phase 6 report
should carry one `mergeGate.botAccounts` line for `coverage-reporter` with one top-level comment,
but the suite captures no chat report, so that line is covered by contract tests only.

The assertions read only the call log: at least one `pr-merge` record, and exactly one of them with
`apply: true`.
