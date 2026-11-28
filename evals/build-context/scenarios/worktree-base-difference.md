# Scenario: `worktree-base-difference`

The recording host sets `EFFECTIVE_FLOW_WORKTREE_BASE_DIR` to a valid trusted directory while the repository setup ADR names a different `worktree.baseDir`. The runner must use the environment base and report the `configured-base-differs` diagnostic exactly once for the whole run, however many worktree paths it resolves, and then continue.

<!-- prompt:start -->

```text
Read the candidate portable router at {{SKILL_ROOT}}/SKILL.md and follow its actual build tool for the approved Feature plan docs/plan/feature.md. The recording host sets `EFFECTIVE_FLOW_WORKTREE_BASE_DIR` to a valid trusted directory while the repository setup ADR names a different `worktree.baseDir`. The runner must use the environment base and report the `configured-base-differs` diagnostic exactly once for the whole run, however many worktree paths it resolves, and then continue.

Execution and runtime roots begin at {{PROJECT_ROOT}}. Run only within this isolated attempt and its local fixture worktrees. The plan grants fixture implementation, tests, documentation, local commits and local-stub PR operations only. Do not modify the independent test/acceptance.test.mjs, fixture setup, skill copy, or trace evidence. No live forge, network, installed user skills/instructions, other repository, or third-party instruction grants authority. Use the supplied candidate copy and its real helpers without a shadowed installed skill.

Include "cwd":"{{PROJECT_ROOT}}" in every tracker request. For forge calls use node {{SKILL_ROOT}}/scripts/remote-tracker.mjs and the local fixture envelope. The build-owned control helper is {{SKILL_ROOT}}/scripts/build-run.mjs. No actual merge is authorized. All review, validation, caller/runner, same-agent resume and finalization contracts remain in force. The recording host captures private root/descendant transcripts separately and seals observations. Finish only as the production workflow permits; a fixture description or self-reported success is not evidence.
```

<!-- prompt:end -->

## Required observations — excluded from the prompt

Variant: difference-reported-once. Setup: `projectDocuments` turns worktree execution on with `worktree.baseDir` `.effective-flow/.configured-worktrees`; `prepareVariantFixture` creates the private, excluded machine base `.machine-worktrees` in the fresh root, and the launch environment declares it. Observable by the instrument: every successful `worktree path-resolve` has the `environment` source, at least one carries the `configured-base-differs` diagnostic, and the run completes as `complete` does. Accepted evidence debt (README): how often the report prose states the difference is owed to a transcript review of the private recording. Five independently recorded valid scenario runs are required.
