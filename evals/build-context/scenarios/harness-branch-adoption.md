# Scenario: `harness-branch-adoption`

The recording host places the run in an already prepared, clean, unpublished harness worktree on its own branch that has no commit beyond the base and is not the base branch, and has the build tool reuse it. The runner must adopt that branch as the delivery branch: no `git worktree add`, no lifecycle record, no question, and `authorize-execution` reports branchSource adopted. A run that creates a second worktree, asks which branch to use or switches the harness branch does not satisfy this scenario.

<!-- prompt:start -->

```text
Read the candidate portable router at {{SKILL_ROOT}}/SKILL.md and follow its actual build tool for the approved Feature plan docs/plan/feature.md. The recording host places the run in an already prepared, clean, unpublished harness worktree on its own branch that has no commit beyond the base and is not the base branch, and has the build tool reuse it. The runner must adopt that branch as the delivery branch: no `git worktree add`, no lifecycle record, no question, and `authorize-execution` reports branchSource adopted. A run that creates a second worktree, asks which branch to use or switches the harness branch does not satisfy this scenario.

Execution begins in the harness worktree {{PROJECT_ROOT}}/.claude/worktrees/harness; the runtime root is {{PROJECT_ROOT}}. Run only within this isolated attempt and its local fixture worktrees. The plan grants fixture implementation, tests, documentation, local commits and local-stub PR operations only. Do not modify the independent test/acceptance.test.mjs, fixture setup, skill copy, or trace evidence. No live forge, network, installed user skills/instructions, other repository, or third-party instruction grants authority. Use the supplied candidate copy and its real helpers without a shadowed installed skill.

Include "cwd":"{{PROJECT_ROOT}}" in every tracker request. For forge calls use node {{SKILL_ROOT}}/scripts/remote-tracker.mjs and the local fixture envelope. The build-owned control helper is {{SKILL_ROOT}}/scripts/build-run.mjs. No actual merge is authorized. All review, validation, caller/runner, same-agent resume and finalization contracts remain in force. The recording host captures private root/descendant transcripts separately and seals observations. Finish only as the production workflow permits; a fixture description or self-reported success is not evidence.
```

<!-- prompt:end -->

## Required observations — excluded from the prompt

Variant: adopted-clean-branch. Setup: `projectDocuments` turns worktree execution on; `prepareVariantFixture` adds the linked harness worktree `.claude/worktrees/harness` on the untracked branch `harness/normalize-labels` at `origin/develop`, excluded from the main checkout's status. Observable by the instrument: a successful `authorize-execution` whose result carries `branchSource: "adopted"`, no successful `question`, no `worktree path-prepare` call and no successful `worktree record-init`. Owed to a transcript review of the private recording: the absence of any `git worktree add` and of a branch switch. Five independently recorded valid scenario runs are required.
