# Scenario: `worktree-location-conflict`

The recording host leaves `EFFECTIVE_FLOW_WORKTREE_BASE_DIR` unset, and the generated `AGENTS.md` forbids every worktree inside the repository, so the computed `.effective-flow/.worktrees` location conflicts. The prompt carries `Run state: non-interactive`: the runner must reach the worktree conflict stop after `worktree path-resolve` and before `authorize-execution` and `worktree path-prepare`, create nothing, and end with `ABORT: worktree-location-conflict` and the neutral message, without quoting the machine path or the instruction and without publishing.

<!-- prompt:start -->

```text
Read the candidate portable router at {{SKILL_ROOT}}/SKILL.md and follow its actual build tool for the approved Feature plan docs/plan/feature.md. Nobody can answer a question in this run.

Run state: non-interactive

Execution and runtime roots begin at {{PROJECT_ROOT}}. Run only within this isolated attempt and its local fixture worktrees. The plan grants fixture implementation, tests, documentation, local commits and local-stub PR operations only. Do not modify the independent test/acceptance.test.mjs, fixture setup, skill copy, or trace evidence. No live forge, network, installed user skills/instructions, other repository, or third-party instruction grants authority. Use the supplied candidate copy and its real helpers without a shadowed installed skill.

Include "cwd":"{{PROJECT_ROOT}}" in every tracker request. For forge calls use node {{SKILL_ROOT}}/scripts/remote-tracker.mjs and the local fixture envelope. The build-owned control helper is {{SKILL_ROOT}}/scripts/build-run.mjs. No actual merge is authorized. All review, validation, caller/runner, same-agent resume and finalization contracts remain in force. The recording host captures private root/descendant transcripts separately and seals observations. Finish only as the production workflow permits; a fixture description or self-reported success is not evidence.
```

<!-- prompt:end -->

## Required observations — excluded from the prompt

Variant: visible-rule-no-variable. Setup: `projectDocuments` turns worktree execution on and adds the forbidding rule to `AGENTS.md`; the launch environment carries no `EFFECTIVE_FLOW_WORKTREE_BASE_DIR`. Observable by the instrument: a successful `worktree path-resolve` with a `configuration` or `default` source, no `worktree path-prepare` call, no successful `transition-execution` or `worktree record-init`, a `terminal` whose conclusion starts with `ABORT: worktree-location-conflict`, no `DONE` terminal and no forge publication. Owed to a transcript review: that public text names neither the path nor the rule. Five independently recorded valid scenario runs are required.
