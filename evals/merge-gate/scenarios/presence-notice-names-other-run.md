# Scenario: `presence-notice-names-other-run`

`merge-proceeds` **with a second gate run already active on the same repository.** The runtime state
root holds one valid presence marker of another session, for pull request 41, under
`.effective-flow/merge-gate-presence/`. The notice it produces changes no gate decision, so the gate
is supposed to merge exactly as it does in `merge-proceeds`, and its report is supposed to name the
other run.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario presence-notice-names-other-run`,
then hand the prompt below to a **fresh** agent — one that has not read this file. A run started from
a session that already knows the expected outcome tests that session's memory rather than the
instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different. It is
the `merge-proceeds` prompt unchanged: the two runs differ in the runtime state, never in what the
agent was told.

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

The prompt states no expectation and does not mention the other run.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent; the assertions
read the call log and the sealed observation, never this file.

The run behaves as in `merge-proceeds`: Phase 0, the dispatch, the delegated run's Entry re-read, the
guard reads, the green checks, Phase 4, and **`pr-merge` twice — the dry-run preview, then once with
`--apply`**. In between, "Run presence" registers this run's own marker and lists the others. The
one other marker is valid — `prNumber` 41, a full 40-hex `head`, base `develop` — so the run shows
one notice line naming pull request 41. That marker's head is not in the sandbox, so the notice
names the pull request alone, without a file overlap. Phase 6 releases this run's own marker and
leaves the other one alone.

The fixture is `merge-proceeds` byte for byte apart from its `name` and `description`. The slot is
provisioned by `_scaffold/run-state-seed.mjs`, which writes the other run's marker and nothing else.

### What the evidence shows, stated exactly

- The call log shows the merge, exactly as `merge-proceeds` does. The presence calls go to the state
  helper and never reach the forge, so the log can show that the notice changed no forge decision,
  not that the notice was computed.
- The sealed last message — the caller's final report — has to name pull request 41. That is a
  pattern over prose. A notice the delegated run showed but left out of its outcome record never
  reaches the caller, and this scenario then fails: the user would not see it either.
- Nothing here shows that the run left the other marker in place; the seal observes no runtime
  state.
